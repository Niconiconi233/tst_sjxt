import type { ReactNode } from 'react';
import { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { auditTheme } from '@/theme';
import { AuthProvider, useAuth } from '@/store/authStore';
import { UserDataProvider, useUserData } from '@/store/userData';
import { DictProvider } from '@/store/dictStore';
import Login from '@/pages/Login';
import MainLayout from '@/layouts/MainLayout';
import Workbench from '@/pages/Workbench';
import ProjectList from '@/pages/ProjectList';
import ProjectCreate from '@/pages/ProjectCreate';
import ProjectDetail from '@/pages/ProjectDetail';
import GroupList from '@/pages/GroupList';
import GroupCreate from '@/pages/GroupCreate';
import GroupDetail from '@/pages/GroupDetail';
import DocumentList from '@/pages/DocumentList';
import DocumentCreate from '@/pages/DocumentCreate';
import Settings from '@/pages/Settings';

// 在线编辑器依赖 Univer 体积较大，按需加载，避免拖慢首屏
const OfficeEditor = lazy(() => import('@/pages/OfficeEditor'));

dayjs.locale('zh-cn');

function AppRoutes() {
  return (
    <Routes>
      {/* 在线编辑器为全屏页面，不套主框架 */}
      <Route
        path="/documents/:id/office"
        element={
          <Suspense fallback={<div className="app-boot">正在加载在线编辑器…</div>}>
            <OfficeEditor />
          </Suspense>
        }
      />
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/workbench" replace />} />
        <Route path="workbench" element={<Workbench />} />
        <Route path="projects" element={<ProjectList />} />
        <Route path="projects/new" element={<ProjectCreate />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="groups" element={<GroupList />} />
        <Route path="groups/new" element={<GroupCreate />} />
        <Route path="groups/:id" element={<GroupDetail />} />
        <Route path="documents" element={<DocumentList />} />
        <Route path="documents/new" element={<DocumentCreate />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/workbench" replace />} />
      </Route>
    </Routes>
  );
}

/** 账户数据装载完成前显示过渡页，避免出现空台账闪烁 */
function DataGate({ children }: { children: ReactNode }) {
  const { ready } = useUserData();
  if (!ready) {
    return (
      <div className="app-boot">
        <div className="app-boot__spinner" />
        <div>正在从本机数据库装载账户数据…</div>
      </div>
    );
  }
  return <>{children}</>;
}

/** 未登录时仅呈现登录界面；登录后按账户装载各自的隔离数据 */
function AppShell() {
  const { currentUser, ready } = useAuth();
  if (!currentUser) return <Login />;
  if (!ready) return <Login />;
  return (
    <UserDataProvider>
      <DataGate>
        <AppRoutes />
      </DataGate>
    </UserDataProvider>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={auditTheme} componentSize="middle">
      <AntdApp>
        <AuthProvider>
          {/* 字典需在登录页之前就绪：新建账户的部门/职务/角色全部来自这里 */}
          <DictProvider>
            <HashRouter>
              <AppShell />
            </HashRouter>
          </DictProvider>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
