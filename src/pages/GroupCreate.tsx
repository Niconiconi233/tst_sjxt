import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  LeftOutlined,
  LockOutlined,
  SaveOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { AuditorCell, BusyTag, RoleTag } from '@/components/BizTag';
import AuditorPicker from '@/components/AuditorPicker';
import { useUserData } from '@/store/userData';
import { useDict } from '@/store/dictStore';
import { useAuditors } from '@/store/auditorStore';
import { usePermission } from '@/utils/permissions';
import type { AuditGroup, Auditor, GroupMember, GroupRole } from '@/types';

const STEPS = [
  { title: '选择项目', desc: '关联审计项目' },
  { title: '组长与主审', desc: '核心岗位配置' },
  { title: '成员与分工', desc: '人员选配与事项分配' },
  { title: '廉政与提交', desc: '纪律要求与确认' },
];

/**
 * 核心岗位：从字典的「审计组角色」中按名称筛出必备岗位。
 * 角色本身可在系统设置中维护，这里只做展示用的归类。
 */
const CORE_ROLE_NAMES = ['审计组长', '副组长', '主审', '廉政监督员'];

export default function GroupCreate() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [params] = useSearchParams();
  const { projects, groups, addGroup } = useUserData();
  const { labels } = useDict();
  const { auditors } = useAuditors();
  const { can } = usePermission();
  const [form] = Form.useForm();

  // 组内角色与审计事项取自后端字典；人员取自后端名册
  const roles = labels('role');
  const coreRoles = roles.filter((r) => CORE_ROLE_NAMES.includes(r));
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState<string | undefined>(params.get('project') ?? undefined);
  const [base, setBase] = useState<Record<string, any>>({});
  const [leaderId, setLeaderId] = useState<string | undefined>();
  const [deputyId, setDeputyId] = useState<string | undefined>();
  const [chiefId, setChiefId] = useState<string | undefined>();
  const [officerId, setOfficerId] = useState<string | undefined>();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discipline, setDiscipline] = useState(
    '严格遵守审计"八不准"工作纪律，实行审计组廉政承诺制，不得接受被审计单位宴请、礼品及任何形式的利益输送。',
  );
  const [pledges, setPledges] = useState<string[]>(['廉政承诺书', '审计"八不准"告知书']);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projectId]);
  const itemOptions = useMemo(
    () =>
      project ? labels('audit_item', project.auditType).map((i) => ({ label: i, value: i })) : [],
    [project, labels],
  );

  const auditorOptions = useMemo(
    () =>
      auditors.map((a) => ({
        value: a.id,
        label: `${a.name}（${a.department} · ${a.title}）`,
      })),
    [],
  );

  const lockedIds = [leaderId, deputyId, chiefId, officerId].filter(Boolean) as string[];

  /** 将核心岗位人员同步为组内成员 */
  const syncCore = () => {
    const pairs: Array<[string | undefined, GroupRole]> = [
      [leaderId, '审计组长'],
      [deputyId, '副组长'],
      [chiefId, '主审'],
      [officerId, '廉政监督员'],
    ];
    setMembers((prev) => {
      const next = [...prev];
      pairs.forEach(([id, role]) => {
        const auditor = auditors.find((a) => a.id === id);
        if (!id || !auditor) return;
        const exist = next.find((m) => m.memberId === id);
        if (exist) {
          exist.role = role;
        } else {
          next.unshift({
            memberId: id,
            auditor,
            role,
            duty: role === '审计组长' ? '全面负责审计组工作' : '',
            responsibleItems: [],
            joinDate: dayjs().format('YYYY-MM-DD'),
            onSite: true,
          });
        }
      });
      return next;
    });
  };

  const next = async () => {
    if (step === 0) {
      if (!projectId) {
        message.warning('请选择要组建审计组的审计项目');
        return;
      }
      try {
        const v = await form.validateFields(['name', 'location', 'range', 'status']);
        setBase((prev) => ({ ...prev, ...v }));
      } catch {
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!leaderId) {
        message.warning('请指定审计组长');
        return;
      }
      syncCore();
      setStep(2);
      return;
    }
    if (step === 2) {
      if (members.length === 0) {
        message.warning('请至少添加一名审计组成员');
        return;
      }
      if (members.some((m) => !m.responsibleItems.length)) {
        message.warning('请为每位成员分配负责的审计事项');
        return;
      }
      setStep(3);
      return;
    }
  };

  const update = (id: string, patch: Partial<GroupMember>) =>
    setMembers((prev) => prev.map((m) => (m.memberId === id ? { ...m, ...patch } : m)));

  const memberColumns: TableProps<GroupMember>['columns'] = [
    {
      title: '成员',
      key: 'auditor',
      width: 190,
      render: (_, r) => (
        <Space size={6}>
          {lockedIds.includes(r.memberId) && (
            <LockOutlined style={{ color: '#b7791f', fontSize: 11 }} title="核心岗位" />
          )}
          <AuditorCell auditor={r.auditor} showDept={false} />
        </Space>
      ),
    },
    {
      title: '组内角色',
      dataIndex: 'role',
      width: 120,
      render: (v: GroupRole, r) => (
        <Select
          size="small"
          value={v}
          style={{ width: '100%' }}
          options={roles.map((x) => ({ value: x, label: x }))}
          onChange={(val) => update(r.memberId, { role: val })}
        />
      ),
    },
    {
      title: '负责审计事项',
      dataIndex: 'responsibleItems',
      width: 240,
      render: (v: string[], r) => (
        <Select
          size="small"
          mode="multiple"
          value={v}
          style={{ width: '100%' }}
          placeholder="请选择"
          maxTagCount="responsive"
          options={itemOptions}
          onChange={(val) => update(r.memberId, { responsibleItems: val })}
        />
      ),
    },
    {
      title: '分工说明',
      dataIndex: 'duty',
      render: (v: string, r) => (
        <Input
          size="small"
          value={v}
          placeholder="请填写具体分工"
          onChange={(e) => update(r.memberId, { duty: e.target.value })}
        />
      ),
    },
    {
      title: '驻场',
      dataIndex: 'onSite',
      width: 60,
      render: (v: boolean, r) => <Switch size="small" checked={v} onChange={(c) => update(r.memberId, { onSite: c })} />,
    },
    {
      title: '',
      key: 'op',
      width: 40,
      render: (_, r) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          disabled={lockedIds.includes(r.memberId)}
          onClick={() => setMembers((prev) => prev.filter((m) => m.memberId !== r.memberId))}
        />
      ),
    },
  ];

  const onSubmit = () => {
    const group: AuditGroup = {
      id: `G${Date.now().toString(36)}`,
      name: base.name,
      projectId: projectId!,
      projectName: project?.name ?? '',
      leaderId: leaderId!,
      leaderName: auditors.find((a) => a.id === leaderId)?.name ?? '',
      memberCount: members.length,
      establishDate: base.range ? dayjs(base.range[0]).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      planEndDate: base.range ? dayjs(base.range[1]).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      status: base.status ?? '组建中',
      location: base.location,
      disciplineNote: discipline,
      members,
    };
    addGroup(group);
    message.success('审计组已组建');
    modal.success({
      title: '审计组组建完成',
      content: (
        <div style={{ fontSize: 13 }}>
          <div>审计组：{group.name}</div>
          <div>所属项目：{project?.name}</div>
          <div>组长：{group.leaderName}</div>
          <div>成员：{group.memberCount} 人</div>
        </div>
      ),
      okText: '查看审计组台账',
      cancelText: '返回',
      okCancel: true,
      onOk: () => navigate('/groups'),
      onCancel: () => navigate('/groups'),
    });
  };

  if (!can('group:create')) {
    return (
      <div className="page">
        <Card>
          <Alert
            type="warning"
            showIcon
            message="当前角色无权组建审计组"
            description="审计组由审计组长负责组建并确定成员分工，组员不能自行建组。"
          />
          <Button style={{ marginTop: 12 }} onClick={() => navigate('/groups')}>
            返回审计组台账
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <Card>
        <Space align="center" size={10} style={{ marginBottom: 4 }}>
          <TeamOutlined style={{ fontSize: 18, color: '#1a5fb4' }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>组建审计组</span>
          <Tag color="blue" style={{ fontSize: 11 }}>
            人员编组
          </Tag>
        </Space>
        <Typography.Paragraph className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          按审计项目需要组建审计组，明确组长、主审及各成员分工。审计组实行组长负责制，成员原则上不少于 2 人。
        </Typography.Paragraph>

        <Steps
          current={step}
          size="small"
          items={STEPS.map((s) => ({ title: s.title, description: s.desc }))}
          style={{ marginBottom: 20 }}
        />

        {/* ---------------- Step 1 ---------------- */}
        {step === 0 && (
          <div>
            <Form form={form} layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="关联审计项目"
                    required
                    extra="仅可选择尚未完成撤组的项目"
                  >
                    <Select
                      placeholder="请选择审计项目"
                      showSearch
                      optionFilterProp="label"
                      value={projectId}
                      onChange={(v) => {
                        setProjectId(v);
                        form.setFieldsValue({ name: `${projects.find((p) => p.id === v)?.auditedUnit}审计组` });
                      }}
                      options={projects
                        .filter((p) => p.status !== '已归档')
                        .map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="name"
                    label="审计组名称"
                    rules={[{ required: true, message: '请输入审计组名称' }]}
                  >
                    <Input placeholder="如：市交通运输局预算执行审计组" allowClear />
                  </Form.Item>
                </Col>
              </Row>

              {project ? (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={
                    <Space size={16} wrap style={{ fontSize: 12 }}>
                      <span>被审计单位：{project.auditedUnit}</span>
                      <span>审计类型：{project.auditType}</span>
                      <span>
                        现场期间：{project.fieldStart} ~ {project.fieldEnd}
                      </span>
                      <span>已建组：{groups.filter((g) => g.projectId === project.id).length} 个</span>
                    </Space>
                  }
                />
              ) : (
                <Empty
                  description="请先选择审计项目"
                  style={{ margin: '8px 0 16px', padding: 16, background: '#fafbfc', borderRadius: 4 }}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )}

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="range" label="组建与计划撤离日期" rules={[{ required: true, message: '请选择日期' }]}>
                    <DatePicker.RangePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="location" label="工作驻地" rules={[{ required: true, message: '请输入工作驻地' }]}>
                    <Input placeholder="如：市交通运输局 3楼会议室" allowClear />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="status" label="组建状态" initialValue="组建中">
                    <Select
                      options={(['组建中', '已成立', '现场实施', '已撤离'] as const).map((s) => ({
                        value: s,
                        label: s,
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </div>
        )}

        {/* ---------------- Step 2 ---------------- */}
        {step === 1 && (
          <div>
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16, fontSize: 12 }}
              message="审计组长须由具备相应资格的审计人员担任，主审不得与组长为同一人。"
            />
            <Row gutter={16}>
              {[
                { label: '审计组长', value: leaderId, set: setLeaderId, tip: '负责审计组全面工作' },
                { label: '副组长', value: deputyId, set: setDeputyId, tip: '协助组长分管专项事项' },
                { label: '主审', value: chiefId, set: setChiefId, tip: '负责底稿汇总与报告起草' },
                { label: '廉政监督员', value: officerId, set: setOfficerId, tip: '监督组内廉政纪律执行' },
              ].map((f) => (
                <Col span={6} key={f.label}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>
                      {f.label}
                      {f.label === '审计组长' && <span style={{ color: '#b42318' }}> *</span>}
                    </div>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="请选择人员"
                      showSearch
                      optionFilterProp="label"
                      allowClear
                      value={f.value}
                      onChange={f.set}
                      options={auditorOptions.filter((o) =>
                        auditors
                          .find((x) => x.id === o.value)
                          ?.capableRoles.includes(f.label as GroupRole),
                      )}
                    />
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {f.tip}
                    </div>
                    {f.value && auditors.some((a) => a.id === f.value) && (
                      <div style={{ marginTop: 6 }}>
                        <Space size={4} wrap>
                          <BusyTag count={auditors.find((a) => a.id === f.value)!.busyProjects} />
                          <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>
                            {auditors.find((a) => a.id === f.value)!.qualification || '—'}
                          </Tag>
                        </Space>
                      </div>
                    )}
                  </div>
                </Col>
              ))}
            </Row>
            <Divider style={{ margin: '0 0 12px' }} />
            <Typography.Text className="text-muted" style={{ fontSize: 12 }}>
              提示：所选核心岗位人员将自动加入审计组成员清单，下一步可继续增补审计员与外部专家。
            </Typography.Text>
          </div>
        )}

        {/* ---------------- Step 3 ---------------- */}
        {step === 2 && (
          <div>
            <div className="toolbar" style={{ marginBottom: 10 }}>
              <Space size={8}>
                <Button type="primary" icon={<UserAddOutlined />} size="small" onClick={() => setPickerOpen(true)}>
                  从人员库添加成员
                </Button>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  当前成员 {members.length} 人
                </span>
              </Space>
              <Space size={8}>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  可分配事项：
                </span>
                <Space size={4} wrap>
                  {itemOptions.slice(0, 6).map((o) => (
                    <Tag key={o.value} style={{ fontSize: 11, marginInlineEnd: 0 }}>
                      {o.label}
                    </Tag>
                  ))}
                </Space>
              </Space>
            </div>
            <Table
              rowKey="memberId"
              size="small"
              columns={memberColumns}
              dataSource={members}
              pagination={false}
              scroll={{ x: 900 }}
              locale={{ emptyText: '尚未添加成员，请点击「从人员库添加成员」' }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={6}>
                    <Space size={8} wrap>
                      {coreRoles.map((r) => {
                        const has = members.some((m) => m.role === r);
                        return (
                          <Tag key={r} color={has ? 'blue' : 'default'} bordered={!has} style={{ fontSize: 11 }}>
                            {r}
                            {has ? ' 已配置' : ' 未配置'}
                          </Tag>
                        );
                      })}
                    </Space>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        )}

        {/* ---------------- Step 4 ---------------- */}
        {step === 3 && (
          <div>
            <Descriptions bordered size="small" column={2} title="组建信息复核" styles={{ label: { width: 130 } }}>
              <Descriptions.Item label="审计组名称">{base.name}</Descriptions.Item>
              <Descriptions.Item label="所属项目">{project?.name}</Descriptions.Item>
              <Descriptions.Item label="工作驻地">{base.location}</Descriptions.Item>
              <Descriptions.Item label="组建状态">{base.status}</Descriptions.Item>
              <Descriptions.Item label="起止日期">
                {base.range
                  ? `${dayjs(base.range[0]).format('YYYY-MM-DD')} ~ ${dayjs(base.range[1]).format('YYYY-MM-DD')}`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="成员人数">{members.length} 人</Descriptions.Item>
              <Descriptions.Item label="审计组长">
                {auditors.find((a) => a.id === leaderId)?.name ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="主审">{auditors.find((a) => a.id === chiefId)?.name ?? '—'}</Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5} style={{ fontSize: 13, margin: '16px 0 8px' }}>
              成员与分工确认
            </Typography.Title>
            <Table
              rowKey="memberId"
              size="small"
              pagination={false}
              dataSource={members}
              columns={[
                { title: '成员', key: 'a', width: 180, render: (_, r) => <AuditorCell auditor={r.auditor} showDept={false} /> },
                { title: '角色', dataIndex: 'role', width: 100, render: (v: GroupRole) => <RoleTag role={v} /> },
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
                { title: '分工说明', dataIndex: 'duty', width: 200, ellipsis: true },
                {
                  title: '驻场',
                  dataIndex: 'onSite',
                  width: 60,
                  render: (v: boolean) => (v ? <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>驻场</Tag> : '—'),
                },
              ]}
            />

            <Typography.Title level={5} style={{ fontSize: 13, margin: '16px 0 8px' }}>
              廉政与纪律要求
            </Typography.Title>
            <Input.TextArea
              rows={3}
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Checkbox.Group
              value={pledges}
              onChange={(v) => setPledges(v as string[])}
              options={[
                { label: '生成《审计组廉政承诺书》', value: '廉政承诺书' },
                { label: '生成《审计"八不准"告知书》', value: '审计"八不准"告知书' },
                { label: '生成《审计组成员分工表》', value: '成员分工表' },
                { label: '生成《审计通知书》', value: '审计通知书' },
              ]}
            />
          </div>
        )}

        <Divider style={{ margin: '16px 0 12px' }} />
        <Space>
          <Button icon={<LeftOutlined />} onClick={() => navigate('/groups')}>
            取消
          </Button>
          <Button icon={<SaveOutlined />} onClick={() => message.info('已保存为草稿（演示）')}>
            存为草稿
          </Button>
          {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>上一步</Button>}
          {step < STEPS.length - 1 ? (
            <Button type="primary" onClick={next}>
              下一步
            </Button>
          ) : (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={onSubmit}>
              确认组建
            </Button>
          )}
        </Space>
      </Card>

      <AuditorPicker
        open={pickerOpen}
        selectedIds={members.map((m) => m.memberId)}
        excludeIds={lockedIds}
        onCancel={() => setPickerOpen(false)}
        onOk={(ids) => {
          const added = ids
            .filter((i) => !members.some((m) => m.memberId === i))
            .map((id) => ({ id, auditor: auditors.find((a) => a.id === id) }))
            .filter((x): x is { id: string; auditor: Auditor } => !!x.auditor);
          setMembers((prev) => [
            ...prev,
            ...added.map(({ id, auditor }) => ({
              memberId: id,
              auditor,
              role: '审计员' as GroupRole,
              duty: '',
              responsibleItems: [],
              joinDate: dayjs().format('YYYY-MM-DD'),
              onSite: true,
            })),
          ]);
          setPickerOpen(false);
          if (added.length) message.success(`已添加 ${added.length} 名成员`);
        }}
      />
    </div>
  );
}
