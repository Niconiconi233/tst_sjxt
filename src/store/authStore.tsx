import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import dayjs from 'dayjs';
import type { GroupRole } from '@/types';
import type { SystemUser } from '@/types/user';
import { repo, LAST_USER_STORAGE_KEY } from '@/services/repository';

export interface CreateUserPayload {
  name: string;
  department: string;
  title: string;
  employeeCode: string;
  role: GroupRole;
  password: string;
  avatarColor: string;
  /** 是否创建时带入示例数据 */
  withDemo: boolean;
}

interface AuthValue {
  users: SystemUser[];
  /** 已注销账户（逻辑删除，数据仍在，可恢复） */
  deletedUsers: SystemUser[];
  currentUser: SystemUser | null;
  lastUserId?: string | null;
  /** 账户表是否已从本机数据库装载完成 */
  ready: boolean;
  /** 当前存储方式：sqlite（Rust 后端）/ browser（预览降级） */
  storageMode: 'sqlite' | 'browser';
  login: (userId: string, password: string) => { ok: boolean; message?: string };
  logout: () => void;
  createUser: (payload: CreateUserPayload) => SystemUser;
  /** 注销账户：默认逻辑删除；physical=true 时物理删除，不可恢复 */
  removeUser: (userId: string, physical?: boolean) => void;
  /** 恢复已注销账户 */
  restoreUser: (userId: string) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * 账户状态的唯一入口。
 * 账户表存放在 Rust 侧 SQLite（浏览器预览时回落 localStorage），
 * 这里维护内存缓存并负责把变更写回持久层。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<SystemUser[]>([]);
  const [ready, setReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [lastUserId, setLastUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_USER_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // 启动时从持久层装载账户表（含已注销账户，供系统设置恢复）
  const reloadUsers = useCallback(() => {
    return Promise.all([repo.loadUsers(), repo.loadDeletedUsers()]).then(([list, deleted]) => {
      setUsers(list);
      setDeletedUsers(deleted);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    reloadUsers()
      .catch((err) => console.error('[auth] 装载账户失败', err))
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [reloadUsers]);

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId],
  );

  const login = useCallback(
    (userId: string, password: string) => {
      const user = users.find((u) => u.id === userId);
      if (!user) return { ok: false, message: '账户不存在' };
      if (user.password && user.password !== password) {
        return { ok: false, message: '登录口令不正确，请重新输入' };
      }
      const stamped: SystemUser = { ...user, lastLoginAt: dayjs().format('YYYY-MM-DD HH:mm') };
      setUsers((prev) => prev.map((u) => (u.id === userId ? stamped : u)));
      void repo.saveUser(stamped);
      setCurrentUserId(userId);
      setLastUserId(userId);
      try {
        localStorage.setItem(LAST_USER_STORAGE_KEY, userId);
      } catch {
        /* 忽略存储异常 */
      }
      return { ok: true };
    },
    [users],
  );

  const logout = useCallback(() => setCurrentUserId(null), []);

  const createUser = useCallback((payload: CreateUserPayload): SystemUser => {
    const now = dayjs().format('YYYY-MM-DD HH:mm');
    const user: SystemUser = {
      ...payload,
      id: `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      lastLoginAt: now,
    };
    setUsers((prev) => [...prev, user]);
    void repo.saveUser(user);
    setCurrentUserId(user.id);
    setLastUserId(user.id);
    try {
      localStorage.setItem(LAST_USER_STORAGE_KEY, user.id);
    } catch {
      /* 忽略存储异常 */
    }
    return user;
  }, []);

  /**
   * 注销账户。
   * - physical = false（默认）：逻辑删除，账户与项目/审计组/文件/待办全部保留，
   *   仅打上注销时间标记，登录页不再出现，可在系统设置中恢复；
   * - physical = true：物理删除，账户与名下全部数据从数据库彻底清除，不可恢复。
   */
  const removeUser = useCallback(
    (userId: string, physical = false) => {
      const now = dayjs().format('YYYY-MM-DD HH:mm');
      const target = users.find((u) => u.id === userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      if (physical) {
        // 物理删除：已注销清单里若存在同名记录也一并移除
        setDeletedUsers((prev) => prev.filter((u) => u.id !== userId));
        void repo.purgeUser(userId).then(() => reloadUsers());
      } else {
        setDeletedUsers((prev) =>
          prev.some((u) => u.id === userId)
            ? prev
            : [...prev, { ...(target as SystemUser), deletedAt: now }],
        );
        void repo.deleteUser(userId, now).then(() => reloadUsers());
      }
      setCurrentUserId((cur) => (cur === userId ? null : cur));
      // 清掉「上次登录」指针，避免登录页仍指向已注销/已删除的账户
      setLastUserId((prev) => (prev === userId ? null : prev));
      try {
        if (localStorage.getItem(LAST_USER_STORAGE_KEY) === userId) {
          localStorage.removeItem(LAST_USER_STORAGE_KEY);
        }
      } catch {
        /* 忽略存储异常 */
      }
    },
    [users, reloadUsers],
  );

  const restoreUser = useCallback(
    (userId: string) => {
      const target = deletedUsers.find((u) => u.id === userId);
      setDeletedUsers((prev) => prev.filter((u) => u.id !== userId));
      setUsers((prev) =>
        prev.some((u) => u.id === userId)
          ? prev
          : [...prev, { ...(target as SystemUser), deletedAt: null }],
      );
      void repo.restoreUser(userId).then(() => reloadUsers());
    },
    [deletedUsers, reloadUsers],
  );

  const value: AuthValue = {
    users,
    deletedUsers,
    currentUser,
    lastUserId,
    ready,
    storageMode: repo.mode,
    login,
    logout,
    createUser,
    removeUser,
    restoreUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
