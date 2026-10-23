import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { AuditOutlined, CheckCircleOutlined, LeftOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '@/store/authStore';
import { useUserData } from '@/store/userData';
import { useDict } from '@/store/dictStore';
import { useAuditors } from '@/store/auditorStore';
import { usePermission } from '@/utils/permissions';
import type { AuditProject, AuditType, ProjectLevel } from '@/types';

const STEPS = [
  { title: '基本信息', desc: '项目标识与类型' },
  { title: '审计范围与期间', desc: '对象、期间与重点' },
  { title: '组织与资源', desc: '负责人与人员配置' },
  { title: '确认提交', desc: '信息复核与立项' },
];

export default function ProjectCreate() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { currentUser } = useAuth();
  const { addProject } = useUserData();
  const { labels } = useDict();
  const { auditors } = useAuditors();
  const { can } = usePermission();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [snapshot, setSnapshot] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  // 审计类型、单位性质、项目级别、审计事项均取自后端字典
  const auditTypes = labels('audit_type');
  const unitNatures = labels('unit_nature');
  const projectLevels = labels('project_level');

  const auditType = Form.useWatch('auditType', form) ?? (snapshot.auditType as AuditType);
  const keyItemOptions = useMemo(
    () =>
      auditType
        ? labels('audit_item', auditType).map((i) => ({ label: i, value: i }))
        : [],
    [auditType, labels],
  );

  const auditorOptions = useMemo(
    () =>
      auditors.map((a) => ({
        label: `${a.name}（${a.department} · ${a.title}）`,
        value: a.id,
      })),
    [auditors],
  );

  const STEP_FIELDS: string[][] = [
    ['name', 'code', 'year', 'auditType', 'level', 'auditedUnit', 'unitNature'],
    ['period', 'fieldPeriod', 'budget', 'fundScale', 'objective', 'keyItems'],
    ['ownerId', 'leaderId', 'deputyLeaderId', 'needExpert', 'expertNote', 'tags'],
    [],
  ];

  const next = async () => {
    try {
      await form.validateFields(STEP_FIELDS[step]);
    } catch {
      message.warning('请先完善必填信息');
      return;
    }
    setSnapshot((prev) => ({ ...prev, ...form.getFieldsValue(true) }));
    setStep((s) => s + 1);
  };

  const prev = () => setStep((s) => Math.max(0, s - 1));

  const onSubmit = async () => {
    const all = { ...snapshot, ...form.getFieldsValue(true) } as Record<string, any>;
    setSubmitting(true);
    const owner = auditors.find((a) => a.id === all.ownerId);
    const leader = auditors.find((a) => a.id === all.leaderId);
    const fmt = (d: any) => (d ? dayjs(d).format('YYYY-MM-DD') : '');

    const project: AuditProject = {
      id: `P${Date.now().toString(36)}`,
      code: all.code,
      name: all.name,
      auditedUnit: all.auditedUnit,
      unitNature: all.unitNature,
      auditType: all.auditType,
      level: all.level,
      status: '筹备中',
      year: all.year,
      periodStart: fmt(all.period?.[0]),
      periodEnd: fmt(all.period?.[1]),
      fieldStart: fmt(all.fieldPeriod?.[0]),
      fieldEnd: fmt(all.fieldPeriod?.[1]),
      budget: all.budget,
      ownerName: owner?.name ?? currentUser?.name ?? '',
      ownerId: all.ownerId,
      progress: 0,
      groupCount: 0,
      docCount: 0,
      issueCount: 0,
      createdAt: dayjs().format('YYYY-MM-DD HH:mm'),
      tags: all.tags ?? [],
      remark: all.remark,
    };

    // 写入当前登录账户的专属数据空间
    window.setTimeout(() => {
      addProject(project);
      setSubmitting(false);
      modal.success({
        title: '审计项目建立成功',
        content: (
          <div style={{ fontSize: 13 }}>
            <div>项目名称：{project.name}</div>
            <div>项目编号：{project.code}</div>
            <div>拟任组长：{leader?.name ?? '未指定'}</div>
            <div style={{ marginTop: 6 }} className="text-muted">
              已存入「{currentUser?.name}」的数据空间，其他账户不可见
            </div>
          </div>
        ),
        okText: '前往组建审计组',
        cancelText: '返回项目台账',
        okCancel: true,
        onOk: () => navigate(`/groups/new?project=${project.id}`),
        onCancel: () => navigate('/projects'),
      });
      message.success('项目已建立');
    }, 500);
  };

  const onSaveDraft = () => {
    setSnapshot((prev) => ({ ...prev, ...form.getFieldsValue(true) }));
    message.info('已保存为草稿（演示）');
  };

  const val = { ...snapshot, ...form.getFieldsValue(true) } as any;

  if (!can('project:create')) {
    return (
      <div className="page">
        <Card>
          <Alert
            type="warning"
            showIcon
            message="当前角色无权建立审计项目"
            description={`「${currentUser?.role ?? '—'}」不能立项。审计项目由审计组长建立后，组员可在项目中承接底稿编制任务。`}
          />
          <Button style={{ marginTop: 12 }} onClick={() => navigate('/projects')}>
            返回项目台账
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <Card>
        <Space align="center" size={10} style={{ marginBottom: 4 }}>
          <AuditOutlined style={{ fontSize: 18, color: '#1a5fb4' }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>建立审计项目</span>
          <Tag color="blue" style={{ fontSize: 11 }}>
            立项登记
          </Tag>
        </Space>
        <Typography.Paragraph className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          按《审计机关审计项目计划管理办法》要求登记项目立项信息。带 <span style={{ color: '#b42318' }}>*</span>{' '}
          为必填项，提交后进入项目台账并可组建审计组。
        </Typography.Paragraph>

        <Steps
          current={step}
          size="small"
          items={STEPS.map((s) => ({ title: s.title, description: s.desc }))}
          style={{ marginBottom: 20 }}
        />

        <Form
          form={form}
          layout="vertical"
          requiredMark
          initialValues={{
            year: 2026,
            level: projectLevels[1] ?? projectLevels[0],
            unitNature: unitNatures[0],
            auditType: auditTypes[0],
            needExpert: false,
            ownerId: currentUser?.id ?? auditors[0]?.id,
            tags: [],
          }}
        >
          {/* ---------------- Step 1 ---------------- */}
          <div style={{ display: step === 0 ? 'block' : 'none' }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="name"
                  label="审计项目名称"
                  rules={[{ required: true, message: '请输入审计项目名称' }]}
                >
                  <Input placeholder="如：2025年度市级部门预算执行及决算草案审计" allowClear />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="code"
                  label="项目文号 / 编号"
                  rules={[{ required: true, message: '请输入项目文号' }]}
                  extra="格式示例：审财〔2026〕015号"
                >
                  <Input placeholder="审财〔2026〕XXX号" allowClear />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="year" label="立项年度">
                  <Select
                    options={[2024, 2025, 2026, 2027].map((y) => ({ label: `${y} 年度`, value: y }))}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="auditType" label="审计类型" rules={[{ required: true }]}>
                  <Select options={auditTypes.map((t) => ({ label: t, value: t }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="level" label="项目级别">
                  <Radio.Group
                    optionType="button"
                    buttonStyle="solid"
                    options={(projectLevels as ProjectLevel[]).map((l) => ({
                      label: l,
                      value: l,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="unitNature" label="被审计单位性质">
                  <Select options={unitNatures.map((n) => ({ label: n, value: n }))} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="auditedUnit"
                  label="被审计单位"
                  rules={[{ required: true, message: '请输入被审计单位' }]}
                >
                  <Input placeholder="请输入被审计单位全称" allowClear />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="contact" label="被审计单位联系人 / 电话">
                  <Input placeholder="如：张主任 138****0000" allowClear />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="remark" label="项目背景与说明">
              <Input.TextArea rows={3} placeholder="简述立项依据、审计缘由及需重点关注的情况" />
            </Form.Item>
          </div>

          {/* ---------------- Step 2 ---------------- */}
          <div style={{ display: step === 1 ? 'block' : 'none' }}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="period" label="审计期间" rules={[{ required: true, message: '请选择审计期间' }]}>
                  <DatePicker.RangePicker style={{ width: '100%' }} placeholder={['开始日期', '结束日期']} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="fieldPeriod"
                  label="现场审计期间"
                  rules={[{ required: true, message: '请选择现场审计期间' }]}
                >
                  <DatePicker.RangePicker style={{ width: '100%' }} placeholder={['进点日期', '撤离日期']} />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="budget" label="计划工作日">
                  <InputNumber style={{ width: '100%' }} min={1} max={365} addonAfter="天" />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="fundScale" label="涉及资金规模">
                  <InputNumber style={{ width: '100%' }} min={0} addonAfter="万元" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="objective"
              label="审计目标"
              rules={[{ required: true, message: '请填写审计目标' }]}
            >
              <Input.TextArea
                rows={3}
                placeholder="如：摸清部门预算执行总体情况，揭示预算编制不科学、执行不严格、资金使用效益不高等问题。"
              />
            </Form.Item>
            <Row gutter={16}>
              <Col span={16}>
                <Form.Item
                  name="keyItems"
                  label="重点审计事项"
                  extra="依据所选审计类型推荐，可自行增删"
                  rules={[{ required: true, message: '请至少选择一项重点审计事项' }]}
                >
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="请选择或输入重点审计事项"
                    options={keyItemOptions}
                    maxTagCount="responsive"
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="scope" label="审计范围与延伸单位">
                  <Input.TextArea rows={2} placeholder="如：含下属 3 个二级预算单位" />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* ---------------- Step 3 ---------------- */}
          <div style={{ display: step === 2 ? 'block' : 'none' }}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="ownerId" label="项目主办处室负责人">
                  <Select options={auditorOptions} showSearch optionFilterProp="label" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="leaderId" label="拟任审计组长" rules={[{ required: true, message: '请选择拟任审计组长' }]}>
                  <Select options={auditorOptions} showSearch optionFilterProp="label" placeholder="请选择" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="deputyLeaderId" label="拟任副组长">
                  <Select options={auditorOptions} showSearch optionFilterProp="label" allowClear />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="needExpert" label="是否需要外部专家" valuePropName="checked">
                  <Switch checkedChildren="需要" unCheckedChildren="不需要" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="expertNote" label="专家专业方向">
                  <Input placeholder="如：工程造价、法律合规" allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="tags" label="项目标签">
                  <Select
                    mode="tags"
                    placeholder="输入后回车添加"
                    tokenSeparators={[',', '，']}
                    open={false}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Divider style={{ margin: '4px 0 12px' }} />
            <Typography.Text className="text-muted" style={{ fontSize: 12 }}>
              提示：审计组的具体人员配备与分工，在项目立项完成后通过「组建审计组」完成。
            </Typography.Text>
          </div>

          {/* ---------------- Step 4 ---------------- */}
          <div style={{ display: step === 3 ? 'block' : 'none' }}>
            <Descriptions
              bordered
              size="small"
              column={2}
              title="立项信息复核"
              styles={{ label: { width: 150 } }}
            >
              <Descriptions.Item label="项目名称">{val.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="项目编号">{val.code || '—'}</Descriptions.Item>
              <Descriptions.Item label="立项年度">{val.year || '—'}</Descriptions.Item>
              <Descriptions.Item label="审计类型">{val.auditType || '—'}</Descriptions.Item>
              <Descriptions.Item label="项目级别">{val.level || '—'}</Descriptions.Item>
              <Descriptions.Item label="被审计单位">
                {val.auditedUnit || '—'}
                {val.unitNature ? `（${val.unitNature}）` : ''}
              </Descriptions.Item>
              <Descriptions.Item label="审计期间">
                {val.period
                  ? `${dayjs(val.period[0]).format('YYYY-MM-DD')} ~ ${dayjs(val.period[1]).format('YYYY-MM-DD')}`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="现场审计期间">
                {val.fieldPeriod
                  ? `${dayjs(val.fieldPeriod[0]).format('YYYY-MM-DD')} ~ ${dayjs(
                      val.fieldPeriod[1],
                    ).format('YYYY-MM-DD')}`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="计划工作日">{val.budget ? `${val.budget} 天` : '—'}</Descriptions.Item>
              <Descriptions.Item label="涉及资金规模">
                {val.fundScale ? `${val.fundScale} 万元` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="拟任组长">
                {auditors.find((a) => a.id === val.leaderId)?.name ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="主办负责人">
                {auditors.find((a) => a.id === val.ownerId)?.name ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="重点审计事项" span={2}>
                <Space size={4} wrap>
                  {(val.keyItems ?? []).length
                    ? (val.keyItems as string[]).map((i) => (
                        <Tag key={i} color="blue" style={{ fontSize: 11 }}>
                          {i}
                        </Tag>
                      ))
                    : '—'}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="审计目标" span={2}>
                {val.objective || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="项目标签" span={2}>
                <Space size={4} wrap>
                  {(val.tags ?? []).length
                    ? (val.tags as string[]).map((t) => (
                        <Tag key={t} style={{ fontSize: 11 }}>
                          {t}
                        </Tag>
                      ))
                    : '—'}
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </div>
        </Form>

        <Divider style={{ margin: '16px 0 12px' }} />

        <Space>
          <Button icon={<LeftOutlined />} onClick={() => navigate('/projects')}>
            取消
          </Button>
          <Button icon={<SaveOutlined />} onClick={onSaveDraft}>
            存为草稿
          </Button>
          {step > 0 && <Button onClick={prev}>上一步</Button>}
          {step < STEPS.length - 1 ? (
            <Button type="primary" onClick={next}>
              下一步
            </Button>
          ) : (
            <Button type="primary" icon={<CheckCircleOutlined />} loading={submitting} onClick={onSubmit}>
              确认立项
            </Button>
          )}
        </Space>
      </Card>
    </div>
  );
}
