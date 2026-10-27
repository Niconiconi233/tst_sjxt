/**
 * 用 Chrome DevTools Protocol 对前端做真实渲染 + 端到端链路验证（零第三方依赖）。
 *
 *   npm run dev   # 先起前端
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-agms \
 *     --no-first-run --no-sandbox --no-proxy-server about:blank
 *   node scripts/cdp-check.cjs
 */
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9223;
const BASE = 'http://localhost:5173';
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
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`  · 截图 ${file}`);
  return file;
}

async function clickText(selector, text) {
  return evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const t = nodes.find((n) => ((n.innerText || n.textContent || '').trim()).includes(${JSON.stringify(text)}));
    if (!t) return false;
    t.scrollIntoView({ block: 'center' });
    t.click();
    return true;
  })()`);
}

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

  console.log('1. 打开首页');
  await send('Page.navigate', { url: BASE });
  await sleep(4000);
  const href = await evaluate('location.href');
  console.log('   location =', href);
  if (!href.startsWith('http://localhost:5173')) throw new Error('页面未加载，检查 dev server');

  console.log('2. 注入登录账户并刷新');
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

  console.log('3. 登录页：', JSON.stringify(await evaluate('document.body.innerText.slice(0, 160)')));
  // 免密账户：点账户卡片即登录
  const entered = await evaluate(`(() => {
    const card = document.querySelector('.os-account');
    if (!card) return false;
    card.click();
    return true;
  })()`);
  console.log('   点击登录：', entered);
  await sleep(3000);
  console.log('   登录后：', JSON.stringify(await evaluate('document.body.innerText.slice(0, 160)')));

  /* ---------------- 端到端：模板 → 占位符 → 快照 ---------------- */
  console.log('\n4. 端到端链路（模板套打 → Univer 快照）');
  const e2e = await evaluate(
    `(async () => {
      const ph = await import('/src/utils/docxPlaceholder.ts');
      const av = await import('/src/utils/auditDocVars.ts');
      const oc = await import('/src/utils/officeConvert.ts');
      const res = await fetch('/__tpl_notice_test.docx');
      const blob = await res.blob();
      const found = await ph.scanDocxPlaceholders(blob);

      const project = {
        id: 'P1', code: 'P2026001', name: '2026年市交通运输局预算执行审计',
        auditedUnit: '市交通运输局', unitNature: '行政机关', auditType: '预算执行审计',
        level: '一级', status: '实施中', year: 2026,
        periodStart: '2025-01-01', periodEnd: '2025-12-31',
        fieldStart: '2026-03-01', fieldEnd: '2026-04-30',
        ownerName: '张建国', ownerId: 'A1001', progress: 30, groupCount: 1,
        docCount: 0, issueCount: 0, createdAt: '2026-03-01', tags: [],
      };
      const mk = (id, name, role, duty, items) => ({
        memberId: id, role, duty, responsibleItems: items,
        joinDate: '2026-03-01', onSite: true,
        auditor: { id, name, code: id, gender: '男', department: '财政审计处',
          title: '处长', phone: '', email: '', capableRoles: [role],
          busyProjects: 1, avatarColor: '#1a5fb4' },
      });
      const members = [
        mk('A1001', '张建国', '审计组长', '全面负责审计组工作', ['预算编制与执行']),
        mk('A1002', '李慧', '主审', '负责底稿汇总与报告起草', ['财政财务收支', '资产管理']),
        mk('A1003', '王海涛', '审计员', '负责延伸审计', ['资产管理']),
      ];

      const vars = av.buildAuditDocVars({
        org: { name: '市审计局', code: '11330100000000000X' },
        project,
        group: {
          name: '市交通运输局预算执行审计组',
          members,
          location: '市交通运输局 3 楼会议室',
          establishDate: '2026-03-01',
          planEndDate: '2026-04-30',
          disciplineNote: '严格遵守审计"八不准"工作纪律。',
        },
        title: '关于对市交通运输局2025年度预算执行审计的通知',
        docNo: '审通〔2026〕015号',
        issueDate: '2026-10-27',
      });

      const filled = await ph.fillDocxTemplate(blob, vars);
      const file = ph.filledDocxAsFile(filled.blob, 'notice.docx');
      const snapshot = await oc.docxToSnapshot(file, '审计通知书');
      const base64 = await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1]);
        fr.readAsDataURL(filled.blob);
      });

      const ds = snapshot.body.dataStream;
      return {
        found,
        missing: filled.missing,
        varsSample: {
          被审计单位: vars['被审计单位'],
          审计期间: vars['审计期间'],
          审计组成员: vars['审计组成员'],
          成员人数: vars['成员人数'],
          成员分工: vars['成员分工'],
          审计事项: vars['审计事项'],
          发文日期: vars['发文日期'],
        },
        streamLen: ds.length,
        hasTableSentinel: ds.includes('\\u001A'),
        tableCount: Object.keys(snapshot.tableSource || {}).length,
        preview: ds.replace(/[\\u001A-\\u001F\\u000E]/g, '').replace(/\\r/g, '\\n').slice(0, 300),
        base64,
      };
    })()`,
    true,
  );
  console.log('   模板占位符：', e2e.found.join('、'));
  console.log('   未取到值：', e2e.missing.join('、') || '（无）');
  console.log('   取值样例：', JSON.stringify(e2e.varsSample, null, 0));
  console.log('   快照 dataStream 长度：', e2e.streamLen, '表格数：', e2e.tableCount);
  console.log('   正文预览：', JSON.stringify(e2e.preview));
  fs.writeFileSync('/tmp/agms-filled-notice.docx', Buffer.from(e2e.base64, 'base64'));
  console.log('   已写出 /tmp/agms-filled-notice.docx');

  /* ---------------- 设置页：模板库 + 占位符说明 ---------------- */
  console.log('\n5. 设置页 → 文书模板库');
  await evaluate(`location.hash = '#/settings?tab=template'`);
  await sleep(2500);
  await shot('02-template-panel');
  console.log(
    '   页面含「占位符说明」：',
    await evaluate(`document.body.innerText.includes('占位符说明')`),
  );
  const opened = await clickText('button', '占位符说明');
  console.log('   点击占位符说明：', opened);
  await sleep(1200);
  await shot('03-var-help');
  const modalText = await evaluate(`document.body.innerText.slice(0, 400)`);
  console.log('   弹窗文本片段：', JSON.stringify(modalText.slice(0, 200)));

  /* ---------------- 组建页 ---------------- */
  console.log('\n6. 组建审计组页面');
  await evaluate(`document.querySelector('.ant-modal-close')?.click()`);
  await sleep(600);
  await evaluate(`location.hash = '#/groups/new'`);
  await sleep(2500);
  await shot('04-group-create');
  const stepText = await evaluate(`document.body.innerText.slice(0, 260)`);
  console.log('   页面文本：', JSON.stringify(stepText));

  console.log('\n控制台错误：', errors.length ? errors.slice(0, 10) : '（无）');
  ws.close();
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
