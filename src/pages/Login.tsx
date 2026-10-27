import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Checkbox, Input, Modal, Select, Typography } from 'antd';
import { ArrowRightOutlined, LockOutlined, UserAddOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '@/store/authStore';
import { useDict } from '@/store/dictStore';
import type { GroupRole } from '@/types';
import '@/styles/login.css';

const AVATAR_COLORS = ['#1a5fb4', '#0f7b8a', '#7a3fa8', '#b7791f', '#1a7f4b', '#b42318', '#41546b', '#5a6acf'];

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 把字典里的名称数组转成 Select 需要的 {label, value} */
const toOptions = (list: string[]) => list.map((x) => ({ label: x, value: x }));

export default function Login() {
  const { users, login, createUser, ready, storageMode } = useAuth();
  const { labels } = useDict();
  const { message } = App.useApp();

  // 部门、职务、角色全部取自后端字典，可在「系统设置 → 字典与模板配置」维护
  const departments = labels('department');
  const titles = labels('title');
  const roles = labels('role');

  const [mode, setMode] = useState<'accounts' | 'create'>('accounts');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(dayjs());
  const [storeHelp, setStoreHelp] = useState(false);
  const pwdRef = useRef<HTMLInputElement>(null);

  // 新建账户表单：部门/职务/角色的默认值等字典装载后再填，避免写死
  const [form, setForm] = useState({
    name: '',
    department: '',
    title: '',
    employeeCode: '',
    role: '' as GroupRole,
    password: '',
    confirmPassword: '',
    avatarColor: AVATAR_COLORS[0],
    withDemo: true,
  });

  // 字典就绪后补上默认选中项；已手工改过的保持不动。
  // 注意 departments / titles / roles 每次渲染都是新数组，不能直接当依赖判断「变了」，
  // 这里让 updater 在值没变化时原样返回，靠 React 的 bail-out 掐断重复渲染 ——
  // 否则 setForm 每次都产出新对象，会触发 Maximum update depth exceeded。
  useEffect(() => {
    if (!departments.length && !titles.length && !roles.length) return;
    setForm((f) => {
      const next = {
        ...f,
        department: f.department || departments[0] || '',
        title: f.title || titles[0] || '',
        role: (f.role && roles.includes(f.role) ? f.role : (roles[0] as GroupRole)) || f.role,
      };
      if (next.department === f.department && next.title === f.title && next.role === f.role) {
        return f;
      }
      return next;
    });
  }, [departments, titles, roles]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(dayjs()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const clock = `${now.format('YYYY年M月D日')} ${WEEKDAYS[now.day()]} ${now.format('HH:mm:ss')}`;

  // 首次进入默认选中上次登录 / 第一个账户
  useEffect(() => {
    if (!activeId && users.length) {
      const last = localStorage.getItem('agms.lastUserId');
      setActiveId(users.find((u) => u.id === last)?.id ?? users[0].id);
    }
  }, [users, activeId]);

  const activeUser = useMemo(() => users.find((u) => u.id === activeId) ?? null, [users, activeId]);
  const needPassword = !!activeUser?.password;

  useEffect(() => {
    if (mode === 'accounts' && needPassword) pwdRef.current?.focus();
  }, [activeId, mode, needPassword]);

  const doLogin = (user: typeof activeUser, pwd: string) => {
    if (!user) return;
    const res = login(user.id, pwd);
    if (!res.ok) {
      setError(res.message ?? '登录失败');
      setPassword('');
      setTimeout(() => setError(''), 2600);
      pwdRef.current?.focus();
    }
  };

  const submitCreate = () => {
    if (!form.name.trim()) {
      message.warning('请填写姓名');
      return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      message.warning('两次输入的登录口令不一致');
      return;
    }
    if (!form.department || !form.title || !form.role) {
      message.warning('请先在「系统设置 → 字典与模板配置」中维护所属部门、职务与角色');
      return;
    }
    createUser({
      name: form.name.trim(),
      department: form.department,
      title: form.title,
      employeeCode: form.employeeCode.trim() || `SJ-${String(Date.now()).slice(-6)}`,
      role: form.role,
      password: form.password,
      avatarColor: form.avatarColor,
      withDemo: form.withDemo,
    });
    message.success(
      storageMode === 'sqlite'
        ? `已创建并登录：${form.name}（账户已写入本机数据库）`
        : `已创建并登录：${form.name}（浏览器预览模式，账户未写入数据库文件）`,
    );
  };

  return (
    <div className="os-login">
      {/* ---------- 顶部状态栏：仅系统名 + 日期星期时间 ---------- */}
      <div className="os-menubar">
        <div className="os-menubar__left">
          <span className="os-menubar__brand">
            <span className="os-menubar__dot" />
            审计组工作管理系统
          </span>
        </div>
        <div className="os-menubar__right">
          <span className="os-menubar__item">{clock}</span>
        </div>
      </div>

      {/* ---------- 中部 ---------- */}
      <div className="os-stage">
        <h1 className="os-title">选 择 账 户 以 登 录</h1>

        {!ready ? (
          <div className="os-loading">正在读取本机账户数据…</div>
        ) : mode === 'accounts' ? (
          <div className="os-users">
            {users.length === 0 && (
              <div className="os-empty">本机还没有任何账户，点击右侧「新增用户」建立第一个账户</div>
            )}
            {users.map((u) => {
              const isActive = u.id === activeId;
              return (
                <div
                  key={u.id}
                  className={`os-account${isActive ? ' is-active' : ''}`}
                  onClick={() => {
                    setActiveId(u.id);
                    setPassword('');
                    setError('');
                    // 免密账户直接登录：显式传 u，不能依赖 activeUser——
                    // setState 尚未生效，闭包里的 activeUser 还是上一个账户，
                    // 同名/免密账户之间切换会登录成别人
                    if (!u.password) doLogin(u, '');
                  }}
                >
                  <div className="os-account__avatar" style={{ background: u.avatarColor }}>
                    {u.name.slice(-2)}
                  </div>
                  <div className="os-account__name">{u.name}</div>

                  {isActive && needPassword && (
                    <>
                      <div className={`os-passbox${error ? ' is-error' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <LockOutlined style={{ fontSize: 12, opacity: 0.75 }} />
                        <input
                          ref={pwdRef}
                          type="password"
                          autoFocus
                          placeholder="登录口令"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && doLogin(activeUser, password)}
                        />
                        <span className="os-passbox__divider" />
                        <button className="os-passbox__go" onClick={() => doLogin(activeUser, password)} title="登录">
                          <ArrowRightOutlined />
                        </button>
                      </div>
                      <div className={`os-hint${error ? ' is-error' : ''}`}>{error || '输入口令后回车登录'}</div>
                    </>
                  )}
                  {isActive && !needPassword && (
                    <div className="os-hint">未设置登录口令 · 点击头像即可登录</div>
                  )}
                </div>
              );
            })}

            {/* 新增账户 */}
            <div
              className="os-account"
              onClick={() => {
                setMode('create');
                setError('');
                setPassword('');
              }}
            >
              <div className="os-account__add">
                <UserAddOutlined />
              </div>
              <div className="os-account__name">新增用户</div>
            </div>
          </div>
        ) : (
          <div className="os-create">
            <h2 className="os-create__title">
              <UserAddOutlined /> 创建新账户
            </h2>

            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center', flex: 'none' }}>
                <div
                  className="os-account__avatar"
                  style={{ background: form.avatarColor, width: 76, height: 76, fontSize: 24 }}
                >
                  {form.name ? form.name.slice(-2) : '新'}
                </div>
                <div className="os-create__colors" style={{ marginTop: 10, justifyContent: 'center', maxWidth: 130 }}>
                  {AVATAR_COLORS.map((c) => (
                    <div
                      key={c}
                      className={`os-create__color${form.avatarColor === c ? ' is-active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setForm((f) => ({ ...f, avatarColor: c }))}
                    />
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="os-create__row">
                  <div className="os-create__field">
                    <div className="os-create__label">姓名 *</div>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="请输入真实姓名"
                    />
                  </div>
                  <div className="os-create__field">
                    <div className="os-create__label">所属部门</div>
                    <Select
                      value={form.department || undefined}
                      style={{ width: '100%' }}
                      placeholder={departments.length ? '请选择所属部门' : '请先在系统设置中维护部门'}
                      onChange={(v) => setForm((f) => ({ ...f, department: v }))}
                      options={toOptions(departments)}
                    />
                  </div>
                  <div className="os-create__field">
                    <div className="os-create__label">职务</div>
                    <Select
                      value={form.title || undefined}
                      style={{ width: '100%' }}
                      placeholder={titles.length ? '请选择职务' : '请先在系统设置中维护职务'}
                      onChange={(v) => setForm((f) => ({ ...f, title: v }))}
                      options={toOptions(titles)}
                    />
                  </div>
                </div>

                <div className="os-create__row">
                  <div className="os-create__field">
                    <div className="os-create__label">工号 / 执法证号</div>
                    <Input
                      value={form.employeeCode}
                      onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))}
                      placeholder="留空自动生成"
                    />
                  </div>
                  <div className="os-create__field">
                    <div className="os-create__label">默认担任角色</div>
                    <Select
                      value={form.role || undefined}
                      style={{ width: '100%' }}
                      placeholder={roles.length ? '请选择默认担任角色' : '请先在系统设置中维护角色'}
                      onChange={(v) => setForm((f) => ({ ...f, role: v }))}
                      options={toOptions(roles)}
                    />
                  </div>
                </div>

                <div className="os-create__row">
                  <div className="os-create__field">
                    <div className="os-create__label">登录口令（可留空，留空则免密登录）</div>
                    <Input.Password
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="设置本机登录口令"
                    />
                  </div>
                  <div className="os-create__field">
                    <div className="os-create__label">确认口令</div>
                    <Input.Password
                      value={form.confirmPassword}
                      onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                      placeholder="再次输入口令"
                    />
                  </div>
                </div>

                <Checkbox
                  checked={form.withDemo}
                  onChange={(e) => setForm((f) => ({ ...f, withDemo: e.target.checked }))}
                >
                  创建并带入一套示例审计数据（便于快速体验）
                </Checkbox>
              </div>
            </div>

            <div className="os-create__foot">
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                {storageMode === 'sqlite'
                  ? '数据由本机 Rust 服务写入 SQLite，各账户的项目、审计组与文件完全隔离'
                  : '浏览器预览模式：数据暂存于本机浏览器，桌面版将由 Rust + SQLite 持久化'}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="small" onClick={() => setMode('accounts')}>
                  返回账户列表
                </Button>
                <Button size="small" type="primary" onClick={submitCreate}>
                  创建并登录
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- 存储状态：一眼看出数据写在哪 ---------- */}
      <div
        className={`os-store os-store--${storageMode}`}
        onClick={() => setStoreHelp(true)}
        title={
          storageMode === 'sqlite'
            ? '数据写入本机 SQLite，点击查看详情'
            : '为什么没有生成 .db 文件？点击查看原因'
        }
      >
        <span className="os-store__dot" />
        {storageMode === 'sqlite'
          ? '本机数据库已连接 · 账户与业务数据写入 SQLite'
          : '浏览器预览模式 · 数据仅存于浏览器，不会生成 .db 文件'}
      </div>

      <Modal
        open={storeHelp}
        onCancel={() => setStoreHelp(false)}
        footer={null}
        width={540}
        title={storageMode === 'sqlite' ? '数据存储：本机 SQLite' : '数据存储：浏览器预览（未写入数据库）'}
      >
        <Typography.Paragraph style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 10 }}>
          {storageMode === 'sqlite' ? (
            <>
              当前运行在 <b>Tauri 桌面窗口</b>内，页面与 Rust 服务之间已建立 IPC 通道，
              账户、审计项目、审计组、工作文件全部写入本机 SQLite 文件。
            </>
          ) : (
            <>
              你现在是用<b>普通浏览器</b>打开 <span className="mono">http://localhost:5173</span>，
              这是前端开发服务器。浏览器出于安全限制<b>无法读写本地文件</b>，因此系统自动降级为
              localStorage（键名 <span className="mono">agms.data.&lt;账户ID&gt;</span>）——
              界面操作都能演示，但<b>不会生成 .db 文件</b>，这就是你建了用户却找不到数据库的原因。
            </>
          )}
        </Typography.Paragraph>

        <div style={{ background: '#f5f7fa', borderRadius: 6, padding: '10px 12px', fontSize: 12, lineHeight: 1.9 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>两种运行方式</div>
          <div>
            · 桌面版：终端执行 <span className="mono">npm run tauri dev</span>，弹出的应用窗口内即为 SQLite 模式
          </div>
          <div>
            · 浏览器预览：只用于快速看界面，数据存在浏览器里，换浏览器或清缓存就会丢失
          </div>
          <div style={{ marginTop: 6, color: '#4b5565' }}>
            数据库文件：
            <span className="mono">
              {storageMode === 'sqlite'
                ? ' 见「系统设置 → 账户与数据空间」，可直接在访达中定位'
                : ' 仅桌面版会生成，路径为 ~/Library/Application Support/cn.audit.workspace/audit_workspace.db'}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right', marginTop: 14 }}>
          <Button size="small" type="primary" onClick={() => setStoreHelp(false)}>
            我知道了
          </Button>
        </div>
      </Modal>
    </div>
  );
}
