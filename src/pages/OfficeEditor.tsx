import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  CloudSyncOutlined,
  SaveOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import UniverEditor, { type UniverEditorHandle } from '@/components/UniverEditor';
import { useAuth } from '@/store/authStore';
import { useUserData } from '@/store/userData';
import { repo } from '@/services/repository';
import { usePermission } from '@/utils/permissions';
import { DOC_TYPE_LABEL, resolveDocType } from '@/utils/docType';
import '@/styles/office.css';

/**
 * 在线编辑页：Word / Excel 双形态，正文以 Univer 快照形式
 * 经 Rust 命令持久化到本机 SQLite。
 */
export default function OfficeEditor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { currentUser, storageMode } = useAuth();
  const { documents, updateDocument, ready } = useUserData();

  const doc = documents.find((d) => d.id === id);
  const editorRef = useRef<UniverEditorHandle>(null);
  const { can, canWriteCategory } = usePermission();
  /** 组员只能编辑工作底稿/事实确认书，其余文件仅可查看 */
  const editable = !!doc && can('doc:edit') && canWriteCategory(doc.category);

  const [content, setContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string>(doc?.updatedAt ?? '');

  const docType = doc ? resolveDocType(doc) : 'sheet';

  // 装载已保存的正文快照
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    setContent(null);
    repo
      .getDocumentContent(doc.id)
      .then((raw) => alive && setContent(raw))
      .catch(() => alive && setContent(''));
    return () => {
      alive = false;
    };
    // 仅在文件 id 变化时重新装载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  const save = useCallback(
    async (silent = false) => {
      if (!doc || !currentUser) return;
      const snapshot = editorRef.current?.getSnapshot();
      if (!snapshot) {
        if (!silent) message.warning('编辑器尚未就绪，请稍候再保存');
        return;
      }
      setSaving(true);
      try {
        const now = dayjs().format('YYYY-MM-DD HH:mm');
        await repo.saveDocumentContent(currentUser.id, doc.id, snapshot, now);
        updateDocument(doc.id, { hasContent: true, updatedAt: now });
        setSavedAt(now);
        setDirty(false);
        if (!silent) message.success('已保存到本机数据库');
      } catch (err) {
        console.error(err);
        message.error('保存失败，请检查本机数据文件是否可写');
      } finally {
        setSaving(false);
      }
    },
    [doc, currentUser, message, updateDocument],
  );

  // 快捷键保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const back = () => {
    if (!dirty) {
      navigate('/documents');
      return;
    }
    modal.confirm({
      title: '有未保存的修改',
      content: '离开前是否保存到本机数据库？',
      okText: '保存并离开',
      cancelText: '放弃修改',
      onOk: async () => {
        await save(true);
        navigate('/documents');
      },
      onCancel: () => navigate('/documents'),
    });
  };

  /** 无编辑权限时，从快照里抽取纯文本做只读查看 */
  const plainText = (() => {
    if (!content) return '';
    try {
      const snap = JSON.parse(content) as { body?: { dataStream?: unknown } };
      const ds = snap?.body?.dataStream;
      if (typeof ds === 'string') return ds.replace(/\r\n?/g, '\n').trim();
    } catch {
      /* 非 JSON 快照按空处理 */
    }
    return '';
  })();

  if (ready && !doc) {
    return (
      <div className="office-page office-page--empty">
        <WarningOutlined style={{ fontSize: 28, color: '#b7791f' }} />
        <div>未找到该工作文件，可能已被删除。</div>
        <Button onClick={() => navigate('/documents')}>返回文件台账</Button>
      </div>
    );
  }

  return (
    <div className="office-page">
      <header className="office-header">
        <Space size={10} align="center">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={back}>
            返回台账
          </Button>
          <div className="office-header__title">
            <div className="office-header__name">
              <Typography.Text ellipsis style={{ maxWidth: 460 }}>
                {doc?.title ?? '正在加载…'}
              </Typography.Text>
            </div>
            <div className="office-header__meta">
              <span>{doc?.code}</span>
              <span className="office-dot" />
              <span>{doc?.projectName}</span>
              <span className="office-dot" />
              <span>{doc?.category}</span>
            </div>
          </div>
        </Space>

        <Space size={12} align="center">
          <Tag color={docType === 'sheet' ? 'green' : 'blue'} style={{ marginInlineEnd: 0 }}>
            {DOC_TYPE_LABEL[docType]}
          </Tag>
          <Tooltip title={storageMode === 'sqlite' ? '写入本机 SQLite 数据库' : '浏览器预览模式，暂存本机'}>
            <span className="office-status">
              <CloudSyncOutlined />
              {saving ? '保存中…' : dirty ? '有未保存修改' : savedAt ? `已保存 ${savedAt}` : '尚未保存'}
            </span>
          </Tooltip>
          {editable ? (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={() => void save()}
            >
              保存
            </Button>
          ) : (
            <Tooltip title={`当前角色「${currentUser?.role ?? '—'}」只能编写工作底稿与事实确认书`}>
              <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                只读查看
              </Tag>
            </Tooltip>
          )}
        </Space>
      </header>

      <div className="office-body">
        {content === null ? (
          <div className="office-loading">
            <Spin />
            <span>正在装载正文…</span>
          </div>
        ) : editable ? (
          <UniverEditor
            ref={editorRef}
            docType={docType}
            content={content}
            title={doc?.title ?? '未命名文件'}
            onDirty={() => setDirty(true)}
          />
        ) : (
          <div className="office-readonly">
            <div className="office-readonly__bar">
              <WarningOutlined />
              当前角色为「{currentUser?.role ?? '—'}」，仅可编写工作底稿与事实确认书，
              本文件为只读查看，不能修改或另存。
            </div>
            {plainText ? (
              <pre className="office-readonly__body">{plainText}</pre>
            ) : (
              <div className="office-readonly__empty">该文件尚未录入正文内容</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
