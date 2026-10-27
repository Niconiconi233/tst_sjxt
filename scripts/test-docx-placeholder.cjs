/**
 * 占位符引擎回归测试（Node 环境）
 *
 *   ./node_modules/.bin/esbuild src/utils/docxPlaceholder.ts --bundle --platform=node \
 *     --format=cjs --external:jszip --outfile=/tmp/ph.cjs
 *   NODE_PATH=$PWD/node_modules node scripts/test-docx-placeholder.cjs
 */
const JSZip = require('jszip');
const assert = require('assert');
const { scanDocxPlaceholders, fillDocxTemplate } = require('/tmp/ph.cjs');

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const para = (inner) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${inner}</w:p>`;
const run = (text, rPr = '') =>
  `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;

async function buildDocx({ body, header = '' }) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body}<w:sectPr/></w:body></w:document>`,
  );
  if (header) {
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${NS}>${header}</w:hdr>`,
    );
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** 取某个部件里所有 <w:t> 的文字（模拟 Word 的阅读顺序） */
async function partText(blob, name = 'word/document.xml') {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const file = zip.file(name);
  if (!file) return '';
  const xml = await file.async('string');
  return [...xml.matchAll(/<w:t(?:\s[^>]*[^/>])?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function partXml(blob, name = 'word/document.xml') {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const file = zip.file(name);
  return file ? file.async('string') : '';
}

(async () => {
  let pass = 0;
  const ok = (name) => {
    pass += 1;
    console.log(`  ✓ ${name}`);
  };

  /* ---------- 1. 跨 run 的占位符（Word 最常见的拆分） ---------- */
  {
    // 第一个 run 用仿宋，第二个 run 加粗 —— 替换后应沿用第一个 run 的字体
    const body = para(
      '<w:r><w:rPr><w:rFonts w:ascii="仿宋"/></w:rPr><w:t xml:space="preserve">关于对${被审计</w:t></w:r>' +
        '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">单位}开展审计的通知</w:t></w:r>',
    );
    const blob = await buildDocx({ body });
    assert.deepStrictEqual(await scanDocxPlaceholders(blob), ['被审计单位'], '跨 run 扫描失败');

    const out = await fillDocxTemplate(blob, { 被审计单位: '市交通运输局' });
    const text = await partText(out.blob);
    assert.strictEqual(text, '关于对市交通运输局开展审计的通知', '跨 run 替换结果不对：' + text);
    const xml = await partXml(out.blob);
    assert.ok(xml.includes('w:ascii="仿宋"'), '丢失首个 run 的字体');
    ok('跨 run 占位符替换，保留原格式');
  }

  /* ---------- 2. 同一 run 内多个占位符 ---------- */
  {
    const blob = await buildDocx({ body: para(run('${审计组组长}与${主审}共同负责')) });
    const out = await fillDocxTemplate(blob, { 审计组组长: '张三', 主审: '李四' });
    assert.strictEqual(await partText(out.blob), '张三与李四共同负责');
    ok('同段落多个占位符');
  }

  /* ---------- 3. 同一节点里「前一个」匹配不受后一个替换影响 ---------- */
  {
    const blob = await buildDocx({
      body: para(run('A${甲}B${乙}C${丙}D')),
    });
    const out = await fillDocxTemplate(blob, { 甲: '1', 乙: '22', 丙: '333' });
    assert.strictEqual(await partText(out.blob), 'A1B22C333D');
    ok('同节点多占位符逐个替换，偏移不串位');
  }

  /* ---------- 4. 未知字段留空 + missing 回报 ---------- */
  {
    const blob = await buildDocx({ body: para(run('A${未知字段}B')) });
    const out = await fillDocxTemplate(blob, { 被审计单位: 'X' });
    assert.strictEqual(await partText(out.blob), 'AB');
    assert.deepStrictEqual(out.missing, ['未知字段']);
    ok('未给值的字段写空并回报');
  }

  /* ---------- 5. 表格单元格内的占位符 ---------- */
  {
    const tbl = `<w:tbl><w:tr><w:tc>${para(run('组长：${审计组组长}'))}</w:tc><w:tc>${para(
      run('人数：${成员人数}'),
    )}</w:tc></w:tr></w:tbl>`;
    const blob = await buildDocx({ body: tbl + para(run('落款：${机关名称}')) });
    const out = await fillDocxTemplate(blob, {
      审计组组长: '王五',
      成员人数: '4',
      机关名称: '市审计局',
    });
    const text = await partText(out.blob);
    assert.ok(text.includes('组长：王五'), '表格内替换失败：' + text);
    assert.ok(text.includes('人数：4'), '表格内替换失败：' + text);
    assert.ok(text.includes('落款：市审计局'), '表格后段落失败：' + text);
    assert.ok((await partXml(out.blob)).includes('<w:tbl>'), '表格结构被破坏');
    ok('表格单元格内占位符');
  }

  /* ---------- 6. 页眉 ---------- */
  {
    const blob = await buildDocx({ body: para(run('正文')), header: para(run('${文号}')) });
    const out = await fillDocxTemplate(blob, { 文号: '审通〔2026〕015号' });
    assert.strictEqual(await partText(out.blob, 'word/header1.xml'), '审通〔2026〕015号');
    ok('页眉占位符');
  }

  /* ---------- 7. 换行与特殊字符 ---------- */
  {
    const blob = await buildDocx({ body: para(run('${成员分工}')) });
    const out = await fillDocxTemplate(blob, {
      成员分工: '张三（组长）：全面负责\n李四（主审）：底稿汇总 A&B<C>',
    });
    const xml = await partXml(out.blob);
    assert.ok(xml.includes('<w:br/>'), '换行未转成 w:br');
    const text = await partText(out.blob);
    assert.ok(text.includes('张三（组长）：全面负责'), '首行丢失：' + text);
    assert.ok(text.includes('A&B<C>'), '特殊字符转义有误：' + text);
    ok('换行转 w:br、& < > 正确转义');
  }

  /* ---------- 8. 自闭合 <w:t/> 不能吞掉后续文字 ---------- */
  {
    const body = `<w:p><w:r><w:t/></w:r><w:r><w:t>${'${被审计单位}'}</w:t></w:r></w:p>`;
    const blob = await buildDocx({ body });
    assert.deepStrictEqual(
      await scanDocxPlaceholders(blob),
      ['被审计单位'],
      '自闭合 w:t 干扰了扫描',
    );
    const out = await fillDocxTemplate(blob, { 被审计单位: '市财政局' });
    assert.strictEqual(await partText(out.blob), '市财政局');
    ok('自闭合 <w:t/> 不吞内容');
  }

  /* ---------- 9. 带属性的自闭合标签同样安全 ---------- */
  {
    const body = `<w:p><w:r><w:t xml:space="preserve"/></w:r><w:r><w:t>${'{{被审计单位}}'}</w:t></w:r></w:p>`;
    const blob = await buildDocx({ body });
    const out = await fillDocxTemplate(blob, { 被审计单位: '市水务局' });
    assert.strictEqual(await partText(out.blob), '市水务局');
    ok('双花括号写法 + 带属性自闭合标签');
  }

  /* ---------- 10. 无占位符的模板原样返回 ---------- */
  {
    const blob = await buildDocx({ body: para(run('没有占位符的正文')) });
    const out = await fillDocxTemplate(blob, {});
    assert.strictEqual(await partText(out.blob), '没有占位符的正文');
    assert.deepStrictEqual(out.found, []);
    ok('无占位符模板不变');
  }

  /* ---------- 11. 段落外（sectPr 等）不受影响 ---------- */
  {
    const blob = await buildDocx({ body: para(run('${被审计单位}')) });
    const out = await fillDocxTemplate(blob, { 被审计单位: 'X局' });
    assert.ok((await partXml(out.blob)).includes('<w:sectPr/>'), '分节属性被破坏');
    ok('段落外 XML 不被改动');
  }

  console.log(`\n全部 ${pass} 项通过`);
})().catch((err) => {
  console.error('\n✗ 测试失败：', err.message);
  process.exit(1);
});
