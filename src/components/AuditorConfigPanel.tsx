/**
 * 审计人员名册配置面板。
 *
 * 维护选人、组长指派、文件编制人 / 复核人的人员来源。
 * 全部读写经过 repository → Rust 名册表，改动即时生效于所有页面。
 */
import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
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
import { useAuditors } from '@/store/auditorStore';
import { useDict } from '@/store/dictStore';
import type { AuditorRecord } from '@/types/auditor';

const GENDER_OPTIONS = [
  { value: '男', label: '男' },
  { value: '女', label: '女' },
];

const AVATAR_COLORS = [
  '#1a5fb4',
  '#0f7b8a',
  '#7a3fa8',
  '#b7791f',
  '#1a7f4b',
  '#b42318',
  '#41546b',
];

interface Editing extends Omit<AuditorRecord, 'id'> {
  id?: string;
}

function blankRecord(sortOrder: number): Editing {
  return {
    name: '',
    code: '',
    gender: '男',
    department: '',
    title: '',
    qualification: '',
    phone: '',
    email: '',
    capableRoles: ['审计员'],
    busyProjects: 0,
    avatarColor: AVATAR_COLORS[0],
    sortOrder,
    enabled: true,
    builtin: false,
  };
}

export default function AuditorConfigPanel() {
  const { all, ready, save, remove, move, restoreDefaults } = useAuditors();
  const { labels } = useDict();
  const { message } = App.useApp();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  // 部门 / 职务 / 角色取自字典，保证名册与下拉框口径一致
  const departments = labels('department');
  const titles = labels('title');
  const roles = labels('role');

  const rows = useMemo(
    () =>
      [...all]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
        .filter((a) =>
          keyword
            ? `${a.name}${a.code}${a.department}${a.title}`.includes(keyword)
            : true,
        ),
    [all, keyword],
  );

  const openCreate = () => {
    const next = blankRecord(all.length);
    setEditing(next);
    form.setFieldsValue(next);
  };

  const openEdit = (item: AuditorRecord) => {
    const next: Editing = { ...item };
    setEditing(next);
    form.setFieldsValue(next);
  };

  const submit = async () => {
    if (!editing) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    if (all.some((x) => x.name === values.name && x.id !== editing.id)) {
      message.warning('名册中已存在同名人员，建议用部门区分或改用全名');
      return;
    }
    await save({
      ...editing,
      ...values,
      capableRoles: values.capableRoles?.length ? values.capableRoles : ['审计员'],
    });
    message.success(editing.id ? '已保存' : '已新增');
    setEditing(null);
  };

  const toggleEnabled = async (item: AuditorRecord) => {
    await save({ ...item, enabled: !item.enabled });
    message.success(item.enabled ? '已停用' : '已启用');
  };

  return (
    <div>
      <Typography.Paragraph style={{ fontSize: 12, color: '#5a6675', marginBottom: 12 }}>
        维护审计人员名册。选人、组长指派、文件编制人与复核人全部取自这里。
        停用后该人员不再出现在选人列表，已参与的项目、审计组与文件不受影响。
        改动即时写入本机数据库，所有账户共用。
      </Typography.Paragraph>

      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          placeholder="姓名 / 工号 / 部门 / 职务"
          allowClear
          style={{ width: 220 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增人员
        </Button>
        <Tooltip title="补回被删除的预置人员（按工号匹配），已存在的不重复添加">
          <Button icon={<UndoOutlined />} onClick={() => void restoreDefaults()}>
            恢复预置人员
          </Button>
        </Tooltip>
        <span style={{ fontSize: 12, color: '#8a94a6' }}>
          共 {all.length} 人，其中已停用 {all.filter((x) => !x.enabled).length} 人
        </span>
      </Space>

      <Table
        size="small"
        rowKey="id"
        loading={!ready}
        dataSource={rows}
        pagination={false}
        scroll={{ y: 400 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="名册为空，点击「新增人员」添加，或先恢复预置人员"
            />
          ),
        }}
        columns={[
          {
            title: '排序',
            width: 90,
            render: (_: unknown, item: AuditorRecord, idx: number) => (
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
          {
            title: '姓名',
            dataIndex: 'name',
            width: 90,
            render: (v: string, r: AuditorRecord) => (
              <Space size={6}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: r.avatarColor,
                    color: '#fff',
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {v.slice(-2)}
                </span>
                {v}
              </Space>
            ),
          },
          { title: '工号', dataIndex: 'code', width: 90 },
          { title: '部门', dataIndex: 'department', width: 170 },
          { title: '职务', dataIndex: 'title', width: 100 },
          {
            title: '资格',
            dataIndex: 'qualification',
            width: 120,
            render: (v?: string) => (v ? <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>{v}</Tag> : '—'),
          },
          {
            title: '可担任角色',
            dataIndex: 'capableRoles',
            render: (v: string[]) =>
              v?.length ? (
                <Space size={4} wrap>
                  {v.map((r) => (
                    <Tag key={r} color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>
                      {r}
                    </Tag>
                  ))}
                </Space>
              ) : (
                '—'
              ),
          },
          { title: '在办', dataIndex: 'busyProjects', width: 60 },
          {
            title: '状态',
            width: 90,
            render: (_: unknown, item: AuditorRecord) => (
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
            render: (_: unknown, item: AuditorRecord) =>
              item.builtin ? (
                <Tag style={{ fontSize: 11 }}>预置</Tag>
              ) : (
                <Tag color="blue" style={{ fontSize: 11 }}>
                  自定义
                </Tag>
              ),
          },
          {
            title: '操作',
            width: 120,
            render: (_: unknown, item: AuditorRecord) => (
              <Space size={4}>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(item)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认从名册中删除该人员？"
                  description="删除后新建表单无法再选到此人；已归档的历史数据不受影响。"
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
        title={editing?.id ? '编辑人员' : '新增人员'}
        okText="保存"
        cancelText="取消"
        width={640}
        onOk={() => void submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入人员姓名' }]}
          >
            <Input placeholder="如：陈志远" />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="code" label="工号 / 执法证号" style={{ flex: 1 }}>
              <Input placeholder="如：SJ-1001" />
            </Form.Item>
            <Form.Item name="gender" label="性别" style={{ width: 110 }}>
              <Select options={GENDER_OPTIONS} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="department" label="所属部门" style={{ flex: 1 }}>
              <Select
                allowClear
                showSearch
                placeholder="选择部门（可在「字典与模板配置」中维护）"
                options={departments.map((d) => ({ value: d, label: d }))}
              />
            </Form.Item>
            <Form.Item name="title" label="职务" style={{ flex: 1 }}>
              <Select
                allowClear
                showSearch
                placeholder="选择职务"
                options={titles.map((t) => ({ value: t, label: t }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="qualification" label="专业技术资格（可选）">
            <Input placeholder="如：高级审计师" />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="phone" label="联系电话" style={{ flex: 1 }}>
              <Input placeholder="如：13800000000" />
            </Form.Item>
            <Form.Item name="email" label="电子邮箱" style={{ flex: 1 }}>
              <Input placeholder="如：user1@audit.gov.cn" />
            </Form.Item>
          </Space>
          <Form.Item name="capableRoles" label="可担任角色">
            <Select
              mode="multiple"
              allowClear
              placeholder="选择该人员可担任的组内角色"
              options={roles.map((r) => ({ value: r, label: r }))}
            />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="busyProjects" label="在办项目数" style={{ width: 140 }}>
              <InputNumber min={0} max={99} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="avatarColor" label="头像配色" style={{ width: 160 }}>
              <Select
                options={AVATAR_COLORS.map((c) => ({
                  value: c,
                  label: (
                    <Space size={6}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: c,
                          display: 'inline-block',
                        }}
                      />
                      {c}
                    </Space>
                  ),
                }))}
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
