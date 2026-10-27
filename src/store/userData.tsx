import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { UserDataset } from '@/mock/seed';
import { useAuth } from '@/store/authStore';
import { persistDataset, repo } from '@/services/repository';
import type { AuditDocument, AuditGroup, AuditProject, TodoItem } from '@/types';

const EMPTY_DATASET: UserDataset = { projects: [], groups: [], documents: [], todos: [] };

interface UserDataValue extends UserDataset {
  /** 当前账户数据是否已从本机数据库装载完成 */
  ready: boolean;
  addProject: (p: AuditProject) => void;
  updateProject: (id: string, patch: Partial<AuditProject>) => void;
  removeProject: (id: string) => void;
  addGroup: (g: AuditGroup) => void;
  updateGroup: (id: string, patch: Partial<AuditGroup>) => void;
  removeGroup: (id: string) => void;
  addDocument: (d: AuditDocument) => void;
  /**
   * 新建文件并同时写入正文（模板生成文书用）。
   * 必须走这一个方法：Rust 侧 insert_document 是 INSERT OR REPLACE，
   * 先插行再写正文才安全；addDocument 的持久化是即发即忘的，紧接着写正文会丢。
   */
  addDocumentWithContent: (d: AuditDocument, content: string) => Promise<void>;
  updateDocument: (id: string, patch: Partial<AuditDocument>) => void;
  removeDocument: (id: string) => void;
  addTodo: (t: TodoItem) => void;
  removeTodo: (id: string) => void;
  /** 重置为账户初始数据 */
  resetDataset: () => Promise<void>;
}

const UserDataContext = createContext<UserDataValue | null>(null);

/**
 * 按登录账户隔离的业务数据仓库。
 *
 * 数据来源：Tauri 环境下由 Rust 侧从 SQLite 读取（表内以 owner_id 分片）；
 * 浏览器预览环境回落到 localStorage 的 `agms.data.<userId>`。
 * 所有写操作在更新内存状态的同时同步落库。
 */
export function UserDataProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? '';

  const [state, setState] = useState<{ ownerId: string; dataset: UserDataset; ready: boolean }>({
    ownerId: '',
    dataset: EMPTY_DATASET,
    ready: false,
  });

  // 供事件回调读取最新数据（避免在 setState 更新函数里做副作用）
  const dataRef = useRef(state.dataset);
  dataRef.current = state.dataset;

  const ownerRef = useRef(userId);
  ownerRef.current = userId;

  // 账户切换：从持久层重新装载该账户的数据
  useEffect(() => {
    let alive = true;
    if (!currentUser) {
      setState({ ownerId: '', dataset: EMPTY_DATASET, ready: true });
      return;
    }
    setState((prev) => (prev.ownerId === currentUser.id ? { ...prev, ready: false } : { ownerId: currentUser.id, dataset: EMPTY_DATASET, ready: false }));
    repo
      .loadDataset(currentUser)
      .then((ds) => {
        if (!alive) return;
        setState({ ownerId: currentUser.id, dataset: ds, ready: true });
      })
      .catch((err) => {
        console.error('[userData] 装载数据失败', err);
        if (alive) setState({ ownerId: currentUser.id, dataset: EMPTY_DATASET, ready: true });
      });
    return () => {
      alive = false;
    };
    // 仅在账户 id 变化时重新装载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 浏览器降级模式下由这里统一落盘
  useEffect(() => {
    if (!currentUser || state.ownerId !== currentUser.id || !state.ready) return;
    persistDataset(currentUser.id, state.dataset);
  }, [state, currentUser]);

  const patchDataset = useCallback(
    (updater: (d: UserDataset) => UserDataset) =>
      setState((prev) => ({ ...prev, dataset: updater(prev.dataset) })),
    [],
  );

  /* ---------------- 审计项目 ---------------- */

  const addProject = useCallback(
    (p: AuditProject) => {
      patchDataset((d) => ({ ...d, projects: [p, ...d.projects] }));
      void repo.putProject(ownerRef.current, p, true);
    },
    [patchDataset],
  );

  const updateProject = useCallback(
    (id: string, patch: Partial<AuditProject>) => {
      const cur = dataRef.current.projects.find((p) => p.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      patchDataset((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? next : p)) }));
      void repo.putProject(ownerRef.current, next, false);
    },
    [patchDataset],
  );

  const removeProject = useCallback(
    (id: string) => {
      patchDataset((d) => ({
        ...d,
        projects: d.projects.filter((p) => p.id !== id),
        groups: d.groups.filter((g) => g.projectId !== id),
        documents: d.documents.filter((x) => x.projectId !== id),
      }));
      void repo.removeProject(ownerRef.current, id);
    },
    [patchDataset],
  );

  /* ---------------- 审计组 ---------------- */

  const addGroup = useCallback(
    (g: AuditGroup) => {
      const proj = dataRef.current.projects.find((p) => p.id === g.projectId);
      patchDataset((d) => ({
        ...d,
        groups: [g, ...d.groups],
        projects: d.projects.map((p) =>
          p.id === g.projectId ? { ...p, groupCount: p.groupCount + 1 } : p,
        ),
      }));
      void repo.putGroup(ownerRef.current, g, true);
      if (proj) void repo.putProject(ownerRef.current, { ...proj, groupCount: proj.groupCount + 1 }, false);
    },
    [patchDataset],
  );

  const updateGroup = useCallback(
    (id: string, patch: Partial<AuditGroup>) => {
      const cur = dataRef.current.groups.find((g) => g.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      patchDataset((d) => ({ ...d, groups: d.groups.map((g) => (g.id === id ? next : g)) }));
      void repo.putGroup(ownerRef.current, next, false);
    },
    [patchDataset],
  );

  const removeGroup = useCallback(
    (id: string) => {
      const group = dataRef.current.groups.find((g) => g.id === id);
      const proj = group && dataRef.current.projects.find((p) => p.id === group.projectId);
      patchDataset((d) => ({
        ...d,
        groups: d.groups.filter((g) => g.id !== id),
        documents: d.documents.map((x) =>
          x.groupId === id ? { ...x, groupId: undefined, groupName: undefined } : x,
        ),
        projects: d.projects.map((p) =>
          p.id === group?.projectId ? { ...p, groupCount: Math.max(0, p.groupCount - 1) } : p,
        ),
      }));
      void repo.removeGroup(ownerRef.current, id);
      if (proj) {
        void repo.putProject(ownerRef.current, { ...proj, groupCount: Math.max(0, proj.groupCount - 1) }, false);
      }
    },
    [patchDataset],
  );

  /* ---------------- 审计工作文件 ---------------- */

  const addDocument = useCallback(
    (doc: AuditDocument) => {
      const proj = dataRef.current.projects.find((p) => p.id === doc.projectId);
      patchDataset((d) => ({
        ...d,
        documents: [doc, ...d.documents],
        projects: d.projects.map((p) =>
          p.id === doc.projectId ? { ...p, docCount: p.docCount + 1 } : p,
        ),
      }));
      void repo.putDocument(ownerRef.current, doc, true);
      if (proj) void repo.putProject(ownerRef.current, { ...proj, docCount: proj.docCount + 1 }, false);
    },
    [patchDataset],
  );

  /**
   * 新建文件并写入正文。
   * 顺序不能反：Rust 侧 insert_document 是 INSERT OR REPLACE（会带上 data 里的
   * content 字段，没有则写空串），而 save_document_content 是纯 UPDATE（行不存在
   * 时无声无息什么都不写）。所以必须先建成文档行，再写正文。
   */
  const addDocumentWithContent = useCallback(
    async (doc: AuditDocument, content: string) => {
      const proj = dataRef.current.projects.find((p) => p.id === doc.projectId);
      patchDataset((d) => ({
        ...d,
        documents: [doc, ...d.documents],
        projects: d.projects.map((p) =>
          p.id === doc.projectId ? { ...p, docCount: p.docCount + 1 } : p,
        ),
      }));
      await repo.putDocument(ownerRef.current, doc, true);
      await repo.saveDocumentContent(ownerRef.current, doc.id, content, doc.updatedAt);
      if (proj) {
        await repo.putProject(ownerRef.current, { ...proj, docCount: proj.docCount + 1 }, false);
      }
    },
    [patchDataset],
  );

  const updateDocument = useCallback(
    (id: string, patch: Partial<AuditDocument>) => {
      const cur = dataRef.current.documents.find((x) => x.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      patchDataset((d) => ({
        ...d,
        documents: d.documents.map((x) => (x.id === id ? next : x)),
      }));
      void repo.putDocument(ownerRef.current, next, false);
    },
    [patchDataset],
  );

  const removeDocument = useCallback(
    (id: string) => {
      patchDataset((d) => ({ ...d, documents: d.documents.filter((x) => x.id !== id) }));
      void repo.removeDocument(ownerRef.current, id);
    },
    [patchDataset],
  );

  /* ---------------- 待办 ---------------- */

  const addTodo = useCallback(
    (t: TodoItem) => {
      patchDataset((d) => ({ ...d, todos: [t, ...d.todos] }));
      void repo.putTodo(ownerRef.current, t);
    },
    [patchDataset],
  );

  const removeTodo = useCallback(
    (id: string) => {
      patchDataset((d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) }));
      void repo.removeTodo(ownerRef.current, id);
    },
    [patchDataset],
  );

  const resetDataset = useCallback(async () => {
    if (!currentUser) return;
    const ds = await repo.resetDataset(currentUser);
    setState({ ownerId: currentUser.id, dataset: ds, ready: true });
  }, [currentUser]);

  const value = useMemo<UserDataValue>(
    () => ({
      ...state.dataset,
      ready: state.ready,
      addProject,
      updateProject,
      removeProject,
      addGroup,
      updateGroup,
      removeGroup,
      addDocument,
      addDocumentWithContent,
      updateDocument,
      removeDocument,
      addTodo,
      removeTodo,
      resetDataset,
    }),
    [
      state,
      addProject,
      updateProject,
      removeProject,
      addGroup,
      updateGroup,
      removeGroup,
      addDocument,
      addDocumentWithContent,
      updateDocument,
      removeDocument,
      addTodo,
      removeTodo,
      resetDataset,
    ],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) throw new Error('useUserData 必须在 UserDataProvider 内使用');
  return ctx;
}
