import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileAddOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { AuditorCell, RoleTag } from '@/components/BizTag';
import AuditorPicker from '@/components/AuditorPicker';
import { useUserData } from '@/store/userData';
import { useDict } from '@/store/dictStore';
import { usePermission } from '@/utils/permissions';
import { useAuditors } from '@/store/auditorStore';
import { bizColors } from '@/theme';
import type { Auditor, GroupMember, GroupRole } from '@/types';

const STATUS_COLOR: Record<string, string> = {
  组建中: '#8a94a6',
  已成立: '#1a5fb4',
  现场实施: '#b7791f',
  已撤离: '#1a7f4b',
};

const LOGS = [
  { time: '2026-03-18 17:10', who: '陈志远', what: '组织学习审计"八不准"工作纪律' },
  { time: '2026-03-12 09:30', who: '冯丽娟', what: '提交本周工作日志与考勤登记' },
  { time: '2026-03-02 08:40', who: '陈志远', what: '审计组进点，召开进点见面会' },
  { time: '2026-02-20 14:20', who: '系统', what: '审计组组建完成，共 7 名成员' },
];

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { groups, documents, updateGroup, removeGroup } = useUserData();
  const { labels } = useDict();
  const { auditors } = useAuditors();
  const { can } = usePermission();
  const roles = labels('role');
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const group = useMemo(() => groups.find((g) => g.id === id), [id, groups]);
  const data = members ?? group?.members ?? [];
  const groupDocs = useMemo(() => documents.filter((d) => d.groupId === id), [id, documents]);

  if (!group) {
    return (
      <Card>
        <Empty description="未找到该审计组">
          <Button onClick={() => navigate('/groups')}>返回审计组台账</Button>
        </Empty>
      </Card>
    );
  }

  const lockedIds = [
    group.members.find((m) => m.role === '审计组长')?.memberId,
    group.members.find((m) => m.role === '主审')?.memberId,
  ].filter(Boolean) as string[];

  const update = (mid: string, patch: Partial<GroupMember>) =>
    setMembers((prev) => (prev ?? group.members).map((m) => (m.memberId === mid ? { ...m, ...patch } : m)));

  const remove = (mid: string) =>
    setMembers((prev) => (prev ?? group.members).filter((m) => m.memberId !== mid));

  /* ---------------- 成员表 ---------------- */
  const memberColumns: TableProps<GroupMember>['columns'] = [
    {
      title: '成员',
      key: 'auditor',
      width: 210,
      render: (_, r) => <AuditorCell auditor={r.auditor} />,
    },
    {
      title: '组内角色',
      dataIndex: 'role',
      width: 120,
      render: (v: GroupRole, r) =>
        editing ? (
          <Select
            size="small"
            value={v}
            style={{ width: '100%' }}
            options={roles.map((x) => ({ value: x, label: x }))}
            onChange={(val) => update(r.memberId, { role: val })}
          />
        ) : (
          <RoleTag role={v} />
        ),
    },
    {
      title: '负责审计事项',
      dataIndex: 'responsibleItems',
      render: (v: string[], r) =>
        editing ? (
          <Select
            size="small"
            mode="multiple"
            value={v}
            style={{ width: '100%' }}
            placeholder="请选择"
            onChange={(val) => update(r.memberId, { responsibleItems: val })}
            options={[...new Set(data.flatMap((m) => m.responsibleItems))].map((i) => ({ value: i, label: i }))}
          />
        ) : (
          <Space size={4} wrap>
            {v.map((i) => (
              <Tag key={i} style={{ fontSize: 11, marginInlineEnd: 0 }}>
                {i}
              </Tag>
            ))}
          </Space>
        ),
    },
    {
      title: '分工说明',
      dataIndex: 'duty',
      ellipsis: true,
      render: (v: string, r) =>
        editing ? (
          <Input size="small" value={v} onChange={(e) => update(r.memberId, { duty: e.target.value })} />
        ) : (
          <span style={{ fontSize: 12 }}>{v || '—'}</span>
        ),
    },
    { title: '入组日期', dataIndex: 'joinDate', width: 110 },
    {
      title: '驻场',
      dataIndex: 'onSite',
      width: 70,
      render: (v: boolean) =>
        v ? (
          <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>
            驻场
          </Tag>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    ...(editing
      ? [
          {
            title: '',
            key: 'op',
            width: 40,
            render: (_: unknown, r: GroupMember) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={lockedIds.includes(r.memberId)}
                onClick={() => remove(r.memberId)}
              />
            ),
          },
        ]
      : []),
  ];

  /* ---------------- 分工矩阵 ---------------- */
  const matrixItems = [...new Set(data.flatMap((m) => m.responsibleItems))];
  const matrixColumns: TableProps<{ item: string }>['columns'] = [
    {
      title: '审计事项',
      dataIndex: 'item',
      width: 160,
      fixed: 'left',
      render: (v: string) => <span style={{ fontSize: 12, fontWeight: 500 }}>{v}</span>,
    },
    ...data.map((m) => ({
      title: (
        <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
          <div style={{ fontSize: 12 }}>{m.auditor.name}</div>
          <div style={{ fontSize: 10, color: '#8a94a6', fontWeight: 400 }}>{m.role}</div>
        </div>
      ),
      key: m.memberId,
      align: 'center' as const,
      render: (_: unknown, row: { item: string }) =>
        m.responsibleItems.includes(row.item) ? (
          <CheckCircleOutlined style={{ color: bizColors.success, fontSize: 14 }} />
        ) : (
          <span className="text-muted">·</span>
        ),
    })),
  ];

  const docColumns: TableProps<(typeof groupDocs)[number]>['columns'] = [
    {
      title: '文件标题',
      dataIndex: 'title',
      render: (v: string, r) => (
        <div>
          <Typography.Link style={{ fontSize: 13 }} onClick={() => navigate('/documents')}>
            {v}
          </Typography.Link>
          <div className="text-muted mono" style={{ fontSize: 11 }}>
            {r.code}
          </div>
        </div>
      ),
    },
    { title: '类别', dataIndex: 'category', width: 120 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => (
        <Tag color={bizColors.docStatus[v as keyof typeof bizColors.docStatus]} style={{ fontSize: 11, marginInlineEnd: 0 }}>
          {v}
        </Tag>
      ),
    },
    { title: '起草人', dataIndex: 'authorName', width: 90 },
    { title: '版本', dataIndex: 'version', width: 70 },
    { title: '更新时间', dataIndex: 'updatedAt', width: 130 },
  ];

  return (
    <div className="page">
      {/* ---------- 头部 ---------- */}
      <div className="detail-hero">
        <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/groups')}>
          返回台账
        </Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <h3 className="detail-hero__title">
              <TeamOutlined style={{ color: bizColors.primary }} />
              {group.name}
              <Tag color={STATUS_COLOR[group.status]} style={{ fontSize: 11, marginInlineEnd: 0 }}>
                {group.status}
              </Tag>
              <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>
                {group.memberCount} 人
              </Tag>
            </h3>
            <div className="detail-hero__meta">
              <span>所属项目：{group.projectName}</span>
              <span>
                <EnvironmentOutlined /> {group.location}
              </span>
              <span>
                {group.establishDate} ~ {group.planEndDate}
              </span>
            </div>
          </div>
          <Space>
            {can('group:edit') && (
            <Button
              icon={<EditOutlined />}
              onClick={() => {
                if (editing) {
                  // 保存成员与分工到当前账户的 SQLite 空间
                  updateGroup(group.id, { members: data, memberCount: data.length });
                  setMembers(null);
                  setEditing(false);
                  message.success('组内成员与分工已保存');
                } else {
                  setMembers(group.members);
                  setEditing(true);
                  message.info('已进入编辑模式，可调整角色、分工与驻场状态');
                }
              }}
            >
              {editing ? '保存分工' : '调整分工'}
            </Button>
            )}
            {can('group:edit') && (
              <Button icon={<UserAddOutlined />} onClick={() => setPickerOpen(true)}>
                增补成员
              </Button>
            )}
            {can('doc:create') && (
              <Button
                icon={<FileAddOutlined />}
                onClick={() => navigate(`/documents/new?project=${group.projectId}&group=${group.id}`)}
              >
                起草文件
              </Button>
            )}
            {can('group:delete') && (
              <Popconfirm
                title="撤销该审计组？"
                description="审计组将被删除，已关联的工作文件会解除关联但不会被删除。"
                okText="确认撤销"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => {
                  removeGroup(group.id);
                  message.success('审计组已撤销');
                  navigate('/groups');
                }}
              >
                <Button danger icon={<DeleteOutlined />}>
                  撤销审计组
                </Button>
              </Popconfirm>
            )}
            <Button type="primary" onClick={() => navigate(`/projects/${group.projectId}`)}>
              查看所属项目
            </Button>
          </Space>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            成员：
          </span>
          {data.map((m) => (
            <Space key={m.memberId} size={4} style={{ background: '#f7f9fb', padding: '2px 8px', borderRadius: 3 }}>
              <Avatar size={20} style={{ backgroundColor: m.auditor.avatarColor, fontSize: 10 }}>
                {m.auditor.name.slice(-2)}
              </Avatar>
              <span style={{ fontSize: 12 }}>{m.auditor.name}</span>
              <span className="text-muted" style={{ fontSize: 11 }}>
                {m.role}
              </span>
            </Space>
          ))}
        </div>
      </div>

      <Row gutter={12}>
        {[
          { label: '组内成员', value: data.length, unit: '人' },
          { label: '驻场人员', value: data.filter((m) => m.onSite).length, unit: '人' },
          { label: '分配事项', value: matrixItems.length, unit: '项' },
          { label: '组内文件', value: groupDocs.length, unit: '份' },
        ].map((s) => (
          <Col span={6} key={s.label}>
            <div className="stat-card" style={{ padding: '10px 14px' }}>
              <div>
                <div className="stat-card__value" style={{ fontSize: 20, color: bizColors.primary }}>
                  {s.value}
                  <span style={{ fontSize: 12, marginLeft: 2, color: '#8a94a6', fontWeight: 400 }}>{s.unit}</span>
                </div>
                <div className="stat-card__title">{s.label}</div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Card size="small" styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          items={[
            {
              key: 'members',
              label: `成员与分工（${data.length}）`,
              children: (
                <Table
                  rowKey="memberId"
                  size="small"
                  columns={memberColumns}
                  dataSource={data}
                  pagination={false}
                  scroll={{ x: 980 }}
                />
              ),
            },
            {
              key: 'matrix',
              label: '分工矩阵',
              children: matrixItems.length ? (
                <Table
                  rowKey="item"
                  size="small"
                  columns={matrixColumns}
                  dataSource={matrixItems.map((item) => ({ item }))}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  bordered
                />
              ) : (
                <Empty description="尚未分配审计事项" />
              ),
            },
            {
              key: 'discipline',
              label: '廉政与纪律',
              children: (
                <Row gutter={16}>
                  <Col span={14}>
                    <Alert
                      type="warning"
                      showIcon
                      icon={<SafetyCertificateOutlined />}
                      message="审计组廉政纪律要求"
                      description={<div style={{ fontSize: 12, lineHeight: 1.8 }}>{group.disciplineNote ?? '严格遵守审计"八不准"工作纪律，不得接受被审计单位宴请、礼品。'}</div>}
                      style={{ marginBottom: 12 }}
                    />
                    <Descriptions bordered size="small" column={2} styles={{ label: { width: 110 } }}>
                      <Descriptions.Item label="廉政监督员">
                        {data.find((m) => m.role === '廉政监督员')?.auditor.name ?? '未设置'}
                      </Descriptions.Item>
                      <Descriptions.Item label="承诺书签订">已签订（{data.length} 人）</Descriptions.Item>
                      <Descriptions.Item label="纪律告知">已送达被审计单位</Descriptions.Item>
                      <Descriptions.Item label="举报渠道">已公示</Descriptions.Item>
                    </Descriptions>
                  </Col>
                  <Col span={10}>
                    <Typography.Title level={5} style={{ fontSize: 13, marginTop: 0 }}>
                      廉政工作记录
                    </Typography.Title>
                    <Timeline
                      items={[
                        { color: 'green', children: '审计组集中签订廉政承诺书（2026-02-20）' },
                        { color: 'green', children: '向被审计单位送达"八不准"告知书（2026-03-02）' },
                        { color: 'blue', children: '开展廉政教育集中学习（2026-03-18）' },
                        { color: 'gray', children: '现场结束前廉政纪律执行情况报告（待提交）' },
                      ]}
                    />
                  </Col>
                </Row>
              ),
            },
            {
              key: 'docs',
              label: `组内文件（${groupDocs.length}）`,
              children: (
                <div>
                  {can('doc:create') && (
                    <div style={{ marginBottom: 10 }}>
                      <Button
                        size="small"
                        icon={<FileAddOutlined />}
                        onClick={() => navigate(`/documents/new?project=${group.projectId}&group=${group.id}`)}
                      >
                        起草文件
                      </Button>
                    </div>
                  )}
                  <Table
                    rowKey="id"
                    size="small"
                    columns={docColumns}
                    dataSource={groupDocs}
                    pagination={false}
                    locale={{ emptyText: '该审计组暂无工作文件' }}
                  />
                </div>
              ),
            },
            {
              key: 'logs',
              label: '组内日志',
              children: (
                <Timeline
                  items={LOGS.map((l) => ({
                    children: (
                      <div>
                        <div style={{ fontSize: 13 }}>{l.what}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {l.who} · {l.time}
                        </div>
                      </div>
                    ),
                  }))}
                />
              ),
            },
          ]}
        />
      </Card>

      <AuditorPicker
        open={pickerOpen}
        selectedIds={data.map((m) => m.memberId)}
        onCancel={() => setPickerOpen(false)}
        onOk={(ids) => {
          const cur = members ?? group.members;
          const added = ids
            .filter((i) => !cur.some((m) => m.memberId === i))
            .map((mid) => ({ mid, auditor: auditors.find((a) => a.id === mid) }))
            .filter((x): x is { mid: string; auditor: Auditor } => !!x.auditor);
          setMembers([
            ...cur,
            ...added.map(({ mid, auditor }) => ({
              memberId: mid,
              auditor,
              role: '审计员' as GroupRole,
              duty: '',
              responsibleItems: [],
              joinDate: group.establishDate,
              onSite: true,
            })),
          ]);
          setPickerOpen(false);
          if (added.length) message.success(`已增补 ${added.length} 名成员（演示，未持久化）`);
        }}
      />
    </div>
  );
}
