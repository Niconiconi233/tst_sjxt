import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
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
  AuditOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FileAddOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { AuditorCell, ProjectStatusTag, RoleTag } from '@/components/BizTag';
import { useUserData } from '@/store/userData';
import { usePermission } from '@/utils/permissions';
import { bizColors } from '@/theme';
import type { AuditProject, GroupMember, ProjectStatus, SecretLevel } from '@/types';

const PROJECT_STATUSES: ProjectStatus[] = ['筹备中', '实施中', '报告阶段', '整改跟踪', '已归档'];

/** 演示用的问题清单（真实数据应由后端提供） */
const ISSUES = [
  { id: 'I1', code: 'WT-001', title: '超预算列支会议费', level: '一般', amount: '12.60 万元', status: '整改中', owner: '冯丽娟', due: '2026-04-30' },
  { id: 'I2', code: 'WT-002', title: '专项资金结转结余未及时清理', level: '重要', amount: '386.20 万元', status: '已整改', owner: '孙雅芳', due: '2026-03-31' },
  { id: 'I3', code: 'WT-003', title: '政府采购程序履行不完整', level: '重要', amount: '74.80 万元', status: '待反馈', owner: '赵慧敏', due: '2026-04-15' },
  { id: 'I4', code: 'WT-004', title: '部分固定资产未入账', level: '一般', amount: '23.15 万元', status: '整改中', owner: '徐明辉', due: '2026-05-10' },
];

const LOGS = [
  { time: '2026-03-18 16:40', who: '李文静', what: '提交《取证单-QZ003》进入复核流程' },
  { time: '2026-03-16 10:12', who: '陈志远', what: '审定审计实施方案 V2.1' },
  { time: '2026-03-10 09:05', who: '冯丽娟', what: '上传现场勘查照片等证据材料 5 份' },
  { time: '2026-03-02 08:30', who: '陈志远', what: '审计组正式进点，召开进点见面会' },
  { time: '2026-02-20 14:22', who: '系统', what: '审计组成立，成员 7 人' },
  { time: '2026-01-18 09:24', who: '陈志远', what: '项目立项登记完成' },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [tab, setTab] = useState('overview');

  const { projects, groups, documents, updateProject, removeProject } = useUserData();
  const { can } = usePermission();

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<Partial<AuditProject>>();

  const openEdit = () => {
    if (!project) return;
    form.setFieldsValue({
      name: project.name,
      auditedUnit: project.auditedUnit,
      status: project.status,
      progress: project.progress,
      remark: project.remark,
    });
    setEditOpen(true);
  };

  /** 保存修改到当前账户的 SQLite 数据空间 */
  const saveEdit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      updateProject(project!.id, values);
      setEditOpen(false);
      message.success('项目信息已保存');
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = () => {
    removeProject(project!.id);
    message.success('项目及其审计组、工作文件已删除');
    navigate('/projects');
  };

  const project = useMemo(() => projects.find((p) => p.id === id), [id, projects]);
  const projectGroups = useMemo(() => groups.filter((g) => g.projectId === id), [id, groups]);
  const projectDocs = useMemo(() => documents.filter((d) => d.projectId === id), [id, documents]);

  const members: GroupMember[] = useMemo(
    () => projectGroups.flatMap((g) => g.members),
    [projectGroups],
  );

  if (!project) {
    return (
      <Card>
        <Empty description="未找到该审计项目">
          <Button onClick={() => navigate('/projects')}>返回项目台账</Button>
        </Empty>
      </Card>
    );
  }

  const docColumns: TableProps<(typeof projectDocs)[number]>['columns'] = [
    {
      title: '文件标题',
      dataIndex: 'title',
      key: 'title',
      render: (v: string, r) => (
        <div>
          <Typography.Link onClick={() => navigate('/documents')} style={{ fontSize: 13 }}>
            {v}
          </Typography.Link>
          <div className="text-muted mono" style={{ fontSize: 11 }}>
            {r.code} · {r.template}
          </div>
        </div>
      ),
    },
    { title: '类别', dataIndex: 'category', key: 'category', width: 110 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: any) => (
        <Tag color={bizColors.docStatus[v as keyof typeof bizColors.docStatus]} style={{ fontSize: 11, marginInlineEnd: 0 }}>
          {v}
        </Tag>
      ),
    },
    { title: '起草人', dataIndex: 'authorName', key: 'authorName', width: 90 },
    {
      title: '密级',
      dataIndex: 'secretLevel',
      key: 'secretLevel',
      width: 70,
      render: (v: SecretLevel) => (
        <Tag style={{ fontSize: 11, marginInlineEnd: 0 }} color={v === '秘密' ? 'orange' : 'default'}>
          {v}
        </Tag>
      ),
    },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 130 },
  ];

  const memberColumns: TableProps<GroupMember>['columns'] = [
    {
      title: '成员',
      key: 'auditor',
      width: 220,
      render: (_, r) => <AuditorCell auditor={r.auditor} />,
    },
    { title: '组内角色', dataIndex: 'role', width: 100, render: (v) => <RoleTag role={v} /> },
    { title: '所属审计组', key: 'group', width: 220, render: (_, r) => projectGroups.find((g) => g.members.includes(r))?.name },
    {
      title: '负责事项',
      dataIndex: 'responsibleItems',
      render: (v: string[]) => (
        <Space size={4} wrap>
          {v.map((i) => (
            <Tag key={i} style={{ fontSize: 11, marginInlineEnd: 0 }}>
              {i}
            </Tag>
          ))}
        </Space>
      ),
    },
    { title: '分工说明', dataIndex: 'duty', ellipsis: true },
    {
      title: '驻场',
      dataIndex: 'onSite',
      width: 60,
      render: (v: boolean) => (v ? <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>驻场</Tag> : <span className="text-muted">—</span>),
    },
  ];

  const issueColumns: TableProps<(typeof ISSUES)[number]>['columns'] = [
    { title: '问题编号', dataIndex: 'code', width: 100 },
    { title: '问题标题', dataIndex: 'title' },
    {
      title: '重要程度',
      dataIndex: 'level',
      width: 90,
      render: (v: string) => (
        <Tag color={v === '重要' ? 'red' : 'orange'} style={{ fontSize: 11, marginInlineEnd: 0 }}>
          {v}
        </Tag>
      ),
    },
    { title: '涉及金额', dataIndex: 'amount', width: 120 },
    {
      title: '整改状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => (
        <Tag color={v === '已整改' ? 'green' : v === '整改中' ? 'blue' : 'default'} style={{ fontSize: 11, marginInlineEnd: 0 }}>
          {v}
        </Tag>
      ),
    },
    { title: '责任人', dataIndex: 'owner', width: 90 },
    { title: '整改期限', dataIndex: 'due', width: 110 },
  ];

  return (
    <div className="page">
      {/* ---------- 项目头部 ---------- */}
      <div className="detail-hero">
        <Space align="center" style={{ marginBottom: 6 }}>
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>
            返回台账
          </Button>
        </Space>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 320, flex: 1 }}>
            <h3 className="detail-hero__title">
              <AuditOutlined style={{ color: bizColors.primary }} />
              {project.name}
              <ProjectStatusTag status={project.status} />
              <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>
                {project.auditType}
              </Tag>
              <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>
                {project.level}项目
              </Tag>
            </h3>
            <div className="detail-hero__meta">
              <span>文号：{project.code}</span>
              <span>被审计单位：{project.auditedUnit}</span>
              <span>负责人：{project.ownerName}</span>
              <span>
                现场期间：{project.fieldStart} ~ {project.fieldEnd}
              </span>
            </div>
          </div>
          <Space>
            {can('project:edit') && (
              <Button icon={<EditOutlined />} onClick={openEdit}>
                编辑
              </Button>
            )}
            {can('group:create') && (
              <Button
                icon={<UsergroupAddOutlined />}
                onClick={() => navigate(`/groups/new?project=${project.id}`)}
              >
                组建审计组
              </Button>
            )}
            {can('doc:create') && (
              <Button
                icon={<FileAddOutlined />}
                onClick={() => navigate(`/documents/new?project=${project.id}`)}
              >
                起草文件
              </Button>
            )}
            {can('project:delete') && (
              <Popconfirm
                title="删除该审计项目？"
                description="项目下的审计组与工作文件将一并删除，操作不可恢复。"
                okText="确认删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={deleteProject}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            )}
            <Button type="primary" icon={<ExportOutlined />} onClick={() => message.info('导出功能待接入后端逻辑')}>
              导出档案
            </Button>
          </Space>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            项目进度
          </span>
          <Progress
            percent={project.progress}
            style={{ marginBottom: 0, flex: 1, maxWidth: 480 }}
            strokeColor={project.progress >= 90 ? bizColors.success : bizColors.primary}
          />
          <Space size={16} className="text-muted" style={{ fontSize: 12 }}>
            <span>审计组 {project.groupCount} 个</span>
            <span>工作文件 {project.docCount} 份</span>
            <span>发现问题 {project.issueCount} 项</span>
          </Space>
        </div>
      </div>

      {/* ---------- 主体 ---------- */}
      <Card size="small" styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            /* ===== 概览 ===== */
            {
              key: 'overview',
              label: '项目概览',
              children: (
                <Row gutter={16}>
                  <Col span={14}>
                    <Descriptions bordered size="small" column={2} styles={{ label: { width: 110 } }}>
                      <Descriptions.Item label="项目编号">{project.code}</Descriptions.Item>
                      <Descriptions.Item label="立项年度">{project.year} 年</Descriptions.Item>
                      <Descriptions.Item label="审计类型">{project.auditType}</Descriptions.Item>
                      <Descriptions.Item label="项目级别">{project.level}</Descriptions.Item>
                      <Descriptions.Item label="审计期间">
                        {project.periodStart} ~ {project.periodEnd}
                      </Descriptions.Item>
                      <Descriptions.Item label="现场期间">
                        {project.fieldStart} ~ {project.fieldEnd}
                      </Descriptions.Item>
                      <Descriptions.Item label="计划工作日">{project.budget ?? '—'} 天</Descriptions.Item>
                      <Descriptions.Item label="立项时间">{project.createdAt}</Descriptions.Item>
                      <Descriptions.Item label="项目标签" span={2}>
                        <Space size={4} wrap>
                          {project.tags.map((t) => (
                            <Tag key={t} color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>
                              {t}
                            </Tag>
                          ))}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="项目说明" span={2}>
                        {project.remark ?? '—'}
                      </Descriptions.Item>
                    </Descriptions>

                    <Typography.Title level={5} style={{ fontSize: 13, margin: '16px 0 8px' }}>
                      重点审计事项
                    </Typography.Title>
                    <Space size={6} wrap>
                      {(project.auditType === '预算执行审计'
                        ? ['部门预算编制', '预算执行进度', '专项资金结转结余', '政府采购', '三公经费', '决算草案']
                        : ['重大经济决策', '财务收支真实性', '国有资产管理', '债务风险', '廉洁从业']
                      ).map((i) => (
                        <Tag key={i} style={{ fontSize: 12, marginInlineEnd: 0 }}>
                          {i}
                        </Tag>
                      ))}
                    </Space>
                  </Col>
                  <Col span={10}>
                    <Typography.Title level={5} style={{ fontSize: 13, margin: '0 0 12px' }}>
                      项目节点进展
                    </Typography.Title>
                    <Timeline
                      items={[
                        { color: 'green', children: <>立项登记 · {project.createdAt}</> },
                        { color: 'green', children: <>审计组成立 · 2026-02-20</> },
                        { color: 'blue', children: <>审计进点 · {project.fieldStart}</> },
                        {
                          color: project.progress >= 90 ? 'green' : 'blue',
                          children: <>现场实施 · 进度 {project.progress}%</>,
                        },
                        {
                          color: project.progress >= 90 ? 'green' : 'gray',
                          children: <>报告出具 · 征求意见</>,
                        },
                        { color: 'gray', children: <>整改跟踪与归档</> },
                      ]}
                    />
                  </Col>
                </Row>
              ),
            },
            /* ===== 审计组 ===== */
            {
              key: 'groups',
              label: `审计组（${projectGroups.length}）`,
              children: projectGroups.length ? (
                <Row gutter={12}>
                  {projectGroups.map((g) => (
                    <Col span={12} key={g.id}>
                      <div className="group-card" onClick={() => navigate(`/groups/${g.id}`)}>
                        <div className="group-card__head">
                          <div style={{ minWidth: 0 }}>
                            <div className="group-card__name">{g.name}</div>
                            <div className="group-card__sub">
                              {g.status} · 组长 {g.leaderName} · 成员 {g.memberCount} 人
                            </div>
                          </div>
                          <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>
                            {g.status}
                          </Tag>
                        </div>
                        <Space size={12} className="text-muted" style={{ fontSize: 12 }} wrap>
                          <span>驻地：{g.location}</span>
                          <span>
                            {g.establishDate} ~ {g.planEndDate}
                          </span>
                        </Space>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Space size={4} wrap>
                            {g.members.slice(0, 6).map((m) => (
                              <Tag key={m.memberId} style={{ fontSize: 11, marginInlineEnd: 0 }}>
                                {m.auditor.name}
                              </Tag>
                            ))}
                            {g.members.length > 6 && (
                              <span className="text-muted" style={{ fontSize: 11 }}>
                                +{g.members.length - 6}
                              </span>
                            )}
                          </Space>
                          <Button type="link" size="small" onClick={() => navigate(`/groups/${g.id}`)}>
                            查看
                          </Button>
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              ) : (
                <Empty description="该项目尚未组建审计组">
                  <Button type="primary" icon={<TeamOutlined />} onClick={() => navigate(`/groups/new?project=${project.id}`)}>
                    立即组建
                  </Button>
                </Empty>
              ),
            },
            /* ===== 工作文件 ===== */
            {
              key: 'docs',
              label: `工作文件（${projectDocs.length}）`,
              children: (
                <div>
                  {can('doc:create') && (
                    <div style={{ marginBottom: 10 }}>
                      <Button
                        icon={<FileAddOutlined />}
                        size="small"
                        onClick={() => navigate(`/documents/new?project=${project.id}`)}
                      >
                        起草文件
                      </Button>
                    </div>
                  )}
                  <Table
                    rowKey="id"
                    size="small"
                    columns={docColumns}
                    dataSource={projectDocs}
                    pagination={false}
                    locale={{ emptyText: '该项目暂无工作文件' }}
                  />
                </div>
              ),
            },
            /* ===== 人员 ===== */
            {
              key: 'members',
              label: `参审人员（${members.length}）`,
              children: (
                <Table
                  rowKey="memberId"
                  size="small"
                  columns={memberColumns}
                  dataSource={members}
                  pagination={false}
                />
              ),
            },
            /* ===== 问题 ===== */
            {
              key: 'issues',
              label: `发现问题（${ISSUES.length}）`,
              children: <Table rowKey="id" size="small" columns={issueColumns} dataSource={ISSUES} pagination={false} />,
            },
            /* ===== 日志 ===== */
            {
              key: 'logs',
              label: '操作日志',
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

      {/* ---------- 编辑项目 ---------- */}
      <Modal
        open={editOpen}
        title="编辑审计项目"
        okText="保存修改"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void saveEdit()}
        onCancel={() => setEditOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 14 }}>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请填写项目名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="auditedUnit" label="被审计单位">
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="status" label="项目状态">
                <Select options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="progress" label="项目进度（%）">
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="项目补充说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
