/**
 * 文书模板库：维护「文件类别 → 模板名称 + 实际文件」。
 *
 * 模板条目本身就是字典里的 `doc_template`（挂在 doc_category 下），
 * 附件存在同一条记录的 file_* 列里 —— 不另建模板表，避免出现第二份模板清单。
 *
 * 上传走隐藏的 <input type="file">，读成 base64 交给 Rust 落库；
 * 下载统一走 saveBlobAs：桌面端弹系统「另存为」，浏览器预览退回常规下载。
 */
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PaperClipOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import DocVarHelpModal from '@/components/DocVarHelpModal';
import { useDict } from '@/store/dictStore';
import { saveBlobAs } from '@/utils/exportFile';
import type { DictItem } from '@/types/dict';

/** 模板文件体积上限：模板是正式文书骨架，超过这个体量多半是误传了别的东西 */
const MAX_FILE_MB = 20;

interface Editing {
  id?: string;
  parent: string;
  label: string;
  remark: string;
}

function formatSize(bytes?: number): string {
  const n = bytes ?? 0;
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocTemplatePanel() {
  const { ready, allOf, labels, save, remove, move, uploadFile, readFile, removeFile } = useDict();
  const { message } = App.useApp();

  const categories = labels('doc_category');
  const [category, setCategory] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [varModal, setVarModal] = useState<{ open: boolean; found?: string[]; name?: string }>({
    open: false,
  });
  const [form] = Form.useForm<{ parent: string; label: string; remark: string }>();

  /** 待上传的模板 id 与用户选中的文件（列表里上传时选完即传，不需要二次确认） */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);
  /** 新建模板时顺带选的文件，等条目落库拿到 id 后再上传 */
  const pendingFile = useRef<File | null>(null);
  const [pickedName, setPickedName] = useState('');

  const allTemplates = useMemo(() => allOf('doc_template'), [allOf]);

  const rows = useMemo(
    () =>
      allTemplates.filter((t) => {
        if (category !== 'all' && t.parent !== category) return false;
        if (!keyword) return true;
        return `${t.label}${t.remark}${t.parent}${t.fileName ?? ''}`.includes(keyword);
      }),
    [allTemplates, category, keyword],
  );

  const uploaded = allTemplates.filter((t) => !!t.fileName).length;

  /* ------------------------------ 上传 ------------------------------ */

  const pickFile = (id: string) => {
    uploadTarget.current = id;
    pendingFile.current = null;
    fileInputRef.current?.click();
  };

  const doUpload = async (id: string, file: File) => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      message.warning(`模板文件超过 ${MAX_FILE_MB}MB，请确认是否选错了文件`);
      return;
    }
    setBusyId(id);
    try {
      await uploadFile(id, file);
      // .docx 顺手解析一遍占位符，让使用者当场知道模板能不能套打
      let tip = '';
      if (/\.docx$/i.test(file.name)) {
        try {
          const { scanDocxPlaceholders } = await import('@/utils/docxPlaceholder');
          const found = await scanDocxPlaceholders(file);
          tip = found.length
            ? `，识别到 ${found.length} 个占位符`
            : '，未发现占位符（生成文书时不会填充内容）';
        } catch {
          tip = '，占位符解析失败，请确认文件是有效的 .docx';
        }
      }
      message.success(`已上传「${file.name}」${tip}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  /** 查看某个模板的占位符清单 */
  const inspectVars = async (item: DictItem) => {
    if (!/\.docx$/i.test(item.fileName ?? '')) {
      message.info('占位符检测仅支持 .docx 模板');
      return;
    }
    setBusyId(item.id);
    try {
      const payload = await readFile(item.id);
      if (!payload) {
        message.warning('未能读取模板内容，请重新上传');
        return;
      }
      const { scanDocxPlaceholders } = await import('@/utils/docxPlaceholder');
      const found = await scanDocxPlaceholders(payload.blob);
      setVarModal({ open: true, found, name: item.label });
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    const id = uploadTarget.current;
    // 清空 value，否则连续选同一个文件不会再触发 change
    e.target.value = '';
    uploadTarget.current = null;
    if (!file) {
      pendingFile.current = null;
      setPickedName('');
      return;
    }
    if (id) {
      await doUpload(id, file);
      return;
    }
    // 来自「新增模板」弹窗：先把文件暂存，等保存拿到 id 再传
    pendingFile.current = file;
    setPickedName(file.name);
  };

  /* ------------------------------ 下载 ------------------------------ */

  const download = async (item: DictItem) => {
    if (!item.fileName) {
      message.warning('该模板尚未上传文件');
      return;
    }
    setBusyId(item.id);
    try {
      const payload = await readFile(item.id);
      if (!payload) {
        message.warning('未能读取模板内容，请重新上传');
        return;
      }
      const ext = (item.fileExt || payload.fileName.split('.').pop() || '').toLowerCase();
      const path = await saveBlobAs(
        payload.blob,
        payload.fileName || `${item.label}.${ext}`,
        ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [],
      );
      if (path) message.success(`已保存到 ${path}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  /* ------------------------------ 增改 ------------------------------ */

  const openCreate = () => {
    const parent = category !== 'all' ? category : categories[0] ?? '';
    setEditing({ parent, label: '', remark: '' });
    pendingFile.current = null;
    setPickedName('');
    form.setFieldsValue({ parent, label: '', remark: '' });
  };

  const openEdit = (item: DictItem) => {
    setEditing({ id: item.id, parent: item.parent, label: item.label, remark: item.remark });
    pendingFile.current = null;
    setPickedName('');
    form.setFieldsValue({ parent: item.parent, label: item.label, remark: item.remark });
  };

  const submit = async () => {
    if (!editing) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    if (
      allTemplates.some(
        (t) => t.parent === values.parent && t.label === values.label && t.id !== editing.id,
      )
    ) {
      message.warning('该类别下已存在同名模板');
      return;
    }
    const current = editing.id ? allTemplates.find((t) => t.id === editing.id) : undefined;
    const saved = await save({
      id: editing.id,
      category: 'doc_template',
      parent: values.parent,
      label: values.label,
      remark: values.remark ?? '',
      sortOrder: current?.sortOrder ?? allTemplates.length,
      enabled: current?.enabled ?? true,
      builtin: current?.builtin ?? false,
    });
    const file = pendingFile.current;
    pendingFile.current = null;
    if (file && saved?.id) await doUpload(saved.id, file);
    message.success(editing.id ? '已保存' : '已新增模板');
    setEditing(null);
  };

  const toggleEnabled = async (item: DictItem) => {
    await save({ ...item, enabled: !item.enabled });
    message.success(item.enabled ? '已停用' : '已启用');
  };

  // 排序按「同一文件类别内」进行：筛选为「全部类别」或有关键字时，表格行序与
  // 同类别内的真实顺序不一致，此时上移/下移会挪错对象，直接禁用。
  const sortable = category !== 'all' && !keyword;

  return (
    <div>
      <Typography.Paragraph style={{ fontSize: 12, color: '#5a6675', marginBottom: 12 }}>
        上传并维护审计文书模板（支持 DOCX / PDF / XLSX / TXT 等）。
        停用后该模板不再出现在「起草工作文件」的模板选择中，已上传的文件仍保留在这里。
        模板文件存入本机数据库，所有账户共用。
        <br />
        .docx 模板可在需要填写的位置写 <Typography.Text code>$&#123;被审计单位&#125;</Typography.Text>{' '}
        这类占位符，组建审计组时按项目和人员信息自动填充，原模板的字体、表格与页面设置不受影响。
      </Typography.Paragraph>

      <Space wrap style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#5a6675' }}>文件类别：</span>
        <Select
          value={category}
          style={{ width: 220 }}
          onChange={setCategory}
          options={[
            { value: 'all', label: '全部类别' },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />
        <Input
          placeholder="模板名称 / 说明 / 文件名"
          allowClear
          style={{ width: 220 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增模板
        </Button>
        <Button icon={<CodeOutlined />} onClick={() => setVarModal({ open: true })}>
          占位符说明
        </Button>
        <span style={{ fontSize: 12, color: '#8a94a6' }}>
          共 {allTemplates.length} 套，已上传文件 {uploaded} 套，待上传 {allTemplates.length - uploaded} 套
        </span>
      </Space>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        accept=".docx,.doc,.pdf,.xlsx,.xls,.txt,.md"
        onChange={(e) => void onFileChange(e)}
      />

      <Table
        size="small"
        rowKey="id"
        loading={!ready}
        dataSource={rows}
        pagination={false}
        scroll={{ y: 420 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="该筛选下暂无模板，点击「新增模板」添加"
            />
          ),
        }}
        columns={[
          {
            title: '排序',
            width: 84,
            render: (_: unknown, item: DictItem, idx: number) => (
              <Tooltip title={sortable ? undefined : '选择具体文件类别后可调整顺序'}>
                <Space size={0}>
                  <Button
                    type="text"
                    size="small"
                    disabled={!sortable || idx === 0}
                    icon={<ArrowUpOutlined />}
                    onClick={() => void move(item, -1)}
                  />
                  <Button
                    type="text"
                    size="small"
                    disabled={!sortable || idx === rows.length - 1}
                    icon={<ArrowDownOutlined />}
                    onClick={() => void move(item, 1)}
                  />
                </Space>
              </Tooltip>
            ),
          },
          { title: '文件类别', dataIndex: 'parent', width: 140 },
          {
            title: '模板名称',
            dataIndex: 'label',
            width: 220,
            render: (v: string, item: DictItem) => (
              <Space size={6}>
                <span>{v}</span>
                {item.builtin && <Tag style={{ fontSize: 10, marginInlineEnd: 0 }}>预置</Tag>}
              </Space>
            ),
          },
          {
            title: '模板文件',
            dataIndex: 'fileName',
            render: (v: string | undefined, item: DictItem) =>
              v ? (
                <Space size={6}>
                  <PaperClipOutlined style={{ color: '#1a5fb4' }} />
                  <span style={{ fontSize: 12 }}>{v}</span>
                  <span className="text-muted mono" style={{ fontSize: 11 }}>
                    {formatSize(item.fileSize)}
                  </span>
                </Space>
              ) : (
                <Tag color="orange" style={{ fontSize: 11, marginInlineEnd: 0 }}>
                  未上传
                </Tag>
              ),
          },
          {
            title: '说明',
            dataIndex: 'remark',
            ellipsis: true,
            render: (v?: string) => v || '—',
          },
          {
            title: '更新时间',
            dataIndex: 'fileUpdatedAt',
            width: 130,
            render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
          },
          {
            title: '状态',
            width: 88,
            render: (_: unknown, item: DictItem) => (
              <Switch
                size="small"
                checked={item.enabled}
                checkedChildren="启用"
                unCheckedChildren="停用"
                onChange={() => void toggleEnabled(item)}
              />
            ),
          },
          {
            title: '操作',
            width: 310,
            render: (_: unknown, item: DictItem) => (
              <Space size={2}>
                <Button
                  type="link"
                  size="small"
                  icon={<UploadOutlined />}
                  loading={busyId === item.id}
                  onClick={() => pickFile(item.id)}
                >
                  {item.fileName ? '替换' : '上传'}
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<DownloadOutlined />}
                  disabled={!item.fileName}
                  loading={busyId === item.id}
                  onClick={() => void download(item)}
                >
                  下载
                </Button>
                <Tooltip title={!item.fileName ? '请先上传 .docx 模板文件' : '查看该模板里的占位符'}>
                  <Button
                    type="link"
                    size="small"
                    icon={<CodeOutlined />}
                    disabled={!item.fileName}
                    onClick={() => void inspectVars(item)}
                  >
                    占位符
                  </Button>
                </Tooltip>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(item)}>
                  编辑
                </Button>
                {item.fileName && (
                  <Popconfirm
                    title="删除已上传的模板文件？"
                    description="只删除文件，模板条目保留，可重新上传。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={async () => {
                      await removeFile(item.id);
                      message.success('模板文件已删除');
                    }}
                  >
                    <Button type="link" size="small" danger icon={<PaperClipOutlined />} />
                  </Popconfirm>
                )}
                <Popconfirm
                  title="确认删除该模板？"
                  description="模板条目与已上传的文件将一并删除，历史文件中使用过的模板名称不受影响。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    await remove(item.id);
                    message.success('模板已删除');
                  }}
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={!!editing}
        title={editing?.id ? '编辑模板' : '新增模板'}
        okText="保存"
        cancelText="取消"
        width={560}
        onOk={() => void submit()}
        onCancel={() => {
          pendingFile.current = null;
          setPickedName('');
          setEditing(null);
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="parent"
            label="所属文件类别"
            rules={[{ required: true, message: '请选择文件类别' }]}
          >
            <Select options={categories.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="label" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="如：审计工作底稿" />
          </Form.Item>
          <Form.Item name="remark" label="说明（可选）">
            <Input.TextArea rows={2} placeholder="模板用途说明，起草文件时展示给使用人" />
          </Form.Item>
          <Form.Item label="模板文件（可选，也可创建后在列表里上传）">
            <Space>
              <Button
                icon={<UploadOutlined />}
                onClick={() => {
                  uploadTarget.current = null;
                  fileInputRef.current?.click();
                }}
              >
                选择文件
              </Button>
              <Input
                placeholder="未选择文件"
                readOnly
                value={pickedName}
                style={{ width: 260 }}
              />
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <DocVarHelpModal
        open={varModal.open}
        onClose={() => setVarModal({ open: false })}
        found={varModal.found}
        templateName={varModal.name}
      />
    </div>
  );
}
