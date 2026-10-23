/** 审计人员名册：入库保存，由「系统设置 → 审计人员名册」维护 */

import type { GroupRole } from '@/types';

/** 名册记录：在 Auditor 基础上补充维护字段 */
export interface AuditorRecord {
  id: string;
  name: string;
  /** 工号 / 执法证号 */
  code: string;
  gender: string;
  department: string;
  title: string;
  qualification?: string;
  phone: string;
  email: string;
  capableRoles: string[];
  busyProjects: number;
  avatarColor: string;
  /** 排序号，越小越靠前 */
  sortOrder: number;
  /** 停用后不出现在选人列表中，历史数据不受影响 */
  enabled: boolean;
  /** 是否为系统预置项 */
  builtin: boolean;
}

/** 名册表单值，供配置页编辑使用 */
export type AuditorInput = Partial<AuditorRecord> & { name: string };

/** 可选的角色值统一收敛到 GroupRole，兼容字典里新增的角色名 */
export type AuditorRole = GroupRole | (string & {});
