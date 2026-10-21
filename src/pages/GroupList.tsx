import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Input,
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
  AppstoreOutlined,
  BarsOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { App } from 'antd';
import { AuditorAvatar, RoleTag } from '@/components/BizTag';
import { useUserData } from '@/store/userData';
import { usePermission } from '@/utils/permissions';
import { bizColors } from '@/theme';
import type { AuditGroup } from '@/types';

const STATUS_COLOR: Record<AuditGroup['status'], string> = {
  组建中: '#8a94a6',
  已成立: '#1a5fb4',
  现场实施: '#b7791f',
  已撤离: '#1a7f4b',
};

export default function GroupList() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const { groups, projects } = useUserData();
  const { can } = usePermission();

  const [view, setView] = useState<'card' | 'table'>('card');
  const [keyword, setKeyword] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>();
  const [status, setStatus] = useState<AuditGroup['status'] | undefined>();
  const [leaderId, setLeaderId] = useState<string | undefined>();

  const filtered = useMemo(
    () =>
      groups.filter((g) => {
        if (keyword && !`${g.name}${g.projectName}${g.leaderName}${g.location}`.includes(keyword)) return false;
        if (projectId && g.projectId !== projectId) return false;
        if (status && g.status !== status) return false;
        if (leaderId && g.leaderId !== leaderId) return false;
        return true;
      }),
    [keyword, projectId, status, leaderId],
  );

  const reset = () => {
    setKeyword('');
    setProjectId(undefined);
    setStatus(undefined);
    setLeaderId(undefined);
  };

  const leaderOptions = useMemo(() => {
    const seen = new Map<string, string>();
    groups.forEach((g) => seen.set(g.leaderId, g.leaderName));
    return [...seen].map(([value, label]) => ({ value, label }));
  }, []);

  const columns: TableProps<AuditGroup>['columns'] = [
    {
      title: '审计组名称',
      dataIndex: 'name',
      width: 260,
      fixed: 'left',
      render: (v: string, r) => (
        <div>
          <Typography.Link style={{ fontSize: 13, fontWeight: 500 }} onClick={() => navigate(`/groups/${r.id}`)}>
            {v}
          </Typography.Link>
          <div className="text-muted mono" style={{ fontSize: 11 }}>
            {r.id}
          </div>
        </div>
      ),
    },
    {
      title: '所属项目',
      dataIndex: 'projectName',
      width: 260,
      render: (v: string, r) => (
        <div>
          <Tooltip title={v}>
            <Typography.Text style={{ fontSize: 13 }} ellipsis>
              {v}
            </Typography.Text>
          </Tooltip>
          <div className="text-muted" style={{ fontSize: 11 }}>
            {r.projectId}
          </div>
        </div>
      ),
    },
    { title: '组长', dataIndex: 'leaderName', width: 90 },
    { title: '成员数', dataIndex: 'memberCount', width: 80, align: 'center' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: AuditGroup['status']) => (
        <Tag color={STATUS_COLOR[v]} style={{ fontSize: 11, marginInlineEnd: 0 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: '工作驻地',
      dataIndex: 'location',
      width: 200,
      render: (v: string) => (
        <Space size={4}>
          <EnvironmentOutlined className="text-muted" />
          <span style={{ fontSize: 12 }}>{v}</span>
        </Space>
      ),
    },
    {
      title: '起止日期',
      key: 'range',
      width: 170,
      render: (_, r) => (
        <span className="text-muted" style={{ fontSize: 12 }}>
          {r.establishDate} ~ {r.planEndDate}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => navigate(`/groups/${r.id}`)}>
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<UserAddOutlined />}
            onClick={() => message.info(`为「${r.name}」增补成员（待接入后端逻辑）`)}
          >
            增补
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page">
      <Card
        size="small"
        title={
          <Space size={8}>
            <TeamOutlined style={{ color: bizColors.primary }} />
            <span>审计组台账</span>
            <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>
              共 {filtered.length} 个审计组
            </Tag>
          </Space>
        }
        extra={
          <Space>
            <Segmented
              size="small"
              value={view}
              onChange={(v) => setView(v as 'card' | 'table')}
              options={[
                { value: 'card', icon: <AppstoreOutlined /> },
                { value: 'table', icon: <BarsOutlined /> },
              ]}
            />
            <Button icon={<ReloadOutlined />} size="small" onClick={reset}>
              重置
            </Button>
            {can('group:create') ? (
              <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => navigate('/groups/new')}>
                组建审计组
              </Button>
            ) : (
              <Tooltip title="仅审计组长可组建审计组">
                <Button type="primary" icon={<PlusOutlined />} size="small" disabled>
                  组建审计组
                </Button>
              </Tooltip>
            )}
          </Space>
        }
      >
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="toolbar__left">
            <Input
              placeholder="组名 / 项目 / 组长 / 驻地"
              allowClear
              prefix={<SearchOutlined className="text-muted" />}
              style={{ width: 240 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Select
              placeholder="所属项目"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 280 }}
              value={projectId}
              onChange={setProjectId}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Select
              placeholder="组状态"
              allowClear
              style={{ width: 120 }}
              value={status}
              onChange={setStatus}
              options={(['组建中', '已成立', '现场实施', '已撤离'] as AuditGroup['status'][]).map((s) => ({
                value: s,
                label: s,
              }))}
            />
            <Select
              placeholder="审计组长"
              allowClear
              style={{ width: 120 }}
              value={leaderId}
              onChange={setLeaderId}
              options={leaderOptions}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <Empty description="没有符合条件的审计组">
            {can('group:create') && (
              <Button type="primary" onClick={() => navigate('/groups/new')}>
                组建审计组
              </Button>
            )}
          </Empty>
        ) : view === 'card' ? (
          <Row gutter={[12, 12]}>
            {filtered.map((g) => (
              <Col span={8} key={g.id}>
                <div className="group-card" onClick={() => navigate(`/groups/${g.id}`)}>
                  <div className="group-card__head">
                    <div style={{ minWidth: 0 }}>
                      <div className="group-card__name">{g.name}</div>
                      <div className="group-card__sub">
                        <Space size={4}>
                          <AuditorAvatar
                            auditor={g.members.find((m) => m.memberId === g.leaderId)?.auditor ?? g.members[0].auditor}
                            size={22}
                          />
                          组长 {g.leaderName}
                        </Space>
                      </div>
                    </div>
                    <Tag color={STATUS_COLOR[g.status]} style={{ fontSize: 11, marginInlineEnd: 0 }}>
                      {g.status}
                    </Tag>
                  </div>

                  <Tooltip title={g.projectName}>
                    <div className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      所属项目：{g.projectName}
                    </div>
                  </Tooltip>

                  <Space size={12} className="text-muted" style={{ fontSize: 12 }} wrap>
                    <span>
                      <TeamOutlined /> {g.memberCount} 人
                    </span>
                    <span>
                      <EnvironmentOutlined /> {g.location}
                    </span>
                  </Space>

                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {g.members.slice(0, 8).map((m) => (
                      <Tooltip key={m.memberId} title={`${m.auditor.name} · ${m.role}`}>
                        <Avatar size={24} style={{ backgroundColor: m.auditor.avatarColor, fontSize: 11 }}>
                          {m.auditor.name.slice(-2)}
                        </Avatar>
                      </Tooltip>
                    ))}
                    {g.members.length > 8 && (
                      <Avatar size={24} style={{ backgroundColor: '#c8cfd8', fontSize: 11, color: '#41546b' }}>
                        +{g.members.length - 8}
                      </Avatar>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTop: '1px solid #eef1f5',
                      paddingTop: 8,
                    }}
                  >
                    <Space size={4}>
                      {g.members
                        .filter((m) => ['主审', '廉政监督员'].includes(m.role))
                        .map((m) => (
                          <RoleTag key={m.memberId} role={m.role} />
                        ))}
                    </Space>
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      {g.establishDate} 成立
                    </span>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        ) : (
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={filtered}
            scroll={{ x: 1400 }}
            pagination={{ size: 'small', showTotal: (t) => `共 ${t} 个审计组` }}
            expandable={{
              expandedRowRender: (r) => (
                <Space size={4} wrap>
                  {r.members.map((m) => (
                    <Tag key={m.memberId} style={{ fontSize: 11, marginInlineEnd: 0 }}>
                      {m.auditor.name} · {m.role}
                    </Tag>
                  ))}
                </Space>
              ),
              rowExpandable: () => true,
            }}
          />
        )}
      </Card>

      <div className="text-muted" style={{ fontSize: 11, textAlign: 'center' }}>
        <UnorderedListOutlined /> 共 {filtered.length} 个审计组，点击卡片查看组内成员与分工
      </div>
    </div>
  );
}
