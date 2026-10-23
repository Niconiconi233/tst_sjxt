/**
 * docx 高保真导入：直接解析 OOXML（word/document.xml + word/styles.xml），
 * 保留字体、字号、加粗、斜体、下划线、颜色、段落对齐、行距、段间距与表格。
 *
 * 为什么不用 mammoth：mammoth 的定位是「语义化 HTML」，它在上游就主动丢弃
 * 直接格式（字体/字号/颜色/表格样式），导出的只有 h/p/table 骨架，格式保真
 * 做不到。这里直读 XML 并映射到 Univer 文档模型：
 *
 * - 字符格式 → body.textRuns 的 ts（ff / eastAsiaFontFamily / fs / bl / it / ul / cl）
 * - 段落格式 → body.paragraphs 的 paragraphStyle（horizontalAlign / lineSpacing /
 *   spaceAbove / spaceBelow）
 * - 表格     → 数据流哨兵 \u001A…\u000F + body.tables + 顶层 tableSource[tableId]。
 *   结构照抄 @univerjs/docs-ui 的 genEmptyTable / genTableSource /
 *   buildDocTableInsertBody：单元格内容是 `CELL_START + 文本 + \r\n + CELL_END`，
 *   段落条目指向 \r、分节条目指向 \n，行内每格与数据流哨兵一一对应。
 *
 * 已覆盖的格式：字体/字号/加粗/斜体/下划线/颜色、段落对齐与间距、项目符号与
 * 编号（含多级编号）、表格（含跨行合并 vMerge 与跨列合并 gridSpan）、页面设置。
 *
 * 已知限制（刻意不做，避免无底洞）：
 * - 图片 / 浮动对象（w:drawing）不导入：文档侧的自由浮动排版属于另一个插件
 *   （@univerjs/docs-drawing-ui），社区版基础包里没有
 * - 嵌套表格（表格里的表格）拍平为单元格内的多段文本
 */
import JSZip from 'jszip';
import {
  DashStyleType,
  HorizontalAlign,
  ObjectRelativeFromH,
  ObjectRelativeFromV,
  TableAlignmentType,
  TableLayoutType,
  TableRowHeightRule,
  TableSizeType,
  TableTextWrapType,
  VerticalAlignmentType,
} from '@univerjs/core';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** Univer 文档数据流哨兵（值照抄 core 的 DataStreamTreeTokenType） */
const SENTINEL = {
  TABLE_START: '\u001A',
  TABLE_ROW_START: '\u001B',
  TABLE_CELL_START: '\u001C',
  TABLE_CELL_END: '\u001D',
  TABLE_ROW_END: '\u000E',
  TABLE_END: '\u000F',
  PARAGRAPH: '\r',
  SECTION_BREAK: '\n',
  TAB: '\t',
} as const;

/** OOXML 长度单位：twip = 1/20 pt；字号 half-point = 1/2 pt；边框 sz = 1/8 pt */
const TWIP_TO_PT = 1 / 20;
const HALF_PT_TO_PT = 1 / 2;
const BORDER_SZ_TO_PT = 1 / 8;

/** w:spacing 的 w:line 以 240 为单倍行距（lineRule=auto 时） */
const LINE_SINGLE = 240;

/* ------------------------------------------------------------------ *
 * 快照类型（与 Univer 的 IDocumentData 对齐的子集）
 * ------------------------------------------------------------------ */

export interface UniverRunStyle {
  ff?: string;
  eastAsiaFontFamily?: string;
  fs?: number;
  bl?: 0 | 1;
  it?: 0 | 1;
  ul?: { s: 0 | 1 };
  cl?: { rgb: string };
}

export interface UniverParagraphStyle {
  horizontalAlign?: number;
  lineSpacing?: number;
  spaceAbove?: { v: number };
  spaceBelow?: { v: number };
}

/** Univer 的 IBullet：listType 必须在预设列表表里，否则渲染层只给默认点 */
export interface UniverBullet {
  listType: string;
  listId: string;
  nestingLevel: number;
  startNumber?: number;
  textStyle?: UniverRunStyle;
}

export interface UniverDocSnapshot {
  id: string;
  title: string;
  body: {
    dataStream: string;
    textRuns: { st: number; ed: number; ts?: UniverRunStyle }[];
    paragraphs: {
      startIndex: number;
      paragraphId: string;
      paragraphStyle?: UniverParagraphStyle;
      bullet?: UniverBullet;
    }[];
    sectionBreaks: { sectionId: string; startIndex: number }[];
    tables: { startIndex: number; endIndex: number; tableId: string }[];
  };
  documentStyle: Record<string, unknown>;
  tableSource: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * XML 小工具（按 localName 匹配，不依赖前缀）
 * ------------------------------------------------------------------ */

type Attrs = Record<string, string>;

function kids(el: Element | null | undefined, name: string): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  for (let i = 0; i < el.children.length; i += 1) {
    const c = el.children[i];
    if (c.localName === name) out.push(c);
  }
  return out;
}

function kid(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  for (let i = 0; i < el.children.length; i += 1) {
    if (el.children[i].localName === name) return el.children[i];
  }
  return null;
}

/** 收集属性（按 localName，Word 的属性都带 w: 前缀） */
function attrsOf(el: Element | null | undefined): Attrs {
  const out: Attrs = {};
  if (!el) return out;
  for (let i = 0; i < el.attributes.length; i += 1) {
    const a = el.attributes[i];
    out[a.localName] = a.value;
  }
  return out;
}

function numAttr(el: Element | null, name: string): number | null {
  if (!el) return null;
  const v = attrsOf(el)[name];
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ *
 * 样式表解析（docDefaults + 样式链继承，这是字体保真的关键）
 * ------------------------------------------------------------------ */

interface StyleDef {
  basedOn?: string;
  run?: Element | null;
  para?: Element | null;
}

interface StyleContext {
  styles: Map<string, StyleDef>;
  defaultRunTs: UniverRunStyle;
  numbering: NumberingContext;
}

/* ------------------------------------------------------------------ *
 * 编号表解析（word/numbering.xml）
 *
 * 链路：w:numPr(numId, ilvl) → w:num(numId → abstractNumId)
 *     → w:abstractNum(abstractNumId) → w:lvl(ilvl) → w:numFmt + w:lvlText
 * ------------------------------------------------------------------ */

/** 列表形态：符号 / 单层编号 / 多级累积编号（1.1、1.1.2）/ 无编号 */
type ListKind = 'bullet' | 'order' | 'orderMulti' | 'none';

interface NumberingContext {
  /** `${numId}|${ilvl}` → 形态；查不到的退化成 order */
  kinds: Map<string, ListKind>;
  /** numId → Univer 的 listId。同一编号定义共享，保证编号跨段连续 */
  listIds: Map<string, string>;
  /** `${numId}|${ilvl}` → 起始编号（Word 的 w:start，仅 >1 时记录） */
  startNumbers: Map<string, number>;
}

const EMPTY_NUMBERING: NumberingContext = {
  kinds: new Map(),
  listIds: new Map(),
  startNumbers: new Map(),
};

function parseNumbering(numberingXml: string | null): NumberingContext {
  const kinds = new Map<string, ListKind>();
  const listIds = new Map<string, string>();
  const kindStarts = new Map<string, number>();
  if (!numberingXml) return { kinds, listIds, startNumbers: kindStarts };

  const doc = new DOMParser().parseFromString(numberingXml, 'text/xml');
  const root = doc.documentElement;

  // abstractNumId → 每层的形态（ilvl → kind）
  const abstracts = new Map<string, Map<number, ListKind>>();
  const abstractStarts = new Map<string, Map<number, number>>();
  for (const abs of kids(root, 'abstractNum')) {
    const aid = attrsOf(abs).abstractNumId;
    if (!aid) continue;
    const lvls = kids(abs, 'lvl');
    // 多级累积编号：任一层的 lvlText 引用了上级编号（%2 及以上），如 "%1.%2"
    const multi = lvls.some((l) => /%[2-9]/.test(attrsOf(kid(l, 'lvlText')).val ?? ''));

    const resolved = new Map<number, ListKind>();
    const starts = new Map<number, number>();
    for (const lvlEl of lvls) {
      const ilvl = Number(attrsOf(lvlEl).ilvl);
      if (!Number.isFinite(ilvl)) continue;
      const fmt = attrsOf(kid(lvlEl, 'numFmt')).val ?? 'decimal';
      resolved.set(
        ilvl,
        fmt === 'bullet' ? 'bullet' : fmt === 'none' ? 'none' : multi ? 'orderMulti' : 'order',
      );
      const start = Number(attrsOf(kid(lvlEl, 'start')).val);
      if (Number.isFinite(start) && start > 1) starts.set(ilvl, start);
    }
    abstracts.set(aid, resolved);
    abstractStarts.set(aid, starts);
  }

  // numId → abstractNumId，同一个 abstract 可被多个 numId 引用
  for (const num of kids(root, 'num')) {
    const numId = attrsOf(num).numId;
    if (!numId) continue;
    const aid = attrsOf(kid(num, 'abstractNumId')).val ?? '';
    const resolved = abstracts.get(aid);
    if (!resolved) continue;
    const starts = abstractStarts.get(aid);
    for (const [ilvl, kind] of resolved) {
      kinds.set(`${numId}|${ilvl}`, kind);
      const start = starts?.get(ilvl);
      if (start !== undefined) kindStarts.set(`${numId}|${ilvl}`, start);
    }
    listIds.set(numId, `list_${numId}`);
  }

  return { kinds, listIds, startNumbers: kindStarts };
}

function parseStyles(stylesXml: string | null, numberingXml: string | null): StyleContext {
  const styles = new Map<string, StyleDef>();
  let defaultRunTs: UniverRunStyle = {};
  const numbering = parseNumbering(numberingXml);
  if (!stylesXml) return { styles, defaultRunTs, numbering };

  const doc = new DOMParser().parseFromString(stylesXml, 'text/xml');
  const root = doc.documentElement;

  // 文档级默认字符样式（w:docDefaults/w:rPrDefault/w:rPr）
  const rprDefault = kid(kid(kid(root, 'docDefaults'), 'rPrDefault'), 'rPr');
  defaultRunTs = runStyleFromRPr(rprDefault);

  for (const styleEl of kids(root, 'style')) {
    const id = attrsOf(styleEl).styleId;
    if (!id) continue;
    styles.set(id, {
      basedOn: attrsOf(kid(styleEl, 'basedOn')).val,
      run: kid(styleEl, 'rPr'),
      para: kid(styleEl, 'pPr'),
    });
  }
  return { styles, defaultRunTs, numbering };
}

/* ------------------------------------------------------------------ *
 * w:pPr → 列表标记（bullet）
 *
 * Univer 的符号 / 编号由 paragraph.bullet 描述，listType 必须是 core 里
 * PRESET_LIST_TYPE 的键 —— 渲染层 `lists[listType]` 查不到就只给默认圆点，
 * 所以这里只能把 Word 的形态归类到已有预设上（字形不能自由组合）：
 *   符号 → BULLET_LIST（● ○ ■，预设只有 3 级）
 *   编号 → ORDER_LIST（1. 2. 3.，预设 9 级）
 *   多级 → ORDER_LIST_2（1. / 1.1. / 1.1.1. 累积式）
 * ------------------------------------------------------------------ */

/** 预设 key → 可用层级数（超出会查不到 nestingLevel，需 clamp） */
const BULLET_PRESET: Record<Exclude<ListKind, 'none'>, { listType: string; maxLevel: number }> = {
  bullet: { listType: 'BULLET_LIST', maxLevel: 2 },
  order: { listType: 'ORDER_LIST', maxLevel: 8 },
  orderMulti: { listType: 'ORDER_LIST_2', maxLevel: 8 },
};

function bulletFromPPr(
  ctx: StyleContext,
  ppr: Element | null,
  styleId: string | undefined,
): UniverBullet | undefined {
  // numPr 同样可由样式提供：先沿 basedOn 链找，直接格式优先覆盖
  let numPr: Element | null = null;
  for (const el of styleParaEls(ctx, styleId)) {
    const n = kid(el, 'numPr');
    if (n && !numPr) numPr = n;
  }
  const direct = kid(ppr, 'numPr');
  if (direct) numPr = direct;
  if (!numPr) return undefined;

  const numId = attrsOf(kid(numPr, 'numId')).val;
  if (!numId) return undefined;
  const ilvlRaw = Number(attrsOf(kid(numPr, 'ilvl')).val ?? 0);
  const ilvl = Number.isFinite(ilvlRaw) && ilvlRaw >= 0 ? ilvlRaw : 0;

  const key = `${numId}|${ilvl}`;
  const kind = ctx.numbering.kinds.get(key);
  // 没有 numbering.xml 或查不到定义时，只要写了 numPr 就按编号处理
  if (kind === 'none') return undefined;
  const preset = BULLET_PRESET[kind ?? 'order'];

  const bullet: UniverBullet = {
    listType: preset.listType,
    listId: ctx.numbering.listIds.get(numId) ?? `list_${numId}`,
    nestingLevel: Math.min(ilvl, preset.maxLevel),
  };
  const start = ctx.numbering.startNumbers.get(key);
  if (start !== undefined) bullet.startNumber = start;
  return bullet;
}

/** w:rPr → Univer 字符样式（不含继承，只做直接映射） */
function runStyleFromRPr(rpr: Element | null): UniverRunStyle {
  const ts: UniverRunStyle = {};
  if (!rpr) return ts;

  const fonts = kid(rpr, 'rFonts');
  if (fonts) {
    const a = attrsOf(fonts);
    if (a.hAnsi || a.ascii) ts.ff = a.hAnsi || a.ascii;
    if (a.eastAsia) ts.eastAsiaFontFamily = a.eastAsia;
  }

  const sz = numAttr(kid(rpr, 'sz'), 'val');
  if (sz != null) ts.fs = sz * HALF_PT_TO_PT;

  const b = kid(rpr, 'b');
  if (b) ts.bl = attrsOf(b).val === '0' || attrsOf(b).val === 'false' ? 0 : 1;

  const italic = kid(rpr, 'i');
  if (italic) ts.it = attrsOf(italic).val === '0' || attrsOf(italic).val === 'false' ? 0 : 1;

  const u = kid(rpr, 'u');
  if (u && attrsOf(u).val !== 'none') ts.ul = { s: 1 };

  const color = attrsOf(kid(rpr, 'color')).val;
  if (color && color !== 'auto') ts.cl = { rgb: `#${color}` };

  return ts;
}

function mergeTs(base: UniverRunStyle, over: UniverRunStyle): UniverRunStyle {
  return { ...base, ...over };
}

/** 沿 basedOn 链收集某样式的 rPr，逐级覆盖 */
function styleRunTs(
  ctx: StyleContext,
  styleId: string | undefined,
  seen = new Set<string>(),
): UniverRunStyle {
  if (!styleId || seen.has(styleId)) return {};
  seen.add(styleId);
  const def = ctx.styles.get(styleId);
  if (!def) return {};
  const inherited = styleRunTs(ctx, def.basedOn, seen);
  return mergeTs(inherited, runStyleFromRPr(def.run ?? null));
}

/** 沿 basedOn 链收集某样式的 pPr 元素链（从根到叶） */
function styleParaEls(
  ctx: StyleContext,
  styleId: string | undefined,
  seen = new Set<string>(),
): Element[] {
  if (!styleId || seen.has(styleId)) return [];
  seen.add(styleId);
  const def = ctx.styles.get(styleId);
  if (!def) return [];
  return [...styleParaEls(ctx, def.basedOn, seen), ...(def.para ? [def.para] : [])];
}

/* ------------------------------------------------------------------ *
 * w:pPr → 段落样式
 * ------------------------------------------------------------------ */

function alignFromJc(val: string | undefined): number | undefined {
  switch (val) {
    case 'center':
      return HorizontalAlign.CENTER;
    case 'right':
    case 'end':
      return HorizontalAlign.RIGHT;
    case 'both':
    case 'justify':
      return HorizontalAlign.JUSTIFIED;
    case 'left':
    case 'start':
      return HorizontalAlign.LEFT;
    default:
      return undefined;
  }
}

function paragraphStyleFromPPr(ppr: Element | null): UniverParagraphStyle {
  const ps: UniverParagraphStyle = {};
  if (!ppr) return ps;

  const jc = alignFromJc(attrsOf(kid(ppr, 'jc')).val);
  if (jc !== undefined) ps.horizontalAlign = jc;

  const spacing = kid(ppr, 'spacing');
  if (spacing) {
    const a = attrsOf(spacing);
    const before = Number(a.before);
    if (Number.isFinite(before) && before > 0) ps.spaceAbove = { v: before * TWIP_TO_PT };
    const after = Number(a.after);
    if (Number.isFinite(after) && after > 0) ps.spaceBelow = { v: after * TWIP_TO_PT };
    const line = Number(a.line);
    if (Number.isFinite(line) && line > 0 && a.lineRule !== 'atLeast' && a.lineRule !== 'exact') {
      ps.lineSpacing = line / LINE_SINGLE;
    }
  }
  return ps;
}

function resolveParagraphStyle(
  ctx: StyleContext,
  ppr: Element | null,
  styleId: string | undefined,
): UniverParagraphStyle {
  let ps: UniverParagraphStyle = {};
  for (const el of styleParaEls(ctx, styleId)) {
    ps = { ...ps, ...paragraphStyleFromPPr(el) };
  }
  ps = { ...ps, ...paragraphStyleFromPPr(ppr) };
  return ps;
}

/** 段落级默认字符样式（w:pPr/w:rPr），作为该段所有 run 的基线 */
function resolveParagraphBaseTs(
  ctx: StyleContext,
  ppr: Element | null,
  styleId: string | undefined,
): UniverRunStyle {
  let ts = ctx.defaultRunTs;
  for (const el of styleParaEls(ctx, styleId)) {
    ts = mergeTs(ts, runStyleFromRPr(kid(el, 'rPr')));
  }
  if (ppr) ts = mergeTs(ts, runStyleFromRPr(kid(ppr, 'rPr')));
  return ts;
}

function resolveRunTs(
  ctx: StyleContext,
  base: UniverRunStyle,
  pStyleId: string | undefined,
  rStyleId: string | undefined,
  rpr: Element | null,
): UniverRunStyle {
  let ts = base;
  ts = mergeTs(ts, styleRunTs(ctx, pStyleId));
  ts = mergeTs(ts, styleRunTs(ctx, rStyleId));
  ts = mergeTs(ts, runStyleFromRPr(rpr));
  return ts;
}

/* ------------------------------------------------------------------ *
 * 快照构建器
 * ------------------------------------------------------------------ */

interface BuiltCell {
  columnSpan: number;
  /** 纵向合并的行数，仅 >1 时有意义（Univer 的 ITableCell.rowSpan） */
  rowSpan?: number;
  margin?: Record<string, { v: number }>;
  backgroundColor?: { rgb: string };
  vAlign?: number;
  borders?: Record<string, unknown>;
}

interface BuiltRow {
  tableCells: BuiltCell[];
  trHeight: { val: { v: number }; hRule: number };
}

class DocBuilder {
  stream = '';

  paragraphs: UniverDocSnapshot['body']['paragraphs'] = [];

  sectionBreaks: UniverDocSnapshot['body']['sectionBreaks'] = [];

  textRuns: UniverDocSnapshot['body']['textRuns'] = [];

  tables: UniverDocSnapshot['body']['tables'] = [];

  tableSource: UniverDocSnapshot['tableSource'] = {};

  private pid = 0;

  private sid = 0;

  private tid = 0;

  /** 追加带样式的正文文本（空串不产 run，避免零长度 run） */
  addText(text: string, ts: UniverRunStyle) {
    if (!text) return;
    const st = this.stream.length;
    this.stream += text;
    this.textRuns.push({ st, ed: st + text.length, ts });
  }

  /** 追加段落标记 \r，并登记段落条目 */
  addParagraphMark(ps?: UniverParagraphStyle, bullet?: UniverBullet) {
    const startIndex = this.stream.length;
    this.stream += SENTINEL.PARAGRAPH;
    this.paragraphs.push({
      startIndex,
      paragraphId: `p_${this.pid}_${startIndex}`,
      ...(Object.keys(ps ?? {}).length ? { paragraphStyle: ps } : {}),
      ...(bullet ? { bullet } : {}),
    });
    this.pid += 1;
  }

  /** 追加分节标记 \n，并登记分节条目 */
  addSectionMark() {
    const startIndex = this.stream.length;
    this.stream += SENTINEL.SECTION_BREAK;
    this.sectionBreaks.push({ sectionId: `s_${this.sid}_${startIndex}`, startIndex });
    this.sid += 1;
  }

  nextTableId() {
    this.tid += 1;
    return `tbl_${Date.now().toString(36)}_${this.tid}`;
  }
}

/* ------------------------------------------------------------------ *
 * 段落 / 表格发射
 * ------------------------------------------------------------------ */

/** w:br / w:cr 在 Univer 里没有对应的「段内软换行」，按换段处理 */
const RUN_TEXT_TAGS = new Set(['t', 'tab', 'br', 'cr']);

function emitRuns(
  b: DocBuilder,
  parent: Element,
  ctx: StyleContext,
  baseTs: UniverRunStyle,
  pStyleId: string | undefined,
  ps: UniverParagraphStyle,
) {
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.localName;
      if (tag === 'r') {
        const rpr = kid(child, 'rPr');
        const rStyleId = attrsOf(rpr).rStyle;
        const finalTs = resolveRunTs(ctx, baseTs, pStyleId, rStyleId, rpr);
        for (const part of Array.from(child.children)) {
          const t = part.localName;
          if (t === 't') {
            b.addText(part.textContent ?? '', finalTs);
          } else if (t === 'tab') {
            b.addText(SENTINEL.TAB, finalTs);
          } else if (t === 'br' || t === 'cr') {
            // 软换行 → 换段（沿用本段样式；单元格内由统一的格末 \n 收口）
            b.addParagraphMark(ps);
          } else if (t === 'drawing' || t === 'pict' || t === 'object') {
            // 图片 / 浮动对象暂不导入
          } else if (t === 'noBreakHyphen') {
            b.addText('-', finalTs);
          }
        }
      } else if (tag === 'hyperlink' || tag === 'smartTag' || tag === 'ins' || tag === 'sdt') {
        walk(child);
      }
      // del / delText（修订删除内容）与其余未知元素一律跳过
    }
  };
  walk(parent);
}

function emitParagraph(
  b: DocBuilder,
  pel: Element,
  ctx: StyleContext,
) {
  const ppr = kid(pel, 'pPr');
  const styleId = attrsOf(kid(ppr, 'pStyle')).val;
  const ps = resolveParagraphStyle(ctx, ppr, styleId);
  const baseTs = resolveParagraphBaseTs(ctx, ppr, styleId);
  emitRuns(b, pel, ctx, baseTs, styleId, ps);
  b.addParagraphMark(ps, bulletFromPPr(ctx, ppr, styleId));
}

function heightRuleFromDocx(val: string | undefined): number {
  if (val === 'exact') return TableRowHeightRule.EXACT;
  if (val === 'atLeast') return TableRowHeightRule.AT_LEAST;
  return TableRowHeightRule.AUTO;
}

function cellMarginFrom(el: Element | null): Record<string, { v: number }> | undefined {
  if (!el) return undefined;
  const pick = (name: string): { v: number } | undefined => {
    const w = numAttr(kid(el, name), 'w');
    return w != null ? { v: w * TWIP_TO_PT } : undefined;
  };
  const margin: Record<string, { v: number }> = {};
  const start = pick('start') ?? pick('left');
  const end = pick('end') ?? pick('right');
  const top = pick('top');
  const bottom = pick('bottom');
  if (start) margin.start = start;
  if (end) margin.end = end;
  if (top) margin.top = top;
  if (bottom) margin.bottom = bottom;
  return Object.keys(margin).length ? margin : undefined;
}

function borderFrom(el: Element | null): Record<string, unknown> | undefined {
  if (!el) return undefined;
  const one = (name: string): Record<string, unknown> | undefined => {
    const b = kid(el, name);
    if (!b) return undefined;
    const a = attrsOf(b);
    if (a.val === 'nil' || a.val === 'none') return undefined;
    const border: Record<string, unknown> = { color: { rgb: `#${a.color || '000000'}` } };
    const sz = Number(a.sz);
    if (Number.isFinite(sz) && sz > 0) border.width = { v: sz * BORDER_SZ_TO_PT };
    border.dashStyle =
      a.val === 'dashed' || a.val === 'dashSmallGap'
        ? DashStyleType.DASH
        : a.val === 'dotted'
          ? DashStyleType.DOT
          : DashStyleType.SOLID;
    return border;
  };
  const out: Record<string, unknown> = {};
  const top = one('top');
  const left = one('start') ?? one('left');
  const bottom = one('bottom');
  const right = one('end') ?? one('right');
  if (top) out.borderTop = top;
  if (left) out.borderLeft = left;
  if (bottom) out.borderBottom = bottom;
  if (right) out.borderRight = right;
  return Object.keys(out).length ? out : undefined;
}

/**
 * 单元格内容：内部 w:p 逐段发射（嵌套表格拍平为文本）。
 *
 * 数据流树的解析规则（engine-render 的 DataStreamTree）：\r 逐个累积段落，
 * \n 把当前累积的段落批量挂到单元格上。所以多段落单元格是
 * `t1\rt2\r\n` —— 段落用 \r 分隔，格末一个 \n 收口，与 genEmptyTable
 * 的空格形态（CELL_START \r\n CELL_END）完全一致。
 */
function emitCellContent(
  b: DocBuilder,
  tc: Element,
  ctx: StyleContext,
) {
  const paras = kids(tc, 'p');
  const nested = kids(tc, 'tbl');

  for (const node of paras) emitParagraph(b, node, ctx);

  for (const node of nested) {
    // 嵌套表格拍平：每个内部段落转成一段纯文本
    for (const p of Array.from(node.getElementsByTagNameNS('*', 'p'))) {
      b.addText((p.textContent ?? '').replace(/\s+/g, ' ').trim(), {});
      b.addParagraphMark();
    }
  }

  if (!paras.length && !nested.length) b.addParagraphMark();
  b.addSectionMark();
}

/** 一行的单元格布局：Word 里被纵向合并覆盖的格子在 XML 中依然占位，
 *  所以起始列直接用 gridSpan 累积即可，不必先算合并。 */
interface CellSlot {
  tc: Element;
  col0: number;
  colSpan: number;
  /** vMerge 续接格：被上方 rowSpan 吞并，不生成 ITableCell 也不写数据流 */
  cont: boolean;
  rowSpan: number;
}

function layoutRow(tr: Element): CellSlot[] {
  const slots: CellSlot[] = [];
  let col = 0;
  for (const tc of kids(tr, 'tc')) {
    const tcPr = kid(tc, 'tcPr');
    const colSpan = numAttr(kid(tcPr, 'gridSpan'), 'val') ?? 1;
    slots.push({ tc, col0: col, colSpan, cont: false, rowSpan: 1 });
    col += colSpan;
  }
  return slots;
}

/**
 * 纵向合并（w:vMerge）：`<w:vMerge w:val="restart"/>` 是合并起点，其后若干行里
 * **同列位置**的 `<w:vMerge/>`（val 缺失即 continue）被它吞并。
 *
 * Univer 侧用 ITableCell.rowSpan 表达，且 core 的合并工具会把被覆盖的格子从矩阵里
 * realDeleteValue 删掉 —— 所以 continue 的格子必须**完全跳过**：既不进 tableCells，
 * 也不写 CELL_START/CELL_END 数据流。否则数据流里的格子数与 tableCells 对不上，
 * 整个表格会渲染错位（engine-render 按 tableRows[row].tableCells[col] 索引访问）。
 */
function applyVMerge(rows: CellSlot[][]): void {
  const isRestart = (slot: CellSlot): boolean => {
    const vm = kid(kid(slot.tc, 'tcPr'), 'vMerge');
    return !!vm && (attrsOf(vm).val ?? '') === 'restart';
  };
  const isContinue = (slot: CellSlot): boolean => {
    const vm = kid(kid(slot.tc, 'tcPr'), 'vMerge');
    return !!vm && (attrsOf(vm).val ?? '') !== 'restart';
  };

  for (const slots of rows) {
    for (const s of slots) {
      if (isContinue(s)) s.cont = true;
    }
  }

  const atCol = (r: number, col0: number): CellSlot | undefined =>
    rows[r]?.find((s) => s.col0 === col0);

  for (let r = 0; r < rows.length; r += 1) {
    for (const s of rows[r]) {
      if (!isRestart(s)) continue;
      // 向下数同列位置连续的 continue 行
      let span = 1;
      for (let rr = r + 1; rr < rows.length; rr += 1) {
        const below = atCol(rr, s.col0);
        if (!below || !below.cont) break;
        span += 1;
      }
      s.rowSpan = span;
    }
  }
}

function emitTable(
  b: DocBuilder,
  tbl: Element,
  ctx: StyleContext,
  pageContentWidth: number,
) {
  // 表格前必须有段落标记（照 Univer shouldCreateParagraphBeforeTable 的约束）
  if (b.stream === '' || !b.stream.endsWith(SENTINEL.PARAGRAPH)) {
    b.addParagraphMark();
  }

  const tblPr = kid(tbl, 'tblPr');
  const tableId = b.nextTableId();
  const startIndex = b.stream.length;
  b.stream += SENTINEL.TABLE_START;

  // 网格列宽（twips → pt）
  let grid = kids(kid(tbl, 'tblGrid'), 'gridCol')
    .map((c) => numAttr(c, 'w') ?? 0)
    .map((w) => w * TWIP_TO_PT);
  const contentWidth = Math.max(
    grid.reduce((s, w) => s + w, 0),
    1,
  );
  if (!grid.length) {
    grid = [pageContentWidth];
  }

  const rows: BuiltRow[] = [];
  const tableBorders = borderFrom(kid(tblPr, 'tblBorders'));
  const tableMargin = cellMarginFrom(kid(tblPr, 'tblCellMar'));

  const rawRows = kids(tbl, 'tr');
  const layouts = rawRows.map(layoutRow);
  applyVMerge(layouts);

  for (let r = 0; r < rawRows.length; r += 1) {
    b.stream += SENTINEL.TABLE_ROW_START;
    const cells: BuiltCell[] = [];
    const trPr = kid(rawRows[r], 'trPr');
    const hVal = numAttr(kid(trPr, 'trHeight'), 'val');
    const hRule = heightRuleFromDocx(attrsOf(kid(trPr, 'trHeight')).val);

    for (const slot of layouts[r]) {
      // 续接格：被上方 rowSpan 覆盖，整个格子不被渲染，数据流也不能写
      if (slot.cont) continue;

      b.stream += SENTINEL.TABLE_CELL_START;
      emitCellContent(b, slot.tc, ctx);
      b.stream += SENTINEL.TABLE_CELL_END;

      const tcPr = kid(slot.tc, 'tcPr');
      const cell: BuiltCell = { columnSpan: slot.colSpan };
      if (slot.rowSpan > 1) cell.rowSpan = slot.rowSpan;
      const margin = cellMarginFrom(kid(tcPr, 'tcMar')) ?? tableMargin;
      if (margin) cell.margin = margin;
      const fill = attrsOf(kid(tcPr, 'shd')).fill;
      if (fill && fill !== 'auto') cell.backgroundColor = { rgb: `#${fill}` };
      const vAlign = attrsOf(kid(tcPr, 'vAlign')).val;
      if (vAlign === 'center') cell.vAlign = VerticalAlignmentType.CENTER;
      else if (vAlign === 'bottom') cell.vAlign = VerticalAlignmentType.BOTTOM;
      else if (vAlign === 'top') cell.vAlign = VerticalAlignmentType.TOP;
      const borders = borderFrom(kid(tcPr, 'tcBorders')) ?? tableBorders;
      if (borders) Object.assign(cell, borders);
      cells.push(cell);
    }
    b.stream += SENTINEL.TABLE_ROW_END;
    rows.push({
      tableCells: cells,
      trHeight: { val: { v: (hVal ?? 0) * TWIP_TO_PT }, hRule },
    });
  }

  b.stream += SENTINEL.TABLE_END;
  const endIndex = b.stream.length;
  // 表格后补一个段落标记（照 buildDocTableInsertBody 的结构）
  b.addParagraphMark();

  b.tables.push({ startIndex, endIndex, tableId });

  const jc = attrsOf(kid(tblPr, 'jc')).val;
  b.tableSource[tableId] = {
    tableRows: rows,
    tableColumns: grid.map((w) => ({ size: { type: TableSizeType.SPECIFIED, width: { v: w } } })),
    tableId,
    align:
      jc === 'center'
        ? TableAlignmentType.CENTER
        : jc === 'right' || jc === 'end'
          ? TableAlignmentType.END
          : TableAlignmentType.START,
    indent: { v: 0 },
    textWrap: TableTextWrapType.NONE,
    position: {
      positionH: { relativeFrom: ObjectRelativeFromH.PAGE, posOffset: 0 },
      positionV: { relativeFrom: ObjectRelativeFromV.PAGE, posOffset: 0 },
    },
    dist: { distB: 0, distL: 0, distR: 0, distT: 0 },
    cellMargin: tableMargin ?? {
      start: { v: 10 },
      end: { v: 10 },
      top: { v: 5 },
      bottom: { v: 5 },
    },
    layout: TableLayoutType.AUTO_FIT,
    size: {
      type: TableSizeType.SPECIFIED,
      width: { v: contentWidth > 1 ? contentWidth : pageContentWidth },
    },
  };
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

export async function docxToSnapshot(file: File, title: string): Promise<UniverDocSnapshot> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error('无法读取该文件，请确认是 .docx 格式（不支持老版 .doc 二进制）');
  }

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('文件里缺少 word/document.xml，不是有效的 .docx');
  const stylesXml = (await zip.file('word/styles.xml')?.async('string')) ?? null;
  const numberingXml = (await zip.file('word/numbering.xml')?.async('string')) ?? null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(await docXmlFile.async('string'), 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('document.xml 解析失败');
  }
  const ctx = parseStyles(stylesXml, numberingXml);

  const bodyEl = doc.documentElement.localName === 'document' ? kid(doc.documentElement, 'body') : null;
  if (!bodyEl) throw new Error('document.xml 里没有 w:body');

  // 页面设置来自最后一个 sectPr（宽高/页边距，单位 twips）
  const sectPr = kid(bodyEl, 'sectPr');
  const pgSz = attrsOf(kid(sectPr, 'pgSz'));
  const pgMar = attrsOf(kid(sectPr, 'pgMar'));
  const pageW = (Number(pgSz.w) || 11906) * TWIP_TO_PT;
  const pageH = (Number(pgSz.h) || 16838) * TWIP_TO_PT;
  const marginTop = (Number(pgMar.top) || 1440) * TWIP_TO_PT;
  const marginBottom = (Number(pgMar.bottom) || 1440) * TWIP_TO_PT;
  const marginLeft = (Number(pgMar.left) || 1800) * TWIP_TO_PT;
  const marginRight = (Number(pgMar.right) || 1800) * TWIP_TO_PT;
  const contentWidth = Math.max(pageW - marginLeft - marginRight, 100);

  const b = new DocBuilder();
  for (const block of Array.from(bodyEl.children)) {
    if (block.localName === 'p') emitParagraph(b, block, ctx);
    else if (block.localName === 'tbl') emitTable(b, block, ctx, contentWidth);
    // sectPr / bookmark / proofErr 等一律跳过
  }

  // 兜底：空文档也要有一段
  if (!b.paragraphs.length) b.addParagraphMark();
  // 文档必须以 \r\n 收尾
  if (!b.stream.endsWith(SENTINEL.PARAGRAPH)) b.addParagraphMark();
  b.addSectionMark();

  // 条目必须与下标同序
  b.paragraphs.sort((x, y) => x.startIndex - y.startIndex);
  b.sectionBreaks.sort((x, y) => x.startIndex - y.startIndex);
  b.textRuns.sort((x, y) => x.st - y.st);

  return {
    id: `doc_${Date.now()}`,
    title,
    body: {
      dataStream: b.stream,
      textRuns: b.textRuns,
      paragraphs: b.paragraphs,
      sectionBreaks: b.sectionBreaks,
      tables: b.tables,
    },
    documentStyle: {
      pageSize: { width: pageW, height: pageH },
      documentFlavor: 2,
      marginTop,
      marginBottom,
      marginLeft,
      marginRight,
      autoHyphenation: 0,
      textStyle: ctx.defaultRunTs.fs ? { ff: ctx.defaultRunTs.ff, fs: ctx.defaultRunTs.fs } : {},
    },
    tableSource: b.tableSource,
  };
}
