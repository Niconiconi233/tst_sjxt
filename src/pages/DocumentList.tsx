import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Dropdown,
  Empty,
  Input,
  Pagination,
  Row,
  Segmented,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import {
  AppstoreOutlined,
  BarsOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  FolderOutlined,
  HistoryOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { AuditorAvatar, DocStatusTag, SecretTag } from '@/components/BizTag';
import { useUserData } from '@/store/userData';
import { usePermission } from '@/utils/permissions';
import { docVersions } from '@/mock/data';
import { useDict } from '@/store/dictStore';
import { useAuditors } from '@/store/auditorStore';
import { bizColors } from '@/theme';
import type { AuditDocument, DocCategory, DocStatus } from '@/types';
const CAT_ICON: Record<string, React.ReactNode> = {
  审计方案类: <FileProtectOutlined />,
  审计通知类: <FileTextOutlined />,
  取证与底稿类: <FileExcelOutlined />,
  审计证据类: <FilePdfOutlined />,
  审计报告类: <FileTextOutlined />,
  整改与移送类: <SendOutlined />,
  廉政与纪律类: <FileProtectOutlined />,
  内部管理类: <FileTextOutlined />,
};

/** 流转示意里不展示「被退回」，其余节点按字典顺序 */
const isFlowNode = (s: string) => s !== '被退回';

export default function DocumentList() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();

  const { documents, projects, groups, removeDocument } = useUserData();
  const { labels } = useDict();
  const { auditorMap } = useAuditors();
  const { can, canWriteCategory } = usePermission();

  // 文件类别与状态均取自后端字典，可在系统设置中维护
  const categories = labels('doc_category');
  const statuses = labels('doc_status') as DocStatus[];
  const workflow = statuses.filter(isFlowNode);

  const [category, setCategory] = useState<string>('全部');
  const [keyword, setKeyword] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>();
  const [status, setStatus] = useState<DocStatus | undefined>();
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [preview, setPreview] = useState<AuditDocument | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 9;

  const filtered = useMemo(
    () =>
      documents.filter((d) => {
        if (category !== '全部' && d.category !== category) return false;
        if (projectId && d.projectId !== projectId) return false;
        if (status && d.status !== status) return false;
        if (keyword && !`${d.title}${d.code}${d.authorName}${d.template}`.includes(keyword)) return false;
        return true;
      }),
    [category, projectId, status, keyword],
  );

  const treeData = [
    {
      title: (
        <Space size={6}>
          <span>全部文件</span>
          <span className="text-muted" style={{ fontSize: 11 }}>
            {documents.length}
          </span>
        </Space>
      ),
      key: '全部',
      icon: <FolderOutlined />,
    },
    ...categories.map((c) => {
      const count = documents.filter((d) => d.category === c).length;
      return {
        title: (
          <Space size={6}>
            <span>{c}</span>
            <span className="text-muted" style={{ fontSize: 11 }}>
              {count}
            </span>
          </Space>
        ),
        key: c,
        icon: <FolderOutlined />,
      };
    }),
  ];

  const columns: TableProps<AuditDocument>['columns'] = [
    {
      title: '文件标题',
      dataIndex: 'title',
      width: 300,
      fixed: 'left',
      render: (_, r) => (
        <Space size={8} align="start">
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 3,
              background: bizColors.primaryLight,
              color: bizColors.primary,
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
              marginTop: 2,
            }}
          >
            {CAT_ICON[r.category]}
          </div>
          <div style={{ minWidth: 0 }}>
            <Typography.Link style={{ fontSize: 13, fontWeight: 500 }} onClick={() => setPreview(r)}>
              {r.title}
            </Typography.Link>
            <div className="text-muted mono" style={{ fontSize: 11, marginTop: 2 }}>
              {r.code} · {r.pages} 页{r.attachmentCount ? ` · ${r.attachmentCount} 件附件` : ''}
            </div>
          </div>
        </Space>
      ),
    },
    { title: '类别', dataIndex: 'category', width: 120 },
    { title: '模板', dataIndex: 'template', width: 150, ellipsis: true },
    {
      title: '所属项目 / 审计组',
      key: 'project',
      width: 230,
      render: (_, r) => (
        <div>
          <Tooltip title={r.projectName}>
            <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.projectName}
            </div>
          </Tooltip>
          <div className="text-muted" style={{ fontSize: 11 }}>
            {r.groupName ?? '未关联审计组'}
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 86,
      render: (v: DocStatus) => <DocStatusTag status={v} />,
    },
    {
      title: '密级',
      dataIndex: 'secretLevel',
      width: 70,
      render: (v: AuditDocument['secretLevel']) => <SecretTag level={v} />,
    },
    {
      title: '起草 / 复核',
      key: 'author',
      width: 140,
      render: (_, r) => (
        <div>
          <div style={{ fontSize: 12 }}>{r.authorName}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            复核：{r.reviewerName ?? '—'}
          </div>
        </div>
      ),
    },
    { title: '版本', dataIndex: 'version', width: 68 },
    { title: '更新时间', dataIndex: 'updatedAt', width: 130 },
    {
      title: '操作',
      key: 'action',
      width: 190,
      fixed: 'right',
      render: (_, r) => (
        <Space size={2}>
          {can('doc:edit') && canWriteCategory(r.category) && (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/documents/${r.id}/office`)}
            >
              编辑
            </Button>
          )}
          <Button type="link" size="small" onClick={() => setPreview(r)}>
            预览
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'version', label: '版本记录', icon: <HistoryOutlined /> },
                { key: 'submit', label: '提交复核', icon: <SendOutlined /> },
                { key: 'upload', label: '上传新版本', icon: <CloudUploadOutlined /> },
                { key: 'print', label: '打印 / 导出 PDF', icon: <PrinterOutlined /> },
                ...(can('doc:delete')
                  ? [
                      { type: 'divider' as const },
                      { key: 'delete', label: '作废', icon: <DeleteOutlined />, danger: true },
                    ]
                  : []),
              ],
              onClick: ({ key }) => {
                if (key === 'version') setPreview(r);
                else if (key === 'delete') {
                  modal.confirm({
                    title: '作废并删除该文件？',
                    content: `《${r.title}》及其正文内容将被删除，操作不可恢复。`,
                    okText: '确认删除',
                    okButtonProps: { danger: true },
                    cancelText: '取消',
                    onOk: () => {
                      removeDocument(r.id);
                      setPreview(null);
                      message.success('文件已删除');
                    },
                  });
                } else message.info(`「${key}」功能待接入后端逻辑`);
              },
            }}
          >
            <Button type="link" size="small">
              更多 <DownOutlined style={{ fontSize: 9 }} />
            </Button>
          </Dropdown>
        </Space>
      ),
    },
  ];

  const pagedGrid = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const workflowIndex = preview ? Math.max(0, workflow.indexOf(preview.status)) : 0;

  return (
    <div className="page">
      <Row gutter={12} style={{ alignItems: 'stretch' }}>
        {/* ---------- 左侧分类 ---------- */}
        <Col span={5}>
          <Card size="small" title="文件分类" styles={{ body: { padding: '8px 4px' } }} style={{ height: '100%' }}>
            <Tree
              showIcon
              blockNode
              defaultExpandAll
              treeData={treeData}
              selectedKeys={[category]}
              onSelect={(keys) => {
                setCategory((keys[0] as string) ?? '全部');
                setPage(1);
              }}
              style={{ fontSize: 13 }}
            />
            <div style={{ padding: '8px 12px', borderTop: '1px solid #eef1f5', marginTop: 8 }}>
              <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>
                按状态筛选
              </div>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Button
                  size="small"
                  type={status === undefined ? 'primary' : 'text'}
                  block
                  style={{ textAlign: 'left', fontSize: 12 }}
                  onClick={() => setStatus(undefined)}
                >
                  全部状态（{documents.length}）
                </Button>
                {statuses.map((s) => {
                  const c = documents.filter((d) => d.status === s).length;
                  return (
                    <Button
                      key={s}
                      size="small"
                      type={status === s ? 'primary' : 'text'}
                      block
                      style={{ textAlign: 'left', fontSize: 12 }}
                      onClick={() => {
                        setStatus(s);
                        setPage(1);
                      }}
                    >
                      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{s}</span>
                        <span style={{ opacity: 0.6 }}>{c}</span>
                      </span>
                    </Button>
                  );
                })}
              </Space>
            </div>
          </Card>
        </Col>

        {/* ---------- 右侧列表 ---------- */}
        <Col span={19}>
          <Card
            size="small"
            title={
              <Space size={8}>
                <FileProtectOutlined style={{ color: bizColors.primary }} />
                <span>审计工作文件台账</span>
                <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>
                  {category} · {filtered.length} 份
                </Tag>
              </Space>
            }
            extra={
              <Space>
                <Segmented
                  size="small"
                  value={view}
                  onChange={(v) => setView(v as 'table' | 'grid')}
                  options={[
                    { value: 'table', icon: <BarsOutlined /> },
                    { value: 'grid', icon: <AppstoreOutlined /> },
                  ]}
                />
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    setKeyword('');
                    setProjectId(undefined);
                    setStatus(undefined);
                    setCategory('全部');
                  }}
                >
                  重置
                </Button>
                {can('doc:create') ? (
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => navigate('/documents/new')}>
                    起草工作文件
                  </Button>
                ) : (
                  <Tooltip title="当前角色无可起草的文件类别">
                    <Button type="primary" size="small" icon={<PlusOutlined />} disabled>
                      起草工作文件
                    </Button>
                  </Tooltip>
                )}
              </Space>
            }
          >
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <div className="toolbar__left">
                <Input
                  placeholder="文件标题 / 编号 / 起草人"
                  allowClear
                  prefix={<SearchOutlined className="text-muted" />}
                  style={{ width: 240 }}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
                <Select
                  placeholder="所属项目"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 280 }}
                  value={projectId}
                  onChange={setProjectId}
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                />
                <Select
                  placeholder="文件状态"
                  allowClear
                  style={{ width: 130 }}
                  value={status}
                  onChange={setStatus}
                  options={statuses.map((s) => ({ value: s, label: s }))}
                />
                <Select
                  placeholder="审计组"
                  allowClear
                  style={{ width: 220 }}
                  options={groups.map((g) => ({ value: g.id, label: g.name }))}
                />
              </div>
              <div className="toolbar__right">
                <span className="text-muted" style={{ fontSize: 11 }}>
                  密级由高到低自动排序
                </span>
              </div>
            </div>

            {filtered.length === 0 ? (
              <Empty description="没有符合条件的文件">
                {can('doc:create') && (
                  <Button type="primary" onClick={() => navigate('/documents/new')}>
                    起草工作文件
                  </Button>
                )}
              </Empty>
            ) : view === 'table' ? (
              <Table
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={filtered}
                scroll={{ x: 1560 }}
                pagination={{
                  size: 'small',
                  showSizeChanger: true,
                  showTotal: (t, r) => `第 ${r[0]}-${r[1]} 条 / 共 ${t} 份文件`,
                  pageSize: 10,
                }}
              />
            ) : (
              <>
                <Row gutter={[12, 12]}>
                  {pagedGrid.map((d) => (
                    <Col span={8} key={d.id}>
                      <div className="doc-card" onClick={() => setPreview(d)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div className="doc-card__icon" style={{ background: bizColors.primaryLight, color: bizColors.primary }}>
                            {CAT_ICON[d.category]}
                          </div>
                          <Space size={4}>
                            <SecretTag level={d.secretLevel} />
                            <DocStatusTag status={d.status} />
                          </Space>
                        </div>
                        <Tooltip title={d.title}>
                          <div className="doc-card__title">{d.title}</div>
                        </Tooltip>
                        <div className="text-muted mono" style={{ fontSize: 11 }}>
                          {d.code}
                        </div>
                        <div className="text-muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.category} · {d.template}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderTop: '1px solid #eef1f5',
                            paddingTop: 8,
                          }}
                        >
                          <Space size={4}>
                            <AuditorAvatar auditor={auditorMap[d.authorId]} size={20} />
                            <span style={{ fontSize: 11 }}>{d.authorName}</span>
                          </Space>
                          <span className="text-muted" style={{ fontSize: 11 }}>
                            {d.version} · {d.pages}页
                          </span>
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <Pagination
                    size="small"
                    current={page}
                    pageSize={PAGE_SIZE}
                    total={filtered.length}
                    onChange={setPage}
                    showTotal={(t) => `共 ${t} 份文件`}
                  />
                </div>
              </>
            )}
          </Card>
        </Col>
      </Row>

      {/* ---------- 预览抽屉 ---------- */}
      <Drawer
        width={860}
        open={!!preview}
        onClose={() => setPreview(null)}
        destroyOnHidden
        title={
          preview && (
            <Space size={8} wrap>
              <FileProtectOutlined style={{ color: bizColors.primary }} />
              <span style={{ fontSize: 14 }}>{preview.title}</span>
              <DocStatusTag status={preview.status} />
              <SecretTag level={preview.secretLevel} />
            </Space>
          )
        }
        extra={
          <Space>
            <Button
              size="small"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => preview && navigate(`/documents/${preview.id}/office`)}
            >
              在线编辑
            </Button>
            <Button size="small" icon={<HistoryOutlined />}>
              版本记录
            </Button>
            <Button size="small" icon={<PrinterOutlined />} onClick={() => message.info('打印功能待接入后端逻辑')}>
              打印
            </Button>
            <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => message.success('已提交复核（演示）')}>
              提交复核
            </Button>
          </Space>
        }
      >
        {preview && (
          <div>
            <Steps
              size="small"
              current={workflowIndex}
              items={workflow.map((s) => ({ title: s }))}
              style={{ marginBottom: 16 }}
            />

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              <Space size={16} wrap className="text-muted" style={{ fontSize: 12 }}>
                <span>编号：{preview.code}</span>
                <span>模板：{preview.template}</span>
                <span>版本：{preview.version}</span>
                <span>页数：{preview.pages}</span>
                <span>附件：{preview.attachmentCount} 件</span>
              </Space>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }} className="text-muted">
              <Space size={8} style={{ fontSize: 12 }}>
                <AuditorAvatar auditor={auditorMap[preview.authorId]} size={22} />
                起草：{preview.authorName} · {preview.createdAt}
              </Space>
              <span style={{ fontSize: 12 }}>复核：{preview.reviewerName ?? '待指派'}</span>
              <span style={{ fontSize: 12 }}>所属项目：{preview.projectName}</span>
            </div>

            <Row gutter={16}>
              <Col span={15}>
                <div className="doc-preview">
                  <div className="doc-preview__title" style={{ width: '48%', margin: '0 auto 20px' }} />
                  <div className="doc-preview__line" style={{ width: '96%' }} />
                  <div className="doc-preview__line" style={{ width: '92%' }} />
                  <div className="doc-preview__line" style={{ width: '88%' }} />
                  <div className="doc-preview__line" style={{ width: '94%' }} />
                  <div style={{ height: 16 }} />
                  <div className="doc-preview__title" style={{ width: '30%' }} />
                  <div className="doc-preview__line" style={{ width: '90%' }} />
                  <div className="doc-preview__line" style={{ width: '96%' }} />
                  <div className="doc-preview__line" style={{ width: '84%' }} />
                  <div className="doc-preview__line" style={{ width: '70%' }} />
                  <div style={{ height: 16 }} />
                  <div className="doc-preview__title" style={{ width: '34%' }} />
                  <div className="doc-preview__line" style={{ width: '93%' }} />
                  <div className="doc-preview__line" style={{ width: '88%' }} />
                  <div className="doc-preview__line" style={{ width: '76%' }} />
                  <div style={{ textAlign: 'center', marginTop: 24 }} className="text-muted">
                    <span style={{ fontSize: 11 }}>
                      第 1 页 / 共 {preview.pages} 页 · 正文内容接入后端后渲染
                    </span>
                  </div>
                </div>
                <AlertHint />
              </Col>
              <Col span={9}>
                <Typography.Title level={5} style={{ fontSize: 13, marginTop: 0 }}>
                  版本与流转
                </Typography.Title>
                <Timeline
                  items={docVersions.map((v) => ({
                    color: v.action === '复核' ? 'orange' : v.action === '创建' ? 'green' : 'blue',
                    children: (
                      <div>
                        <div style={{ fontSize: 12 }}>
                          <Tag style={{ fontSize: 10, marginInlineEnd: 4 }}>
                            {v.version}
                          </Tag>
                          {v.action} · {v.operator}
                        </div>
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {v.time}
                        </div>
                        {v.comment && (
                          <div style={{ fontSize: 11, color: '#41546b', marginTop: 2 }}>{v.comment}</div>
                        )}
                      </div>
                    ),
                  }))}
                />
                <div style={{ marginTop: 12 }}>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>
                    关联底稿 / 证据
                  </div>
                  <Space size={4} wrap>
                    {preview.refCodes.length ? (
                      preview.refCodes.map((c) => (
                        <Tag key={c} style={{ fontSize: 11, marginInlineEnd: 0 }}>
                          {c}
                        </Tag>
                      ))
                    ) : (
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        无
                      </span>
                    )}
                  </Space>
                </div>
              </Col>
            </Row>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function AlertHint() {
  return (
    <div
      style={{
        marginTop: 10,
        padding: '8px 10px',
        background: '#fff8e6',
        border: '1px solid #f0d9a8',
        borderRadius: 4,
        fontSize: 11,
        color: '#8a6414',
        display: 'flex',
        gap: 6,
        alignItems: 'flex-start',
      }}
    >
      <Badge status="warning" />
      <span>
        涉密文件仅限在审计组内网终端查看，禁止导出、截屏或外发。当前为 UI 演示内容，非真实审计资料。
      </span>
    </div>
  );
}
