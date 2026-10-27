/**
 * docx 占位符引擎：在 OOXML 层替换 `${字段}` / `{{字段}}`，模板排版原样保留。
 *
 * 为什么必须在 XML 层做、不能「读文字 → 替换 → 写回」：
 * Word 会按编辑历史把同一段文字切成多个 `<w:r>`，一个占位符经常被拆成
 * `<w:t>${被审计</w:t></w:r><w:r><w:t>单位}</w:t>` —— 按节点逐个做字符串
 * 替换必然匹配不到（这是所有「Word 模板套打」功能最常见的翻车点）。
 *
 * 这里的做法：
 * 1. 用正则切出每个 `<w:p>`（`w:p` 不会嵌套，非贪婪即可；表格单元格里的段落
 *    同样是 `w:p`，因此表格内占位符一并覆盖）；
 * 2. 把段内所有 `<w:t>` 的文字拼成逻辑文本（同时记录每段在逻辑文本里的区间）；
 * 3. 在逻辑文本上匹配占位符；
 * 4. 替换结果写回「覆盖到的第一个」`<w:t>`，其余被覆盖的节点清空 ——
 *    字体/字号/颜色/加粗沿用第一个 run 的格式；
 * 5. 文档其余部分一个字节都不动（不做 DOMParser 往返，避免命名空间被重写）。
 *
 * 支持部件：正文、页眉、页脚、脚注、尾注。
 * 替换值里的换行会转成 `<w:br/>`，因此「成员分工」这类多行字段能正常折行。
 */
import JSZip from 'jszip';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** 参与替换的部件 */
const PART_RE = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/** 部件处理顺序：正文优先，便于字段清单按正文出现顺序展示 */
function partRank(name: string): number {
  if (name === 'word/document.xml') return 0;
  if (/^word\/header/.test(name)) return 1;
  if (/^word\/footer/.test(name)) return 2;
  return 3;
}

const PARAGRAPH_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
/**
 * 文字节点。属性部分的末尾刻意排除 `/`，否则自闭合的 `<w:t foo="bar"/>`
 * 会被当成开标签，把后面整段内容吞进「文字」里。
 */
const TEXT_RE = /<w:t((?:\s+[^>]*[^/>])?)>([\s\S]*?)<\/w:t>/g;

/** 每次重新构造，避免带 g 的正则跨调用残留 lastIndex */
const tokenRe = () => /\$\{\s*([^{}$]+?)\s*\}|\{\{\s*([^{}]+?)\s*\}\}/g;

const XML_ENTITY_RE = /&(lt|gt|amp|quot|apos|#x?[0-9a-fA-F]+);/g;

function decodeXml(input: string): string {
  if (!input.includes('&')) return input;
  return input.replace(XML_ENTITY_RE, (whole, name: string) => {
    switch (name) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const hex = name[1] === 'x' || name[1] === 'X';
        const code = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
    }
  });
}

function encodeXml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 输出节点文字：转义 + 换行转 `<w:br/>`。
 * 闭合当前 `<w:t>` 再开一个同格式的，仍在同一个 run 内，OOXML 合法。
 */
function emitText(value: string): string {
  return encodeXml(value).replace(/\r\n?|\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
}

/** 被修改过的节点补 `xml:space="preserve"`，否则 Word 会吃掉首尾空格 */
function ensurePreserve(openTag: string): string {
  if (/\bxml:space\s*=/.test(openTag)) {
    return openTag.replace(/xml:space\s*=\s*"[^"]*"/, 'xml:space="preserve"');
  }
  return openTag.replace(/>$/, ' xml:space="preserve">');
}

interface Seg {
  /** 开标签起始位置 */
  tagStart: number;
  /** 开标签原文，如 `<w:t xml:space="preserve">` */
  openTag: string;
  /** 文字起始位置 */
  textStart: number;
  /** 文字结束位置 */
  textEnd: number;
  /** 解码后的文字 */
  text: string;
}

/**
 * 处理单个段落。
 * @param values 传 null 表示只扫描不替换
 * @param found  收集模板中出现的占位符（保持出现顺序）
 */
function processParagraph(
  para: string,
  values: Record<string, string> | null,
  found: string[],
): string {
  const segs: Seg[] = [];
  let full = '';
  TEXT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEXT_RE.exec(para))) {
    const attr = m[1] ?? '';
    const openTag = `<w:t${attr}>`;
    const textStart = m.index + openTag.length;
    const text = decodeXml(m[2]);
    segs.push({
      tagStart: m.index,
      openTag,
      textStart,
      textEnd: textStart + m[2].length,
      text,
    });
    // 逻辑文本下标 = 累计已拼接长度
    full += text;
  }
  if (!segs.length) return para;

  const re = tokenRe();
  const matches: { start: number; end: number; key: string }[] = [];
  let t: RegExpExecArray | null;
  while ((t = re.exec(full))) {
    matches.push({ start: t.index, end: t.index + t[0].length, key: (t[1] ?? t[2]).trim() });
  }
  if (!matches.length) return para;

  for (const mt of matches) {
    if (mt.key && !found.includes(mt.key)) found.push(mt.key);
  }
  if (!values) return para;

  /* 逻辑下标 → 节点下标：按累计长度二分/顺序查找 */
  const logicalStart: number[] = [];
  let acc = 0;
  for (const s of segs) {
    logicalStart.push(acc);
    acc += s.text.length;
  }
  const locate = (pos: number) => {
    for (let i = segs.length - 1; i >= 0; i -= 1) {
      if (pos >= logicalStart[i]) return i;
    }
    return -1;
  };

  const texts = segs.map((s) => s.text);
  const touched = new Set<number>();

  // 从后往前替换：靠前的匹配偏移不受影响，同一节点内的前缀长度也不变
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const { start, end, key } = matches[i];
    const value = values[key] ?? '';
    const a = locate(start);
    const b = locate(end - 1);
    if (a < 0 || b < 0) continue;
    const offA = start - logicalStart[a];
    if (a === b) {
      const cur = texts[a];
      texts[a] = cur.slice(0, offA) + value + cur.slice(end - logicalStart[a]);
    } else {
      const offB = end - logicalStart[b];
      texts[a] = texts[a].slice(0, offA) + value;
      for (let k = a + 1; k < b; k += 1) texts[k] = '';
      texts[b] = texts[b].slice(offB);
    }
    for (let k = a; k <= b; k += 1) touched.add(k);
  }

  let out = '';
  let cursor = 0;
  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i];
    out += para.slice(cursor, seg.tagStart);
    out += touched.has(i) ? ensurePreserve(seg.openTag) : seg.openTag;
    out += emitText(texts[i]);
    cursor = seg.textEnd;
  }
  out += para.slice(cursor);
  return out;
}

/** 遍历一个 XML 部件；values 为 null 时只收集占位符 */
function processPart(xml: string, values: Record<string, string> | null, found: string[]): string {
  return xml.replace(PARAGRAPH_RE, (para) => processParagraph(para, values, found));
}

async function loadParts(source: Blob): Promise<{
  zip: JSZip;
  parts: { name: string; xml: string }[];
}> {
  const zip = await JSZip.loadAsync(await source.arrayBuffer());
  const names = Object.keys(zip.files)
    .filter((n) => PART_RE.test(n))
    .sort((a, b) => partRank(a) - partRank(b));
  if (!names.length) throw new Error('不是有效的 .docx 文件（缺少 word/document.xml）');
  const parts: { name: string; xml: string }[] = [];
  for (const name of names) {
    const file = zip.file(name);
    if (!file) continue;
    parts.push({ name, xml: await file.async('string') });
  }
  return { zip, parts };
}

/** 扫描模板里的全部占位符（去重，按正文 → 页眉 → 页脚顺序） */
export async function scanDocxPlaceholders(source: Blob): Promise<string[]> {
  const { parts } = await loadParts(source);
  const found: string[] = [];
  for (const p of parts) processPart(p.xml, null, found);
  return found;
}

export interface DocxFillResult {
  blob: Blob;
  /** 模板中出现的全部字段（去重，保持出现顺序） */
  found: string[];
  /** 模板里出现、但 values 没给值的字段（这些位置按空串写入） */
  missing: string[];
}

/**
 * 用 values 替换模板中的占位符，返回新的 .docx。
 * 未提供值的字段写入空串，并在 missing 中回报，由调用方提示使用者。
 */
export async function fillDocxTemplate(
  source: Blob,
  values: Record<string, string>,
): Promise<DocxFillResult> {
  const { zip, parts } = await loadParts(source);
  const found: string[] = [];
  for (const part of parts) {
    const next = processPart(part.xml, values, found);
    if (next !== part.xml) zip.file(part.name, next);
  }
  const missing = found.filter((k) => values[k] === undefined || values[k] === '');
  // 用 arraybuffer 而不是 'blob'：JSZip 的 blob 输出只在浏览器实现，
  // 走 arraybuffer 再由我们包 Blob，浏览器与 Node（单元测试）都能跑
  const buffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const blob = new Blob([buffer], { type: DOCX_MIME });
  return { blob, found, missing };
}

/** 把替换结果包成 File，供 docxToSnapshot 直接消化 */
export function filledDocxAsFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, { type: DOCX_MIME });
}

export { DOCX_MIME };
