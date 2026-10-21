import type { SystemUser } from '@/types/user';
import {
  auditors,
  documents as seedDocuments,
  groups as seedGroups,
  projects as seedProjects,
  todos as seedTodos,
} from '@/mock/data';
import type {
  AuditDocument,
  AuditGroup,
  AuditProject,
  Auditor,
  GroupMember,
  GroupRole,
  TodoItem,
} from '@/types';

/** 单个账户的完整业务数据集（用户之间彼此隔离） */
export interface UserDataset {
  projects: AuditProject[];
  groups: AuditGroup[];
  documents: AuditDocument[];
  todos: TodoItem[];
}

const EMPTY: UserDataset = { projects: [], groups: [], documents: [], todos: [] };

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function mkMember(auditor: Auditor, role: GroupRole, duty: string, items: string[]): GroupMember {
  return {
    memberId: auditor.id,
    auditor,
    role,
    duty,
    responsibleItems: items,
    joinDate: new Date().toISOString().slice(0, 10),
    onSite: true,
  };
}

/**
 * 为每个账户生成初始数据集。
 * - 预置演示账户：使用完整示例数据，便于查看全部界面；
 * - 勾选「带入示例数据」的新账户：为其生成一套以本人为主的小型数据；
 * - 未勾选：空数据集，从零开始建立项目、审计组与文件。
 */
export function buildSeed(user: SystemUser, withDemo: boolean): UserDataset {
  if (!withDemo) {
    return {
      ...clone(EMPTY),
      todos: [
        {
          id: 'todo_welcome',
          title: '开始使用：先建立你的第一个审计项目',
          type: '待办',
          deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          projectName: '—',
          owner: user.name,
          level: '中',
        },
      ],
    };
  }

  if (user.id === 'u_demo_chen') {
    return {
      projects: clone(seedProjects),
      groups: clone(seedGroups),
      documents: clone(seedDocuments),
      todos: clone(seedTodos),
    };
  }

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (n: number) => fmt(new Date(Date.now() + n * 86400000));

  const me: Auditor = {
    id: user.id,
    name: user.name,
    code: user.employeeCode,
    gender: '男',
    department: user.department,
    title: user.title,
    qualification: '审计师',
    phone: '138****0000',
    email: `${user.employeeCode || 'user'}@audit.gov.cn`,
    capableRoles: ['审计组长', '主审'],
    busyProjects: 1,
    avatarColor: user.avatarColor,
  };

  const mates = [
    mkMember(me, user.role || '审计组长', '全面负责审计组工作，审定实施方案与报告', ['总体统筹']),
    mkMember(auditors[3], '主审', '汇总底稿、起草审计报告', ['底稿复核', '报告起草']),
    mkMember(auditors[9], '审计员', '负责财务收支与专项资金核查', ['财务收支', '专项资金']),
    mkMember(auditors[8], '复核员', '负责底稿与证据复核', ['底稿复核']),
  ];

  const project: AuditProject = {
    id: `P_${user.id}`,
    code: '审财〔2026〕新001号',
    name: '示例：2025年度部门预算执行审计',
    auditedUnit: '示例被审计单位',
    unitNature: '行政机关',
    auditType: '预算执行审计',
    level: '二级',
    status: '筹备中',
    year: today.getFullYear(),
    periodStart: `${today.getFullYear() - 1}-01-01`,
    periodEnd: `${today.getFullYear() - 1}-12-31`,
    fieldStart: fmt(today),
    fieldEnd: plus(60),
    budget: 45,
    ownerName: user.name,
    ownerId: user.id,
    progress: 12,
    groupCount: 1,
    docCount: 1,
    issueCount: 0,
    createdAt: fmt(today),
    tags: ['示例数据'],
    remark: '这是创建账户时自动带入的示例项目，可直接编辑或删除。',
  };

  const group: AuditGroup = {
    id: `G_${user.id}`,
    name: '示例审计组',
    projectId: project.id,
    projectName: project.name,
    leaderId: user.id,
    leaderName: user.name,
    memberCount: mates.length,
    establishDate: fmt(today),
    planEndDate: plus(60),
    status: '组建中',
    location: '待填写工作驻地',
    disciplineNote: '严格遵守审计"八不准"工作纪律。',
    members: mates,
  };

  const doc: AuditDocument = {
    id: `D_${user.id}`,
    code: '审财〔2026〕新001号-001',
    title: '审计实施方案（示例）',
    category: '审计方案类',
    template: '审计实施方案',
    projectId: project.id,
    projectName: project.name,
    groupId: group.id,
    groupName: group.name,
    status: '草稿',
    secretLevel: '内部',
    authorId: user.id,
    authorName: user.name,
    version: 'V1.0',
    createdAt: fmt(today),
    updatedAt: fmt(today),
    pages: 2,
    attachmentCount: 0,
    refCodes: [],
  };

  return {
    projects: [project],
    groups: [group],
    documents: [doc],
    todos: [
      {
        id: 'todo_seed_1',
        title: '完善《审计实施方案（示例）》并提交复核',
        type: '待办',
        deadline: plus(3),
        projectName: project.name,
        owner: user.name,
        level: '中',
      },
    ],
  };
}
