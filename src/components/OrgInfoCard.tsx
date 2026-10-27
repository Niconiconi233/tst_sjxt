/**
 * 机构信息卡片：机关名称、机构代码可编辑并持久化，其余指标实时统计。
 *
 * 原先「机构与人员」页签里是写死的「XX 市审计局 / 11330000000000000X」加一张
 * 只读人员预览表 —— 预览的正是「审计人员名册」里维护的同一批人，属于重复内容。
 * 现在机构信息并入名册页，人员只在名册里维护一处：
 * - 机关名称、机构代码存 app_settings（全库共享的键值表）；
 * - 内设机构数、业务处室取自字典的「所属部门」；
 * - 在编人员数取自审计人员名册。
 */
import { useEffect, useState } from 'react';
import { App, Button, Descriptions, Form, Input, Modal, Space, Tag, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { repo } from '@/services/repository';
import { useDict } from '@/store/dictStore';
import { useAuditors } from '@/store/auditorStore';

export const ORG_NAME_KEY = 'org.name';
export const ORG_CODE_KEY = 'org.code';

export default function OrgInfoCard() {
  const { message } = App.useApp();
  const { labels } = useDict();
  const { all } = useAuditors();

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<{ name: string; code: string }>();

  useEffect(() => {
    let alive = true;
    void repo.loadSettings().then((s) => {
      if (alive) setSettings(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const departments = labels('department');
  const enabledCount = all.filter((x) => x.enabled).length;
  const orgName = settings[ORG_NAME_KEY] ?? '';
  const orgCode = settings[ORG_CODE_KEY] ?? '';

  const openEdit = () => {
    form.setFieldsValue({ name: orgName, code: orgCode });
    setEditing(true);
  };

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const name = (values.name ?? '').trim();
    const code = (values.code ?? '').trim();
    await repo.saveSetting(ORG_NAME_KEY, name);
    await repo.saveSetting(ORG_CODE_KEY, code);
    setSettings((s) => ({ ...s, [ORG_NAME_KEY]: name, [ORG_CODE_KEY]: code }));
    setEditing(false);
    message.success('机构信息已保存');
  };

  return (
    <>
      <Descriptions
        bordered
        size="small"
        column={2}
        styles={{ label: { width: 120 } }}
        title={
          <Space size={8}>
            <Typography.Text strong style={{ fontSize: 13 }}>
              机构信息
            </Typography.Text>
            <Button size="small" type="link" icon={<EditOutlined />} onClick={openEdit}>
              编辑
            </Button>
          </Space>
        }
      >
        <Descriptions.Item label="审计机关名称">
          {orgName || <span className="text-muted">未设置</span>}
        </Descriptions.Item>
        <Descriptions.Item label="机构代码">
          {orgCode ? <span className="mono">{orgCode}</span> : <span className="text-muted">未设置</span>}
        </Descriptions.Item>
        <Descriptions.Item label="内设机构数">{departments.length} 个</Descriptions.Item>
        <Descriptions.Item label="在编人员数">
          {enabledCount} 人
          {all.length !== enabledCount && (
            <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>
              （名册共 {all.length} 人，停用 {all.length - enabledCount} 人）
            </span>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="业务处室" span={2}>
          {departments.length ? (
            <Space size={4} wrap>
              {departments.map((d) => (
                <Tag key={d} style={{ fontSize: 11, marginInlineEnd: 0 }}>
                  {d}
                </Tag>
              ))}
            </Space>
          ) : (
            <span className="text-muted">尚未配置，请在「字典与模板配置 → 所属部门」中维护</span>
          )}
        </Descriptions.Item>
      </Descriptions>

      <Modal
        open={editing}
        title="编辑机构信息"
        okText="保存"
        cancelText="取消"
        onOk={() => void submit()}
        onCancel={() => setEditing(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="审计机关名称">
            <Input placeholder="如：XX 市审计局" />
          </Form.Item>
          <Form.Item name="code" label="机构代码">
            <Input placeholder="统一社会信用代码或机关内部编码" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
