import type { AuditDocument, DocEditorType } from '@/types';

/** 按文件类别推荐正文形态：底稿/证据类以表格为主，其余以文书（Word）为主 */
export function recommendDocType(category: string): DocEditorType {
  return category === '取证与底稿类' || category === '审计证据类' ? 'sheet' : 'document';
}

/** 取文件实际使用的编辑形态（未显式指定时按类别推荐） */
export function resolveDocType(doc: Pick<AuditDocument, 'docType' | 'category'>): DocEditorType {
  return doc.docType ?? recommendDocType(doc.category);
}

export const DOC_TYPE_LABEL: Record<DocEditorType, string> = {
  sheet: '表格（Excel）',
  document: '文书（Word）',
};
