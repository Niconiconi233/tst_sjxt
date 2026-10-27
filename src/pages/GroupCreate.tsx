import { useEffect, useMemo, useState } from 'react';
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
  FileTextOutlined,
  LeftOutlined,
  LockOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { AuditorCell, BusyTag, RoleTag } from '@/components/BizTag';
import AuditorPicker from '@/components/AuditorPicker';
import DocVarHelpModal from '@/components/DocVarHelpModal';
import { useAuth } from '@/store/authStore';
import { useUserData } from '@/store/userData';
import { useDict } from '@/store/dictStore';
import { useAuditors } from '@/store/auditorStore';
import { repo } from '@/services/repository';
import { buildAuditDocVars, varDefOf } from '@/utils/auditDocVars';
import { usePermission } from '@/utils/permissions';
import type { AuditDocument, AuditGroup, Auditor, GroupMember, GroupRole } from '@/types';

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

/** 通知书设置区的小字段标题（与项目内其它表单的 label 字号保持一致） */
const FIELD_LABEL = { fontSize: 12, color: '#5a6675', marginBottom: 4 };

export default function GroupCreate() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [params] = useSearchParams();
  const { projects, groups, documents, addGroup, addDocument, addDocumentWithContent } = useUserData();
  const { labels, allOf, readFile } = useDict();
  const { auditors } = useAuditors();
  const { currentUser } = useAuth();
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

  /* ---------------- 审计通知书生成 ---------------- */

  /** 勾选「生成《审计通知书》」后才展开下面这些配置 */
  const wantNotice = pledges.includes('审计通知书');
  const [noticeTplId, setNoticeTplId] = useState<string>();
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeNo, setNoticeNo] = useState('');
  const [noticeDate, setNoticeDate] = useState(dayjs());
  /** 模板里检测到的占位符 */
  const [noticeVars, setNoticeVars] = useState<string[]>([]);
  const [noticeScan, setNoticeScan] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [noticeError, setNoticeError] = useState('');
  /** 系统取不到值、由使用者手填的字段 */
  const [extraVars, setExtraVars] = useState<Record<string, string>>({});
  const [org, setOrg] = useState<{ name?: string; code?: string }>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projectId]);
  const itemOptions = useMemo(
    () =>
      project ? labels('audit_item', project.auditType).map((i) => ({ label: i, value: i })) : [],
    [project, labels],
  );

  /* ---------------- 通知书：模板、标题、占位符取值 ---------------- */

  /** 「审计通知类」下的启用模板；只有 .docx 才能套打，其余在选项里置灰 */
  const noticeAllTemplates = useMemo(
    () => allOf('doc_template', '审计通知类').filter((t) => t.enabled),
    [allOf],
  );

  const defaultNoticeTitle = useMemo(() => {
    if (!project) return '审计通知书';
    const year = project.periodStart ? dayjs(project.periodStart).year() : project.year;
    return `关于对${project.auditedUnit}${year}年度${project.auditType}的通知`;
  }, [project]);

  const defaultNoticeNo = useMemo(() => {
    const year = dayjs().year();
    const seq = documents.filter((d) => d.category === '审计通知类').length + 1;
    return `审通〔${year}〕${String(seq).padStart(3, '0')}号`;
  }, [documents]);

  const noticeTitleValue = noticeTitle || defaultNoticeTitle;
  const noticeNoValue = noticeNo || defaultNoticeNo;

  /** 机构名称取自「系统设置 → 机构与人员」，供落款使用 */
  useEffect(() => {
    repo
      .loadSettings()
      .then((s) => setOrg({ name: s['org.name'], code: s['org.code'] }))
      .catch(() => undefined);
  }, []);

  /** 打开本步时默认选中第一个可套打的模板 */
  useEffect(() => {
    if (!wantNotice) return;
    setNoticeTplId((cur) => {
      if (cur && noticeAllTemplates.some((t) => t.id === cur)) return cur;
      const first = noticeAllTemplates.find((t) => /\.docx$/i.test(t.fileName ?? ''));
      return first?.id;
    });
  }, [wantNotice, noticeAllTemplates]);

  /** 换模板就重新解析占位符 */
  useEffect(() => {
    if (!wantNotice || !noticeTplId) {
      setNoticeVars([]);
      setNoticeScan('idle');
      return;
    }
    let alive = true;
    setNoticeScan('loading');
    setNoticeError('');
    void (async () => {
      try {
        const payload = await readFile(noticeTplId);
        if (!payload) throw new Error('未能读取模板文件，请到文书模板库重新上传');
        // jszip 体积不小，按需加载，不拖累建组页面首屏
        const { scanDocxPlaceholders } = await import('@/utils/docxPlaceholder');
        const found = await scanDocxPlaceholders(payload.blob);
        if (!alive) return;
        setNoticeVars(found);
        setNoticeScan('done');
      } catch (err) {
        if (!alive) return;
        setNoticeVars([]);
        setNoticeScan('error');
        setNoticeError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [wantNotice, noticeTplId, readFile]);

  const noticeVarsAll = useMemo(
    () =>
      buildAuditDocVars({
        org,
        project: project ?? null,
        group: {
          name: base.name,
          members,
          location: base.location,
          establishDate: base.range
            ? dayjs(base.range[0]).format('YYYY-MM-DD')
            : dayjs().format('YYYY-MM-DD'),
          planEndDate: base.range
            ? dayjs(base.range[1]).format('YYYY-MM-DD')
            : dayjs().format('YYYY-MM-DD'),
          disciplineNote: discipline,
        },
        title: noticeTitleValue,
        docNo: noticeNoValue,
        issueDate: noticeDate.format('YYYY-MM-DD'),
      }),
    [org, project, base, members, discipline, noticeTitleValue, noticeNoValue, noticeDate],
  );

  /** 手填值覆盖自动取值（使用者可能想临时改某处表述） */
  const finalVars = useMemo(
    () => ({ ...noticeVarsAll, ...extraVars }),
    [noticeVarsAll, extraVars],
  );

  const setExtra = (key: string, value: string) =>
    setExtraVars((prev) => ({ ...prev, [key]: value }));

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

  const onSubmit = async () => {
    if (generating) return;
    const now = dayjs().format('YYYY-MM-DD HH:mm');
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

    setGenerating(true);
    addGroup(group);

    /** 生成的通知书；勾选才会产生 */
    let noticeDoc: AuditDocument | undefined;
    let noticeWarn = '';

    try {
      if (wantNotice) {
        const tpl = noticeAllTemplates.find((t) => t.id === noticeTplId);
        const usable = !!tpl && /\.docx$/i.test(tpl.fileName ?? '');
        let snapshotJson = '';

        if (usable) {
          const payload = await readFile(tpl!.id);
          if (!payload) throw new Error('未能读取模板文件，请到文书模板库重新上传');
          // 填占位符后直接把原始 DOCX 字节落库（__DOCX__: 前缀），
          // 由 docx-editor 直接打开，不再经 Univer 快照转换层
          const { fillDocxTemplate } = await import('@/utils/docxPlaceholder');
          const filled = await fillDocxTemplate(payload.blob, finalVars);
          const bytes = new Uint8Array(await filled.blob.arrayBuffer());
          let b64 = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            b64 += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          snapshotJson = '__DOCX__:' + btoa(b64);
          if (filled.missing.length) {
            noticeWarn = `有 ${filled.missing.length} 个字段未取到值，文中对应位置为空：${filled.missing.join('、')}`;
          }
        } else if (!tpl) {
          noticeWarn =
            '未选择模板，已创建空白文件条目。到「文书模板库」上传审计通知书 .docx 后可重新生成。';
        } else {
          noticeWarn = `模板「${tpl.label}」尚未上传 .docx 文件（当前为${
            tpl.fileName ? '其他格式' : '空'
          }），已创建空白文件条目。`;
        }

        noticeDoc = {
          id: `D${Date.now().toString(36)}`,
          code: noticeNoValue,
          title: noticeTitleValue,
          category: '审计通知类',
          template: tpl?.label ?? '审计通知书',
          docType: 'document',
          hasContent: !!snapshotJson,
          projectId: projectId!,
          projectName: project?.name ?? '',
          groupId: group.id,
          groupName: group.name,
          status: '草稿',
          secretLevel: '内部',
          authorId: leaderId ?? currentUser?.id ?? '',
          authorName: auditors.find((a) => a.id === leaderId)?.name ?? currentUser?.name ?? '',
          version: 'V1.0',
          createdAt: now,
          updatedAt: now,
          pages: 3,
          attachmentCount: 0,
          refCodes: [],
        };

        // 有正文时走 addDocumentWithContent：先落文档行、再写正文，顺序不能反
        if (snapshotJson) await addDocumentWithContent(noticeDoc, snapshotJson);
        else addDocument(noticeDoc);
      }
    } catch (err) {
      console.error(err);
      noticeWarn = `审计通知书生成失败：${
        err instanceof Error ? err.message : String(err)
      }。审计组已建成，可到文件台账重新起草。`;
    } finally {
      setGenerating(false);
    }

    message.success('审计组已组建');
    modal.success({
      title: '审计组组建完成',
      width: 540,
      content: (
        <div style={{ fontSize: 13 }}>
          <div>审计组：{group.name}</div>
          <div>所属项目：{project?.name}</div>
          <div>组长：{group.leaderName}</div>
          <div>成员：{group.memberCount} 人</div>
          {noticeDoc && (
            <>
              <Divider style={{ margin: '10px 0' }} />
              <div>审计通知书：{noticeDoc.title}</div>
              <div>文号：{noticeDoc.code}</div>
              <div>
                正文：
                {noticeDoc.hasContent ? '已按模板填入项目与审计组信息（草稿）' : '空白文件'}
              </div>
              {noticeWarn && (
                <div style={{ color: '#b7791f', marginTop: 6, fontSize: 12 }}>{noticeWarn}</div>
              )}
            </>
          )}
        </div>
      ),
      okText: noticeDoc ? '打开通知书' : '查看审计组台账',
      cancelText: '返回',
      okCancel: true,
      onOk: () => navigate(noticeDoc ? `/documents/${noticeDoc.id}/office` : '/groups'),
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

            {/* 勾选「审计通知书」后展开：选模板 → 解析占位符 → 核对取值 */}
            {wantNotice && (
              <div
                style={{
                  marginTop: 12,
                  border: '1px solid #dfe4ea',
                  borderRadius: 4,
                  background: '#fafbfc',
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Space size={8}>
                    <FileTextOutlined style={{ color: '#1a5fb4' }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>审计通知书生成设置</span>
                    <Tag color="blue" style={{ fontSize: 10, marginInlineEnd: 0 }}>
                      套打模板
                    </Tag>
                  </Space>
                  <Button
                    type="link"
                    size="small"
                    icon={<QuestionCircleOutlined />}
                    onClick={() => setHelpOpen(true)}
                  >
                    占位符写法
                  </Button>
                </div>

                {noticeAllTemplates.length === 0 ? (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ fontSize: 12 }}
                    message="还没有「审计通知类」模板"
                    description={
                      <span style={{ fontSize: 12 }}>
                        请先到「系统设置 → 文书模板库」新建「审计通知书」模板并上传 .docx 文件。
                        <Button
                          type="link"
                          size="small"
                          onClick={() => navigate('/settings?tab=template')}
                        >
                          前往文书模板库
                        </Button>
                      </span>
                    }
                  />
                ) : (
                  <>
                    <Row gutter={12} style={{ marginBottom: 8 }}>
                      <Col span={9}>
                        <div style={FIELD_LABEL}>使用模板</div>
                        <Select
                          style={{ width: '100%' }}
                          value={noticeTplId}
                          onChange={setNoticeTplId}
                          placeholder="请选择审计通知书模板"
                          options={noticeAllTemplates.map((t) => ({
                            value: t.id,
                            label: `${t.label}${t.fileName ? '' : '（未上传文件）'}`,
                            disabled: !/\.docx$/i.test(t.fileName ?? ''),
                          }))}
                        />
                      </Col>
                      <Col span={9}>
                        <div style={FIELD_LABEL}>文件标题</div>
                        <Input
                          value={noticeTitleValue}
                          onChange={(e) => setNoticeTitle(e.target.value)}
                          allowClear
                        />
                      </Col>
                      <Col span={6}>
                        <div style={FIELD_LABEL}>发文日期</div>
                        <DatePicker
                          style={{ width: '100%' }}
                          value={noticeDate}
                          allowClear={false}
                          onChange={(d) => d && setNoticeDate(d)}
                        />
                      </Col>
                    </Row>

                    <Row gutter={12} style={{ marginBottom: 4 }}>
                      <Col span={9}>
                        <div style={FIELD_LABEL}>文号</div>
                        <Input
                          value={noticeNoValue}
                          onChange={(e) => setNoticeNo(e.target.value)}
                          allowClear
                        />
                      </Col>
                      <Col span={15}>
                        <div style={FIELD_LABEL}>模板占位符</div>
                        {noticeScan === 'loading' ? (
                          <span style={{ fontSize: 12, color: '#8a94a6' }}>正在解析模板…</span>
                        ) : noticeScan === 'error' ? (
                          <span style={{ fontSize: 12, color: '#b42318' }}>{noticeError}</span>
                        ) : noticeScan === 'done' ? (
                          <span style={{ fontSize: 12 }}>
                            检测到 <b>{noticeVars.length}</b> 个占位符
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#8a94a6' }}>请先选择模板</span>
                        )}
                      </Col>
                    </Row>

                    {noticeScan === 'done' && noticeVars.length === 0 && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ fontSize: 12, marginTop: 8 }}
                        message="模板里没有占位符，生成的通知书就是模板原文"
                        description={
                          <span style={{ fontSize: 12 }}>
                            在 Word 模板中把需要填写的位置写成 $&#123;被审计单位&#125; 这类占位符即可自动填充。点右上角「占位符写法」查看全部可用字段。
                          </span>
                        }
                      />
                    )}

                    {noticeScan === 'done' && noticeVars.length > 0 && (
                      <>
                        <div style={{ fontSize: 12, color: '#5a6675', margin: '10px 0 4px' }}>
                          将填充 {noticeVars.length} 个字段；系统取不到值的可直接在此填写，留空则文中该处为空
                        </div>
                        <div
                          style={{
                            maxHeight: 190,
                            overflow: 'auto',
                            background: '#fff',
                            border: '1px solid #eef1f5',
                            borderRadius: 4,
                            padding: '6px 10px',
                          }}
                        >
                          {noticeVars.map((key) => {
                            const auto = noticeVarsAll[key] ?? '';
                            const known = !!varDefOf(key);
                            return (
                              <div
                                key={key}
                                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}
                              >
                                <Tag
                                  color={known ? 'blue' : 'orange'}
                                  title={known ? undefined : '模板中的自定义字段'}
                                  style={{
                                    width: 108,
                                    textAlign: 'center',
                                    fontSize: 11,
                                    marginInlineEnd: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {key}
                                </Tag>
                                {auto ? (
                                  <span
                                    title={auto}
                                    style={{
                                      fontSize: 12,
                                      color: '#1f2933',
                                      flex: 1,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {auto}
                                  </span>
                                ) : (
                                  <Input
                                    size="small"
                                    value={extraVars[key] ?? ''}
                                    placeholder={known ? '系统无取值，请填写' : '模板中的自定义字段，请填写'}
                                    onChange={(e) => setExtra(key, e.target.value)}
                                    style={{ flex: 1, maxWidth: 320 }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
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
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={generating}
              onClick={() => void onSubmit()}
            >
              {generating ? '正在生成文书…' : '确认组建'}
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

      <DocVarHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        found={noticeScan === 'done' ? noticeVars : undefined}
        templateName={noticeAllTemplates.find((t) => t.id === noticeTplId)?.label}
      />
    </div>
  );
}
