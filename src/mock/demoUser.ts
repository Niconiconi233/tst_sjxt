import type { SystemUser } from '@/types/user';

/** 预置演示账户：首次启动时自动写入数据库，便于直接体验完整界面 */
export const DEMO_USER: SystemUser = {
  id: 'u_demo_chen',
  name: '陈志远',
  avatarColor: '#1a5fb4',
  department: '财政审计一处',
  title: '处长',
  employeeCode: 'SJ-1001',
  role: '审计组长',
  password: '',
  createdAt: '2026-01-04 09:00',
  withDemo: true,
};
