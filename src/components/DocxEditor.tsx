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
 * 字体：文书普遍使用宋体/黑体/楷体/仿宋等中文字体，docx-editor 默认不携带
 * 中文字体（仅以 monospace 近似排版）。这里通过 customFonts() 注册本应用自带的
 * 中文字体文件（放在 public/fonts/ 下，见该目录的 README），保证中英文混排的
 * 度量与分页正确、字形按真实字体绘制。
 *
 * 自定义字体文件由使用者自行放入 public/fonts/，约定文件名如下：
 *   Songti.ttf / Songti-Bold.ttf   宋体（正文，SimSun）
 *   SimHei.ttf / SimHei-Bold.ttf   黑体（标题）
 *   KaiTi.ttf                      楷体
 *   FangSong.ttf                   仿宋
 * 缺哪个文件，对应字体就退回引擎默认（不影响打开，仅该字体字形不精确）。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  DocxEditor as DocxEditorComponent,
  useFonts,
  type DocxEditorRef,
} from '@docx-editor.dev/react';
import {
  customFonts,
  type FontUrlSource,
} from '@docx-editor.dev/core/editor';
import type { DocumentChange } from '@docx-editor.dev/core/contracts/editor';
import zhCN from '@docx-editor.dev/i18n/zh-CN';
import { fixEastAsiaSlots } from '@/utils/docxEastAsiaFix';
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

/**
 * 中文字体源清单。family 用 Word 里的中文字体名（与文书 docx 内声明的字体名一致），
 * 引擎按大小写折叠匹配，命中后即用对应 ttf/otf 精确排版。
 *
 * 只注册常规字重（400）：public/fonts/ 下没有 Songti-Bold.ttf / SimHei-Bold.ttf 时，
 * 配置了反而会因 fetch 到 SPA fallback 的 HTML 而报 4 个 malformed 失败，
 * 且让 customFonts 这个 origin 被跳过（a font origin failed and was skipped）。
 * 以后放入 Bold 文件后，把对应 700 字重条目加回来即可。
 *
 * 文件放在 public/fonts/ 下，URL 走相对路径（开发走 dev server，打包进 dist）。
 */
const CJK_FONT_SOURCES: FontUrlSource[] = [
  // 宋体（正文）
  { url: '/fonts/Songti.ttf', family: '宋体', weight: 400, style: 'normal' },
  { url: '/fonts/Songti.ttf', family: 'SimSun', weight: 400, style: 'normal' },
  // 黑体（标题）
  { url: '/fonts/SimHei.ttf', family: '黑体', weight: 400, style: 'normal' },
  { url: '/fonts/SimHei.ttf', family: 'SimHei', weight: 400, style: 'normal' },
  // 楷体
  { url: '/fonts/KaiTi.ttf', family: '楷体', weight: 400, style: 'normal' },
  { url: '/fonts/KaiTi.ttf', family: 'KaiTi', weight: 400, style: 'normal' },
  { url: '/fonts/KaiTi.ttf', family: '楷体_GB2312', weight: 400, style: 'normal' },
  // 仿宋
  { url: '/fonts/FangSong.ttf', family: '仿宋', weight: 400, style: 'normal' },
  { url: '/fonts/FangSong.ttf', family: 'FangSong', weight: 400, style: 'normal' },
  { url: '/fonts/FangSong.ttf', family: '仿宋_GB2312', weight: 400, style: 'normal' },
];

/**
 * 我们注册的中文字体 family 名（小写集合，用于大小写折叠匹配）。
 * 保存/导出时用于判断「用户把西文槽改成了中文字体」。
 */
const CJK_FONT_FAMILIES = new Set(
  CJK_FONT_SOURCES.map((s) => s.family.trim().toLowerCase()),
);

const DocxEditor = forwardRef<DocxEditorHandle, Props>(function DocxEditor(
  { content, title, resetKey = 0, onDirty },
  ref,
) {
  const innerRef = useRef<DocxEditorRef>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  /** 是否在输入法合成过程中 */
  const composingRef = useRef(false);
  /** 本次合成期间文档是否发生过变更（引擎是否吃到了候选词） */
  const composingChangedRef = useRef(false);
  /** 正在补写候选词（避免对补发的 compositionend 递归处理） */
  const patchingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  /** onReady 之前 onChange 的触发属于加载/初始化，不应标记为「未保存」 */
  const readyRef = useRef(false);

  // 注册中文字体（customFonts 放首位，优先于引擎默认替代字体）。
  // useFonts 稳定 resolver 身份，避免每次 render 新建函数导致编辑器整体重建。
  const fonts = useFonts(
    customFonts({
      sources: CJK_FONT_SOURCES,
      onFailure: (failure) =>
        console.warn('[DocxEditor] 字体加载失败', failure.request.family, failure.reason),
    }),
  );

  useImperativeHandle(ref, () => ({
    save: async () => {
      try {
        const buf = await innerRef.current?.save();
        if (!buf) return null;
        // 修复引擎「改字体不写 eastAsia 槽」的缺陷（详见 docxEastAsiaFix.ts）
        const bytes = new Uint8Array(buf);
        const fixed = await fixEastAsiaSlots(bytes);
        // 返回拷贝，避免 typed array 视图逃逸到引擎后被复用
        return fixed.slice().buffer;
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
    if (composingRef.current) composingChangedRef.current = true;
    if (!readyRef.current) return;
    onDirty?.();
  };

  /**
   * 中文输入法（IME）兼容处理。
   *
   * 引擎的输入法链路是「浏览器把候选词写进可编辑 DOM → compositionend 时比对 DOM 与
   * 文档模型并落库」。它在 Chrome 里正常，在 WKWebView（桌面端用的内核）里打不进中文，
   * 原因是引擎的 beforeinput 处理无条件调用了 preventDefault()，WebKit 会尊重该取消，
   * 候选词根本没进 DOM，后续比对自然什么都拿不到（英文不走合成链路，所以能正常输入）。
   *
   * 两道处理：
   * 1. 合成期间在捕获阶段截下 beforeinput，引擎就拿不到它、也就无法取消，
   *    浏览器得以把候选词写进 DOM（引擎合成期本就忽略该事件，不改变任何行为）。
   * 2. compositionend 后若文档没有任何变更（说明 1 没生效或内核另有差异），
   *    用原生编辑命令补写一次：触发 beforeinput 时引擎直接入队；若浏览器只改了 DOM，
   *    补发一次 compositionend，引擎的 DOM 比对会接管。两条路径都只写入一次。
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onBeforeInput = (e: Event) => {
      if (composingRef.current) e.stopPropagation();
    };
    const onStart = () => {
      composingRef.current = true;
      composingChangedRef.current = false;
    };
    const onEnd = (e: Event) => {
      composingRef.current = false;
      // 补发事件会再次冒泡到这里，用标志避免递归
      if (patchingRef.current) return;
      const data = (e as CompositionEvent).data ?? '';
      if (!data) return;
      setTimeout(() => {
        if (composingChangedRef.current) return;
        const pages = host.querySelector('[contenteditable="true"]');
        if (!pages) return;
        // 引擎没吃到候选词，走兜底。留一条日志便于在浏览器里定位内核差异
        console.warn('[DocxEditor] 输入法候选词未落库，启用兜底写入：', data);
        patchingRef.current = true;
        try {
          // ① 原生编辑命令：触发 beforeinput 时引擎直接入队；否则只改 DOM
          document.execCommand('insertText', false, data);
          // ② 补发一次 compositionend：让引擎的 DOM 比对接管 ① 写进 DOM 的文本
          pages.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data }));
          // ③ ①②都没生效时（内核连合成期事件都不派发），按当前选区直接落库
          if (!composingChangedRef.current) {
            const sel = innerRef.current?.snapshot()?.selection ?? null;
            if (sel) {
              innerRef.current?.exec({
                type: 'insertText',
                target: sel,
                text: data,
              } as unknown as Parameters<DocxEditorRef['exec']>[0]);
            }
          }
        } catch {
          /* 兜底写入失败不阻断编辑，用户可重试 */
        } finally {
          patchingRef.current = false;
        }
      }, 0);
    };

    host.addEventListener('beforeinput', onBeforeInput, true);
    host.addEventListener('compositionstart', onStart, true);
    host.addEventListener('compositionend', onEnd);
    return () => {
      host.removeEventListener('beforeinput', onBeforeInput, true);
      host.removeEventListener('compositionstart', onStart, true);
      host.removeEventListener('compositionend', onEnd);
    };
  }, []);

  const docSource = content && content.length > 0 ? content : ('blank' as const);

  return (
    <div className="docx-editor-host" ref={hostRef}>
      <DocxEditorComponent
        ref={innerRef}
        document={docSource}
        title={title}
        i18n={zhCN}
        colorMode="light"
        fonts={fonts}
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
