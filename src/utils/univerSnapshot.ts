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

/** 补齐文档快照中缺失的段落结构（兼容历史版本保存过的正文） */
export function normalizeDocSnapshot(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const doc = snapshot as { body?: { dataStream?: unknown; paragraphs?: unknown } };
  const body = doc.body ?? {};
  const dataStream = typeof body.dataStream === 'string' ? body.dataStream : '';
  if (!Array.isArray(body.paragraphs) || body.paragraphs.length === 0) {
    const stream = dataStream || '\r\n';
    body.dataStream = stream;
    body.paragraphs = buildParagraphs(stream);
  }
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

/** 新建文档（Word 类）的初始快照 */
export function defaultDocSnapshot(title: string) {
  const dataStream = `${title}\r\n\r\n`;
  return {
    id: `doc_${Date.now()}`,
    title,
    body: {
      dataStream,
      paragraphs: buildParagraphs(dataStream),
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
