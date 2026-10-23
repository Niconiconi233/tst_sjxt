import { useMemo, useState } from 'react';
import { Alert, Button, Drawer, Input, Select, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { AuditorCell, BusyTag } from '@/components/BizTag';
import { useAuditors } from '@/store/auditorStore';
import { useDict } from '@/store/dictStore';
import type { Auditor } from '@/types';

interface Props {
  open: boolean;
  /** 已选人员 id（组内已有成员） */
  selectedIds: string[];
  /** 不可重复选择的人员（如已设为组长） */
  excludeIds?: string[];
  onCancel: () => void;
  onOk: (ids: string[]) => void;
}

/** 人员库选择器：按部门 / 资格 / 在办负荷筛选审计人员 */
export default function AuditorPicker({ open, selectedIds, excludeIds = [], onCancel, onOk }: Props) {
  const [keyword, setKeyword] = useState('');
  const [dept, setDept] = useState<string | undefined>();
  const [role, setRole] = useState<string | undefined>();
  const [draft, setDraft] = useState<string[]>(selectedIds);

  // 人员名册与可选角色均取自后端，可在「系统设置」中维护
  const { auditors, departments } = useAuditors();
  const { labels: dictLabels } = useDict();
  const roleOptions = dictLabels('role');

  const dataSource = useMemo(
    () =>
      auditors.filter((a) => {
        if (keyword && !`${a.name}${a.code}${a.department}${a.title}`.includes(keyword)) return false;
        if (dept && a.department !== dept) return false;
        if (role && !a.capableRoles.includes(role as any)) return false;
        return true;
      }),
    [auditors, keyword, dept, role],
  );

  const columns: TableProps<Auditor>['columns'] = [
    {
      title: '人员',
      key: 'auditor',
      width: 200,
      render: (_, r) => <AuditorCell auditor={r} />,
    },
    { title: '工号', dataIndex: 'code', width: 90, render: (v: string) => <span className="mono">{v}</span> },
    {
      title: '专业技术资格',
      dataIndex: 'qualification',
      width: 130,
      render: (v?: string) => (v ? <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>{v}</Tag> : '—'),
    },
    {
      title: '可担任角色',
      dataIndex: 'capableRoles',
      render: (v: Auditor['capableRoles']) => (
        <Space size={4} wrap>
          {v.map((r) => (
            <Tag key={r} color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>
              {r}
            </Tag>
          ))}
        </Space>
      ),
    },
    { title: '在办负荷', dataIndex: 'busyProjects', width: 90, render: (v: number) => <BusyTag count={v} /> },
  ];

  const openDrawer = () => setDraft(selectedIds);

  return (
    <Drawer
      title="人员库 · 选择审计组成员"
      width={880}
      open={open}
      onClose={onCancel}
      afterOpenChange={(v) => v && openDrawer()}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={() => onOk(draft)}>
            确定添加（{draft.filter((d) => !selectedIds.includes(d)).length} 人）
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12, fontSize: 12 }}
        message="优先选择在办负荷较低、且具备相应专业资格的人员。同一人员不宜同时在 3 个以上在办项目中担任主审。"
      />
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          placeholder="姓名 / 工号 / 部门"
          allowClear
          prefix={<SearchOutlined className="text-muted" />}
          style={{ width: 220 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Select
          placeholder="所属部门"
          allowClear
          style={{ width: 200 }}
          value={dept}
          onChange={setDept}
          options={departments.map((d) => ({ value: d, label: d }))}
        />
        <Select
          placeholder="可担任角色"
          allowClear
          style={{ width: 140 }}
          value={role}
          onChange={setRole}
          options={roleOptions.map((r) => ({ value: r, label: r }))}
        />
      </Space>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={dataSource}
        scroll={{ y: 460 }}
        pagination={false}
        rowSelection={{
          selectedRowKeys: draft,
          onChange: (keys) => setDraft(keys as string[]),
          getCheckboxProps: (r) => ({
            disabled: excludeIds.includes(r.id) && !selectedIds.includes(r.id),
          }),
        }}
      />
    </Drawer>
  );
}
