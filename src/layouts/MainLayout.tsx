import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  App,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
  Dropdown,
  Input,
  Layout,
  Menu,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import {
  AuditOutlined,
  BellOutlined,
  DeleteOutlined,
  DownOutlined,
  FileAddOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { menuTree, resolveBreadcrumb, resolveOpenKeys } from '@/config/menu';
import { useAuth } from '@/store/authStore';
import { useUserData } from '@/store/userData';
import { usePermission } from '@/utils/permissions';

const { Header, Sider, Content, Footer } = Layout;

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { currentUser, logout, removeUser, storageMode } = useAuth();
  const { projects, todos, documents, groups } = useUserData();
  const { can, isLeader, role } = usePermission();
  const [collapsed, setCollapsed] = useState(false);
  const [projectCtx, setProjectCtx] = useState<string | undefined>(undefined);
  /** 注销账户弹窗：physical 决定逻辑删除还是物理删除，默认逻辑删除 */
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [physicalDelete, setPhysicalDelete] = useState(false);
  const { token } = theme.useToken();

  const menuItems: MenuProps['items'] = useMemo(
    () =>
      menuTree.map((node) =>
        node.children
          ? {
              key: node.key,
              icon: node.icon,
              label: node.label,
              children: node.children.map((c) => ({
                key: c.key,
                icon: c.icon,
                label: c.label,
              })),
            }
          : { key: node.key, icon: node.icon, label: node.label },
      ),
    [],
  );

  /** 菜单 key -> 路径 */
  const keyToPath = useMemo(() => {
    const map: Record<string, string> = {};
    const walk = (nodes: typeof menuTree) => {
      nodes.forEach((n) => {
        if (n.path) map[n.key] = n.path;
        if (n.children) walk(n.children);
      });
    };
    walk(menuTree);
    return map;
  }, []);

  const selectedKey = useMemo(() => {
    const all = menuTree.flatMap((n) => (n.children ? n.children : [n]));
    const exact = all.find((n) => n.path === location.pathname);
    if (exact) return exact.key;
    if (location.pathname.startsWith('/projects/')) return 'project:list';
    if (location.pathname.startsWith('/groups/')) return 'group:list';
    return 'workbench';
  }, [location.pathname]);

  const breadcrumb = resolveBreadcrumb(location.pathname);
  const openKeys = resolveOpenKeys(location.pathname);
  const pendingCount = todos.length;

  // 项目上下文默认落在当前账户的第一个在办项目上
  useEffect(() => {
    if (!projectCtx && projects.length) setProjectCtx(projects[0].id);
  }, [projects, projectCtx]);

  /** 打开注销确认弹窗，每次都从「逻辑删除」的默认状态开始 */
  const openDeactivate = () => {
    if (!currentUser) return;
    setPhysicalDelete(false);
    setDeactivateOpen(true);
  };

  /** 按勾选状态执行注销：未勾选＝逻辑删除（可恢复），勾选＝物理删除（不可恢复） */
  const submitDeactivate = () => {
    if (!currentUser) return;
    const { id, name } = currentUser;
    const physical = physicalDelete;
    setDeactivateOpen(false);
    removeUser(id, physical);
    if (physical) {
      message.success(`账户「${name}」及其全部数据已永久删除`);
    } else {
      message.success(`账户「${name}」已注销，数据已保留，可在系统设置中恢复`);
    }
    logout();
  };

  const userMenu: MenuProps = {
    items: [
      {
        key: 'profile',
        label: `${currentUser?.name} · ${currentUser?.department} ${currentUser?.title}`,
        disabled: true,
      },
      { type: 'divider' },
      { key: 'role', label: `默认角色：${role}` },
      { key: 'scope', label: '数据空间：仅本人可见（本机隔离）' },
      { type: 'divider' },
      { key: 'lock', label: '锁定屏幕 / 切换账户' },
      { key: 'logout', label: '退出登录' },
      { type: 'divider' },
      {
        key: 'deactivate',
        label: '注销账户',
        danger: true,
        icon: <DeleteOutlined />,
      },
    ],
    onClick: ({ key }) => {
      if (key === 'lock' || key === 'logout') logout();
      if (key === 'deactivate') openDeactivate();
    },
  };

  return (
    <Layout className="app-layout">
      <Sider
        className="app-sider"
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={216}
        theme="dark"
      >
        <div className="brand">
          <div className="brand__logo">审</div>
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div className="brand__text">审计组工作管理系统</div>
              <div className="brand__sub">Audit Team Workspace</div>
            </div>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          items={menuItems}
          selectedKeys={[selectedKey]}
          defaultOpenKeys={openKeys}
          onClick={({ key }) => {
            const p = keyToPath[key];
            if (p) navigate(p);
          }}
          style={{ borderInlineEnd: 'none', marginTop: 8 }}
        />
        {!collapsed && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              right: 12,
              padding: '8px 10px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.55)',
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            <div>版本 v0.1.0</div>
            <div>
              {storageMode === 'sqlite' ? '数据由本机 SQLite 持久化' : '浏览器预览存储'}
            </div>
          </div>
        )}
      </Sider>

      <Layout>
        <Header className="app-header">
          <Space size={8}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((v) => !v)}
              style={{ color: '#41546b' }}
            />
            <Breadcrumb
              items={breadcrumb.map((b) => ({ title: b }))}
              style={{ fontSize: 13 }}
            />
          </Space>

          <Space size={10} wrap={false}>
            {projects.length > 0 && (
              <Select
                size="small"
                value={projectCtx}
                onChange={setProjectCtx}
                style={{ width: 260 }}
                options={projects.map((p) => ({
                  value: p.id,
                  label: `${p.code} ${p.name}`,
                }))}
                optionRender={(opt) => (
                  <Tooltip title={opt.label as string} placement="right">
                    <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {opt.label}
                    </div>
                  </Tooltip>
                )}
              />
            )}
            <Input
              size="small"
              allowClear
              placeholder="搜索项目 / 文件 / 人员"
              style={{ width: 200 }}
              variant="filled"
            />
            <Dropdown
              menu={{
                items: [
                  can('project:create')
                    ? { key: '1', label: '建立审计项目', icon: <AuditOutlined /> }
                    : {
                        key: '1x',
                        label: '建立审计项目（仅审计组长可操作）',
                        icon: <AuditOutlined />,
                        disabled: true,
                      },
                  can('group:create')
                    ? { key: '2', label: '组建审计组', icon: <TeamOutlined /> }
                    : {
                        key: '2x',
                        label: '组建审计组（仅审计组长可操作）',
                        icon: <TeamOutlined />,
                        disabled: true,
                      },
                  can('doc:create')
                    ? { key: '3', label: '起草工作文件', icon: <FileAddOutlined /> }
                    : {
                        key: '3x',
                        label: '起草工作文件（无可用类别）',
                        icon: <FileAddOutlined />,
                        disabled: true,
                      },
                ],
                onClick: ({ key }) => {
                  if (key === '1') navigate('/projects/new');
                  if (key === '2') navigate('/groups/new');
                  if (key === '3') navigate('/documents/new');
                },
              }}
            >
              <Button type="primary" size="small" icon={<PlusOutlined />}>
                新建
                <DownOutlined style={{ fontSize: 10 }} />
              </Button>
            </Dropdown>
            <Badge count={pendingCount} size="small" offset={[-2, 2]}>
              <Button type="text" size="small" icon={<BellOutlined style={{ fontSize: 16, color: '#41546b' }} />} />
            </Badge>
            <Button type="text" size="small" icon={<QuestionCircleOutlined style={{ color: '#41546b' }} />} />
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space size={6} style={{ cursor: 'pointer', padding: '0 4px' }}>
                <Avatar
                  size={26}
                  style={{ backgroundColor: currentUser?.avatarColor ?? '#1a5fb4', fontSize: 12 }}
                >
                  {currentUser?.name.slice(-2)}
                </Avatar>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 12, color: token.colorText }}>{currentUser?.name}</div>
                  <Tag
                    color={isLeader ? 'blue' : 'default'}
                    style={{ marginInlineEnd: 0, marginTop: 2, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                  >
                    {role}
                  </Tag>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content className="app-content">
          <Outlet />
        </Content>

        <Footer style={{ textAlign: 'center', padding: '4px 16px' }}>
          <Typography.Text className="text-muted" style={{ fontSize: 11 }}>
            {currentUser?.name} 的数据空间 · 项目 {projects.length} 个 ·{' '}
            {storageMode === 'sqlite' ? '本机 SQLite 持久化（Rust）' : '浏览器预览存储'}
          </Typography.Text>
        </Footer>
      </Layout>

      {/* 注销账户：默认逻辑删除，勾选后改为物理删除 */}
      <Modal
        open={deactivateOpen}
        title={`注销账户「${currentUser?.name ?? ''}」`}
        okText={physicalDelete ? '永久删除' : '确认注销'}
        cancelText="再想想"
        okButtonProps={{ danger: true }}
        onOk={submitDeactivate}
        onCancel={() => setDeactivateOpen(false)}
        maskClosable={false}
        width={540}
        destroyOnClose
      >
        <div style={{ fontSize: 13, lineHeight: 1.9 }}>
          注销后该账户将从登录列表中移除，其名下的
          <b> {projects.length} 个审计项目、{groups.length} 个审计组、{documents.length} 份工作文件</b>
          {physicalDelete ? '将被一并从数据库中删除。' : '将全部标记为已删除，不再出现在台账中。'}
        </div>

        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            border: `1px solid ${physicalDelete ? '#ffccc7' : '#e6e8eb'}`,
            borderRadius: 6,
            background: physicalDelete ? '#fff2f0' : '#f7f9fb',
            transition: 'all .2s',
          }}
        >
          <Checkbox
            checked={physicalDelete}
            onChange={(e) => setPhysicalDelete(e.target.checked)}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>同时物理删除，不保留任何数据</span>
          </Checkbox>
          <div style={{ fontSize: 12, color: physicalDelete ? '#a8071a' : '#8a94a6', marginTop: 4, lineHeight: 1.7 }}>
            {physicalDelete
              ? '账户及其项目、审计组、工作文件（含文档正文）、待办记录将从数据库彻底清除，数据库文件中不留任何副本。'
              : '不勾选（默认）为逻辑删除：数据仅打上删除标记，可随时在「系统设置 → 账户与数据空间」中恢复。'}
          </div>
        </div>

        {physicalDelete && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12, fontSize: 12 }}
            message="此操作不可撤销"
            description="删除后无法在系统设置中恢复，也无法从本机数据库中找回，请确认已完成必要的数据备份。"
          />
        )}
      </Modal>
    </Layout>
  );
}
