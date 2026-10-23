/**
 * Univer 初始快照构造与规范化（纯函数，无 DOM / Univer 运行时依赖，便于单测）。
 *
 * 这里最容易被忽略的是 Word 文档的 `body.paragraphs`：
 * Univer 的换行命令需要靠它定位光标所在段落，缺了这个数组就会出现
 * 「能打字但按回车没反应」的问题，所以新建与读取历史快照都要补齐。
 */
import type { DocEditorType } from '@/types';

export interface UniverParagraph {
  startIndex: number;
  paragraphId: string;
}

/** 依据 dataStream 生成段落索引（Univer 以 \r 作为段落标记） */
export function buildParagraphs(dataStream: string): UniverParagraph[] {
  const paragraphs: UniverParagraph[] = [];
  for (let i = 0; i < dataStream.length; i += 1) {
    if (dataStream[i] === '\r') {
      paragraphs.push({ startIndex: i, paragraphId: `p_${paragraphs.length}_${i}` });
    }
  }
  return paragraphs;
}

/** 正文默认文字样式（Univer 保存快照时的默认字体族/字号/颜色） */
export const DEFAULT_DOC_TEXT_STYLE = {
  ff: 'Arial',
  fs: 11,
  cl: { rgb: '#000000' },
} as const;

/**
 * 文档快照的顶层骨架（字段取自 Univer 自己的 getEmptySnapshot）。
 *
 * 注意：**这些顶层字段缺失并不会导致白页**。新建文档的快照同样只有
 * id/title/body/documentStyle 四个顶层字段，显示一直是正常的。
 * 补它们的真正理由是：Univer 内部对这些容器是直接 `.push` / 直接读属性的，
 * 缺失会在插入表格、插入绘图、设置页眉页脚时踩到 undefined。
 * 因此打开时按这份骨架补齐，缺什么补什么，已有值一律保留。
 *
 * 另外骨架里 autoHyphenation 固定为 0，原因与下方 normalizeDocSnapshot 中
 * 强制关掉自动断字是同一个：Univer 排版是分片增量的，开启自动断字时排版前
 * 要先加载对应语言的连字符词典（5.81MB），词典没到手就
 * `if (state.pendingHyphenation != null) return false`，排版永不发布，
 * 主文档组件于是一个字都不画 —— 只剩背景组件画出的白色页面。
 * 该词典在 Tauri 的自定义协议（tauri://）下加载不到，桌面端必然踩中；
 * 且 Univer 保存快照时会把默认值 autoHyphenation = 1 写回 documentStyle，
 * 所以每次打开文档都要显式关掉。中文文书也用不到西文断字。
 */
const DOC_SCAFFOLD: Record<string, unknown> = {
  locale: 'enUS',
  tableSource: {},
  drawings: {},
  drawingsOrder: [],
  headers: {},
  footers: {},
  notes: {},
  noteSettings: {},
  documentStyle: {
    pageSize: { width: 595.3, height: 841.9 },
    documentFlavor: 2,
    marginTop: 72,
    marginBottom: 72,
    marginRight: 90,
    marginLeft: 90,
    // 自动断字必须关（理由见上方文档注释）
    autoHyphenation: 0,
    doNotHyphenateCaps: 0,
    consecutiveHyphenLimit: 2,
    defaultHeaderId: '',
    defaultFooterId: '',
    evenPageHeaderId: '',
    evenPageFooterId: '',
    firstPageHeaderId: '',
    firstPageFooterId: '',
    evenAndOddHeaders: 0,
    useFirstPageHeaderFooter: 0,
    marginHeader: 30,
    marginFooter: 30,
    renderConfig: {
      zeroWidthParagraphBreak: 0,
      vertexAngle: 0,
      centerAngle: 0,
      background: { rgb: '#ccc' },
    },
    textStyle: DEFAULT_DOC_TEXT_STYLE,
  },
  settings: {},
};

/** 补齐文档快照中缺失的段落结构、骨架字段与默认正文样式 */
export function normalizeDocSnapshot(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const doc = snapshot as {
    body?: {
      dataStream?: unknown;
      paragraphs?: unknown;
      sectionBreaks?: unknown;
      textRuns?: unknown;
      customRanges?: unknown;
      customDecorations?: unknown;
      customBlocks?: unknown;
      tables?: unknown;
      columnGroups?: unknown;
      blockRanges?: unknown;
    };
    documentStyle?: Record<string, unknown>;
  };

  // 1. 顶层骨架：缺的补上，已有的保留
  for (const [key, value] of Object.entries(DOC_SCAFFOLD)) {
    if (doc[key as keyof typeof doc] === undefined) {
      (doc as Record<string, unknown>)[key] =
        typeof value === 'object' && value !== null ? structuredClone(value) : value;
    }
  }

  // 2. documentStyle 内部字段同样逐个补齐（保留已有值）
  const style: Record<string, unknown> = doc.documentStyle ?? {};
  const scaffoldStyle = DOC_SCAFFOLD.documentStyle as Record<string, unknown>;
  for (const [key, value] of Object.entries(scaffoldStyle)) {
    if (style[key] === undefined) {
      style[key] =
        typeof value === 'object' && value !== null ? structuredClone(value) : value;
    }
  }
  // 无论是 Univer 保存时写回的默认值，还是缺失，一律强制关掉自动断字
  style.autoHyphenation = 0;
  // 正文默认样式：保留用户设定，缺的用默认补
  style.textStyle = {
    ...DEFAULT_DOC_TEXT_STYLE,
    ...(typeof style.textStyle === 'object' && style.textStyle !== null
      ? (style.textStyle as Record<string, unknown>)
      : {}),
  };
  doc.documentStyle = style;

  // 3. 正文数据流结构 —— 这一步是「导入 Word 后白页」的真正解药，见下方说明
  const body = doc.body ?? {};
  let stream = typeof body.dataStream === 'string' ? body.dataStream : '';
  if (!stream) stream = '\r\n';

  // 3.1 必须以 \r\n 收尾：\r 是段落标记，\n 是分节标记
  if (!stream.endsWith('\r\n')) {
    stream = stream.endsWith('\r') ? `${stream}\n` : `${stream}\r\n`;
  }
  body.dataStream = stream;

  // 3.2 段落条目：缺则重建；已有则只补齐尾部新产生的那个 \r
  //     （只追加、不改动已有条目，避免打乱 textRuns 的下标）
  const lastParagraphIndex = stream.length - 2;
  if (!Array.isArray(body.paragraphs) || body.paragraphs.length === 0) {
    body.paragraphs = buildParagraphs(stream);
  } else {
    const has = (body.paragraphs as { startIndex?: number }[]).some(
      (p) => p && p.startIndex === lastParagraphIndex,
    );
    if (!has) {
      (body.paragraphs as unknown[]).push({
        startIndex: lastParagraphIndex,
        paragraphId: `p_${(body.paragraphs as unknown[]).length}_${lastParagraphIndex}`,
      });
    }
  }

  // 3.3 分节符：记下每个 \n 的位置（缺了这一项排版引擎切不出「节」）
  if (!Array.isArray(body.sectionBreaks) || body.sectionBreaks.length === 0) {
    const breaks: { startIndex: number }[] = [];
    for (let i = 0; i < stream.length; i += 1) {
      if (stream[i] === '\n') breaks.push({ startIndex: i });
    }
    body.sectionBreaks = breaks.length ? breaks : [{ startIndex: stream.length - 1 }];
  }

  // 3.4 其余正文容器一律补空数组：Univer 对它们是直接 .push 的，
  //     缺了会在插入表格 / 自定义块时抛错
  if (!Array.isArray(body.textRuns)) body.textRuns = [];
  if (!Array.isArray(body.customRanges)) body.customRanges = [];
  if (!Array.isArray(body.customDecorations)) body.customDecorations = [];
  if (!Array.isArray(body.customBlocks)) body.customBlocks = [];
  if (!Array.isArray(body.tables)) body.tables = [];
  if (!Array.isArray(body.columnGroups)) body.columnGroups = [];
  if (!Array.isArray(body.blockRanges)) body.blockRanges = [];
  doc.body = body as typeof doc.body;

  return doc;
}

/** 新建表格的初始快照 */
export function defaultSheetSnapshot(title: string) {
  return {
    id: `sheet_${Date.now()}`,
    name: title,
    sheetOrder: ['s1'],
    sheets: {
      s1: {
        id: 's1',
        name: 'Sheet1',
        rowCount: 200,
        columnCount: 30,
        defaultColumnWidth: 96,
        defaultRowHeight: 26,
        cellData: {},
      },
    },
    styles: {},
  };
}

/**
 * 新建文档（Word 类）的初始快照。
 *
 * dataStream 用 `${title}\r\r\n`：标题行 + 一个空行，两段同属一节。
 * 不要写成 `${title}\r\n\r\n` —— 那是「两段两节」，会被排成两页。
 */
export function defaultDocSnapshot(title: string) {
  const dataStream = `${title}\r\r\n`;
  return {
    id: `doc_${Date.now()}`,
    title,
    body: {
      dataStream,
      paragraphs: buildParagraphs(dataStream),
      sectionBreaks: [{ startIndex: dataStream.length - 1 }],
    },
    documentStyle: {
      pageSize: { width: 595.3, height: 841.9 },
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 90,
      marginRight: 90,
    },
  };
}

export function createInitialSnapshot(docType: DocEditorType, title: string): unknown {
  return docType === 'document' ? defaultDocSnapshot(title) : defaultSheetSnapshot(title);
}
