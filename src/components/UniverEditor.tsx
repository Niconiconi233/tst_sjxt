/**
 * Univer 在线编辑器封装（Word 文档 / Excel 表格通用）
 *
 * - 由 docType 决定创建 UNIVER_DOC（文档）或 UNIVER_SHEET（表格）实例；
 * - 内容以 Univer 快照 JSON 形式通过 Rust 命令落库；
 * - 组件卸载时释放实例并清空容器，避免 React 严格模式下重复挂载残留。
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
  /** 用户产生编辑动作时回调（用于标记未保存） */
  onDirty?: () => void;
}

const UniverEditor = forwardRef<UniverEditorHandle, Props>(function UniverEditor(
  { docType, content, title, onDirty },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<Univer | null>(null);
  const unitRef = useRef<{ getSnapshot: () => unknown } | null>(null);
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

      const univer = new Univer({
        locale: ZH_CN as never,
        locales: { [ZH_CN]: ZH_LOCALES } as never,
      });
      univerRef.current = univer;

      univer.registerPlugin(UniverRenderEnginePlugin);
      univer.registerPlugin(UniverFormulaEnginePlugin);
      univer.registerPlugin(UniverUIPlugin, {
        container: host,
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

      unitRef.current = univer.createUnit(type, snapshot as never) as unknown as {
        getSnapshot: () => unknown;
      };
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
      unitRef.current = null;
      const univer = univerRef.current;
      univerRef.current = null;
      try {
        univer?.dispose();
      } catch {
        /* 释放异常不影响页面切换 */
      }
      host.innerHTML = '';
    };
    // content 仅在文档切换时变化，故意不加入依赖以免重建实例
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, title]);

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
