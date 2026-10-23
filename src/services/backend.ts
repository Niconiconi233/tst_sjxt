/**
 * Rust 后端（Tauri command）调用封装。
 *
 * 运行在 Tauri 桌面壳中时使用 SQLite 持久化；
 * 运行在普通浏览器（如本地预览）时自动降级到 localStorage，
 * 由 services/repository.ts 负责选择具体实现。
 */
import type { UserDataset } from '@/mock/seed';
import type {
  AuditDocument,
  AuditGroup,
  AuditProject,
  TodoItem,
} from '@/types';
import type { SystemUser } from '@/types/user';
import type { DictItem } from '@/types/dict';
import type { AuditorRecord } from '@/types/auditor';

/** 是否运行在 Tauri 桌面容器内 */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('未连接 Rust 后端：当前为浏览器预览环境');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export interface AppInfo {
  name: string;
  version: string;
  tauriVersion: string;
  platform: string;
  dbPath: string;
}

export const backend = {
  available: isTauriRuntime(),

  ping: () => call<string>('ping'),
  appInfo: () => call<AppInfo>('app_info'),
  dbFilePath: () => call<string>('db_file_path'),
  revealDbFile: () => call<void>('reveal_db_file'),

  /* 业务字典（下拉选项，全库共享） */
  listDict: () => call<DictItem[]>('list_dict'),
  saveDictItem: (item: DictItem) => call<DictItem>('save_dict_item', { item }),
  deleteDictItem: (id: string) => call<void>('delete_dict_item', { id }),
  restoreDictDefaults: () => call<DictItem[]>('restore_dict_defaults'),

  /* 审计人员名册（全库共享） */
  listAuditors: () => call<AuditorRecord[]>('list_auditors'),
  saveAuditor: (item: AuditorRecord) => call<AuditorRecord>('save_auditor', { item }),
  deleteAuditor: (id: string) => call<void>('delete_auditor', { id }),
  restoreDefaultAuditors: () => call<AuditorRecord[]>('restore_default_auditors'),

  /* 账户 */
  listUsers: () => call<SystemUser[]>('list_users'),
  listDeletedUsers: () => call<SystemUser[]>('list_deleted_users'),
  saveUser: (user: SystemUser) => call<SystemUser>('save_user', { user }),
  touchLogin: (id: string, time: string) => call<void>('touch_login', { id, time }),
  /** 注销账户：逻辑删除，仅打标记 */
  deleteUser: (id: string, time: string) => call<void>('delete_user', { id, time }),
  /** 注销账户：物理删除，账户与名下数据一并从库中清除 */
  purgeUser: (id: string) => call<void>('purge_user', { id }),
  restoreUser: (id: string) => call<void>('restore_user', { id }),

  /* 工作台数据 */
  loadWorkspace: (ownerId: string) => call<UserDataset>('load_workspace', { ownerId }),
  seedWorkspace: (ownerId: string, ds: UserDataset) =>
    call<boolean>('seed_workspace', {
      ownerId,
      projects: ds.projects,
      groups: ds.groups,
      documents: ds.documents,
      todos: ds.todos,
    }),
  resetWorkspace: (ownerId: string) => call<void>('reset_workspace', { ownerId }),

  /* 审计项目 */
  createProject: (ownerId: string, item: AuditProject) =>
    call<void>('create_project', { ownerId, item }),
  updateProject: (ownerId: string, item: AuditProject) =>
    call<void>('update_project', { ownerId, item }),
  deleteProject: (ownerId: string, id: string) => call<void>('delete_project', { ownerId, id }),

  /* 审计组 */
  createGroup: (ownerId: string, item: AuditGroup) => call<void>('create_group', { ownerId, item }),
  updateGroup: (ownerId: string, item: AuditGroup) => call<void>('update_group', { ownerId, item }),
  deleteGroup: (ownerId: string, id: string) => call<void>('delete_group', { ownerId, id }),

  /* 审计工作文件 */
  createDocument: (ownerId: string, item: AuditDocument) =>
    call<void>('create_document', { ownerId, item }),
  updateDocument: (ownerId: string, item: AuditDocument) =>
    call<void>('update_document', { ownerId, item }),
  deleteDocument: (ownerId: string, id: string) => call<void>('delete_document', { ownerId, id }),
  getDocumentContent: (id: string) => call<string>('get_document_content', { id }),
  saveDocumentContent: (ownerId: string, id: string, content: string, updatedAt: string) =>
    call<void>('save_document_content', { ownerId, id, content, updatedAt }),

  /* 待办 */
  createTodo: (ownerId: string, item: TodoItem) => call<void>('create_todo', { ownerId, item }),
  deleteTodo: (ownerId: string, id: string) => call<void>('delete_todo', { ownerId, id }),
};
