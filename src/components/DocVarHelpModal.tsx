/**
 * 占位符说明弹窗：告诉使用者「在 Word 模板里怎么写、系统能填哪些字段」。
 * 模板库与组建审计组两处共用。
 */
import { useMemo, useState } from 'react';
import { Alert, App, Button, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { CopyOutlined, SearchOutlined } from '@ant-design/icons';
import { DOC_VAR_DEFS, varDefOf, type DocVarDef, type DocVarGroup } from '@/utils/auditDocVars';

const GROUP_ORDER: DocVarGroup[] = ['审计项目', '审计组', '文书信息', '机构信息'];

interface Props {
  open: boolean;
  onClose: () => void;
  /** 当前模板中检测到的字段名 */
  found?: string[];
  /** 模板名称 / 模板项名称，用于提示文案 */
  templateName?: string;
}

export default function DocVarHelpModal({ open, onClose, found, templateName }: Props) {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState('');

  const copy = async (def: DocVarDef) => {
    const token = `\${${def.key}}`;
    try {
      await navigator.clipboard.writeText(token);
      message.success(`已复制 ${token}`);
    } catch {
      message.info(`请手动输入：${token}`);
    }
  };

  const rows = useMemo(() => {
    const kw = keyword.trim();
    if (!kw) return DOC_VAR_DEFS;
    return DOC_VAR_DEFS.filter((d) =>
      `${d.key}${d.label}${d.desc}${d.sample}`.includes(kw),
    );
  }, [keyword]);

  const unknown = (found ?? []).filter((k) => !varDefOf(k));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          知道了
        </Button>
      }
      width={820}
      destroyOnHidden
      title="模板占位符说明"
    >
      <Typography.Paragraph style={{ fontSize: 12, color: '#5a6675', marginBottom: 12 }}>
        在 Word 模板需要填内容的位置写占位符，例如「关于对
        <Typography.Text code>$&#123;被审计单位&#125;</Typography.Text>
        <Typography.Text code>$&#123;审计期间&#125;</Typography.Text>
        进行审计的通知」。支持 <Typography.Text code>$&#123;字段&#125;</Typography.Text> 与{' '}
        <Typography.Text code>&#123;&#123;字段&#125;&#125;</Typography.Text> 两种写法；
        占位符可以写在正文、表格、页眉页脚、脚注里，也可以被 Word 拆成多段格式（替换后会
        保留原字体与字号）。替换只改文字，模板的页面设置、编号、表格线一概不动。
      </Typography.Paragraph>

      {found && (
        <Alert
          type={unknown.length ? 'warning' : 'success'}
          showIcon
          style={{ marginBottom: 12, fontSize: 12 }}
          message={
            <span>
              {templateName ? `「${templateName}」` : '当前模板'}
              检测到 {found.length} 个占位符
              {unknown.length ? `，其中 ${unknown.length} 个系统不认识：${unknown.join('、')}` : '，全部可自动填充'}
            </span>
          }
          description={
            unknown.length ? (
              <span style={{ fontSize: 12 }}>
                这些字段不会自动取值。请把模板里的名字改成下表中已有的字段，或在生成文书时手动填写。
              </span>
            ) : undefined
          }
        />
      )}

      <Input
        allowClear
        prefix={<SearchOutlined style={{ color: '#8a94a6' }} />}
        placeholder="搜索字段名、说明或示例"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {GROUP_ORDER.map((group) => {
        const data = rows.filter((d) => d.group === group);
        if (!data.length) return null;
        return (
          <div key={group} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2933', marginBottom: 6 }}>
              {group}
              <span style={{ fontWeight: 400, color: '#8a94a6', marginLeft: 6 }}>
                {data.length} 个字段
              </span>
            </div>
            <Table<DocVarDef>
              size="small"
              rowKey="key"
              dataSource={data}
              pagination={false}
              columns={[
                {
                  title: '占位符（点击复制）',
                  dataIndex: 'key',
                  width: 190,
                  render: (_: unknown, d: DocVarDef) => (
                    <Tag
                      color="blue"
                      style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}
                      onClick={() => void copy(d)}
                    >
                      <Space size={4}>
                        <CopyOutlined style={{ fontSize: 10 }} />
                        {`\${${d.key}}`}
                      </Space>
                    </Tag>
                  ),
                },
                {
                  title: '说明',
                  dataIndex: 'desc',
                  render: (_: unknown, d: DocVarDef) => (
                    <span style={{ fontSize: 12 }}>
                      <span style={{ color: '#1f2933' }}>{d.label}</span>
                      <span style={{ color: '#5a6675' }}> · {d.desc}</span>
                    </span>
                  ),
                },
                {
                  title: '取值示例',
                  dataIndex: 'sample',
                  width: 240,
                  render: (v: string) => (
                    <span style={{ fontSize: 11, color: '#5a6675' }}>{v}</span>
                  ),
                },
              ]}
            />
          </div>
        );
      })}

      <Alert
        type="info"
        showIcon
        style={{ fontSize: 12, marginTop: 4 }}
        message="提示：字段取值来自「机构与人员」「项目台账」与本次组建的审计组信息。系统取不到值的字段（如未配置副组长），会在生成界面上让你手动填写，留空则文中该处为空。"
      />
    </Modal>
  );
}
