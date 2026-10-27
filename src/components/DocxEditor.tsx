/**
 * docx-editor 在线编辑器封装（仅 Word 文书）
 *
 * 用 https://github.com/eigenpal/docx-editor 的 React 适配器替换 Univer 的 Word 引擎。
 * 正文以「原始 DOCX 二进制」形态经 Rust 命令落库（base64 字符串），
 * 不再经过自研 docxImport/docxToSnapshot 的 OOXML→快照转换层。
 *
 * 契约：
 * - 加载：`document` prop 传 DOCX 字节（Uint8Array）；空内容传 'blank'。
 * - 保存：`ref.save()` 返回 Promise<ArrayBuffer | null>。
 * - 变化：`onChange` 回调（revision+identity 增量，不是字节），用于标记未保存。
 *
 * 注意：不传 fonts 时引擎以 monospace 近似排版（换行/分页是估算的），
 * 字形仍按真实字体绘制。后续可接 @docx-editor.dev/fonts-cjk 优化中英文混排。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  DocxEditor as DocxEditorComponent,
  type DocxEditorRef,
} from '@docx-editor.dev/react';
import type { DocumentChange } from '@docx-editor.dev/core/contracts/editor';
import zhCN from '@docx-editor.dev/i18n/zh-CN';
import '@docx-editor.dev/react/styles.css';

export interface DocxEditorHandle {
  /** 序列化当前文档为 DOCX 字节（ArrayBuffer），未就绪返回 null */
  save: () => Promise<ArrayBuffer | null>;
  /** 是否已就绪 */
  isReady: () => boolean;
}

interface Props {
  /** DOCX 字节；空串/空数组表示新建空白文档 */
  content: Uint8Array | null;
  title: string;
  /** 内容变化时重建（导入正文后使用） */
  resetKey?: number;
  /** 用户产生编辑动作时回调（用于标记未保存） */
  onDirty?: () => void;
}

const DocxEditor = forwardRef<DocxEditorHandle, Props>(function DocxEditor(
  { content, title, resetKey = 0, onDirty },
  ref,
) {
  const innerRef = useRef<DocxEditorRef>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  /** onReady 之前 onChange 的触发属于加载/初始化，不应标记为「未保存」 */
  const readyRef = useRef(false);

  useImperativeHandle(ref, () => ({
    save: async () => {
      try {
        return await innerRef.current?.save() ?? null;
      } catch {
        return null;
      }
    },
    isReady: () => ready,
  }));

  // 每次 resetKey 变化时，通过 ref 强制重载当前字节（导入正文后）
  useEffect(() => {
    if (!innerRef.current) return;
    readyRef.current = false;
    if (content && content.length > 0) {
      innerRef.current.load(content);
    } else {
      innerRef.current.load('blank');
    }
    // 仅在导入（resetKey 变化）时主动重载；正常打开由 document prop 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const onChange = (_change: DocumentChange) => {
    if (!readyRef.current) return;
    onDirty?.();
  };

  const docSource = content && content.length > 0 ? content : ('blank' as const);

  return (
    <div className="docx-editor-host">
      <DocxEditorComponent
        ref={innerRef}
        document={docSource}
        title={title}
        i18n={zhCN}
        colorMode="light"
        onReady={() => {
          readyRef.current = true;
          setReady(true);
          setError('');
        }}
        onChange={onChange}
      />
      {error && (
        <div className="office-error">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>在线编辑器加载失败</div>
          <div style={{ fontSize: 12 }}>{error}</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            可先返回台账，稍后重试；文件正文仍保存在本机数据库中。
          </div>
        </div>
      )}
    </div>
  );
});

export default DocxEditor;
