import { buildSeed } from '@/mock/seed';
import type { SystemUser } from '@/types/user';

const base: SystemUser = {
  id: 'u_aaa',
  name: '张三',
  avatarColor: '#1a5fb4',
  department: '财政审计一处',
  title: '审计员',
  employeeCode: 'SJ-9001',
  role: '审计组长',
  password: '',
  createdAt: '2026-10-20 10:00',
  withDemo: true,
};

const userB: SystemUser = { ...base, id: 'u_bbb', name: '李四', employeeCode: 'SJ-9002' };
const userC: SystemUser = { ...base, id: 'u_ccc', name: '王五', withDemo: false };

const a = buildSeed(base, true);
const b = buildSeed(userB, true);
const c = buildSeed(userC, false);

const report = {
  a: { projects: a.projects.map((p) => p.id), owner: a.projects[0]?.ownerName, docs: a.documents.length },
  b: { projects: b.projects.map((p) => p.id), owner: b.projects[0]?.ownerName, docs: b.documents.length },
  c: { projects: c.projects.map((p) => p.id), todos: c.todos.map((t) => t.owner) },
  sameIds: JSON.stringify(a.projects.map((p) => p.id)) === JSON.stringify(b.projects.map((p) => p.id)),
  sameOwner: a.projects[0]?.ownerName === b.projects[0]?.ownerName,
};

console.log(JSON.stringify(report, null, 2));
if (report.sameIds || report.sameOwner) {
  console.error('FAIL: 不同账户生成了相同数据');
  process.exit(1);
}
console.log('PASS: 各账户种子数据彼此独立');
