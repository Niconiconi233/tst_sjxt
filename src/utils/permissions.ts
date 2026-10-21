/**
 * 页面权限：按账户的「默认担任角色」控制可见与可操作的入口。
 *
 * 业务规则（可按机关实际制度调整）：
 * - 审计组长：全量权限，可立项、组建审计组、起草并签发全部类别文件；
 * - 副组长：除删除类操作外与组长一致；
 * - 主审：可起草方案/底稿/证据/报告类文件，不能立项、不能组建审计组；
 * - 审计员（组员）：只能编写工作底稿与事实确认书，不能立项、组建审计组、签发与删除；
 * - 复核员：可查阅并批注底稿/证据/报告，不能立项与删除；
 * - 廉政监督员 / 资料员 / 外部专家：仅能编写各自职责范围内的文件。
 */
import { useAuth } from '@/store/authStore';
import type { DocCategory, GroupRole } from '@/types';

export type PermissionKey =
  | 'project:create'
  | 'project:edit'
  | 'project:delete'
  | 'group:create'
  | 'group:edit'
  | 'group:delete'
  | 'doc:create'
  | 'doc:edit'
  | 'doc:delete'
  | 'doc:sign';

const ALL_PERMISSIONS: PermissionKey[] = [
  'project:create',
  'project:edit',
  'project:delete',
  'group:create',
  'group:edit',
  'group:delete',
  'doc:create',
  'doc:edit',
  'doc:delete',
  'doc:sign',
];

const ALL_CATEGORIES: DocCategory[] = [
  '审计方案类',
  '审计通知类',
  '取证与底稿类',
  '审计证据类',
  '审计报告类',
  '整改与移送类',
  '廉政与纪律类',
  '内部管理类',
];

export interface RolePolicy {
  /** 权限说明，用于界面提示 */
  summary: string;
  permissions: PermissionKey[];
  categories: DocCategory[];
}

/** 组员可编写的文件类别：工作底稿与事实确认书 */
const MEMBER_CATEGORIES: DocCategory[] = ['取证与底稿类', '审计证据类'];

const POLICY: Record<GroupRole, RolePolicy> = {
  审计组长: {
    summary: '全部权限：可立项、组建审计组、起草与签发全部类别文件',
    permissions: ALL_PERMISSIONS,
    categories: ALL_CATEGORIES,
  },
  副组长: {
    summary: '协助组长开展工作，除删除类操作外与组长一致',
    permissions: ALL_PERMISSIONS.filter(
      (p) => p !== 'project:delete' && p !== 'group:delete' && p !== 'doc:delete',
    ),
    categories: ALL_CATEGORIES,
  },
  主审: {
    summary: '负责方案与报告起草，不能立项、不能组建审计组',
    permissions: ['project:edit', 'group:edit', 'doc:create', 'doc:edit'],
    categories: ['审计方案类', '取证与底稿类', '审计证据类', '审计报告类', '整改与移送类'],
  },
  审计员: {
    summary: '仅可编写工作底稿、事实确认书，不能立项与组建审计组',
    permissions: ['doc:create', 'doc:edit'],
    categories: MEMBER_CATEGORIES,
  },
  复核员: {
    summary: '负责底稿与报告复核，可编写底稿/证据/报告，不能立项与删除',
    permissions: ['doc:create', 'doc:edit'],
    categories: ['取证与底稿类', '审计证据类', '审计报告类'],
  },
  廉政监督员: {
    summary: '负责廉政纪律监督，仅可编写廉政与纪律类文件',
    permissions: ['doc:create', 'doc:edit'],
    categories: ['廉政与纪律类'],
  },
  资料员: {
    summary: '负责资料归档与内部事务，仅可编写内部管理类文件',
    permissions: ['doc:create', 'doc:edit'],
    categories: ['内部管理类', '审计证据类'],
  },
  外部专家: {
    summary: '受聘参与专项核查，仅可编写工作底稿',
    permissions: ['doc:create', 'doc:edit'],
    categories: ['取证与底稿类'],
  },
};

const FALLBACK_ROLE: GroupRole = '审计员';

export function getPolicy(role?: GroupRole | string): RolePolicy {
  return POLICY[(role as GroupRole) ?? FALLBACK_ROLE] ?? POLICY[FALLBACK_ROLE];
}

export function canDo(role: GroupRole | string | undefined, key: PermissionKey): boolean {
  return getPolicy(role).permissions.includes(key);
}

export function canWriteCategory(
  role: GroupRole | string | undefined,
  category: DocCategory,
): boolean {
  return getPolicy(role).categories.includes(category);
}

export function allowedCategories(role?: GroupRole | string): DocCategory[] {
  return getPolicy(role).categories;
}

/** 页面内统一取用：按当前登录账户的角色判定 */
export function usePermission() {
  const { currentUser } = useAuth();
  const role = (currentUser?.role ?? FALLBACK_ROLE) as GroupRole;
  const policy = getPolicy(role);

  return {
    role,
    policy,
    isLeader: role === '审计组长',
    can: (key: PermissionKey) => policy.permissions.includes(key),
    allowedCategories: policy.categories,
    canWriteCategory: (category: DocCategory) => policy.categories.includes(category),
  };
}
