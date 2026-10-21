import {
  buildParagraphs,
  createInitialSnapshot,
  normalizeDocSnapshot,
} from '@/utils/univerSnapshot';

const doc = createInitialSnapshot('document', '审计实施方案') as any;
console.log('新建文档 dataStream =', JSON.stringify(doc.body.dataStream));
console.log('新建文档 段落数 =', doc.body.paragraphs.length, doc.body.paragraphs);

// 模拟旧版本保存的正文（没有 paragraphs，回车会失效）
const legacy = { id: 'doc_legacy', title: '旧文档', body: { dataStream: '第一段\r\n第二段\r\n' } };
const fixed = normalizeDocSnapshot(legacy) as any;
console.log('旧快照修复后 段落数 =', fixed.body.paragraphs.length, fixed.body.paragraphs);
console.log('旧快照文本未被改动 =', fixed.body.dataStream === '第一段\r\n第二段\r\n');

// 边界：空数据流也要能生成一个段落
console.log('空快照 =', JSON.stringify(normalizeDocSnapshot({ body: {} })));
console.log('纯文本段落索引 =', buildParagraphs('a\rb\rc'));
