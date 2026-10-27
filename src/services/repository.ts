/**
 * 数据仓库：对上层页面/状态容器屏蔽「SQLite（Rust）」与「localStorage（浏览器预览）」的差异。
 *
 * - Tauri 桌面运行时：所有读写经由 invoke 调用 Rust 命令，落 SQLite 文件；
 * - 浏览器预览：回落到 localStorage，保证界面在无桌面壳时仍可完整演示。
 */
import { buildSeed, type UserDataset } from '@/mock/seed';
import { defaultDictItems } from '@/mock/dictDefaults';
import { defaultAuditors } from '@/mock/auditorDefaults';
import { backend, isTauriRuntime } from '@/services/backend';
import { base64ToBlob, blobToBase64, mimeOfExt } from '@/utils/exportFile';
import type {
  AuditDocument,
  AuditGroup,
  AuditProject,
  TodoItem,
} from '@/types';
import type { SystemUser } from '@/types/user';
import type { DictItem } from '@/types/dict';
import type { AuditorRecord } from '@/types/auditor';

const USERS_KEY = 'agms.users';
const LAST_USER_KEY = 'agms.lastUserId';
const dataKey = (userId: string) => `agms.data.${userId}`;
/** 浏览器模式下记录「已注销」的账户（数据块本身保留不动，便于恢复） */
const MARKED_DELETED_KEY = 'agms.deletedUsers';
/** 浏览器模式下的业务字典缓存 */
const DICT_KEY = 'agms.dict';
/** 浏览器模式下的人员名册缓存 */
const AUDITORS_KEY = 'agms.auditors';
/** 浏览器模式下的应用级设置（机关名称、机构代码等） */
const SETTINGS_KEY = 'agms.settings';
/** 浏览器模式下的模板附件内容（每个模板一个键，避免与元数据混在一起） */
const dictFileKey = (id: string) => `agms.dictFile.${id}`;

export type StorageMode = 'sqlite' | 'browser';

export interface DataRepository {
  mode: StorageMode;
  loadUsers(): Promise<SystemUser[]>;
  /** 已注销账户（逻辑删除，可恢复） */
  loadDeletedUsers(): Promise<SystemUser[]>;
  saveUser(user: SystemUser): Promise<void>;
  /** 注销账户：逻辑删除 */
  deleteUser(id: string, time: string): Promise<void>;
  /** 注销账户：物理删除（账户、业务数据与文档正文一并清除，不可恢复） */
  purgeUser(id: string): Promise<void>;
  /** 恢复已注销账户 */
  restoreUser(id: string): Promise<void>;
  touchLogin(id: string, time: string): Promise<void>;

  loadDataset(user: SystemUser): Promise<UserDataset>;
  resetDataset(user: SystemUser): Promise<UserDataset>;

  putProject(ownerId: string, item: AuditProject, isNew: boolean): Promise<void>;
  removeProject(ownerId: string, id: string): Promise<void>;
  putGroup(ownerId: string, item: AuditGroup, isNew: boolean): Promise<void>;
  removeGroup(ownerId: string, id: string): Promise<void>;
  putDocument(ownerId: string, item: AuditDocument, isNew: boolean): Promise<void>;
  removeDocument(ownerId: string, id: string): Promise<void>;
  putTodo(ownerId: string, item: TodoItem): Promise<void>;
  removeTodo(ownerId: string, id: string): Promise<void>;

  getDocumentContent(id: string): Promise<string>;
  saveDocumentContent(
    ownerId: string,
    id: string,
    content: string,
    updatedAt: string,
  ): Promise<void>;

  /* 业务字典（下拉选项，全库共享） */
  loadDict(): Promise<DictItem[]>;
  saveDictItem(item: DictItem): Promise<DictItem>;
  deleteDictItem(id: string): Promise<void>;
  restoreDictDefaults(): Promise<DictItem[]>;

  /* 文书模板附件（挂在 doc_template 条目上） */
  uploadDictFile(id: string, file: File, updatedAt: string): Promise<DictItem | undefined>;
  /** 取模板附件：未上传返回 null */
  readDictFile(id: string): Promise<{ fileName: string; blob: Blob } | null>;
  deleteDictFile(id: string): Promise<DictItem | undefined>;

  /* 应用级键值配置（机关名称、机构代码等） */
  loadSettings(): Promise<Record<string, string>>;
  saveSetting(key: string, value: string): Promise<void>;

  /* 审计人员名册（全库共享） */
  loadAuditors(): Promise<AuditorRecord[]>;
  saveAuditor(item: AuditorRecord): Promise<AuditorRecord>;
  deleteAuditor(id: string): Promise<void>;
  restoreDefaultAuditors(): Promise<AuditorRecord[]>;
}

/** 失败不阻断界面操作，仅记录日志（后续可替换为全局提示） */
async function safe<T>(op: () => Promise<T>, label: string): Promise<T | undefined> {
  try {
    return await op();
  } catch (err) {
    console.error(`[repository] ${label} 失败`, err);
    return undefined;
  }
}

/* ================================================================== */
/* SQLite（Rust 后端）实现                                             */
/* ================================================================== */

const sqliteRepo: DataRepository = {
  mode: 'sqlite',

  /**
   * 账户表：直接返回库中的活跃账户。
   * 新装系统没有任何预置账户，登录页只显示「新增用户」，由使用人自行建立。
   */
  async loadUsers() {
    return (await safe(() => backend.listUsers(), 'loadUsers')) ?? [];
  },

  async loadDeletedUsers() {
    return (await safe(() => backend.listDeletedUsers(), 'listDeletedUsers')) ?? [];
  },

  async saveUser(user) {
    await safe(() => backend.saveUser(user), 'saveUser');
  },

  async deleteUser(id, time) {
    await safe(() => backend.deleteUser(id, time), 'deleteUser');
  },

  async purgeUser(id) {
    await safe(() => backend.purgeUser(id), 'purgeUser');
  },

  async restoreUser(id) {
    await safe(() => backend.restoreUser(id), 'restoreUser');
  },

  async touchLogin(id, time) {
    await safe(() => backend.touchLogin(id, time), 'touchLogin');
  },

  async loadDataset(user) {
    const ds = (await safe(() => backend.loadWorkspace(user.id), 'loadWorkspace')) ?? {
      projects: [],
      groups: [],
      documents: [],
      todos: [],
    };
    if (ds.projects.length || ds.documents.length || ds.todos.length) return ds;
    // 账户首次进入：按「是否带入示例数据」播种一次
    const seed = buildSeed(user, user.withDemo);
    const inserted = await safe(() => backend.seedWorkspace(user.id, seed), 'seedWorkspace');
    if (inserted) return seed;
    return (
      (await safe(() => backend.loadWorkspace(user.id), 'loadWorkspace(retry)')) ?? seed
    );
  },

  async resetDataset(user) {
    await safe(() => backend.resetWorkspace(user.id), 'resetWorkspace');
    const seed = buildSeed(user, user.withDemo);
    await safe(() => backend.seedWorkspace(user.id, seed), 'seedWorkspace(reset)');
    return seed;
  },

  putProject: (ownerId, item, isNew) =>
    safe(
      () => (isNew ? backend.createProject(ownerId, item) : backend.updateProject(ownerId, item)),
      'putProject',
    ).then(() => undefined),
  removeProject: (ownerId, id) =>
    safe(() => backend.deleteProject(ownerId, id), 'removeProject').then(() => undefined),
  putGroup: (ownerId, item, isNew) =>
    safe(
      () => (isNew ? backend.createGroup(ownerId, item) : backend.updateGroup(ownerId, item)),
      'putGroup',
    ).then(() => undefined),
  removeGroup: (ownerId, id) =>
    safe(() => backend.deleteGroup(ownerId, id), 'removeGroup').then(() => undefined),
  putDocument: (ownerId, item, isNew) =>
    safe(
      () =>
        isNew ? backend.createDocument(ownerId, item) : backend.updateDocument(ownerId, item),
      'putDocument',
    ).then(() => undefined),
  removeDocument: (ownerId, id) =>
    safe(() => backend.deleteDocument(ownerId, id), 'removeDocument').then(() => undefined),
  putTodo: (ownerId, item) =>
    safe(() => backend.createTodo(ownerId, item), 'putTodo').then(() => undefined),
  removeTodo: (ownerId, id) =>
    safe(() => backend.deleteTodo(ownerId, id), 'removeTodo').then(() => undefined),

  async getDocumentContent(id) {
    return (await safe(() => backend.getDocumentContent(id), 'getDocumentContent')) ?? '';
  },

  async saveDocumentContent(ownerId, id, content, updatedAt) {
    await safe(
      () => backend.saveDocumentContent(ownerId, id, content, updatedAt),
      'saveDocumentContent',
    );
  },

  async loadDict() {
    return (await safe(() => backend.listDict(), 'listDict')) ?? [];
  },

  async saveDictItem(item) {
    return (
      (await safe(() => backend.saveDictItem(item), 'saveDictItem')) ?? item
    );
  },

  async deleteDictItem(id) {
    await safe(() => backend.deleteDictItem(id), 'deleteDictItem');
  },

  async restoreDictDefaults() {
    return (await safe(() => backend.restoreDictDefaults(), 'restoreDictDefaults')) ?? [];
  },

  async uploadDictFile(id, file, updatedAt) {
    const dataBase64 = await blobToBase64(file);
    return safe(
      () => backend.uploadDictFile(id, file.name, dataBase64, updatedAt),
      'uploadDictFile',
    );
  },

  async readDictFile(id) {
    const payload = await safe(() => backend.readDictFile(id), 'readDictFile');
    if (!payload) return null;
    const ext = payload.fileName.split('.').pop() ?? '';
    return {
      fileName: payload.fileName,
      blob: base64ToBlob(payload.dataBase64, mimeOfExt(ext)),
    };
  },

  async deleteDictFile(id) {
    return safe(() => backend.deleteDictFile(id), 'deleteDictFile');
  },

  async loadSettings() {
    return (await safe(() => backend.loadAppSettings(), 'loadAppSettings')) ?? {};
  },

  async saveSetting(key, value) {
    await safe(() => backend.saveAppSetting(key, value), 'saveAppSetting');
  },

  async loadAuditors() {
    return (await safe(() => backend.listAuditors(), 'listAuditors')) ?? [];
  },

  async saveAuditor(item) {
    return (await safe(() => backend.saveAuditor(item), 'saveAuditor')) ?? item;
  },

  async deleteAuditor(id) {
    await safe(() => backend.deleteAuditor(id), 'deleteAuditor');
  },

  async restoreDefaultAuditors() {
    return (await safe(() => backend.restoreDefaultAuditors(), 'restoreDefaultAuditors')) ?? [];
  },
};

/* ================================================================== */
/* 浏览器 localStorage 实现（无桌面壳时的降级方案）                     */
/* ================================================================== */

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用时静默降级，仅影响刷新后的持久性 */
  }
}

const browserRepo: DataRepository = {
  mode: 'browser',

  /** 账户表：新装系统为空，登录页只显示「新增用户」 */
  async loadUsers() {
    return readJSON<SystemUser[]>(USERS_KEY, []).filter((u) => !u.deletedAt);
  },

  async loadDeletedUsers() {
    return readJSON<SystemUser[]>(USERS_KEY, []).filter((u) => !!u.deletedAt);
  },

  async saveUser(user) {
    const users = readJSON<SystemUser[]>(USERS_KEY, []);
    const idx = users.findIndex((u) => u.id === user.id);
    writeJSON(USERS_KEY, idx >= 0 ? users.map((u) => (u.id === user.id ? user : u)) : [...users, user]);
  },

  /** 逻辑删除：保留账户与其全部数据，仅打标记 */
  async deleteUser(id, time) {
    const users = readJSON<SystemUser[]>(USERS_KEY, []);
    writeJSON(
      USERS_KEY,
      users.map((u) => (u.id === id ? { ...u, deletedAt: time } : u)),
    );
    // 数据块本身保留不动，仅记录注销标记，恢复时即可原样读回
    writeJSON(MARKED_DELETED_KEY, {
      ...readJSON<Record<string, string>>(MARKED_DELETED_KEY, {}),
      [id]: time,
    });
  },

  /** 物理删除：账户、工作台数据块与全部文档正文一并清除，不留副本 */
  async purgeUser(id) {
    const users = readJSON<SystemUser[]>(USERS_KEY, []);
    writeJSON(USERS_KEY, users.filter((u) => u.id !== id));
    // 顺着数据块清掉该账户每一份文档的正文缓存
    const ds = readJSON<UserDataset | null>(dataKey(id), null);
    try {
      ds?.documents?.forEach((d) => localStorage.removeItem(`agms.content.${d.id}`));
      localStorage.removeItem(dataKey(id));
    } catch {
      /* 存储不可用时忽略 */
    }
    const marks = readJSON<Record<string, string>>(MARKED_DELETED_KEY, {});
    delete marks[id];
    writeJSON(MARKED_DELETED_KEY, marks);
  },

  async restoreUser(id) {
    const users = readJSON<SystemUser[]>(USERS_KEY, []);
    writeJSON(
      USERS_KEY,
      users.map((u) => (u.id === id ? { ...u, deletedAt: null } : u)),
    );
    const marks = readJSON<Record<string, string>>(MARKED_DELETED_KEY, {});
    delete marks[id];
    writeJSON(MARKED_DELETED_KEY, marks);
  },

  async touchLogin(id, time) {
    const users = readJSON<SystemUser[]>(USERS_KEY, []);
    writeJSON(USERS_KEY, users.map((u) => (u.id === id ? { ...u, lastLoginAt: time } : u)));
  },

  async loadDataset(user) {
    const cached = readJSON<UserDataset | null>(dataKey(user.id), null);
    if (cached && Array.isArray(cached.projects)) return cached;
    const seed = buildSeed(user, user.withDemo);
    writeJSON(dataKey(user.id), seed);
    return seed;
  },

  async resetDataset(user) {
    const seed = buildSeed(user, user.withDemo);
    writeJSON(dataKey(user.id), seed);
    return seed;
  },

  async putProject() {},
  async removeProject() {},
  async putGroup() {},
  async removeGroup() {},
  async putDocument() {},
  async removeDocument() {},
  async putTodo() {},
  async removeTodo() {},

  async getDocumentContent(id) {
    return localStorage.getItem(`agms.content.${id}`) ?? '';
  },

  async saveDocumentContent(_ownerId, id, content) {
    localStorage.setItem(`agms.content.${id}`, content);
  },

  async loadDict() {
    const cached = readJSON<DictItem[] | null>(DICT_KEY, null);
    if (cached && cached.length) return cached;
    const seeded = defaultDictItems();
    writeJSON(DICT_KEY, seeded);
    return seeded;
  },

  async saveDictItem(item) {
    const list = readJSON<DictItem[]>(DICT_KEY, defaultDictItems());
    // 新建条目在这里补 id，并把它回传给调用方：新增模板后要立刻用这个 id 上传附件
    const stored: DictItem = { ...item, id: item.id || `d_${item.category}_${Date.now()}` };
    writeJSON(
      DICT_KEY,
      list.some((x) => x.id === stored.id)
        ? list.map((x) => (x.id === stored.id ? stored : x))
        : [...list, stored],
    );
    return stored;
  },

  async deleteDictItem(id) {
    writeJSON(
      DICT_KEY,
      readJSON<DictItem[]>(DICT_KEY, []).filter((x) => x.id !== id),
    );
  },

  async restoreDictDefaults() {
    // 补回缺失的预置项，保留人工新增的条目
    const list = readJSON<DictItem[]>(DICT_KEY, []);
    const merged = [...list];
    for (const d of defaultDictItems()) {
      if (!merged.some((x) => x.category === d.category && x.parent === d.parent && x.label === d.label)) {
        merged.push(d);
      }
    }
    writeJSON(DICT_KEY, merged);
    return merged;
  },

  async loadAuditors() {
    const cached = readJSON<AuditorRecord[] | null>(AUDITORS_KEY, null);
    if (cached && cached.length) return cached;
    const seeded = defaultAuditors();
    writeJSON(AUDITORS_KEY, seeded);
    return seeded;
  },

  async saveAuditor(item) {
    const list = readJSON<AuditorRecord[]>(AUDITORS_KEY, defaultAuditors());
    writeJSON(
      AUDITORS_KEY,
      list.some((x) => x.id === item.id)
        ? list.map((x) => (x.id === item.id ? item : x))
        : [...list, { ...item, id: item.id || `au_${Date.now()}` }],
    );
    return item;
  },

  async deleteAuditor(id) {
    writeJSON(
      AUDITORS_KEY,
      readJSON<AuditorRecord[]>(AUDITORS_KEY, []).filter((x) => x.id !== id),
    );
  },

  async restoreDefaultAuditors() {
    // 补回缺失的预置人员（按 id），保留人工新增的条目
    const list = readJSON<AuditorRecord[]>(AUDITORS_KEY, []);
    const merged = [...list];
    for (const a of defaultAuditors()) {
      if (!merged.some((x) => x.id === a.id)) merged.push(a);
    }
    writeJSON(AUDITORS_KEY, merged);
    return merged;
  },

  /* ---------------- 文书模板附件（浏览器版存 localStorage） ---------------- */

  async uploadDictFile(id, file, updatedAt) {
    const base64 = await blobToBase64(file);
    try {
      localStorage.setItem(dictFileKey(id), base64);
    } catch {
      // 模板可能几 MB，localStorage 配额不够时明确报错，而不是静默丢文件
      throw new Error('浏览器预览模式的本地存储空间不足，请改用桌面端上传模板');
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const list = readJSON<DictItem[]>(DICT_KEY, []);
    const updated = list.map((x) =>
      x.id === id
        ? { ...x, fileName: file.name, fileExt: ext, fileSize: file.size, fileUpdatedAt: updatedAt }
        : x,
    );
    writeJSON(DICT_KEY, updated);
    return updated.find((x) => x.id === id);
  },

  async readDictFile(id) {
    const base64 = localStorage.getItem(dictFileKey(id));
    if (!base64) return null;
    const item = readJSON<DictItem[]>(DICT_KEY, []).find((x) => x.id === id);
    const fileName = item?.fileName || '模板文件';
    const ext = fileName.split('.').pop() ?? '';
    return { fileName, blob: base64ToBlob(base64, mimeOfExt(ext)) };
  },

  async deleteDictFile(id) {
    localStorage.removeItem(dictFileKey(id));
    const list = readJSON<DictItem[]>(DICT_KEY, []);
    const updated = list.map((x) =>
      x.id === id
        ? { ...x, fileName: '', fileExt: '', fileSize: 0, fileUpdatedAt: '' }
        : x,
    );
    writeJSON(DICT_KEY, updated);
    return updated.find((x) => x.id === id);
  },

  async loadSettings() {
    return readJSON<Record<string, string>>(SETTINGS_KEY, {});
  },

  async saveSetting(key, value) {
    writeJSON(SETTINGS_KEY, { ...readJSON<Record<string, string>>(SETTINGS_KEY, {}), [key]: value });
  },
};

export const repo: DataRepository = isTauriRuntime() ? sqliteRepo : browserRepo;

/** 浏览器实现下由外层统一落盘（SQLite 实现无需冗余写入） */
export function persistDataset(userId: string, dataset: UserDataset) {
  if (repo.mode === 'browser') writeJSON(dataKey(userId), dataset);
}

export const LAST_USER_STORAGE_KEY = LAST_USER_KEY;
