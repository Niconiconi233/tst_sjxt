import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
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
  Tag,
  Typography,
  Upload,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  FileAddOutlined,
  FileTextOutlined,
  LeftOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '@/store/authStore';
import { useUserData } from '@/store/userData';
import { useDict } from '@/store/dictStore';
import { useAuditors } from '@/store/auditorStore';
import { allowedCategories, canDo } from '@/utils/permissions';
import { bizColors } from '@/theme';
import { recommendDocType } from '@/utils/docType';
import { buildAuditDocVars, varDefOf } from '@/utils/auditDocVars';
import { repo } from '@/services/repository';
import DocVarHelpModal from '@/components/DocVarHelpModal';
import type { AuditDocument, DocCategory, DocStatus, SecretLevel } from '@/types';

const STEPS = [
  { title: '选择模板', desc: '文件类别与模板' },
  { title: '填写要素', desc: '标题、项目、密级' },
  { title: '流转送审', desc: '复核与签发设置' },
];

/** 套打设置区的小字段标题（与组建审计组内的表单 label 字号保持一致） */
const FIELD_LABEL = { fontSize: 12, color: '#5a6675', marginBottom: 4 };

export default function DocumentCreate() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [params] = useSearchParams();
  const { currentUser } = useAuth();
  const { projects, groups, documents, addDocument, addDocumentWithContent } = useUserData();
  const { labels, allOf, remarkOf, readFile } = useDict();
  const { auditors } = useAuditors();
  const [form] = Form.useForm();

  const [step, setStep] = useState(0);
  /** 只展示当前角色可编写的类别；默认选中第一个可用类别 */
  const myCategories = useMemo(
    () => labels('doc_category').filter((c) => allowedCategories(currentUser?.role).includes(c as DocCategory)),
    [currentUser?.role, labels],
  );
  const [category, setCategory] = useState<DocCategory>(
    (myCategories[0] as DocCategory) ?? '取证与底稿类',
  );
  const [template, setTemplate] = useState<string>('');

  // 模板随类别/字典变化同步：默认选中该类别下的第一个模板
  useEffect(() => {
    const list = labels('doc_template', category);
    setTemplate((cur) => (cur && list.includes(cur) ? cur : list[0] ?? ''));
  }, [category, labels]);
  const [snapshot, setSnapshot] = useState<Record<string, any>>({});
  const [flow, setFlow] = useState<'draft' | 'review' | 'issue'>('review');

  const initialProject = params.get('project') ?? undefined;
  const initialGroup = params.get('group') ?? undefined;

  /* ---------------- 模板套打生成 ---------------- */

  /** 当前类别下的全部模板（含未上传文件的条目） */
  const categoryTemplates = useMemo(
    () => allOf('doc_template', category),
    [allOf, category],
  );

  /** 当前选中模板对应的字典条目（用于读取其 .docx 文件） */
  const selectedTemplateItem = useMemo(
    () => categoryTemplates.find((t) => t.label === template),
    [categoryTemplates, template],
  );

  /** 选中的模板是否可套打：需为已上传的 .docx */
  const canFill = !!selectedTemplateItem && /\.docx$/i.test(selectedTemplateItem.fileName ?? '');

  /** 选中模板是否为表格类（.xlsx / .xls），是则走 Excel 形态 */
  const isSheetTemplate =
    !!selectedTemplateItem && /\.(xlsx|xls)$/i.test(selectedTemplateItem.fileName ?? '');

  /** 按「模板实际文件格式」决定正文形态；无文件时退回类别推荐 */
  const docType = isSheetTemplate
    ? 'sheet'
    : canFill
      ? 'document'
      : recommendDocType(category);

  /** 套打上下文里选中的项目 / 审计组（与 Step 2 表单同源，提交时一致） */
  const [tplProjectId, setTplProjectId] = useState<string | undefined>(initialProject);
  const [tplGroupId, setTplGroupId] = useState<string | undefined>(initialGroup);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === tplProjectId) ?? null,
    [projects, tplProjectId],
  );

  /** 模板里检测到的占位符 */
  const [tplVars, setTplVars] = useState<string[]>([]);
  const [tplScan, setTplScan] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [tplError, setTplError] = useState('');
  /** 系统取不到值、由使用者手填的字段 */
  const [extraVars, setExtraVars] = useState<Record<string, string>>({});
  const [org, setOrg] = useState<{ name?: string; code?: string }>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // 机构名称取自「系统设置 → 机构与人员」，供落款使用
  useEffect(() => {
    repo
      .loadSettings()
      .then((s) => setOrg({ name: s['org.name'], code: s['org.code'] }))
      .catch(() => undefined);
  }, []);

  // 换模板或换类别就重新解析占位符
  useEffect(() => {
    if (!canFill || !selectedTemplateItem) {
      setTplVars([]);
      setTplScan('idle');
      setTplError('');
      return;
    }
    let alive = true;
    setTplScan('loading');
    setTplError('');
    void (async () => {
      try {
        const payload = await readFile(selectedTemplateItem.id);
        if (!payload) throw new Error('未能读取模板文件，请到文书模板库重新上传');
        const { scanDocxPlaceholders } = await import('@/utils/docxPlaceholder');
        const found = await scanDocxPlaceholders(payload.blob);
        if (!alive) return;
        setTplVars(found);
        setTplScan('done');
      } catch (err) {
        if (!alive) return;
        setTplVars([]);
        setTplScan('error');
        setTplError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [canFill, selectedTemplateItem, readFile]);

  /** 依据当前选中的项目/组自动取值；取不到的留空由使用者手填 */
  const tplVarsAll = useMemo(() => {
    const group = selectedProject
      ? groups.find((g) => g.id === tplGroupId || g.projectId === selectedProject.id)
      : undefined;
    return buildAuditDocVars({
      org,
      project: selectedProject,
      group: group
        ? {
            name: group.name,
            members: group.members,
            location: group.location,
            establishDate: group.establishDate,
            planEndDate: group.planEndDate,
            disciplineNote: group.disciplineNote,
          }
        : undefined,
      title: (form.getFieldValue('title') as string) ?? '',
      docNo: (form.getFieldValue('code') as string) ?? '',
      issueDate: dayjs().format('YYYY-MM-DD'),
    });
  }, [org, selectedProject, groups, tplGroupId, form]);

  /** 手填值覆盖自动取值（提交时与最终上下文合并） */
  const setExtra = (key: string, value: string) =>
    setExtraVars((prev) => ({ ...prev, [key]: value }));

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [],
  );
  const groupOptions = useMemo(() => groups.map((g) => ({ value: g.id, label: g.name })), [groups]);

  const val = { ...snapshot, ...form.getFieldsValue(true) } as any;

  const next = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      try {
        await form.validateFields(['title', 'projectId', 'secretLevel', 'authorId']);
      } catch {
        message.warning('请完善文件要素');
        return;
      }
      setSnapshot((p) => ({ ...p, ...form.getFieldsValue(true) }));
      setStep(2);
    }
  };

  const onSubmit = async () => {
    if (generating) return;
    const project = projects.find((p) => p.id === val.projectId);
    const group = groups.find((g) => g.id === val.groupId);
    const author = auditors.find((a) => a.id === val.authorId);
    const reviewer = auditors.find((a) => a.id === val.reviewerId);
    const status: DocStatus = flow === 'draft' ? '草稿' : flow === 'review' ? '待复核' : '已签发';
    const now = dayjs().format('YYYY-MM-DD HH:mm');

    const doc: AuditDocument = {
      id: `D${Date.now().toString(36)}`,
      code:
        val.code ||
        `${(project?.code ?? 'DOC').replace(/[〔〕]/g, '')}-${String(documents.length + 1).padStart(3, '0')}`,
      title: val.title,
      category,
      template,
      docType,
      hasContent: false,
      projectId: val.projectId,
      projectName: project?.name ?? '',
      groupId: val.groupId,
      groupName: group?.name,
      status,
      secretLevel: (val.secretLevel ?? '内部') as SecretLevel,
      authorId: author?.id ?? currentUser?.id ?? '',
      authorName: author?.name ?? currentUser?.name ?? '',
      reviewerName: reviewer?.name,
      version: val.version ?? 'V1.0',
      createdAt: now,
      updatedAt: now,
      pages: val.pages ?? 3,
      attachmentCount: Array.isArray(val.attachments) ? val.attachments.length : 0,
      refCodes: val.refCodes ?? [],
      remark: val.remark,
    };

    setGenerating(true);
    try {
      if (isSheetTemplate && selectedTemplateItem) {
        // 表格类模板（.xlsx/.xls）：解析成 Univer 表格快照落库，走 Excel 形态
        const payload = await readFile(selectedTemplateItem.id);
        if (!payload) throw new Error('未能读取模板文件，请到文书模板库重新上传');
        const { xlsxToSnapshot } = await import('@/utils/officeConvert');
        const file = new File([payload.blob], payload.fileName || `${template}.xlsx`);
        const snapshot = await xlsxToSnapshot(file, val.title);
        doc.hasContent = true;
        await addDocumentWithContent(doc, JSON.stringify(snapshot));
        message.success(flow === 'draft' ? '已保存为草稿' : flow === 'review' ? '已提交复核' : '文件已签发');
      } else if (canFill && selectedTemplateItem) {
        // 可套打（.docx 模板）时，用最终上下文重新构建变量并填充占位符，
        // 直接把原始 DOCX 字节落库；否则按无正文方式新建。
        const payload = await readFile(selectedTemplateItem.id);
        if (!payload) throw new Error('未能读取模板文件，请到文书模板库重新上传');
        const { fillDocxTemplate } = await import('@/utils/docxPlaceholder');
        const finalCtx = buildAuditDocVars({
          org,
          project: project ?? null,
          group: group
            ? {
                name: group.name,
                members: group.members,
                location: group.location,
                establishDate: group.establishDate,
                planEndDate: group.planEndDate,
                disciplineNote: group.disciplineNote,
              }
            : undefined,
          title: val.title,
          docNo: doc.code,
          issueDate: dayjs().format('YYYY-MM-DD'),
        });
        const filled = await fillDocxTemplate(payload.blob, { ...finalCtx, ...extraVars });
        const bytes = new Uint8Array(await filled.blob.arrayBuffer());
        let b64 = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          b64 += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const content = '__DOCX__:' + btoa(b64);
        doc.hasContent = true;
        await addDocumentWithContent(doc, content);
        if (filled.missing.length) {
          message.warning(`已生成，但有 ${filled.missing.length} 个字段未取到值，文中对应位置为空：${filled.missing.join('、')}`);
        } else {
          message.success(flow === 'draft' ? '已保存为草稿' : flow === 'review' ? '已提交复核' : '文件已签发');
        }
      } else {
        addDocument(doc);
        message.success(flow === 'draft' ? '已保存为草稿' : flow === 'review' ? '已提交复核' : '文件已签发');
      }
    } catch (err) {
      console.error(err);
      message.error(`生成失败：${err instanceof Error ? err.message : String(err)}`);
      setGenerating(false);
      return;
    }
    setGenerating(false);

    modal.success({
      title: flow === 'draft' ? '文件已存为草稿' : flow === 'review' ? '文件已提交复核' : '文件已签发',
      content: (
        <div style={{ fontSize: 13 }}>
          <div>文件标题：{doc.title}</div>
          <div>文件类别：{category}（{template}）</div>
          <div>所属项目：{doc.projectName}</div>
          <div>当前状态：{doc.status}</div>
        </div>
      ),
      okText: '返回文件台账',
      cancelText: '在线编辑正文',
      okCancel: true,
      onOk: () => navigate('/documents'),
      onCancel: () => navigate(`/documents/${doc.id}/office`),
    });
  };

  // 无起草权限的角色（理论上不展示入口）直接拦截
  if (!canDo(currentUser?.role, 'doc:create') || myCategories.length === 0) {
    return (
      <div className="page">
        <Card>
          <Alert
            type="warning"
            showIcon
            message="当前角色无权起草工作文件"
            description={`「${currentUser?.role ?? '—'}」只能查看文件台账，无法新建审计工作文件。如需编制底稿或事实确认书，请联系审计组长为您分配相应角色。`}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <Card>
        <Space align="center" size={10} style={{ marginBottom: 4 }}>
          <FileAddOutlined style={{ fontSize: 18, color: '#1a5fb4' }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>起草审计工作文件</span>
          <Tag color="blue" style={{ fontSize: 11 }}>
            {template}
          </Tag>
        </Space>
        <Typography.Paragraph className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          审计工作文件按类别套用标准模板编制，文件编号由系统按项目文号自动生成。编制完成提交复核后，由复核人签署意见。
        </Typography.Paragraph>

        <Steps
          current={step}
          size="small"
          items={STEPS.map((s) => ({ title: s.title, description: s.desc }))}
          style={{ marginBottom: 20 }}
        />

        {/* ---------- Step 1：选模板 ---------- */}
        {step === 0 && (
          <div>
            <Typography.Title level={5} style={{ fontSize: 13, marginTop: 0 }}>
              1. 选择文件类别
              <span className="text-muted" style={{ fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                （当前角色「{currentUser?.role ?? '—'}」可编写 {myCategories.length} 类）
              </span>
            </Typography.Title>
            <Space size={6} wrap style={{ marginBottom: 16 }}>
              {myCategories.map((c) => (
                <Button
                  key={c}
                  size="small"
                  type={category === c ? 'primary' : 'default'}
                  onClick={() => {
                    setCategory(c as DocCategory);
                    setTemplate(labels('doc_template', c)[0] ?? '');
                  }}
                >
                  {c}
                </Button>
              ))}
            </Space>

            <Typography.Title level={5} style={{ fontSize: 13 }}>
              2. 选择文件模板
            </Typography.Title>
            <Row gutter={[12, 12]}>
              {labels('doc_template', category).map((t) => {
                const item = categoryTemplates.find((x) => x.label === t);
                const hasDocx = !!item && /\.docx$/i.test(item.fileName ?? '');
                const hasSheet = !!item && /\.(xlsx|xls)$/i.test(item.fileName ?? '');
                return (
                  <Col span={8} key={t}>
                    <div
                      onClick={() => setTemplate(t)}
                      style={{
                        border: `1px solid ${template === t ? bizColors.primary : '#e6e9ee'}`,
                        background: template === t ? bizColors.primaryLight : '#fff',
                        borderRadius: 4,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        height: '100%',
                        transition: 'all .2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{t}</span>
                        {template === t && <CheckCircleOutlined style={{ color: bizColors.primary }} />}
                      </div>
                      <div className="text-muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                        {remarkOf('doc_template', t, category) || '按标准格式套用模板编制'}
                      </div>
                      {item?.fileName && (
                        <div style={{ fontSize: 10, color: hasDocx ? '#1a5fb4' : hasSheet ? '#2f855a' : '#8a94a6', marginTop: 4 }}>
                          {hasDocx
                            ? '已上传 .docx，可套打生成'
                            : hasSheet
                              ? '已上传表格，将生成 Excel 文件'
                              : `已上传（${item.fileExt ?? ''}）`}
                        </div>
                      )}
                    </div>
                  </Col>
                );
              })}
            </Row>

            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16, fontSize: 12 }}
              message="模板包含固定的文书要素、格式与审批流程节点，套用后可编辑正文内容。"
            />

            {/* ---------- 模板套打生成扩展栏 ---------- */}
            {canFill && selectedTemplateItem && (
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
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{template}套打生成</span>
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

                <Row gutter={12} style={{ marginBottom: 8 }}>
                  <Col span={8}>
                    <div style={FIELD_LABEL}>所属审计项目</div>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      style={{ width: '100%' }}
                      value={tplProjectId}
                      placeholder="请选择审计项目"
                      options={projectOptions}
                      onChange={(v) => {
                        setTplProjectId(v);
                        form.setFieldValue('projectId', v);
                      }}
                    />
                  </Col>
                  <Col span={8}>
                    <div style={FIELD_LABEL}>所属审计组</div>
                    <Select
                      allowClear
                      style={{ width: '100%' }}
                      value={tplGroupId}
                      placeholder="请选择审计组（可选）"
                      options={groupOptions}
                      onChange={(v) => {
                        setTplGroupId(v);
                        form.setFieldValue('groupId', v);
                      }}
                    />
                  </Col>
                  <Col span={8}>
                    <div style={FIELD_LABEL}>模板占位符</div>
                    {tplScan === 'loading' ? (
                      <span style={{ fontSize: 12, color: '#8a94a6' }}>正在解析模板…</span>
                    ) : tplScan === 'error' ? (
                      <span style={{ fontSize: 12, color: '#b42318' }}>{tplError}</span>
                    ) : tplScan === 'done' ? (
                      <span style={{ fontSize: 12 }}>
                        检测到 <b>{tplVars.length}</b> 个占位符
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#8a94a6' }}>请先选择模板</span>
                    )}
                  </Col>
                </Row>

                {tplScan === 'done' && tplVars.length === 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ fontSize: 12, marginTop: 8 }}
                    message="模板里没有占位符，生成的文书就是模板原文"
                    description={
                      <span style={{ fontSize: 12 }}>
                        在 Word 模板中把需要填写的位置写成 $&#123;被审计单位&#125; 这类占位符即可自动填充。点右上角「占位符写法」查看全部可用字段。
                      </span>
                    }
                  />
                )}

                {tplScan === 'done' && tplVars.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: '#5a6675', margin: '10px 0 4px' }}>
                      将填充 {tplVars.length} 个字段；系统取不到值的可直接在此填写，留空则文中该处为空
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
                      {tplVars.map((key) => {
                        const auto = tplVarsAll[key] ?? '';
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
              </div>
            )}
          </div>
        )}

        {/* ---------- Step 2：要素 ---------- */}
        <div style={{ display: step === 1 ? 'block' : 'none' }}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              secretLevel: '内部',
              authorId: currentUser?.id ?? auditors[0]?.id,
              version: 'V1.0',
              pages: 3,
              projectId: initialProject,
              groupId: initialGroup,
            }}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <Tag color="blue">
                {category}
              </Tag>
              <Tag>{template}</Tag>
              <Button
                type="link"
                size="small"
                onClick={() => setStep(0)}
              >
                更换模板
              </Button>
            </div>

            <Row gutter={16}>
              <Col span={16}>
                <Form.Item
                  name="title"
                  label="文件标题"
                  rules={[{ required: true, message: '请输入文件标题' }]}
                  extra="标题应规范、完整，如「关于对××单位开展××审计的通知」"
                >
                  <Input placeholder={`请输入${template}标题`} allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="code" label="文件编号" extra="留空则由系统按项目文号自动生成">
                  <Input placeholder="审财〔2026〕015号-001" allowClear />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={10}>
                <Form.Item name="projectId" label="所属审计项目" rules={[{ required: true, message: '请选择所属项目' }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="请选择审计项目"
                    options={projectOptions}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="groupId" label="所属审计组">
                  <Select allowClear placeholder="请选择审计组" options={groupOptions} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="secretLevel" label="密级" rules={[{ required: true }]}>
                  <Select
                    options={(['公开', '内部', '秘密', '机密'] as SecretLevel[]).map((s) => ({ value: s, label: s }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="authorId" label="起草人" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={auditors.map((a) => ({ value: a.id, label: `${a.name}（${a.department}）` }))}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="reviewerId" label="复核人">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="请选择复核人"
                    options={auditors
                      .filter((a) => a.capableRoles.includes('复核员'))
                      .map((a) => ({ value: a.id, label: `${a.name}（${a.department}）` }))}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="version" label="版本号">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="pages" label="页数">
                  <InputNumber min={1} max={999} style={{ width: '100%' }} addonAfter="页" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="refCodes" label="关联底稿 / 证据编号">
                  <Select
                    mode="tags"
                    placeholder="输入编号后回车，如 QZ-001"
                    tokenSeparators={[',', '，', ' ']}
                    open={false}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="attachments" label="附件材料">
                  <Upload beforeUpload={() => false} multiple>
                    <Button icon={<CloudUploadOutlined />} size="small">
                      选择附件（演示，不上传）
                    </Button>
                  </Upload>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </div>

        {/* ---------- Step 3：流转 ---------- */}
        {step === 2 && (
          <div>
            <Row gutter={16}>
              <Col span={14}>
                <Descriptions bordered size="small" column={2} title="文件要素复核" styles={{ label: { width: 110 } }}>
                  <Descriptions.Item label="文件标题" span={2}>
                    {val.title || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="文件类别">{category}</Descriptions.Item>
                  <Descriptions.Item label="使用模板">{template}</Descriptions.Item>
                  <Descriptions.Item label="所属项目" span={2}>
                    {projects.find((p) => p.id === val.projectId)?.name ?? '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="所属审计组">
                    {groups.find((g) => g.id === val.groupId)?.name ?? '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="密级">{val.secretLevel ?? '内部'}</Descriptions.Item>
                  <Descriptions.Item label="起草人">
                    {auditors.find((a) => a.id === val.authorId)?.name ?? currentUser?.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="复核人">
                    {auditors.find((a) => a.id === val.reviewerId)?.name ?? '待指派'}
                  </Descriptions.Item>
                  <Descriptions.Item label="版本 / 页数">
                    {val.version ?? 'V1.0'} · {val.pages ?? 3} 页
                  </Descriptions.Item>
                </Descriptions>

                <Typography.Title level={5} style={{ fontSize: 13, margin: '16px 0 8px' }}>
                  流转方式
                </Typography.Title>
                <Radio.Group value={flow} onChange={(e) => setFlow(e.target.value)}>
                  <Space direction="vertical" size={8}>
                    <Radio value="draft">
                      <span style={{ fontSize: 13 }}>仅保存为草稿</span>
                      <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>
                        不进入复核流程，可随时继续编辑
                      </span>
                    </Radio>
                    <Radio value="review">
                      <span style={{ fontSize: 13 }}>提交复核</span>
                      <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>
                        送复核人审核，状态变为「待复核」
                      </span>
                    </Radio>
                    <Radio value="issue">
                      <span style={{ fontSize: 13 }}>直接签发</span>
                      <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>
                        适用于组长已授权的常规文书，签发后不可修改
                      </span>
                    </Radio>
                  </Space>
                </Radio.Group>
              </Col>
              <Col span={10}>
                <Typography.Title level={5} style={{ fontSize: 13, marginTop: 0 }}>
                  流转节点预览
                </Typography.Title>
                <div style={{ background: '#f7f9fb', border: '1px solid #e6e9ee', borderRadius: 4, padding: 12 }}>
                  {[
                    { t: '起草编制', who: auditors.find((a) => a.id === val.authorId)?.name ?? currentUser?.name, done: true },
                    { t: '审计组复核', who: auditors.find((a) => a.id === val.reviewerId)?.name ?? '待指派', done: flow !== 'draft' },
                    { t: '组长签发', who: '审计组长', done: flow === 'issue' },
                    { t: '归档入库', who: '系统自动', done: false },
                  ].map((n, i, arr) => (
                    <div key={n.t} style={{ display: 'flex', gap: 10, paddingBottom: i === arr.length - 1 ? 0 : 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: n.done ? bizColors.primary : '#dfe4ea',
                            color: '#fff',
                            fontSize: 10,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          {i + 1}
                        </div>
                        {i !== arr.length - 1 && <div style={{ flex: 1, width: 1, background: '#dfe4ea', marginTop: 2 }} />}
                      </div>
                      <div style={{ paddingBottom: 4 }}>
                        <div style={{ fontSize: 12, color: n.done ? '#1f2933' : '#8a94a6' }}>{n.t}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {n.who}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Checkbox defaultChecked style={{ marginTop: 12, fontSize: 12 }}>
                  我已核对文件内容，确认符合审计文书规范
                </Checkbox>
              </Col>
            </Row>
          </div>
        )}

        <Divider style={{ margin: '16px 0 12px' }} />
        <Space>
          <Button icon={<LeftOutlined />} onClick={() => navigate('/documents')}>
            取消
          </Button>
          <Button icon={<SaveOutlined />} onClick={() => message.info('已存为草稿（演示）')}>
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
              {generating
                ? '正在生成文书…'
                : flow === 'draft'
                  ? '保存草稿'
                  : flow === 'review'
                    ? '提交复核'
                    : '确认签发'}
            </Button>
          )}
        </Space>
      </Card>

      <DocVarHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        found={tplScan === 'done' ? tplVars : undefined}
        templateName={template}
      />
    </div>
  );
}
