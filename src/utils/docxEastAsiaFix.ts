/**
 * docx 后处理：补全 `w:rFonts` 缺失/不一致的 eastAsia 槽位。
 *
 * 背景（2026-10-29）：按 OOXML 规范，中文字符按脚本走 eastAsia 槽而不是
 * ascii/hAnsi。只写西文槽的文件在 Word 里中文会掉回默认字体。
 *
 * - 引擎 2.32.0 的字体选择器只写 ascii/hAnsi，改字体后中文不动、导出也不变；
 *   升级到 2.33.0 后引擎已会为东亚字体补写 eastAsia（改字体即时生效），
 *   本模块退化为安全网。
 * - 仍然有价值的场景：别处生成的 docx（含本项目用 docx 库生成的文书）里
 *   ascii/hAnsi 写了中文字体、却没有 eastAsia。
 *
 * 修复规则：对每个 `w:rFonts`，若 ascii/hAnsi 是中文字体，则把 eastAsia（及 cs）
 * 同步成同一字体。ascii 是 Times New Roman 等西文字体时不动 eastAsia
 * （保持「中文宋体 + 西文 Times」的公文惯例）。
 *
 * 必须跑回归：scripts/test-eastasia-fix.mjs
 */
import JSZip from 'jszip';

/** 需要与 ascii/hAnsi 同步的槽位列表 */
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** 中文字体集合（与 DocxEditor 的 CJK_FONT_FAMILIES 保持一致） */
export const CJK_FAMILIES = new Set([
  '宋体', 'simsun', 'nsimsun', '新宋体',
  '黑体', 'simhei',
  '楷体', 'kaiti', '楷体_gb2312', 'kaiti_gb2312',
  '仿宋', 'fangsong', '仿宋_gb2312', 'fangsong_gb2312',
  '微软雅黑', 'microsoft yahei',
]);

/**
 * 判断字体名（大小写折叠后）是否为中文字体
 */
export function isCjkFamily(name: string | null | undefined): boolean {
  if (!name) return false;
  return CJK_FAMILIES.has(name.trim().toLowerCase());
}

/**
 * 修复 docx 字节里的 eastAsia 槽位。
 * 返回新的 docx 字节（输入无修改需要时返回原引用）。
 */
export async function fixEastAsiaSlots(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const targets = ['word/document.xml', 'word/styles.xml'];
  let changed = false;

  for (const path of targets) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const next = fixXml(xml);
    if (next !== xml) {
      zip.file(path, next);
      changed = true;
    }
  }

  if (!changed) return bytes;

  const out = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return out;
}

/**
 * 对一段 OOXML 文本执行 eastAsia 修复。独立导出便于单元测试。
 *
 * 处理 `<w:rFonts .../>` 标签：
 * - 若 ascii/hAnsi 属性值是中文字体且 eastAsia 缺失或与 ascii 不一致 → eastAsia = ascii
 * - cs 槽位同步（复杂文种，公文场景少见，保持一致性）
 */
export function fixXml(xml: string, _report?: (changed: boolean) => void): string {
  return xml.replace(/<w:rFonts\b([^>]*?)\/>/g, (full, attrs0: string) => {
    const get = (attrs: string, name: string): string | null => {
      const m = attrs.match(new RegExp(`\\bw:${name}="([^"]*)"`));
      return m ? m[1] : null;
    };
    const setAttr = (attrs: string, name: string, value: string): string => {
      if (new RegExp(`\\bw:${name}="`).test(attrs)) {
        return attrs.replace(new RegExp(`\\bw:${name}="[^"]*"`), `w:${name}="${value}"`);
      }
      return `${attrs} w:${name}="${value}"`;
    };

    const ascii = get(attrs0, 'ascii');
    const hAnsi = get(attrs0, 'hAnsi');
    const eastAsia = get(attrs0, 'eastAsia');
    const cs = get(attrs0, 'cs');
    // ascii/hAnsi 里任一是中文字体即触发（正常情况两者相同）
    const cjkAscii = isCjkFamily(ascii) ? ascii : isCjkFamily(hAnsi) ? hAnsi : null;
    if (!cjkAscii) return full;
    const same = (v: string | null) => !!v && v.trim().toLowerCase() === cjkAscii.trim().toLowerCase();
    // 四个槽位都一致才不动（引擎 2.33 只补 eastAsia，cs 仍是旧值，这里一并对齐）
    if (same(eastAsia) && same(cs)) return full;

    // 顺序串接修改，避免基于旧 attrs 互相覆盖
    let attrs = attrs0;
    attrs = setAttr(attrs, 'eastAsia', cjkAscii);
    attrs = setAttr(attrs, 'cs', cjkAscii);
    return `<w:rFonts${attrs}/>`;
  });
}
