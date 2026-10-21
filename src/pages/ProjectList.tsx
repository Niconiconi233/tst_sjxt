import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Input,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import {
  AuditOutlined,
  DownOutlined,
  ExportOutlined,
  FileAddOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { ProjectStatusTag } from '@/components/BizTag';
import { useUserData } from '@/store/userData';
import { usePermission } from '@/utils/permissions';
import { bizColors } from '@/theme';
import type { AuditProject, AuditType, ProjectLevel, ProjectStatus } from '@/types';

const AUDIT_TYPES: AuditType[] = [
  '预算执行审计',
  '经济责任审计',
  '专项资金审计',
  '财务收支审计',
  '绩效审计',
  '合规审计',
  '跟踪审计',
];
const STATUSES: ProjectStatus[] = ['筹备中', '实施中', '报告阶段', '整改跟踪', '已归档'];
const LEVELS: ProjectLevel[] = ['一级', '二级', '三级'];

export default function ProjectList() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { projects } = useUserData();
  const { can, allowedCategories } = usePermission();

  const [keyword, setKeyword] = useState('');
  const [year, setYear] = useState<number | undefined>();
  const [type, setType] = useState<AuditType | undefined>();
  const [status, setStatus] = useState<ProjectStatus | undefined>();
  const [level, setLevel] = useState<ProjectLevel | undefined>();
  const [quick, setQuick] = useState<string>('全部');

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (keyword && !`${p.name}${p.code}${p.auditedUnit}${p.ownerName}`.includes(keyword)) return false;
      if (year && p.year !== year) return false;
      if (type && p.auditType !== type) return false;
      if (status && p.status !== status) return false;
      if (level && p.level !== level) return false;
      if (quick === '在办' && !['实施中', '报告阶段'].includes(p.status)) return false;
      if (quick === '本年' && p.year !== 2026) return false;
      if (quick === '未完成组' && p.groupCount === 0) return false;
      if (quick === '超期预警' && p.progress < 60 && p.status === '实施中') return false;
      return true;
    });
  }, [keyword, year, type, status, level, quick]);

  const reset = () => {
    setKeyword('');
    setYear(undefined);
    setType(undefined);
    setStatus(undefined);
    setLevel(undefined);
    setQuick('全部');
  };

  const summary = useMemo(
    () => [
      { label: '项目总数', value: projects.length, color: bizColors.primary },
      { label: '现场实施中', value: projects.filter((p) => p.status === '实施中').length, color: bizColors.primary },
      { label: '报告阶段', value: projects.filter((p) => p.status === '报告阶段').length, color: bizColors.warning },
      { label: '整改跟踪', value: projects.filter((p) => p.status === '整改跟踪').length, color: '#7a3fa8' },
      { label: '已归档', value: projects.filter((p) => p.status === '已归档').length, color: bizColors.success },
    ],
    [],
  );

  const columns: TableProps<AuditProject>['columns'] = [
    {
      title: '项目名称 / 文号',
      dataIndex: 'name',
      key: 'name',
      width: 300,
      fixed: 'left',
      render: (_, r) => (
        <div style={{ minWidth: 0 }}>
          <Tooltip title={r.name}>
            <Typography.Link onClick={() => navigate(`/projects/${r.id}`)} style={{ fontSize: 13, fontWeight: 500 }}>
              {r.name}
            </Typography.Link>
          </Tooltip>
          <div className="text-muted mono" style={{ marginTop: 2 }}>
            {r.code}
          </div>
        </div>
      ),
    },
    {
      title: '被审计单位',
      dataIndex: 'auditedUnit',
      key: 'auditedUnit',
      width: 190,
      render: (v: string, r) => (
        <div>
          <div style={{ fontSize: 13 }}>{v}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            {r.unitNature}
          </div>
        </div>
      ),
    },
    { title: '审计类型', dataIndex: 'auditType', key: 'auditType', width: 110, render: (v) => <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>{v}</Tag> },
    { title: '级别', dataIndex: 'level', key: 'level', width: 70 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: ProjectStatus) => <ProjectStatusTag status={v} />,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 140,
      render: (v: number) => (
        <Progress
          percent={v}
          size="small"
          strokeColor={v >= 90 ? bizColors.success : v < 40 ? bizColors.warning : bizColors.primary}
          style={{ marginBottom: 0 }}
        />
      ),
    },
    {
      title: '现场期间',
      key: 'field',
      width: 170,
      render: (_, r) => (
        <span className="text-muted" style={{ fontSize: 12 }}>
          {r.fieldStart} ~ {r.fieldEnd}
        </span>
      ),
    },
    { title: '负责人', dataIndex: 'ownerName', key: 'ownerName', width: 90 },
    {
      title: '审计组',
      dataIndex: 'groupCount',
      key: 'groupCount',
      width: 70,
      align: 'center',
      render: (v: number) => (
        <Tag color={v ? 'blue' : 'default'} style={{ fontSize: 11, marginInlineEnd: 0 }}>
          {v} 个
        </Tag>
      ),
    },
    { title: '文件', dataIndex: 'docCount', key: 'docCount', width: 66, align: 'center' },
    {
      title: '问题',
      dataIndex: 'issueCount',
      key: 'issueCount',
      width: 66,
      align: 'center',
      render: (v: number) =>
        v ? <span style={{ color: bizColors.danger, fontWeight: 500 }}>{v}</span> : <span className="text-muted">0</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 168,
      fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => navigate(`/projects/${r.id}`)}>
            详情
          </Button>
          {can('group:create') && (
            <Button
              type="link"
              size="small"
              icon={<TeamOutlined />}
              onClick={() => navigate(`/groups/new?project=${r.id}`)}
            >
              建组
            </Button>
          )}
          <Dropdown
            menu={{
              items: [
                ...(can('doc:create') && allowedCategories.length
                  ? [{ key: 'doc', label: '起草工作文件', icon: <FileAddOutlined /> }]
                  : []),
                ...(can('project:edit') ? [{ key: 'edit', label: '编辑项目' }] : []),
                { key: 'export', label: '导出项目档案', icon: <ExportOutlined /> },
                ...(can('project:delete')
                  ? [
                      { type: 'divider' as const },
                      { key: 'archive', label: '归档项目', danger: true },
                    ]
                  : []),
              ],
              onClick: ({ key }) => {
                if (key === 'doc') navigate(`/documents/new?project=${r.id}`);
                else message.info(`「${key}」功能待接入后端逻辑`);
              },
            }}
          >
            <Button type="link" size="small">
              更多 <DownOutlined style={{ fontSize: 9 }} />
            </Button>
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div className="page">
      {/* ---------- 概览 ---------- */}
      <Row gutter={12}>
        {summary.map((s) => (
          <Col span={Math.floor(24 / summary.length)} key={s.label}>
            <div className="stat-card" style={{ padding: '10px 14px' }}>
              <div style={{ minWidth: 0 }}>
                <div className="stat-card__value" style={{ fontSize: 20, color: s.color }}>
                  {s.value}
                </div>
                <div className="stat-card__title">{s.label}</div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Card
        size="small"
        title={
          <Space size={8}>
            <AuditOutlined style={{ color: bizColors.primary }} />
            <span>审计项目台账</span>
            <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>
              共 {filtered.length} 项
            </Tag>
          </Space>
        }
        extra={
          <Space>
            <Segmented
              size="small"
              value={quick}
              onChange={(v) => setQuick(v as string)}
              options={['全部', '在办', '本年', '未完成组', '超期预警']}
            />
            <Button icon={<ReloadOutlined />} size="small" onClick={reset}>
              重置
            </Button>
            <Button icon={<ExportOutlined />} size="small" onClick={() => message.info('导出功能待接入后端逻辑')}>
              导出
            </Button>
            {can('project:create') ? (
              <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => navigate('/projects/new')}>
                建立审计项目
              </Button>
            ) : (
              <Tooltip title="当前角色为「审计组成员」，仅可编写工作底稿与事实确认书">
                <Button type="primary" icon={<PlusOutlined />} size="small" disabled>
                  建立审计项目
                </Button>
              </Tooltip>
            )}
          </Space>
        }
      >
        {/* ---------- 筛选区 ---------- */}
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="toolbar__left">
            <Input
              placeholder="项目名称 / 文号 / 被审计单位"
              allowClear
              prefix={<SearchOutlined className="text-muted" />}
              style={{ width: 240 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Select
              placeholder="立项年度"
              allowClear
              style={{ width: 120 }}
              value={year}
              onChange={setYear}
              options={[2025, 2026].map((y) => ({ label: `${y} 年`, value: y }))}
            />
            <Select
              placeholder="审计类型"
              allowClear
              style={{ width: 140 }}
              value={type}
              onChange={setType}
              options={AUDIT_TYPES.map((t) => ({ label: t, value: t }))}
            />
            <Select
              placeholder="项目状态"
              allowClear
              style={{ width: 120 }}
              value={status}
              onChange={setStatus}
              options={STATUSES.map((s) => ({ label: s, value: s }))}
            />
            <Select
              placeholder="项目级别"
              allowClear
              style={{ width: 110 }}
              value={level}
              onChange={setLevel}
              options={LEVELS.map((l) => ({ label: l, value: l }))}
            />
            <DatePicker.RangePicker size="small" style={{ width: 230 }} placeholder={['立项起', '立项止']} />
          </div>
        </div>

        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1560 }}
          pagination={{
            size: 'small',
            showSizeChanger: true,
            showTotal: (t, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${t} 项项目`,
            defaultPageSize: 10,
          }}
          rowClassName={(_, i) => (i % 2 === 1 ? 'row-striped' : '')}
        />
      </Card>
    </div>
  );
}
