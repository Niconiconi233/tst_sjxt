/**
 * 完整业务走查（真实鼠标键盘事件版）：
 *   上传通知书模板 → 组建审计组向导 → 勾选生成通知书 → 打开在线编辑器。
 *
 *   npm run dev
 *   Chrome --headless=new --remote-debugging-port=9223 --no-proxy-server ...
 *   node scripts/cdp-walk.cjs
 */
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9223;
const BASE = 'http://localhost:5173';
const TPL_FILE = path.join(__dirname, '..', 'public', '__tpl_notice_test.docx');
const OUT_DIR = '/tmp/agms-shots';

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

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`  · 截图 ${file}`);
}

/** 元素中心点的视口坐标。expr 是「返回 Element 或 null」的 JS 表达式 */
async function centerOf(expr) {
  const pt = await evaluate(`(() => {
    const el = ${expr};
    if (!el || !el.scrollIntoView) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  return pt;
}

async function clickPoint(pt) {
  if (!pt) return false;
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1,
  });
  return true;
}

async function clickSelector(expr) {
  return clickPoint(await centerOf(expr));
}

async function typeText(text) {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: ch, text: ch, unmodifiedText: ch,
    });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
  }
}

async function pressKey(key, code, vk) {
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  });
}

/** 打开 antd Select（React 合成事件）并 JS 点击下拉里的第 n 项 */
async function pickSelect(selectExpr, optionIndex = 0) {
  await evaluate(`(() => {
    const sel = ${selectExpr};
    if (!sel) return false;
    const s = sel.querySelector('.ant-select-selector') ?? sel;
    s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    s.click();
    return true;
  })()`);
  await sleep(700);
  const text = await evaluate(`(() => {
    const opt = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')][${optionIndex}];
    if (!opt) return null;
    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    opt.click();
    return opt.textContent;
  })()`);
  await sleep(450);
  await pressKey('Escape', 'Escape', 27);
  await sleep(250);
  return text;
}

/** 找包含指定文字的表单项里的 input，真实点击后逐字输入 */
async function fillInputByLabel(label, value) {
  const pt = await centerOf(
    `[...document.querySelectorAll('.ant-form-item')].find((n) => n.innerText.includes(${JSON.stringify(label)}))?.querySelector('input') ?? null`,
  );
  if (!pt) return '(无输入框)';
  await clickPoint(pt);
  await sleep(300);
  await typeText(value);
  await sleep(300);
  return await evaluate(
    `[...document.querySelectorAll('.ant-form-item')].find((n) => n.innerText.includes(${JSON.stringify(label)}))?.querySelector('input')?.value`,
  );
}

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
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
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1500,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log('1. 打开并登录');
  await send('Page.navigate', { url: BASE });
  await sleep(4000);
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await evaluate(`(() => {
    localStorage.setItem('agms.users', JSON.stringify([{
      id: 'u_demo', name: '张建国', avatarColor: '#1a5fb4',
      department: '财政审计处', title: '处长', employeeCode: 'A1001',
      role: '审计组长', password: '', createdAt: ${JSON.stringify(now)},
      withDemo: true, deletedAt: null,
    }]));
    localStorage.setItem('agms.lastUserId', 'u_demo');
    return true;
  })()`);
  await send('Page.reload');
  await sleep(4000);
  await evaluate(`document.querySelector('.os-account')?.click()`);
  await sleep(2500);

  console.log('2. 模板库：给「审计通知书」上传模板文件');
  await evaluate(`location.hash = '#/settings?tab=template'`);
  await sleep(2500);
  const state = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.ant-table-tbody tr')].find((tr) =>
      tr.innerText.includes('审计通知书'),
    );
    if (!row) return 'missing';
    if (row.innerText.includes('.docx')) return 'uploaded';
    const btn = [...row.querySelectorAll('button')].find((b) => b.innerText.includes('上传'));
    if (!btn) return 'no-btn';
    btn.click();
    return 'picked';
  })()`);
  console.log('   模板状态：', state);
  if (state === 'picked') {
    await sleep(600);
    const { root } = await send('DOM.getDocument');
    const { nodeId } = await send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'input[type="file"]',
    });
    if (!nodeId) throw new Error('未找到 file input');
    await send('DOM.setFileInputFiles', { nodeId, files: [TPL_FILE] });
    await sleep(2500);
  }

  console.log('\n3. 组建审计组：第 1 步');
  await evaluate(`location.hash = '#/groups/new'`);
  await sleep(2200);
  const projSel = `[...document.querySelectorAll('.ant-form-item')].find((n) => n.innerText.includes('关联审计项目'))?.querySelector('.ant-select') ?? null`;
  let proj = await pickSelect(projSel, 0);
  await sleep(400);
  let projVal = await evaluate(
    `[...document.querySelectorAll('.ant-form-item')].find((n) => n.innerText.includes('关联审计项目'))?.querySelector('.ant-select-selection-item')?.textContent ?? ''`,
  );
  if (!projVal) {
    console.log('   项目未选中，重试');
    proj = await pickSelect(projSel, 0);
    await sleep(400);
    projVal = await evaluate(
      `[...document.querySelectorAll('.ant-form-item')].find((n) => n.innerText.includes('关联审计项目'))?.querySelector('.ant-select-selection-item')?.textContent ?? ''`,
    );
  }
  console.log('   选择项目：', projVal || '(失败)');

  // 审计组名称（自动填充过，但要确认非空）
  let nameVal = await evaluate(
    `[...document.querySelectorAll('.ant-form-item')].find((n) => n.innerText.includes('审计组名称'))?.querySelector('input')?.value`,
  );
  if (!nameVal) {
    nameVal = await fillInputByLabel('审计组名称', '市交通运输局预算执行审计组');
  }
  console.log('   组名：', JSON.stringify(nameVal));

  // RangePicker：点开 → 输入起 → Enter → 输入止 → Enter
  const pickerPt = await centerOf(`document.querySelector('.ant-picker') ?? null`);
  await clickPoint(pickerPt);
  await sleep(600);
  await typeText('2026-03-01');
  await pressKey('Enter', 'Enter', 13);
  await sleep(500);
  await typeText('2026-04-30');
  await pressKey('Enter', 'Enter', 13);
  await sleep(400);
  await evaluate(`document.body.click()`); // 收起面板
  await sleep(400);
  const rangeVal = await evaluate(
    `[...document.querySelectorAll('.ant-picker-input input')].map((i) => i.value).join(' ~ ')`,
  );
  console.log('   日期：', rangeVal);

  const locVal = await fillInputByLabel('工作驻地', '市交通运输局 3 楼会议室');
  console.log('   驻地：', JSON.stringify(locVal));
  await sleep(300);

  await evaluate(`[...document.querySelectorAll('button')].filter((b) => b.innerText.includes('下一步'))[0]?.click()`);
  await sleep(1000);

  console.log('4. 第 2 步（核心岗位）');
  const stepNow = async () =>
    evaluate(`document.querySelector('.ant-steps-item-active')?.innerText ?? '?'`);
  console.log('   当前步骤：', await stepNow());
  // 4 个岗位 Select
  for (let i = 0; i < 4; i += 1) {
    const picked = await pickSelect(`[...document.querySelectorAll('.ant-card .ant-select')][${i}] ?? null`, 0);
    console.log(`   岗位[${i}]：`, picked);
    await sleep(350);
  }
  await shot('05-step2');
  await evaluate(`[...document.querySelectorAll('button')].filter((b) => b.innerText.includes('下一步'))[0]?.click()`);
  await sleep(1000);
  console.log('   当前步骤：', await stepNow());

  console.log('5. 第 3 步（成员与分工）');
  const rowCount = await evaluate(
    `document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length`,
  );
  console.log('   成员行数：', rowCount);
  for (let r = 0; r < rowCount; r += 1) {
    // 每行第二个 Select 是「负责审计事项」
    await clickSelector(
      `[...document.querySelectorAll('.ant-table-tbody tr.ant-table-row')[${r}].querySelectorAll('.ant-select')][1] ?? null`,
    );
    await sleep(500);
    await clickSelector(
      `[...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')][0] ?? null`,
    );
    await sleep(400);
    await pressKey('Escape', 'Escape', 27);
    await sleep(300);
  }
  await shot('06-step3');
  await evaluate(`[...document.querySelectorAll('button')].filter((b) => b.innerText.includes('下一步'))[0]?.click()`);
  await sleep(1200);
  console.log('   当前步骤：', await stepNow());

  console.log('6. 第 4 步：勾选生成《审计通知书》');
  const checked = await evaluate(`(() => {
    const label = [...document.querySelectorAll('label')].find((l) =>
      l.innerText.includes('生成《审计通知书》'),
    );
    if (!label) return false;
    const box = label.querySelector('input[type=checkbox]');
    if (!box?.checked) label.click();
    return true;
  })()`);
  console.log('   勾选：', checked);
  await sleep(3000);
  await shot('07-step4-notice');
  const panelText = await evaluate(`(() => {
    const el = [...document.querySelectorAll('div')].find((d) =>
      d.innerText.startsWith('审计通知书生成设置'),
    );
    return el ? el.innerText.slice(0, 900) : '(未找到配置区)';
  })()`);
  console.log('   配置区内容：\n', panelText);

  console.log('7. 确认组建');
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.includes('确认组建'))?.click()`);
  await sleep(5000);
  await shot('08-created-modal');
  const modalText = await evaluate(
    `document.querySelector('.ant-modal-confirm')?.innerText.replace(/\\n/g, ' | ') ?? '(无弹窗)'`,
  );
  console.log('   结果弹窗：', modalText);

  console.log('8. 打开生成的通知书（在线编辑器）');
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.ant-modal-confirm .ant-btn')]
      .find((b) => b.innerText.includes('打开通知书'));
    btn?.click();
    return !!btn;
  })()`);
  await sleep(10000);
  await shot('09-office-editor');
  const editorText = await evaluate(`document.body.innerText.slice(0, 400)`);
  console.log('   编辑器页面文本：\n', editorText);

  console.log('\n运行期异常：', errors.length ? errors.slice(0, 5) : '（无）');
  ws.close();
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
