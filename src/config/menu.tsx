import type { ReactNode } from 'react';
import {
  AppstoreOutlined,
  AuditOutlined,
  FileProtectOutlined,
  FolderOpenOutlined,
  PlusCircleOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';

export interface MenuNode {
  key: string;
  /** 路由路径，分组节点为空 */
  path?: string;
  label: string;
  icon?: ReactNode;
  children?: MenuNode[];
}

/** 左侧主导航：围绕「项目建立 → 审计组建立 → 工作文件建立」三条主线组织 */
export const menuTree: MenuNode[] = [
  {
    key: 'workbench',
    path: '/workbench',
    label: '工作台',
    icon: <AppstoreOutlined />,
  },
  {
    key: 'project',
    label: '审计项目管理',
    icon: <AuditOutlined />,
    children: [
      { key: 'project:list', path: '/projects', label: '项目台账', icon: <SolutionOutlined /> },
      { key: 'project:new', path: '/projects/new', label: '建立审计项目', icon: <PlusCircleOutlined /> },
    ],
  },
  {
    key: 'group',
    label: '审计组管理',
    icon: <TeamOutlined />,
    children: [
      { key: 'group:list', path: '/groups', label: '审计组台账', icon: <TeamOutlined /> },
      { key: 'group:new', path: '/groups/new', label: '组建审计组', icon: <UsergroupAddOutlined /> },
    ],
  },
  {
    key: 'doc',
    label: '审计工作文件',
    icon: <FolderOpenOutlined />,
    children: [
      { key: 'doc:list', path: '/documents', label: '文件台账', icon: <FileProtectOutlined /> },
      { key: 'doc:new', path: '/documents/new', label: '起草工作文件', icon: <PlusCircleOutlined /> },
    ],
  },
  {
    key: 'settings',
    path: '/settings',
    label: '系统设置',
    icon: <SettingOutlined />,
  },
];

/** 扁平化的可跳转菜单项 */
export const flatMenu: MenuNode[] = menuTree.flatMap((n) =>
  n.children ? n.children : [n],
);

/** 根据当前路径解析面包屑 */
export function resolveBreadcrumb(pathname: string): string[] {
  if (pathname.startsWith('/projects/') && pathname !== '/projects/new') {
    return ['审计项目管理', '项目台账', '项目详情'];
  }
  if (pathname.startsWith('/groups/') && pathname !== '/groups/new') {
    return ['审计组管理', '审计组台账', '审计组详情'];
  }
  for (const node of menuTree) {
    if (node.path === pathname) return [node.label];
    if (node.children) {
      const hit = node.children.find((c) => c.path === pathname);
      if (hit) return [node.label, hit.label];
    }
  }
  return ['审计组工作管理系统'];
}

/** 根据路径推断默认展开的父级菜单 */
export function resolveOpenKeys(pathname: string): string[] {
  const keys: string[] = [];
  for (const node of menuTree) {
    if (!node.children) continue;
    if (node.children.some((c) => c.path === pathname)) keys.push(node.key);
    else if (pathname.startsWith(`/${node.key === 'project' ? 'projects' : node.key === 'group' ? 'groups' : 'documents'}/`)) {
      keys.push(node.key);
    }
  }
  return keys;
}
