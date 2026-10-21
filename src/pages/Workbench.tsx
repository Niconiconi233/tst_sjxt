import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  List,
  Progress,
  Row,
  Space,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import {
  AuditOutlined,
  BellOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  RightOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { ProjectStatusTag } from '@/components/BizTag';
import { useUserData } from '@/store/userData';
import { usePermission } from '@/utils/permissions';
import { bizColors } from '@/theme';
import type { TodoItem } from '@/types';

const ICON_BG: Record<string, { bg: string; color: string }> = {
  blue: { bg: bizColors.primaryLight, color: bizColors.primary },
  green: { bg: '#e6f4ec', color: bizColors.success },
  orange: { bg: '#fdf3e3', color: bizColors.warning },
  purple: { bg: '#f2ecfa', color: '#7a3fa8' },
};

function StatCard({
  icon,
  value,
  title,
  extra,
  tone,
}: {
  icon: React.ReactNode;
  value: number | string;
  title: string;
  extra?: string;
  tone: keyof typeof ICON_BG;
}) {
  const t = ICON_BG[tone];
  return (
    <div className="stat-card">
      <div className="stat-card__icon" style={{ background: t.bg, color: t.color }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="stat-card__value">{value}</div>
        <div className="stat-card__title">{title}</div>
        {extra && <div className="stat-card__extra">{extra}</div>}
      </div>
    </div>
  );
}

const LEVEL_COLOR: Record<TodoItem['level'], string> = {
  高: bizColors.danger,
  中: bizColors.warning,
  低: bizColors.neutral,
};

export default function Workbench() {
  const navigate = useNavigate();
  const { projects, groups, documents, todos } = useUserData();
  const { can, isLeader, role, policy } = usePermission();

  const running = projects.filter((p) => p.status === '实施中');
  const pendingDocs = documents.filter((d) => ['待复核', '复核中'].includes(d.status));
  const totalIssues = projects.reduce((s, p) => s + p.issueCount, 0);

  return (
    <div className="page">
      {/* ---------- 概览统计 ---------- */}
      <Row gutter={12}>
        <Col span={6}>
          <StatCard
            icon={<AuditOutlined />}
            value={running.length}
            title="在办审计项目"
            extra={`全部 ${projects.length} 个 · 在办 ${running.length} 个`}
            tone="blue"
          />
        </Col>
        <Col span={6}>
          <StatCard
            icon={<TeamOutlined />}
            value={groups.length}
            title="已组建审计组"
            extra={`在岗人员 ${new Set(groups.flatMap((g) => g.members.map((m) => m.memberId))).size} 人`}
            tone="purple"
          />
        </Col>
        <Col span={6}>
          <StatCard
            icon={<FileTextOutlined />}
            value={documents.length}
            title="在库工作文件"
            extra={`待复核 ${pendingDocs.length} 份`}
            tone="orange"
          />
        </Col>
        <Col span={6}>
          <StatCard
            icon={<WarningOutlined />}
            value={totalIssues}
            title="累计发现问题"
            extra={`覆盖 ${projects.length} 个项目 · 逾期提醒 ${todos.filter((t) => t.level === '高').length} 项`}
            tone="green"
          />
        </Col>
      </Row>

      <Row gutter={12}>
        {/* ---------- 项目进度 ---------- */}
        <Col span={14}>
          <Card
            title="我的审计项目"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/projects')}>
                全部项目 <RightOutlined style={{ fontSize: 10 }} />
              </Button>
            }
            styles={{ body: { padding: '4px 12px 12px' } }}
          >
            <List
              locale={{ emptyText: <Empty description="还没有审计项目，点击右侧「快捷操作」建立" /> }}
              dataSource={projects.filter((p) => p.status !== '已归档').slice(0, 6)}
              renderItem={(p) => (
                <List.Item
                  style={{ padding: '10px 0', cursor: 'pointer' }}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  actions={[
                    <Space key="a" size={6}>
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        {p.fieldStart} ~ {p.fieldEnd}
                      </span>
                      <ProjectStatusTag status={p.status} />
                    </Space>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={6}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                        <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>
                          {p.auditType}
                        </Tag>
                      </Space>
                    }
                    description={
                      <div style={{ marginTop: 6 }}>
                        <Space size={12} className="text-muted" style={{ fontSize: 11 }}>
                          <span>{p.code}</span>
                          <span>被审计单位：{p.auditedUnit}</span>
                          <span>组长：{p.ownerName}</span>
                        </Space>
                        <Progress
                          percent={p.progress}
                          size="small"
                          style={{ marginTop: 6, marginBottom: 0, maxWidth: 520 }}
                          strokeColor={p.progress >= 90 ? bizColors.success : bizColors.primary}
                        />
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* ---------- 待办 ---------- */}
        <Col span={10}>
          <Card
            title={
              <Space size={6}>
                <BellOutlined style={{ color: bizColors.warning }} />
                <span>待办与提醒</span>
                <Badge count={todos.length} style={{ backgroundColor: bizColors.danger }} />
              </Space>
            }
            styles={{ body: { padding: '12px 16px' } }}
          >
            <Timeline
              items={todos.slice(0, 6).map((t) => ({
                color: LEVEL_COLOR[t.level],
                children: (
                  <div>
                    <div style={{ fontSize: 13, color: '#1f2933', lineHeight: 1.4 }}>{t.title}</div>
                    <Space size={8} className="text-muted" style={{ fontSize: 11, marginTop: 4 }} wrap>
                      <Tag
                        color={t.type === '催办' ? 'red' : t.type === '待复核' ? 'blue' : 'default'}
                       
                        style={{ fontSize: 11, marginInlineEnd: 0 }}
                      >
                        {t.type}
                      </Tag>
                      <span>{t.owner}</span>
                      <span>
                        <ClockCircleOutlined /> 截止 {t.deadline}
                      </span>
                    </Space>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={12}>
        {/* ---------- 快捷入口 ---------- */}
        <Col span={8}>
          <Card title="快捷操作" size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button
                block
                icon={<AuditOutlined />}
                disabled={!can('project:create')}
                onClick={() => navigate('/projects/new')}
              >
                建立审计项目
              </Button>
              <Button
                block
                icon={<TeamOutlined />}
                disabled={!can('group:create')}
                onClick={() => navigate('/groups/new')}
              >
                组建审计组
              </Button>
              <Button
                block
                icon={<FileTextOutlined />}
                disabled={!can('doc:create')}
                onClick={() => navigate('/documents/new')}
              >
                起草工作文件
              </Button>
              {!isLeader && (
                <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.7 }}>
                  当前角色「{role}」：{policy.summary}。
                </div>
              )}
            </Space>
          </Card>
        </Col>

        {/* ---------- 最近文件 ---------- */}
        <Col span={16}>
          <Card
            title="最近更新文件"
            size="small"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/documents')}>
                文件台账 <RightOutlined style={{ fontSize: 10 }} />
              </Button>
            }
          >
            {documents.length === 0 ? (
              <Empty description="暂无文件" />
            ) : (
              <List
                size="small"
                dataSource={[...documents].slice(0, 6)}
                renderItem={(d) => (
                  <List.Item
                    style={{ padding: '8px 0', cursor: 'pointer' }}
                    onClick={() => navigate('/documents')}
                  >
                    <Space size={8} style={{ minWidth: 0 }}>
                      <FileTextOutlined style={{ color: bizColors.primary }} />
                      <Tooltip title={d.title}>
                        <Typography.Text style={{ fontSize: 13 }} ellipsis>
                          {d.title}
                        </Typography.Text>
                      </Tooltip>
                      <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>
                        {d.category}
                      </Tag>
                    </Space>
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      {d.authorName} · {d.updatedAt}
                    </span>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
