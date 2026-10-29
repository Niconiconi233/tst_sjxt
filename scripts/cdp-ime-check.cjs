/**
 * 中文输入法（IME）与中文字体即时生效的端到端验证。
 *
 * 前置：
 *   npm run dev
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-ime \
 *     --no-first-run --no-sandbox --no-proxy-server about:blank
 *   node scripts/cdp-ime-check.cjs
 */
const fs = require('fs');

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

async function main() {
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
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log('1. 注入账户 + 空白文书');
  await send('Page.navigate', { url: BASE });
  await sleep(3500);
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await evaluate(`(() => {
    const uid = 'u_demo';
    localStorage.setItem('agms.users', JSON.stringify([{
      id: uid, name: '张建国', avatarColor: '#1a5fb4',
      department: '财政审计处', title: '处长', employeeCode: 'A1001',
      role: '审计组长', password: '', createdAt: ${JSON.stringify(now)},
      withDemo: false, deletedAt: null,
    }]));
    localStorage.setItem('agms.lastUserId', uid);
    const doc = {
      id: 'D_ime', code: 'IME-001', title: '输入法测试文书',
      category: '审计通知类', template: '审计通知书', docType: 'document',
      hasContent: false, projectId: '', projectName: '', status: '草稿',
      secretLevel: '内部', authorId: 'A1001', authorName: '张建国',
      version: 'V1.0', createdAt: ${JSON.stringify(now)}, updatedAt: ${JSON.stringify(now)},
      pages: 1,
    };
    localStorage.setItem('agms.data.' + uid, JSON.stringify({
      projects: [], groups: [], documents: [doc], todos: [],
    }));
    localStorage.setItem('agms.content.D_ime', '');
    return true;
  })()`);

  await send('Page.reload');
  await sleep(3500);
  // 免密账户：点账户卡片登录
  await evaluate(`(() => { const c = document.querySelector('.os-account'); if (c) { c.click(); return true; } return false; })()`);
  await sleep(3000);

  await send('Page.navigate', { url: `${BASE}/#/documents/D_ime/office` });
  await sleep(6000);
  console.log('   页面：', JSON.stringify(await evaluate('document.body.innerText.slice(0, 120)')));

  console.log('\n2. 等待编辑器挂载');
  for (let i = 0; i < 30; i += 1) {
    const mounted = await evaluate(`!!document.querySelector('.docx-editor__pages, [data-docx-page], .docx-page')`);
    if (mounted) break;
    await sleep(1000);
  }
  const dom = await evaluate(`(() => {
    const el = document.querySelector('[contenteditable]');
    return {
      hasEditable: !!el,
      editableClass: el ? el.className : null,
      editableCE: el ? el.getAttribute('contenteditable') : null,
    };
  })()`);
  console.log('   可编辑层：', JSON.stringify(dom));

  console.log('\n3. 点击正文获取焦点');
  const box = await evaluate(`(() => {
    const el = document.querySelector('[contenteditable="true"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + 80, y: r.top + 120 };
  })()`);
  if (!box) throw new Error('找不到可编辑层');
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type, x: box.x, y: box.y, button: 'left', clickCount: 1,
    });
  }
  await sleep(1200);
  console.log('   焦点元素：', await evaluate(`document.activeElement?.className ?? 'none'`));

  console.log('\n4. 英文直接输入（Input.insertText）');
  await send('Input.insertText', { text: 'ABC' });
  await sleep(1200);
  console.log('   正文文本：', JSON.stringify(await evaluate(`(() => {
    const el = document.querySelector('[contenteditable="true"]');
    return el ? el.innerText.slice(0, 60) : null;
  })()`)));

  console.log('\n5. 模拟中文输入法（compositionstart → DOM 写入 → compositionend）');
  const composed = await evaluate(`(() => {
    const el = document.querySelector('[contenteditable="true"]');
    if (!el) return { ok: false, why: 'no editable' };
    el.focus();
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, cancelable: true }));
    // 真实 IME 由浏览器把候选串写进可编辑 DOM，这里用 execCommand 等价模拟
    const ok = document.execCommand('insertText', false, '你好世界');
    el.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: '你好世界' }));
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你好世界' }));
    return { ok };
  })()`);
  console.log('   execCommand insertText：', JSON.stringify(composed));
  await sleep(1800);
  const after = await evaluate(`(() => {
    const el = document.querySelector('[contenteditable="true"]');
    return el ? el.innerText.slice(0, 80) : null;
  })()`);
  console.log('   正文文本：', JSON.stringify(after));
  console.log('   含「你好世界」：', String(after || '').includes('你好世界'));

  console.log('\n6. 保存并读回正文（落库校验）');
  const saved = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.innerText || '').includes('保存'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  console.log('   点击保存：', saved);
  await sleep(2500);
  const content = await evaluate(`localStorage.getItem('agms.content.D_ime') ?? ''`);
  console.log('   正文前缀：', content.slice(0, 24), '长度：', content.length);
  fs.writeFileSync('/tmp/ime-content.txt', content);

  console.log('\n控制台错误：', errors.length ? errors.slice(0, 8) : '（无）');
  ws.close();
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
