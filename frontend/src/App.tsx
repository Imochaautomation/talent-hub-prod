import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './components/layout/ThemeProvider';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { useAuthStore } from './store/authStore';

// Lazy load all pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const JobArchitecturePage = lazy(() => import('./pages/JobArchitecturePage'));
const EmployeeProfilePage = lazy(() => import('./pages/EmployeeProfilePage'));
const SalaryBandDesignerPage = lazy(() => import('./pages/SalaryBandDesignerPage'));
const PayEquityPage = lazy(() => import('./pages/PayEquityPage'));
const BenefitsManagementPage = lazy(() => import('./pages/BenefitsManagementPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));
const VariablePayPage = lazy(() => import('./pages/VariablePayPage'));
const ScenarioModelerPage = lazy(() => import('./pages/ScenarioModelerPage'));
const NotificationsCenterPage = lazy(() => import('./pages/NotificationsCenterPage'));
// SettingsPage (legacy) removed — /settings redirects to /settings/platform
const BenefitsHubPage = lazy(() => import('./pages/BenefitsHubPage'));
const PlatformSettingsPage = lazy(() => import('./pages/PlatformSettingsPage'));
const UserSettingsPage = lazy(() => import('./pages/UserSettingsPage'));
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage'));
const DataCenterPage = lazy(() => import('./pages/DataCenterPage'));
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage'));
const ApplicationLogsPage = lazy(() => import('./pages/ApplicationLogsPage'));
const CompensationHubPage = lazy(() => import('./pages/CompensationHubPage'));
const LeadershipReportPage = lazy(() => import('./pages/LeadershipReportPage'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />

        {/* Protected routes wrapped in AppShell */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="job-architecture" element={<JobArchitecturePage />} />
          <Route path="employees" element={<Navigate to="/job-architecture" replace />} />
          <Route path="employees/:id" element={<EmployeeProfilePage />} />
          <Route path="salary-bands" element={<SalaryBandDesignerPage />} />
          <Route path="pay-equity" element={<PayEquityPage />} />
          <Route path="benefits" element={<BenefitsManagementPage />} />
          <Route path="rsu" element={<Navigate to="/benefits" replace />} />
          <Route path="performance" element={<PerformancePage />} />
          <Route path="variable-pay" element={<VariablePayPage />} />
          <Route path="scenarios" element={<ScenarioModelerPage />} />
          <Route path="notifications" element={<NotificationsCenterPage />} />
          <Route path="settings" element={<Navigate to="/settings/platform" replace />} />
          <Route path="settings/platform" element={<PlatformSettingsPage />} />
          <Route path="settings/user" element={<UserSettingsPage />} />
          <Route path="benefits-hub" element={<BenefitsHubPage />} />
          <Route path="ai-assistant" element={<AIAssistantPage />} />
          <Route path="data-center" element={<DataCenterPage />} />
          <Route path="app-logs" element={<ApplicationLogsPage />} />
          <Route path="compensation" element={<CompensationHubPage />} />
          <Route path="leadership-report" element={<LeadershipReportPage />} />
        </Route>

        {/* Catch-all — send to login, ProtectedRoute handles auth check */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  // Single hydration gate at the top level — only ONE loading state for the whole app.
  // Both LoginPage and ProtectedRoute previously had their own _hasHydrated spinners
  // which created a flicker chain. Now there's one spinner here, routes render only
  // after Zustand has fully read from localStorage.
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);

  return (
    <ThemeProvider>
      {!_hasHydrated ? <PageLoader /> : <AppRoutes />}
    </ThemeProvider>
  );
}
