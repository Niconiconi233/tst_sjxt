/**
 * 字典配置面板：维护各下拉选项（部门、职务、角色、审计类型、文件类别与模板、审计事项等）。
 *
 * 全部读写都经过 repository → Rust 字典表，改动即时生效于所有页面的下拉框。
 */
import { useEffect, useMemo, useState } from 'react';
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
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useDict } from '@/store/dictStore';
import { DICT_CATEGORY_META, DICT_GROUPS, type DictItem } from '@/types/dict';

interface Editing {
  id?: string;
  category: string;
  parent: string;
  label: string;
  remark: string;
}

export default function DictConfigPanel() {
  const { items, ready, allOf, labels, save, remove, move, restoreDefaults } = useDict();
  const { message } = App.useApp();

  const [category, setCategory] = useState<string>('department');
  const [parent, setParent] = useState<string>('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [form] = Form.useForm<{ label: string; remark: string; parent?: string }>();

  const meta = DICT_CATEGORY_META[category];
  const parentOptions = meta?.parent ? labels(meta.parent) : [];

  // 切换分类时，把「上级」默认选为第一个可用项
  useEffect(() => {
    if (!meta?.parent) {
      setParent('');
      return;
    }
    setParent((cur) => (cur && parentOptions.includes(cur) ? cur : parentOptions[0] ?? ''));
  }, [category, meta?.parent, parentOptions]);

  // 表格必须展示「含已停用」的全量条目：若用只看启用项的 options，
  // 点一下停用开关整行就消失了，用户再也点不回来。
  const rows = useMemo(
    () => allOf(category, meta?.parent ? parent : undefined),
    [allOf, category, parent, meta?.parent],
  );

  const openCreate = () => {
    setEditing({ category, parent: meta?.parent ? parent : '', label: '', remark: '' });
    form.setFieldsValue({ label: '', remark: '', parent: meta?.parent ? parent : '' });
  };

  const openEdit = (item: DictItem) => {
    setEditing({
      id: item.id,
      category: item.category,
      parent: item.parent,
      label: item.label,
      remark: item.remark,
    });
    form.setFieldsValue({ label: item.label, remark: item.remark, parent: item.parent });
  };

  const submit = async () => {
    if (!editing) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const existing = rows.find(
      (x) => x.label === values.label && x.id !== editing.id,
    );
    if (existing) {
      message.warning('同分类下已存在相同名称的选项');
      return;
    }
    const current = editing.id ? items.find((x) => x.id === editing.id) : undefined;
    await save({
      id: editing.id,
      category: editing.category,
      parent: meta?.parent ? (values.parent ?? editing.parent) : editing.parent,
      label: values.label,
      remark: values.remark ?? '',
      sortOrder: current?.sortOrder ?? rows.length,
      // 编辑已停用条目时保持停用，不能因为点了一次「保存」就悄悄启用
      enabled: current?.enabled ?? true,
      builtin: current?.builtin ?? false,
    });
    message.success(editing.id ? '已保存' : '已新增');
    setEditing(null);
  };

  const toggleEnabled = async (item: DictItem) => {
    await save({ ...item, enabled: !item.enabled });
    message.success(item.enabled ? '已停用' : '已启用');
  };

  return (
    <div>
      <Typography.Paragraph style={{ fontSize: 12, color: '#5a6675', marginBottom: 12 }}>
        维护系统各处下拉框的候选项。停用后该选项不再出现在下拉列表中，但在本页仍会列出（显示为「停用」），
        随时可以重新启用；历史数据中已使用的值不受影响。
        改动即时写入本机数据库，所有账户共用。文书模板请到「文书模板库」页维护。
      </Typography.Paragraph>

      <Space wrap style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#5a6675' }}>配置项：</span>
        <Select
          value={category}
          style={{ width: 260 }}
          onChange={setCategory}
          options={DICT_GROUPS.map((g) => ({
            label: g.title,
            options: g.categories.map((c) => ({
              label: DICT_CATEGORY_META[c]?.label ?? c,
              value: c,
            })),
          }))}
        />
        {meta?.parent && (
          <Select
            value={parent || undefined}
            style={{ width: 200 }}
            placeholder={meta.parentLabel}
            onChange={setParent}
            options={parentOptions.map((x) => ({ label: x, value: x }))}
          />
        )}
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增选项
        </Button>
        <Tooltip title="补回被删除的系统预置项，已存在的不会重复添加">
          <Button icon={<UndoOutlined />} onClick={() => void restoreDefaults()}>
            恢复预置项
          </Button>
        </Tooltip>
        <span style={{ fontSize: 12, color: '#8a94a6' }}>
          共 {rows.length} 项，其中已停用 {rows.filter((x) => !x.enabled).length} 项
        </span>
      </Space>

      {meta?.hint && (
        <div style={{ fontSize: 12, color: '#5a6675', marginBottom: 10 }}>用途：{meta.hint}</div>
      )}

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
              description="该配置项下暂无选项，点击「新增选项」添加"
            />
          ),
        }}
        columns={[
          {
            title: '排序',
            width: 100,
            render: (_: unknown, item: DictItem, idx: number) => (
              <Space size={0}>
                <Button
                  type="text"
                  size="small"
                  disabled={idx === 0}
                  icon={<ArrowUpOutlined />}
                  onClick={() => void move(item, -1)}
                />
                <Button
                  type="text"
                  size="small"
                  disabled={idx === rows.length - 1}
                  icon={<ArrowDownOutlined />}
                  onClick={() => void move(item, 1)}
                />
              </Space>
            ),
          },
          { title: '名称', dataIndex: 'label' },
          {
            title: '说明',
            dataIndex: 'remark',
            render: (v?: string) => v || '—',
          },
          {
            title: '状态',
            width: 90,
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
            title: '来源',
            width: 90,
            render: (_: unknown, item: DictItem) =>
              item.builtin ? <Tag style={{ fontSize: 11 }}>预置</Tag> : <Tag color="blue" style={{ fontSize: 11 }}>自定义</Tag>,
          },
          {
            title: '操作',
            width: 120,
            render: (_: unknown, item: DictItem) => (
              <Space size={4}>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(item)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除该选项？"
                  description="删除后使用该值的新建表单将不再出现此项，历史数据不受影响。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void remove(item.id)}
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
        title={editing?.id ? '编辑选项' : '新增选项'}
        okText="保存"
        cancelText="取消"
        onOk={() => void submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {meta?.parent && (
            <Form.Item name="parent" label={meta.parentLabel ?? '上级'}>
              <Select options={parentOptions.map((x) => ({ label: x, value: x }))} />
            </Form.Item>
          )}
          <Form.Item
            name="label"
            label="名称"
            rules={[{ required: true, message: '请输入选项名称' }]}
          >
            <Input placeholder="如：财政审计一处" />
          </Form.Item>
          <Form.Item name="remark" label="说明（可选）">
            <Input.TextArea rows={2} placeholder="如模板用途说明，鼠标悬停或列表展示时使用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
