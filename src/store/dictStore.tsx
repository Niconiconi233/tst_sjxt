/**
 * 业务字典状态容器。
 *
 * 所有下拉选项（部门、职务、角色、审计类型、文件类别与模板、审计事项等）
 * 统一从后端字典表读取，页面不再保留硬编码选项。
 * 桌面端读 SQLite，浏览器预览回落 localStorage，由 repository 屏蔽差异。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { repo } from '@/services/repository';
import type { DictItem } from '@/types/dict';

interface DictValue {
  items: DictItem[];
  /** 字典是否已装载完成 */
  ready: boolean;
  /** 取某分类下已启用的条目（可指定上级值），按排序号升序 */
  options: (category: string, parent?: string) => DictItem[];
  /** 取某分类下已启用条目的名称数组，直接喂给 Select / Segmented */
  labels: (category: string, parent?: string) => string[];
  /** 取条目的备注（如模板说明） */
  remarkOf: (category: string, label: string, parent?: string) => string;
  /** 新增或更新条目 */
  save: (item: Partial<DictItem> & { category: string; label: string }) => Promise<void>;
  /** 删除条目 */
  remove: (id: string) => Promise<void>;
  /** 上移 / 下移 */
  move: (item: DictItem, delta: -1 | 1) => Promise<void>;
  /** 补回系统预置项 */
  restoreDefaults: () => Promise<void>;
  reload: () => Promise<void>;
}

const DictContext = createContext<DictValue | null>(null);

export function DictProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DictItem[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await repo.loadDict());
    } catch (err) {
      console.error('[dict] 装载字典失败', err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const options = useCallback(
    (category: string, parent?: string) =>
      items
        .filter(
          (x) =>
            x.category === category &&
            x.enabled &&
            (parent === undefined || x.parent === parent),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [items],
  );

  const labels = useCallback(
    (category: string, parent?: string) => options(category, parent).map((x) => x.label),
    [options],
  );

  const remarkOf = useCallback(
    (category: string, label: string, parent?: string) =>
      items.find(
        (x) =>
          x.category === category &&
          x.label === label &&
          (parent === undefined || x.parent === parent),
      )?.remark ?? '',
    [items],
  );

  const save = useCallback<DictValue['save']>(
    async (item) => {
      const base: DictItem = {
        id: item.id ?? '',
        category: item.category,
        parent: item.parent ?? '',
        label: item.label,
        remark: item.remark ?? '',
        sortOrder: item.sortOrder ?? options(item.category, item.parent).length,
        enabled: item.enabled ?? true,
        builtin: item.builtin ?? false,
      };
      await repo.saveDictItem(base);
      await reload();
    },
    [options, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await repo.deleteDictItem(id);
      await reload();
    },
    [reload],
  );

  const move = useCallback(
    async (item: DictItem, delta: -1 | 1) => {
      const list = options(item.category, item.parent);
      const idx = list.findIndex((x) => x.id === item.id);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= list.length) return;
      const swapped = [...list];
      swapped[idx] = { ...list[target], sortOrder: list[idx].sortOrder };
      swapped[target] = { ...list[idx], sortOrder: list[target].sortOrder };
      for (const x of swapped.slice(Math.min(idx, target), Math.max(idx, target) + 1)) {
        await repo.saveDictItem(x);
      }
      await reload();
    },
    [options, reload],
  );

  const restoreDefaults = useCallback(async () => {
    await repo.restoreDictDefaults();
    await reload();
  }, [reload]);

  const value = useMemo<DictValue>(
    () => ({
      items,
      ready,
      options,
      labels,
      remarkOf,
      save,
      remove,
      move,
      restoreDefaults,
      reload,
    }),
    [items, ready, options, labels, remarkOf, save, remove, move, restoreDefaults, reload],
  );

  return <DictContext.Provider value={value}>{children}</DictContext.Provider>;
}

export function useDict(): DictValue {
  const ctx = useContext(DictContext);
  if (!ctx) throw new Error('useDict 必须在 DictProvider 内使用');
  return ctx;
}
