/**
 * Univer 快照 ↔ Office 文件互转
 *
 * Univer 社区版只有编辑器，没有 docx/xlsx 的导入导出，本模块补上这一段：
 *
 * - 导出 Word：`body.dataStream` 是一串「文本 + 哨兵」的混编序列，逐字符扫描：
 *   正文段落按 `\r` 切分并用 `textRuns` 的字符区间还原加粗/字号/颜色，表格则是一段
 *   哨兵区间，整体转成真正的 `w:tbl`（含边框、底纹、垂直对齐、跨行跨列）；
 * - 导入 Word：直读 OOXML（见 docxImport.ts），保留字体、段落、编号与表格。
 *
 * 保真度定位：文字、段落层级、项目符号与编号、行内样式（粗/斜/下划线/删除线/
 * 颜色/字号）、表格（含合并单元格）往返完整；页眉页脚、批注、图片、分栏不处理。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  HeightRule,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type { UniverBullet } from './docxImport';

/* ------------------------------------------------------------------ *
 * Univer 快照类型（只声明用得到的字段）
 * ------------------------------------------------------------------ */

interface UniverRunStyle {
  /** 字体 */
  ff?: string;
  /** 字号（pt） */
  fs?: number;
  /** 加粗 */
  bl?: number;
  /** 斜体 */
  it?: number;
  /** 下划线 */
  ul?: { s?: number };
  /** 删除线 */
  st?: { s?: number };
  /** 颜色 */
  cl?: { rgb?: string };
  /** 垂直对齐：1 上标 2 下标 */
  va?: number;
}

interface UniverTextRun {
  st: number;
  ed: number;
  ts?: UniverRunStyle;
}

interface UniverDocSnapshot {
  id?: string;
  title?: string;
  body?: {
    dataStream?: string;
    textRuns?: UniverTextRun[];
    paragraphs?: { startIndex: number; bullet?: UniverBullet }[];
    /** 分节标记 `\n` 的下标，缺了排版引擎切不出「节」 */
    sectionBreaks?: { startIndex: number }[];
    /** 表格哨兵区间（startIndex 指向数据流里的 \u001A） */
    tables?: { startIndex: number; endIndex: number; tableId: string }[];
  };
  documentStyle?: {
    pageSize?: { width?: number; height?: number };
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
  };
  /** tableId → Univer 表格定义，与 body.tables 配套 */
  tableSource?: Record<string, UniverTable>;
}

/** Univer 文档表格（IDocumentBody 之外的 tableSource 条目） */
interface UniverTable {
  tableRows?: {
    tableCells?: UniverTableCell[];
    trHeight?: { val?: { v?: number } };
    repeatHeaderRow?: number;
  }[];
  tableColumns?: { size?: { width?: { v?: number } } }[];
}

interface UniverTableCell {
  columnSpan?: number;
  rowSpan?: number;
  vAlign?: number;
  backgroundColor?: { rgb?: string };
  /** { v: pt } */
  size?: { width?: { v?: number } };
  borderTop?: UniverCellBorder;
  borderBottom?: UniverCellBorder;
  borderLeft?: UniverCellBorder;
  borderRight?: UniverCellBorder;
}

interface UniverCellBorder {
  color?: { rgb?: string };
  /** { v: pt } */
  width?: { v?: number };
}

/** 1pt = 20 twip，docx 内部长度单位 */
const PT_TO_TWIP = 20;
/** A4 纵向（pt），快照缺失页面设置时的兜底 */
const DEFAULT_PAGE = { width: 595.3, height: 841.9 };
const DEFAULT_MARGIN = { top: 72, bottom: 72, left: 90, right: 90 };
/** 正文字号（pt），用于判断一段是否为标题 */
const BODY_FONT_SIZE = 12;

/* ------------------------------------------------------------------ *
 * 导出：Univer 快照 → .docx
 * ------------------------------------------------------------------ */

/** 取字符位置命中的行内样式 */
function styleAt(textRuns: UniverTextRun[], index: number): UniverRunStyle | undefined {
  for (const run of textRuns) {
    if (index >= run.st && index < run.ed) return run.ts;
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * 导出：正文段落与表格混合编排
 *
 * Univer 的数据流是「文本 + 哨兵」的混编序列：正文段落以 \r 结束，表格是一段
 * 由哨兵包裹的区间（\u001A…\u000F），其中每个单元格又由 \u001C…\u001D 包裹。
 * 所以不能像早先那样先把整条数据流净化再按 \r 切 —— 那样表格里的文字会被泼进
 * 前后段落。正确做法是逐字符扫描：遇到段落标记就冲刷缓冲，遇到表格起点就把整个
 * 区间交给表格构造器。
 * ------------------------------------------------------------------ */

const DOC_TOKEN = {
  TABLE_START: '\u001A',
  TABLE_ROW_START: '\u001B',
  TABLE_CELL_START: '\u001C',
  TABLE_CELL_END: '\u001D',
  TABLE_ROW_END: '\u000E',
  TABLE_END: '\u000F',
  PARAGRAPH: '\r',
  SECTION_BREAK: '\n',
} as const;

/** Univer VerticalAlignmentType → docx 的 TableVerticalAlign（TOP=2 / CENTER=3 / BOTTOM=4）。
 *  这里不用 VerticalAlign 全量，因为它还有表格用不到的 both 成员会导致类型冲突。 */
const DOC_V_ALIGN: Record<number, 'top' | 'center' | 'bottom' | undefined> = {
  2: VerticalAlign.TOP,
  3: VerticalAlign.CENTER,
  4: VerticalAlign.BOTTOM,
};

/** 净化后的一段文本，附带每个字符在原始数据流里的下标 —— 查字符样式全靠它 */
interface Slice {
  text: string;
  orig: number[];
}

/** 数据流区间 → 若干段（按 \r 切）。哨兵与分节符剥离，下标保留以便查样式 */
function sliceRange(stream: string, from: number, to: number): Slice[] {
  const out: Slice[] = [];
  let text = '';
  let orig: number[] = [];
  const push = () => {
    if (text || orig.length) out.push({ text, orig });
    text = '';
    orig = [];
  };
  for (let i = from; i < to; i += 1) {
    const code = stream.charCodeAt(i);
    // \r 切段；\t 保留；其余控制字符（哨兵、分节符）一律剥离
    if (code === 13) push();
    else if (code === 9) {
      text += stream[i];
      orig.push(i);
    } else if (code < 32) continue;
    else {
      text += stream[i];
      orig.push(i);
    }
  }
  push();
  // 尾部的收口分节符会留下一个空段，丢掉
  while (out.length && !out[out.length - 1].text) out.pop();
  return out;
}

/** 表格区间内每个单元格的原始下标范围，按行分组（与 tableRows 一一对应） */
function listCellRanges(
  stream: string,
  from: number,
  to: number,
): { start: number; end: number }[][] {
  const rows: { start: number; end: number }[][] = [];
  let cur: { start: number; end: number }[] | null = null;
  let cellStart = -1;
  for (let i = from; i < to; i += 1) {
    const ch = stream[i];
    if (ch === DOC_TOKEN.TABLE_ROW_START) {
      cur = [];
      rows.push(cur);
    } else if (ch === DOC_TOKEN.TABLE_CELL_START) {
      cellStart = i + 1;
    } else if (ch === DOC_TOKEN.TABLE_CELL_END) {
      if (cur && cellStart >= 0) cur.push({ start: cellStart, end: i });
      cellStart = -1;
    }
  }
  return rows;
}

function makeDocxRun(
  text: string,
  ts: UniverRunStyle | undefined,
  fallbackSize: number,
): TextRun {
  return new TextRun({
    text,
    bold: !!ts?.bl,
    italics: !!ts?.it,
    underline: ts?.ul?.s ? {} : undefined,
    strike: !!ts?.st?.s,
    color: ts?.cl?.rgb ? ts.cl.rgb.replace(/^#/, '') : undefined,
    size: (ts?.fs ?? fallbackSize) * 2,
    font: ts?.ff ? { name: ts.ff, hint: 'eastAsia' } : undefined,
    superScript: ts?.va === 1 || undefined,
    subScript: ts?.va === 2 || undefined,
  });
}

/** 依据原始下标把一段文本按样式边界切成 docx 的 TextRun */
function runsFromSlice(
  slice: Slice,
  textRuns: UniverTextRun[],
  fallbackSize: number,
): TextRun[] {
  const { text, orig } = slice;
  if (!text) return [makeDocxRun('', undefined, fallbackSize)];
  if (!orig.length) return [makeDocxRun(text, undefined, fallbackSize)];

  // 原始下标 → 净化后下标：找第一个 ≥ o 的位置
  const at = (o: number): number => {
    let lo = 0;
    let hi = orig.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (orig[mid] < o) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const start = orig[0];
  const end = orig[orig.length - 1] + 1;
  const points = new Set<number>([0, text.length]);
  for (const run of textRuns) {
    if (run.ed <= start || run.st >= end) continue;
    points.add(at(Math.max(run.st, start)));
    points.add(at(Math.min(run.ed, end)));
  }

  const sorted = [...points].sort((a, b) => a - b);
  const runs: TextRun[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const f = sorted[i];
    const t = sorted[i + 1];
    if (t <= f) continue;
    const o = orig[f];
    runs.push(
      makeDocxRun(
        text.slice(f, t),
        o === undefined ? undefined : styleAt(textRuns, o),
        fallbackSize,
      ),
    );
  }
  return runs.length ? runs : [makeDocxRun(text, undefined, fallbackSize)];
}

/** Univer 单元格边框 → docx 边框（Univer 的 width 单位是 pt，OOXML 的 sz 是 1/8 pt） */
function cellBorders(cell: UniverTableCell) {
  const one = (b: UniverCellBorder | undefined) =>
    b
      ? {
          style: BorderStyle.SINGLE,
          size: Math.max(Math.round((b.width?.v ?? 1) * 8), 1),
          color: (b.color?.rgb ?? '#000000').replace(/^#/, ''),
        }
      : undefined;
  const borders = {
    top: one(cell.borderTop),
    bottom: one(cell.borderBottom),
    left: one(cell.borderLeft),
    right: one(cell.borderRight),
  };
  return borders.top || borders.bottom || borders.left || borders.right ? borders : undefined;
}

/** 构造一个 docx 表格：行列结构取自 tableSource，文字取自数据流里的单元格区间 */
function buildDocTable(
  stream: string,
  range: { startIndex: number; endIndex: number; tableId: string },
  src: UniverTable,
  textRuns: UniverTextRun[],
): Table {
  const rangeRows = listCellRanges(stream, range.startIndex, range.endIndex);
  const srcRows = src.tableRows ?? [];
  const columnWidths = (src.tableColumns ?? [])
    .map((c) => c.size?.width?.v)
    .filter((w): w is number => typeof w === 'number' && w > 0)
    .map((w) => Math.round(w * PT_TO_TWIP));

  const rows: TableRow[] = [];
  for (let r = 0; r < srcRows.length; r += 1) {
    const srcRow = srcRows[r];
    const rangeRow = rangeRows[r] ?? [];
    const cells: TableCell[] = [];
    const cellDefs = srcRow.tableCells ?? [];

    for (let c = 0; c < cellDefs.length; c += 1) {
      const def = cellDefs[c];
      const area = rangeRow[c];
      const slices = area ? sliceRange(stream, area.start, area.end) : [];
      const paras = slices.length
        ? slices.map((s) => new Paragraph({ children: runsFromSlice(s, textRuns, BODY_FONT_SIZE) }))
        : [new Paragraph({ children: [makeDocxRun('', undefined, BODY_FONT_SIZE)] })];

      cells.push(
        new TableCell({
          children: paras,
          columnSpan: (def.columnSpan ?? 1) > 1 ? def.columnSpan : undefined,
          rowSpan: (def.rowSpan ?? 1) > 1 ? def.rowSpan : undefined,
          verticalAlign: DOC_V_ALIGN[def.vAlign ?? 0],
          shading: def.backgroundColor?.rgb
            ? { type: ShadingType.CLEAR, fill: def.backgroundColor.rgb.replace(/^#/, '') }
            : undefined,
          borders: cellBorders(def),
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          // 跨列格子不指定宽度，让 Word 按跨的几列合计
          width:
            def.size?.width?.v && (def.columnSpan ?? 1) <= 1
              ? { size: Math.round(def.size.width.v * PT_TO_TWIP), type: WidthType.DXA }
              : undefined,
        }),
      );
    }

    const h = srcRow.trHeight?.val?.v;
    rows.push(
      new TableRow({
        children: cells,
        height:
          h && h > 0 ? { value: Math.round(h * PT_TO_TWIP), rule: HeightRule.ATLEAST } : undefined,
      }),
    );
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: columnWidths.length ? columnWidths : undefined,
  });
}

/** Univer 的 bullet → docx 的列表形态。listType 是 Univer 预设列表表的键 */
type BulletShape = 'bullet' | 'order' | 'orderMulti';

function bulletShape(listType: string | undefined): BulletShape {
  if (listType === 'BULLET_LIST') return 'bullet';
  if (listType === 'ORDER_LIST_2') return 'orderMulti';
  return 'order';
}

interface DocNumbering {
  /** numbering reference → 使用到的层级配置 */
  config: {
    reference: string;
    levels: {
      level: number;
      format: (typeof LevelFormat)[keyof typeof LevelFormat];
      text: string;
      alignment: (typeof AlignmentType)[keyof typeof AlignmentType];
      style: { paragraph: { indent: { left: number; hanging: number } } };
      start?: number;
    }[];
  }[];
}

function buildDocChildren(
  snapshot: UniverDocSnapshot,
  stream: string,
  textRuns: UniverTextRun[],
): { children: (Paragraph | Table)[]; numbering?: DocNumbering } {
  const tableSource = snapshot.tableSource ?? {};
  const tableAt = new Map<number, { startIndex: number; endIndex: number; tableId: string }>();
  for (const t of snapshot.body?.tables ?? []) {
    if (tableSource[t.tableId]) tableAt.set(t.startIndex, t);
  }
  // 段落条目的下标就是它那个 \r 的位置
  const bullets = new Map<number, UniverBullet>();
  for (const p of snapshot.body?.paragraphs ?? []) {
    if (p.bullet) bullets.set(p.startIndex, p.bullet);
  }

  const out: (Paragraph | Table)[] = [];
  /** listId → { 形态, 用到的层级, 起始编号 } */
  const lists = new Map<string, { shape: BulletShape; levels: Set<number>; start: Map<number, number> }>();
  let text = '';
  const orig: number[] = [];

  const flush = (paraStart: number | null) => {
    const slice: Slice = { text, orig: [...orig] };
    text = '';
    orig.length = 0;
    if (!slice.text) return;

    const styleList = slice.orig.map((o) => styleAt(textRuns, o));
    const runs = runsFromSlice(slice, textRuns, BODY_FONT_SIZE);
    const heading = headingOf(runs, styleList);
    const bullet = paraStart === null ? undefined : bullets.get(paraStart);

    // 列表项：docx 有两种写法 —— 符号用内置 bullet，编号要挂到 numbering 的 reference
    let docBullet: { level: number } | undefined;
    let numbering: { reference: string; level: number } | undefined;
    if (bullet) {
      const level = bullet.nestingLevel ?? 0;
      const shape = bulletShape(bullet.listType);
      if (shape === 'bullet') {
        docBullet = { level };
      } else {
        numbering = { reference: bullet.listId, level };
        let entry = lists.get(bullet.listId);
        if (!entry) {
          entry = { shape, levels: new Set(), start: new Map() };
          lists.set(bullet.listId, entry);
        }
        entry.levels.add(level);
        if (bullet.startNumber && bullet.startNumber > 1) entry.start.set(level, bullet.startNumber);
      }
    }

    out.push(
      new Paragraph({
        children: runs,
        heading,
        alignment: AlignmentType.LEFT,
        bullet: docBullet,
        numbering,
        // 列表段落已经有自己的缩进，别再叠中文首行缩进
        spacing: heading ? { after: 120 } : undefined,
        indent:
          heading || docBullet || numbering
            ? undefined
            : slice.text.includes('\t') || !slice.text.trim()
              ? undefined
              : { firstLine: 480 },
      }),
    );
  };

  let i = 0;
  while (i < stream.length) {
    const code = stream.charCodeAt(i);

    if (tableAt.has(i)) {
      const range = tableAt.get(i)!;
      flush(null);
      out.push(buildDocTable(stream, range, tableSource[range.tableId], textRuns));
      i = Math.max(range.endIndex, i + 1);
      continue;
    }
    if (code === 13) {
      // \r 段落标记：它的下标正是段落条目的 startIndex
      flush(i);
      i += 1;
      continue;
    }
    if (code < 32) {
      i += 1;
      continue;
    }
    text += stream[i];
    orig.push(i);
    i += 1;
  }
  flush(null);

  // 把收到的列表转成 docx 的 numbering 配置
  const config: DocNumbering['config'] = [];
  for (const [reference, entry] of lists) {
    const levels = [...entry.levels].sort((a, b) => a - b);
    config.push({
      reference,
      levels: levels.map((level) => {
        // 累积式：1. / 1.1. / 1.1.1.；独立式：每层只显示本级号吗？Word 里 %1 %2 是各层的计数器
        const text =
          entry.shape === 'orderMulti'
            ? Array.from({ length: level + 1 }, (_, k) => `%${k + 1}`).join('.') + '.'
            : `%${level + 1}.`;
        return {
          level,
          format: LevelFormat.DECIMAL,
          text,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
          ...(entry.start.get(level) ? { start: entry.start.get(level)! } : {}),
        };
      }),
    });
  }
  return { children: out, numbering: config.length ? { config } : undefined };
}

/** 依据字号与加粗推断段落在 Word 里的标题级别 */
function headingOf(
  runs: TextRun[],
  styleList: (UniverRunStyle | undefined)[],
): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
  if (!runs.length) return undefined;
  const sizes = styleList.filter(Boolean).map((s) => s?.fs ?? BODY_FONT_SIZE);
  if (!sizes.length) return undefined;
  const maxSize = Math.max(...sizes);
  const allBold = styleList.every((s) => !!s?.bl);

  if (!allBold) return undefined;
  if (maxSize >= 20) return HeadingLevel.HEADING_1;
  if (maxSize >= 16) return HeadingLevel.HEADING_2;
  if (maxSize >= 14) return HeadingLevel.HEADING_3;
  return undefined;
}

/** 把 Univer 文档快照导出为 docx Blob */
export async function docSnapshotToDocxBlob(
  content: string,
  title: string,
): Promise<Blob> {
  let snapshot: UniverDocSnapshot;
  try {
    snapshot = JSON.parse(content) as UniverDocSnapshot;
  } catch {
    throw new Error('正文快照不是合法 JSON，无法导出');
  }

  const dataStream = snapshot.body?.dataStream ?? '';
  const textRuns = snapshot.body?.textRuns ?? [];

  const docStyle = snapshot.documentStyle ?? {};
  const page = docStyle.pageSize ?? DEFAULT_PAGE;
  const margin = {
    top: (docStyle.marginTop ?? DEFAULT_MARGIN.top) * PT_TO_TWIP,
    bottom: (docStyle.marginBottom ?? DEFAULT_MARGIN.bottom) * PT_TO_TWIP,
    left: (docStyle.marginLeft ?? DEFAULT_MARGIN.left) * PT_TO_TWIP,
    right: (docStyle.marginRight ?? DEFAULT_MARGIN.right) * PT_TO_TWIP,
  };

  const { children, numbering } = buildDocChildren(snapshot, dataStream, textRuns);

  if (!children.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: '', size: 24 })] }));
  }

  const doc = new Document({
    creator: '审计工作管理系统',
    title,
    description: '由审计工作管理系统导出',
    numbering,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: Math.round((page.width ?? DEFAULT_PAGE.width) * PT_TO_TWIP),
              height: Math.round((page.height ?? DEFAULT_PAGE.height) * PT_TO_TWIP),
            },
            margin,
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/* ------------------------------------------------------------------ *
 * 导入：.docx → Univer 快照（高保真，直读 OOXML，见 docxImport.ts）
 * ------------------------------------------------------------------ */

export { docxToSnapshot } from './docxImport';
export type { UniverBullet, UniverParagraphStyle, UniverRunStyle } from './docxImport';

/* ------------------------------------------------------------------ *
 * 表格：Univer 快照 ↔ .xlsx
 * ------------------------------------------------------------------ */

interface UniverCell {
  v?: string | number | boolean;
  f?: string;
  t?: number;
  s?: string;
}

interface UniverMerge {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

interface UniverSheet {
  id: string;
  name?: string;
  cellData?: Record<string, Record<string, UniverCell>>;
  mergeData?: UniverMerge[];
  columnData?: Record<string, { w?: number }>;
  rowData?: Record<string, { h?: number }>;
}

interface UniverSheetSnapshot {
  id?: string;
  name?: string;
  sheetOrder?: string[];
  sheets?: Record<string, UniverSheet>;
  styles?: Record<string, unknown>;
}

/** 列号转 A1 地址里的字母部分（0 → A，26 → AA） */
function colName(index: number): string {
  let n = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** 把 Univer 表格快照导出为 xlsx Blob */
export async function sheetSnapshotToXlsxBlob(
  content: string,
  title: string,
): Promise<Blob> {
  const XLSX = await import('xlsx');
  let snapshot: UniverSheetSnapshot;
  try {
    snapshot = JSON.parse(content) as UniverSheetSnapshot;
  } catch {
    throw new Error('正文快照不是合法 JSON，无法导出');
  }

  const order = snapshot.sheetOrder ?? Object.keys(snapshot.sheets ?? {});
  const wb = XLSX.utils.book_new();
  let appended = 0;

  for (const sheetId of order) {
    const sheet = snapshot.sheets?.[sheetId];
    if (!sheet) continue;

    const ws: Record<string, unknown> = {};
    let maxRow = -1;
    let maxCol = -1;

    for (const [rowKey, row] of Object.entries(sheet.cellData ?? {})) {
      const r = Number(rowKey);
      for (const [colKey, cell] of Object.entries(row ?? {})) {
        const c = Number(colKey);
        if (cell?.v === undefined && !cell?.f) continue;
        const addr = `${colName(c)}${r + 1}`;
        const type = typeof cell.v;
        ws[addr] = {
          t: type === 'number' ? 'n' : type === 'boolean' ? 'b' : 's',
          v: cell.v ?? (cell.f ? 0 : ''),
          ...(cell.f ? { f: cell.f.replace(/^=/, '') } : {}),
        };
        if (r > maxRow) maxRow = r;
        if (c > maxCol) maxCol = c;
      }
    }

    if (maxRow >= 0 && maxCol >= 0) {
      ws['!ref'] = `A1:${colName(maxCol)}${maxRow + 1}`;
    }
    if (sheet.mergeData?.length) {
      ws['!merges'] = sheet.mergeData.map((m) => ({
        s: { r: m.startRow, c: m.startColumn },
        e: { r: m.endRow, c: m.endColumn },
      }));
    }
    const cols = Object.entries(sheet.columnData ?? {})
      .filter(([, v]) => typeof v?.w === 'number')
      .map(([k, v]) => ({ wch: Math.max(6, Math.round((v.w as number) / 7)), _idx: Number(k) }))
      .sort((a, b) => a._idx - b._idx);
    if (cols.length) ws['!cols'] = cols.map(({ wch }) => ({ wch }));

    // 表名不能含 : \ / ? * [ ]，且不超过 31 字符
    const name = (sheet.name ?? `Sheet${appended + 1}`).replace(/[:\\/?*[\]]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws as never, name || `Sheet${appended + 1}`);
    appended += 1;
  }

  if (!appended) XLSX.utils.book_append_sheet(wb, {}, 'Sheet1');

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** 把 .xlsx 文件解析为 Univer 表格快照 */
export async function xlsxToSnapshot(file: File, title: string): Promise<UniverSheetSnapshot> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  const sheets: Record<string, UniverSheet> = {};
  const sheetOrder: string[] = [];

  wb.SheetNames.forEach((name, idx) => {
    const ws = wb.Sheets[name];
    const cellData: Record<string, Record<string, UniverCell>> = {};
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;

    if (range) {
      for (let r = range.s.r; r <= range.e.r; r += 1) {
        for (let c = range.s.c; c <= range.e.c; c += 1) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (!cell || (cell.v === undefined && !cell.f)) continue;
          const target: UniverCell = {};
          if (cell.f) {
            target.f = cell.f;
            target.v = typeof cell.v === 'number' ? cell.v : 0;
            target.t = 2;
          } else if (typeof cell.v === 'number') {
            target.v = cell.v;
            target.t = 2;
          } else if (typeof cell.v === 'boolean') {
            target.v = cell.v;
            target.t = 3;
          } else {
            target.v = String(cell.v ?? '');
            target.t = 1;
          }
          (cellData[r] ??= {})[c] = target;
        }
      }
    }

    const mergeData: UniverMerge[] = (ws['!merges'] ?? []).map(
      (m: { s: { r: number; c: number }; e: { r: number; c: number } }) => ({
        startRow: m.s.r,
        startColumn: m.s.c,
        endRow: m.e.r,
        endColumn: m.e.c,
      }),
    );

    const columnData: Record<string, { w: number }> = {};
    (ws['!cols'] ?? []).forEach((col: { wch?: number; width?: number } | undefined, i: number) => {
      const w = col?.wch ?? col?.width;
      if (typeof w === 'number' && w > 0) columnData[i] = { w: Math.round(w * 7) };
    });

    const sheetId = `s${idx + 1}`;
    sheetOrder.push(sheetId);
    sheets[sheetId] = {
      id: sheetId,
      name,
      cellData,
      mergeData,
      columnData,
      rowData: {},
    };
  });

  return {
    id: `sheet_${Date.now()}`,
    name: title,
    sheetOrder,
    sheets,
    styles: {},
  };
}
