/**
 * 审计人员名册状态容器。
 *
 * 选人、组长指派、文件编制人 / 复核人统一从后端名册表读取，
 * 页面不再保留硬编码名单。桌面端读 SQLite，浏览器预览回落 localStorage，
 * 由 repository 屏蔽差异。
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
import type { Auditor } from '@/types';
import type { AuditorRecord } from '@/types/auditor';

/** 名册记录 → 界面使用的 Auditor（性别、角色收敛到联合类型，其余字段直通） */
function toAuditor(r: AuditorRecord): Auditor {
  return {
    ...r,
    gender: r.gender === '女' ? '女' : '男',
    capableRoles: r.capableRoles as Auditor['capableRoles'],
  };
}

interface AuditorValue {
  /** 启用中的人员，按排序号升序 —— 界面取数入口 */
  auditors: Auditor[];
  /** 按 id 索引，供头像、姓名回显使用 */
  auditorMap: Record<string, Auditor>;
  /** 全量记录（含停用），供配置页维护 */
  all: AuditorRecord[];
  ready: boolean;
  /** 名册中出现的部门（已去重） */
  departments: string[];
  save: (item: Partial<AuditorRecord> & { name: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (item: AuditorRecord, delta: -1 | 1) => Promise<void>;
  restoreDefaults: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuditorContext = createContext<AuditorValue | null>(null);

export function AuditorProvider({ children }: { children: ReactNode }) {
  const [all, setAll] = useState<AuditorRecord[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      setAll(await repo.loadAuditors());
    } catch (err) {
      console.error('[auditors] 装载人员名册失败', err);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sorted = useMemo(
    () => [...all].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [all],
  );

  const auditors = useMemo(
    () => sorted.filter((x) => x.enabled).map(toAuditor),
    [sorted],
  );

  const auditorMap = useMemo(
    () => Object.fromEntries(auditors.map((a) => [a.id, a])),
    [auditors],
  );

  const departments = useMemo(
    () => [...new Set(auditors.map((a) => a.department).filter(Boolean))],
    [auditors],
  );

  const save = useCallback<AuditorValue['save']>(
    async (item) => {
      const base: AuditorRecord = {
        id: item.id ?? '',
        name: item.name,
        code: item.code ?? '',
        gender: item.gender ?? '男',
        department: item.department ?? '',
        title: item.title ?? '',
        qualification: item.qualification ?? '',
        phone: item.phone ?? '',
        email: item.email ?? '',
        capableRoles: item.capableRoles ?? ['审计员'],
        busyProjects: item.busyProjects ?? 0,
        avatarColor: item.avatarColor ?? '#1a5fb4',
        sortOrder: item.sortOrder ?? sorted.length,
        enabled: item.enabled ?? true,
        builtin: item.builtin ?? false,
      };
      await repo.saveAuditor(base);
      await reload();
    },
    [sorted.length, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await repo.deleteAuditor(id);
      await reload();
    },
    [reload],
  );

  const move = useCallback(
    async (item: AuditorRecord, delta: -1 | 1) => {
      const idx = sorted.findIndex((x) => x.id === item.id);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= sorted.length) return;
      const swapped = [...sorted];
      swapped[idx] = { ...sorted[target], sortOrder: sorted[idx].sortOrder };
      swapped[target] = { ...sorted[idx], sortOrder: sorted[target].sortOrder };
      for (const x of swapped.slice(Math.min(idx, target), Math.max(idx, target) + 1)) {
        await repo.saveAuditor(x);
      }
      await reload();
    },
    [sorted, reload],
  );

  const restoreDefaults = useCallback(async () => {
    await repo.restoreDefaultAuditors();
    await reload();
  }, [reload]);

  const value = useMemo<AuditorValue>(
    () => ({
      auditors,
      auditorMap,
      all,
      ready,
      departments,
      save,
      remove,
      move,
      restoreDefaults,
      reload,
    }),
    [auditors, auditorMap, all, ready, departments, save, remove, move, restoreDefaults, reload],
  );

  return <AuditorContext.Provider value={value}>{children}</AuditorContext.Provider>;
}

export function useAuditors(): AuditorValue {
  const ctx = useContext(AuditorContext);
  if (!ctx) throw new Error('useAuditors 必须在 AuditorProvider 内使用');
  return ctx;
}
