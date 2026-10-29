/**
 * 验证「改字体后中文立即生效」：选中文案 → 工具栏字体选楷体 → 立刻读绘制层 font-family。
 *
 * 前置：npm run dev + headless Chrome --remote-debugging-port=9223
 */
const fs = require('fs');
const JSZip = require('jszip');

const PORT = process.env.CDP_PORT || 9223;
const BASE = 'http://localhost:5173';

let ws;
let seq = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  const id = (seq += 1);
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP 超时: ${method}`));
      }
    }, 60000);
  });
}

async function evaluate(expression, awaitPromise = false) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (res.exceptionDetails) {
    throw new Error(
      res.exceptionDetails.exception?.description || JSON.stringify(res.exceptionDetails),
    );
  }
  return res.result?.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RF = (f) =>
  `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>`;

async function makeDocx() {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS}"><w:body>
<w:p><w:pPr><w:rPr>${RF('仿宋_GB2312')}<w:sz w:val="32"/></w:rPr></w:pPr>
<w:r><w:rPr>${RF('仿宋_GB2312')}<w:sz w:val="32"/></w:rPr><w:t>审计测试正文内容</w:t></w:r></w:p>
<w:sectPr/></w:body></w:document>`,
  );
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return buf.toString('base64');
}

async function main() {
  const b64 = await makeDocx();
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('没有可用的页面目标');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description ?? '异常');
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  console.log('1. 注入账户 + 文书（正文仿宋_GB2312）');
  await send('Page.navigate', { url: BASE });
  await sleep(3500);
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await evaluate(`(() => {
    const uid = 'u_demo';
    localStorage.setItem('agms.users', JSON.stringify([{
      id: uid, name: '张建国', avatarColor: '#1a5fb4', department: '财政审计处',
      title: '处长', employeeCode: 'A1001', role: '审计组长', password: '',
      createdAt: ${JSON.stringify(now)}, withDemo: false, deletedAt: null,
    }]));
    localStorage.setItem('agms.lastUserId', uid);
    const doc = {
      id: 'D_font', code: 'FONT-001', title: '字体测试文书',
      category: '审计通知类', template: '审计通知书', docType: 'document',
      hasContent: true, projectId: '', projectName: '', status: '草稿',
      secretLevel: '内部', authorId: 'A1001', authorName: '张建国',
      version: 'V1.0', createdAt: ${JSON.stringify(now)}, updatedAt: ${JSON.stringify(now)}, pages: 1,
    };
    localStorage.setItem('agms.data.' + uid, JSON.stringify({
      projects: [], groups: [], documents: [doc], todos: [],
    }));
    localStorage.setItem('agms.content.D_font', '__DOCX__:' + ${JSON.stringify(b64)});
    return true;
  })()`);
  await send('Page.reload');
  await sleep(3500);
  await evaluate(`(() => { const c = document.querySelector('.os-account'); if (c) c.click(); return !!c; })()`);
  await sleep(2500);
  await send('Page.navigate', { url: `${BASE}/#/documents/D_font/office` });
  await sleep(7000);

  for (let i = 0; i < 30; i += 1) {
    if (await evaluate(`!!document.querySelector('.docx-pages[contenteditable="true"]')`)) break;
    await sleep(1000);
  }

  console.log('2. 打开时正文绘制字体');
  const readFont = () => evaluate(`(() => {
    const spans = [...document.querySelectorAll('.docx-pages span, .docx-pages [data-docx-part] span')]
      .filter((s) => (s.textContent || '').includes('审'));
    return spans.slice(0, 3).map((s) => ({
      text: (s.textContent || '').slice(0, 8),
      font: s.style.fontFamily || getComputedStyle(s).fontFamily,
    }));
  })()`);
  console.log('   ', JSON.stringify(await readFont()));

  console.log('3. 点入正文 → 全选');
  const box = await evaluate(`(() => {
    const el = document.querySelector('.docx-pages[contenteditable="true"]');
    const r = el.getBoundingClientRect();
    return { x: r.left + 120, y: r.top + 120 };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await sleep(800);
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {
      type, key: 'a', code: 'KeyA', modifiers: 2,
      windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 0,
    });
  }
  await sleep(800);

  console.log('4. 打开字体下拉并选「楷体」');
  const trig = await evaluate(`(() => {
    const el = document.querySelector('.docx-toolbar__font-family-trigger');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!trig) throw new Error('找不到字体下拉');
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: trig.x, y: trig.y, button: 'left', clickCount: 1 });
  }
  await sleep(1000);
  const opts = await evaluate(`(() => {
    const items = [...document.querySelectorAll('[role="option"], .docx-menu__item, li')]
      .filter((n) => (n.innerText || '').trim());
    return items.slice(0, 40).map((n) => (n.innerText || '').trim().slice(0, 16));
  })()`);
  console.log('   候选：', JSON.stringify(opts.slice(0, 25)));
  const picked = await evaluate(`(() => {
    const items = [...document.querySelectorAll('[role="option"], .docx-menu__item, li')];
    const t = items.find((n) => ((n.innerText || '').trim() === '楷体'));
    if (!t) return null;
    t.scrollIntoView({ block: 'center' });
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!picked) throw new Error('下拉里没有「楷体」');
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: picked.x, y: picked.y, button: 'left', clickCount: 1 });
  }
  await sleep(2000);
  console.log('   工具栏显示：', await evaluate(`document.querySelector('.docx-toolbar__font-family-trigger')?.innerText`));
  console.log('   改后绘制字体：', JSON.stringify(await readFont()));

  console.log('5. 保存并校验 OOXML');
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes('保存'));
    if (b) { b.click(); return true; } return false;
  })()`);
  await sleep(2500);
  const content = await evaluate(`localStorage.getItem('agms.content.D_font') ?? ''`);
  fs.writeFileSync('/tmp/font-live-content.txt', content);

  console.log('\n控制台错误：', errors.length ? errors.slice(0, 5) : '（无）');
  ws.close();
}

main()
  .then(() => {
    const fs2 = require('fs');
    const c = fs2.readFileSync('/tmp/font-live-content.txt', 'utf8');
    if (!c.startsWith('__DOCX__:')) {
      console.log('!! 正文不是 DOCX：', c.slice(0, 40));
      return;
    }
    return JSZip.loadAsync(Buffer.from(c.slice(9), 'base64')).then(async (z) => {
      const xml = await z.file('word/document.xml').async('string');
      console.log('   rFonts：', [...xml.matchAll(/<w:rFonts[^>]*>/g)].map((m) => m[0]));
    });
  })
  .catch((err) => {
    console.error('✗', err.message);
    process.exit(1);
  });
