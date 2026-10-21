import type { GroupRole } from './index';

/** 本机登录账户（区别于「人员库」中的审计人员） */
export interface SystemUser {
  id: string;
  /** 显示姓名 */
  name: string;
  /** 头像底色 */
  avatarColor: string;
  /** 所属部门 */
  department: string;
  /** 职务 */
  title: string;
  /** 工号 */
  employeeCode: string;
  /** 默认承担角色（用于起草文件默认签名等） */
  role: GroupRole;
  /** 登录口令，空串表示免密登录 */
  password: string;
  createdAt: string;
  lastLoginAt?: string;
  /** 是否带入了示例数据 */
  withDemo: boolean;
  /** 注销时间：非空表示账户已逻辑删除，数据仍保留，可在系统设置中恢复 */
  deletedAt?: string | null;
}
