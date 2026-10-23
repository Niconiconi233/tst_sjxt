import { useEffect, useState } from 'react';
import {
  App,
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  AppstoreAddOutlined,
  CopyOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  SafetyOutlined,
  SettingOutlined,
  SwapOutlined,
  TeamOutlined,
  UndoOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { BusyTag } from '@/components/BizTag';
import DictConfigPanel from '@/components/DictConfigPanel';
import AuditorConfigPanel from '@/components/AuditorConfigPanel';
import { useAuth } from '@/store/authStore';
import { useUserData } from '@/store/userData';
import { useDict } from '@/store/dictStore';
import { useAuditors } from '@/store/auditorStore';
import { backend } from '@/services/backend';
import { getPolicy } from '@/utils/permissions';

export default function Settings() {
  const { message } = App.useApp();
  const { currentUser, logout, storageMode, deletedUsers, restoreUser } = useAuth();
  const { projects, groups, documents, todos, resetDataset } = useUserData();
  const { items: dictItems, labels } = useDict();
  const { auditors } = useAuditors();
  const departments = labels('department');
  const roles = labels('role');
  const [dbPath, setDbPath] = useState('');
  const [backendInfo, setBackendInfo] = useState('');

  useEffect(() => {
    if (storageMode !== 'sqlite') {
      setDbPath('浏览器 localStorage（预览模式）');
      setBackendInfo('未连接');
      return;
    }
    backend
      .appInfo()
      .then((info) => {
        setDbPath(info.dbPath);
        setBackendInfo(`Rust ${info.version} · Tauri ${info.tauriVersion} · ${info.platform}`);
      })
      .catch(() => setBackendInfo('连接异常'));
  }, [storageMode]);
  const [autoBackup, setAutoBackup] = useState(true);
  const [mode, setMode] = useState('single');

  /** 在系统文件管理器中定位数据库文件，确认数据到底写在哪 */
  const revealDb = async () => {
    try {
      await backend.revealDbFile();
    } catch (err) {
      message.error(String(err));
    }
  };

  const copyDbPath = async () => {
    try {
      await navigator.clipboard.writeText(dbPath);
      message.success('已复制数据库路径');
    } catch {
      message.warning('当前环境不允许访问剪贴板，请手动选择路径复制');
    }
  };

  return (
    <div className="page">
      <Card size="small" title={<Space><SettingOutlined style={{ color: '#1a5fb4' }} />系统设置</Space>}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, fontSize: 12 }}
          message="字典类配置（部门、职务、角色、审计类型、文件类别与模板、审计事项等）已持久化到本机数据库，在「字典与模板配置」页维护后立即生效；机构信息、备份策略等仍为展示内容，将在业务逻辑阶段实现。"
        />
        <Tabs
          items={[
            {
              key: 'account',
              label: (
                <Space size={4}>
                  <UserOutlined />
                  账户与数据空间
                </Space>
              ),
              children: (
                <>
                <Row gutter={20}>
                  <Col span={10}>
                    <Card size="small" style={{ background: '#fafbfc' }}>
                      <Space size={12} align="center">
                        <Avatar size={54} style={{ backgroundColor: currentUser?.avatarColor, fontSize: 20 }}>
                          {currentUser?.name.slice(-2)}
                        </Avatar>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{currentUser?.name}</div>
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {currentUser?.department} · {currentUser?.title}
                          </div>
                          <div className="text-muted mono" style={{ fontSize: 11, marginTop: 2 }}>
                            工号 {currentUser?.employeeCode}
                          </div>
                        </div>
                      </Space>
                      <Descriptions size="small" column={1} style={{ marginTop: 14 }} styles={{ label: { width: 90 } }}>
                        <Descriptions.Item label="创建时间">{currentUser?.createdAt}</Descriptions.Item>
                        <Descriptions.Item label="上次登录">{currentUser?.lastLoginAt ?? '本次会话'}</Descriptions.Item>
                        <Descriptions.Item label="登录口令">
                          {currentUser?.password ? '已设置' : '未设置（免密登录）'}
                        </Descriptions.Item>
                      </Descriptions>
                      <Space style={{ marginTop: 8 }}>
                        <Button size="small" icon={<SwapOutlined />} onClick={logout}>
                          锁定并切换账户
                        </Button>
                      </Space>
                    </Card>
                  </Col>
                  <Col span={14}>
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12, fontSize: 12 }}
                      message="数据隔离说明"
                      description={
                        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                          {storageMode === 'sqlite'
                            ? '账户、审计项目、审计组、工作文件与待办全部由本机 Rust 服务写入 SQLite 数据库，各业务表以 owner_id 分片，切换账户后只能读取到本人的数据。'
                            : '当前为浏览器预览模式，数据暂存于本机 localStorage（键名 agms.data.<账户ID>）。在桌面端运行 npm run tauri dev 后将自动切换为 Rust + SQLite 持久化。'}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginTop: 6,
                              flexWrap: 'wrap',
                            }}
                          >
                            <span className="mono" style={{ fontSize: 11, color: '#4b5565' }}>
                              数据文件：{dbPath || '—'}
                            </span>
                            {storageMode === 'sqlite' && (
                              <>
                                <Button size="small" icon={<FolderOpenOutlined />} onClick={revealDb}>
                                  在访达中显示
                                </Button>
                                <Button size="small" icon={<CopyOutlined />} onClick={copyDbPath}>
                                  复制路径
                                </Button>
                              </>
                            )}
                          </div>
                          <div className="mono" style={{ fontSize: 11, color: '#4b5565' }}>
                            后端：{backendInfo || '—'}
                          </div>
                        </div>
                      }
                    />
                    <Row gutter={10}>
                      {[
                        { label: '审计项目', value: projects.length, unit: '个' },
                        { label: '审计组', value: groups.length, unit: '个' },
                        { label: '工作文件', value: documents.length, unit: '份' },
                        { label: '待办事项', value: todos.length, unit: '条' },
                      ].map((s) => (
                        <Col span={6} key={s.label}>
                          <div className="stat-card" style={{ padding: '10px 12px' }}>
                            <div>
                              <div className="stat-card__value" style={{ fontSize: 20 }}>
                                {s.value}
                                <span style={{ fontSize: 11, color: '#8a94a6', marginLeft: 2 }}>{s.unit}</span>
                              </div>
                              <div className="stat-card__title">{s.label}</div>
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                    <Popconfirm
                      title="重置为初始数据？"
                      description="将清空当前账户下新建的项目、审计组与文件，恢复为该账户创建时的初始数据。"
                      okText="确认重置"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={async () => {
                        await resetDataset();
                        message.success('已恢复初始数据');
                      }}
                    >
                      <Button danger size="small" style={{ marginTop: 12 }}>
                        重置我的数据
                      </Button>
                    </Popconfirm>
                  </Col>
                </Row>

                <Divider style={{ margin: '18px 0 12px' }} />

                {/* ---------- 已注销账户：逻辑删除后可恢复 ---------- */}
                <Space size={8} style={{ marginBottom: 10 }}>
                  <Typography.Title level={5} style={{ fontSize: 13, margin: 0 }}>
                    已注销账户（逻辑删除，可恢复）
                  </Typography.Title>
                  <Tag color={deletedUsers.length ? 'orange' : 'default'} style={{ marginInlineEnd: 0 }}>
                    {deletedUsers.length} 个
                  </Tag>
                </Space>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 10, fontSize: 12 }}
                  message="逻辑注销不会真正删除数据"
                  description="注销账户时若未勾选「同时物理删除」，其审计项目、审计组、工作文件与待办仅被打上删除标记并移出台账，数据仍完整保留在数据库文件中，点击「恢复」即可连同全部数据一起回到登录列表。勾选物理删除的账户不会出现在此列表。"
                />
                {deletedUsers.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已注销账户" />
                ) : (
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={deletedUsers}
                    columns={[
                      {
                        title: '账户',
                        key: 'name',
                        render: (_, u) => (
                          <Space size={8}>
                            <Avatar size={26} style={{ backgroundColor: u.avatarColor, fontSize: 11 }}>
                              {u.name.slice(-2)}
                            </Avatar>
                            <div>
                              <div style={{ fontSize: 12 }}>{u.name}</div>
                              <div className="text-muted" style={{ fontSize: 11 }}>
                                {u.department} · {u.role}
                              </div>
                            </div>
                          </Space>
                        ),
                      },
                      { title: '工号', dataIndex: 'employeeCode', width: 120 },
                      {
                        title: '注销时间',
                        dataIndex: 'deletedAt',
                        width: 140,
                        render: (v: string | null) => v ?? '—',
                      },
                      {
                        title: '操作',
                        key: 'action',
                        width: 110,
                        render: (_, u) => (
                          <Popconfirm
                            title={`恢复账户「${u.name}」？`}
                            description="该账户及其全部审计项目、审计组与工作文件将重新可用。"
                            okText="确认恢复"
                            cancelText="取消"
                            onConfirm={() => {
                              restoreUser(u.id);
                              message.success(`账户「${u.name}」已恢复，可重新登录`);
                            }}
                          >
                            <Button size="small" type="primary" ghost icon={<UndoOutlined />}>
                              恢复
                            </Button>
                          </Popconfirm>
                        ),
                      },
                    ]}
                  />
                )}
                </>
              ),
            },
            {
              key: 'org',
              label: (
                <Space size={4}>
                  <TeamOutlined />
                  机构与人员
                </Space>
              ),
              children: (
                <div>
                  <Descriptions bordered size="small" column={2} styles={{ label: { width: 140 } }}>
                    <Descriptions.Item label="审计机关名称">XX 市审计局</Descriptions.Item>
                    <Descriptions.Item label="机构代码">11330000000000000X</Descriptions.Item>
                    <Descriptions.Item label="内设机构数">12 个</Descriptions.Item>
                    <Descriptions.Item label="在编人员数">{auditors.length} 人</Descriptions.Item>
                    <Descriptions.Item label="业务处室">
                      {departments.length
                        ? departments.join('、')
                        : '尚未配置，请在「字典与模板配置」中维护'}
                    </Descriptions.Item>
                  </Descriptions>
                  <Divider style={{ margin: '16px 0 12px' }} />
                  <Typography.Title level={5} style={{ fontSize: 13 }}>
                    人员库预览
                  </Typography.Title>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={{ pageSize: 6, size: 'small' }}
                    dataSource={auditors}
                    columns={[
                      { title: '姓名', dataIndex: 'name', width: 100 },
                      { title: '工号', dataIndex: 'code', width: 100 },
                      { title: '部门', dataIndex: 'department', width: 200 },
                      { title: '职务', dataIndex: 'title', width: 120 },
                      {
                        title: '资格',
                        dataIndex: 'qualification',
                        width: 140,
                        render: (v?: string) => (v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : '—'),
                      },
                      { title: '负荷', dataIndex: 'busyProjects', width: 90, render: (v: number) => <BusyTag count={v} /> },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'dict',
              label: (
                <Space size={4}>
                  <AppstoreAddOutlined />
                  字典与模板配置
                </Space>
              ),
              children: <DictConfigPanel />,
            },
            {
              key: 'auditors',
              label: (
                <Space size={4}>
                  <TeamOutlined />
                  审计人员名册
                </Space>
              ),
              children: <AuditorConfigPanel />,
            },
            {
              key: 'template',
              label: '文书模板库',
              children: (
                <Descriptions bordered size="small" column={2} styles={{ label: { width: 140 } }}>
                  <Descriptions.Item label="模板总数">
                    {dictItems.filter((x) => x.category === 'doc_template' && x.enabled).length} 套
                  </Descriptions.Item>
                  <Descriptions.Item label="文书类别">
                    {dictItems.filter((x) => x.category === 'doc_category' && x.enabled).length} 类
                  </Descriptions.Item>
                  <Descriptions.Item label="模板版本">2026.01 版</Descriptions.Item>
                  <Descriptions.Item label="维护入口">
                    「字典与模板配置」页可增删改模板与类别
                  </Descriptions.Item>
                  <Descriptions.Item label="支持格式" span={2}>
                    DOCX / PDF / 内置富文本
                  </Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'auth',
              label: (
                <Space size={4}>
                  <SafetyOutlined />
                  权限与角色
                </Space>
              ),
              children: (
                <Table
                  size="small"
                  rowKey="role"
                  pagination={false}
                  dataSource={
                    roles.length
                      ? roles.map((r) => ({
                          role: r,
                          scope: getPolicy(r).summary,
                          op: getPolicy(r).permissions.length
                            ? `${getPolicy(r).permissions.length} 项操作权限 · 可编写 ${getPolicy(r).categories.length} 类文件`
                            : '无操作权限',
                        }))
                      : []
                  }
                  columns={[
                    { title: '角色', dataIndex: 'role', width: 140, render: (v: string) => <Tag color="blue">{v}</Tag> },
                    { title: '数据范围', dataIndex: 'scope' },
                    { title: '主要操作权限', dataIndex: 'op' },
                  ]}
                />
              ),
            },
            {
              key: 'system',
              label: (
                <Space size={4}>
                  <DatabaseOutlined />
                  系统参数
                </Space>
              ),
              children: (
                <Row gutter={24}>
                  <Col span={12}>
                    <Descriptions bordered size="small" column={1} styles={{ label: { width: 150 } }}>
                      <Descriptions.Item label="运行模式">
                        <Select
                          size="small"
                          value={mode}
                          onChange={setMode}
                          style={{ width: 220 }}
                          options={[
                            { value: 'single', label: '单机模式（本地数据库）' },
                            { value: 'server', label: '联网模式（连接审计专网服务器）' },
                          ]}
                        />
                      </Descriptions.Item>
                      <Descriptions.Item label="本地数据目录">
                        <Input size="small" defaultValue="~/Library/Application Support/cn.audit.workspace" />
                      </Descriptions.Item>
                      <Descriptions.Item label="自动备份">
                        <Switch size="small" checked={autoBackup} onChange={setAutoBackup} />
                      </Descriptions.Item>
                      <Descriptions.Item label="备份保留份数">
                        <Input size="small" defaultValue="30" style={{ width: 120 }} suffix="份" />
                      </Descriptions.Item>
                    </Descriptions>
                    <Space style={{ marginTop: 12 }}>
                      <Button size="small" onClick={() => message.success('已触发本地备份（演示）')}>
                        立即备份
                      </Button>
                      <Button size="small" onClick={() => message.info('恢复功能待接入后端逻辑')}>
                        从备份恢复
                      </Button>
                    </Space>
                  </Col>
                  <Col span={12}>
                    <Alert
                      type="warning"
                      showIcon
                      message="数据安全提示"
                      description={
                        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                          审计资料属涉密信息，单机模式下数据加密存储于本地；联网模式须部署于审计专网，禁止接入互联网。
                          数据库选型建议 SQLite（单机）或 PostgreSQL（联网）。
                        </div>
                      }
                    />
                  </Col>
                </Row>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
