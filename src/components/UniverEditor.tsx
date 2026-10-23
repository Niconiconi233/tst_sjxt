/**
 * Univer 在线编辑器封装（Word 文档 / Excel 表格通用）
 *
 * - 由 docType 决定创建 UNIVER_DOC（文档）或 UNIVER_SHEET（表格）实例；
 * - 内容以 Univer 快照 JSON 形式通过 Rust 命令落库；
 * - 导入正文等场景通过 resetKey 触发「整实例重建」。
 *
 * ─ Univer 实例的销毁铁律（踩过坑，勿改）──────────────────────────────
 * 1. 不能在 React 提交/卸载阶段同步 dispose()。UI 插件在容器 div 里
 *    挂了自己的 React root，同步 dispose 会与外层 React 抢 DOM，
 *    抛 removeChild NotFoundError，整页白屏。
 * 2. 新旧实例共存期间**绝对不能 dispose 旧实例**。dispose() 会释放
 *    渲染引擎的全局单例，只要旧实例的 dispose 发生在新实例「的一生中」
 *    任何时点，新实例就会变成「数据在模型里、画布永远空白且无法编辑」
 *    的空壳 —— Chrome 里「等新实例渲染完再销毁」侥幸可用，但 Tauri 的
 *    WKWebView 时序不同，同样复现（实测 2026-10-22）。
 *
 * 因此重建流程是：旧实例立刻摘出 DOM，放进「僵尸」列表**不销毁**；
 * 只在组件卸载（离开编辑页）时，才在宏任务里统一 dispose 全部实例。
 * 这个「先销毁、后建新」的顺序是历史上多文档切换一直正常的路径。
 * resetKey 必须用 prop 传入，不要给本组件加 React key（key 变化走
 * React 卸载路径，同样会崩）。
 * ─────────────────────────────────────────────────────────────────────
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Univer, UniverInstanceType } from '@univerjs/core';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula';

import DesignZhCN from '@univerjs/design/locale/zh-CN';
import UiZhCN from '@univerjs/ui/locale/zh-CN';
import SheetsZhCN from '@univerjs/sheets/locale/zh-CN';
import SheetsUiZhCN from '@univerjs/sheets-ui/locale/zh-CN';
import SheetsFormulaZhCN from '@univerjs/sheets-formula/locale/zh-CN';
import DocsUiZhCN from '@univerjs/docs-ui/locale/zh-CN';

import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/sheets-ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';
import { createInitialSnapshot, normalizeDocSnapshot } from '@/utils/univerSnapshot';
import type { DocEditorType } from '@/types';

const ZH_CN = 'zhCN';

type Dict = Record<string, unknown>;

function deepMerge(target: Dict, ...sources: Dict[]): Dict {
  for (const src of sources) {
    if (!src) continue;
    for (const [key, value] of Object.entries(src)) {
      const current = target[key];
      const bothObjects =
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        current &&
        typeof current === 'object' &&
        !Array.isArray(current);
      target[key] = bothObjects
        ? deepMerge({ ...(current as Dict) }, value as Dict)
        : value;
    }
  }
  return target;
}

/** 合并各子包的简体中文语言包 */
const ZH_LOCALES = deepMerge(
  {},
  DesignZhCN as unknown as Dict,
  UiZhCN as unknown as Dict,
  SheetsZhCN as unknown as Dict,
  SheetsUiZhCN as unknown as Dict,
  SheetsFormulaZhCN as unknown as Dict,
  DocsUiZhCN as unknown as Dict,
);

export interface UniverEditorHandle {
  /** 导出当前快照 JSON；实例未就绪时返回 null */
  getSnapshot: () => string | null;
}

interface Props {
  docType: DocEditorType;
  /** 已保存的快照 JSON（空串表示新建） */
  content: string;
  title: string;
  /** 变化时重建 Univer 实例（导入正文后使用），见文件头说明 */
  resetKey?: number;
  /** 用户产生编辑动作时回调（用于标记未保存） */
  onDirty?: () => void;
}

/** 一代 Univer 实例：引擎 + 专属容器 div */
interface UniverInstance {
  univer: Univer;
  div: HTMLDivElement;
  unitId: string | null;
}

/** 真正释放实例（只允许在组件卸载后的宏任务里调用） */
function disposeInstance(inst: UniverInstance) {
  try {
    inst.univer.dispose();
  } catch {
    /* 释放异常不影响页面 */
  }
  inst.div.innerHTML = '';
}

const UniverEditor = forwardRef<UniverEditorHandle, Props>(function UniverEditor(
  { docType, content, title, resetKey = 0, onDirty },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<UniverInstance | null>(null);
  /** 已摘出 DOM 的僵尸实例（与现役实例共存期间绝不 dispose，卸载时统一回收） */
  const pendingRef = useRef<Set<UniverInstance>>(new Set());
  const unitRef = useRef<{
    getSnapshot: () => unknown;
    getUnitId?: () => string;
  } | null>(null);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      try {
        const snap = unitRef.current?.getSnapshot();
        return snap ? JSON.stringify(snap) : null;
      } catch {
        return null;
      }
    },
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;

    const boot = () => {
      let snapshot: unknown;
      if (content) {
        try {
          snapshot = JSON.parse(content);
        } catch {
          snapshot = createInitialSnapshot(docType, title);
        }
      } else {
        snapshot = createInitialSnapshot(docType, title);
      }
      if (docType === 'document') snapshot = normalizeDocSnapshot(snapshot);

      // 上一代实例只摘 DOM，进僵尸列表，重叠期间绝不 dispose（见文件头铁律 2）
      const previous = instRef.current;
      instRef.current = null;
      unitRef.current = null;
      if (previous) {
        try {
          previous.div.remove();
        } catch {
          /* 容器可能已被 React 移除 */
        }
        pendingRef.current.add(previous);
      }

      const div = document.createElement('div');
      div.style.cssText = 'width:100%;height:100%;';
      host.appendChild(div);

      const univer = new Univer({
        locale: ZH_CN as never,
        locales: { [ZH_CN]: ZH_LOCALES } as never,
      });

      univer.registerPlugin(UniverRenderEnginePlugin);
      univer.registerPlugin(UniverFormulaEnginePlugin);
      univer.registerPlugin(UniverUIPlugin, {
        container: div,
        // header 承载菜单栏与工具栏，关掉会导致 Word 里既没有工具按钮也没有菜单
        header: true,
        toolbar: true,
        footer: true,
      });
      univer.registerPlugin(UniverDocsPlugin);
      univer.registerPlugin(UniverDocsUIPlugin);
      univer.registerPlugin(UniverSheetsPlugin);
      univer.registerPlugin(UniverSheetsUIPlugin);
      univer.registerPlugin(UniverSheetsFormulaPlugin);

      const type =
        docType === 'document'
          ? UniverInstanceType.UNIVER_DOC
          : UniverInstanceType.UNIVER_SHEET;

      const unit = univer.createUnit(type, snapshot as never) as unknown as {
        getSnapshot: () => unknown;
        getUnitId?: () => string;
      };
      unitRef.current = unit;
      instRef.current = { univer, div, unitId: unit.getUnitId?.() ?? null };
    };

    // 等一帧，确保容器已完成布局测量
    const raf = window.requestAnimationFrame(() => {
      if (disposed) return;
      try {
        boot();
        setError('');
      } catch (err) {
        console.error('[univer] 初始化失败', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    const markDirty = () => onDirty?.();
    host.addEventListener('keyup', markDirty);
    host.addEventListener('pointerup', markDirty);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      host.removeEventListener('keyup', markDirty);
      host.removeEventListener('pointerup', markDirty);
    };
    // content/resetKey 变化时重建实例（导入正文）；title/docType 变化同理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, title, resetKey]);

  // 组件卸载（离开编辑页）：此刻已无共存实例需要保护，在宏任务里统一
  // dispose 当前实例与全部僵尸实例。「先销毁、后建新」是历史上多文档
  // 切换一直正常的路径；不能在 React 提交阶段同步执行（见文件头铁律 1）。
  useEffect(
    () => () => {
      const inst = instRef.current;
      const pending = pendingRef.current;
      instRef.current = null;
      unitRef.current = null;
      if (!inst && pending.size === 0) return;
      window.setTimeout(() => {
        if (inst) disposeInstance(inst);
        for (const old of pending) disposeInstance(old);
        pending.clear();
      }, 0);
    },
    [],
  );

  return (
    <>
      <div className="univer-host" ref={hostRef} />
      {error && (
        <div className="office-error">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>在线编辑器加载失败</div>
          <div style={{ fontSize: 12 }}>{error}</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            可先返回台账，稍后重试；文件正文仍保存在本机数据库中。
          </div>
        </div>
      )}
    </>
  );
});

export default UniverEditor;
