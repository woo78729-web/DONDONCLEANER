import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppErrorBoundary } from './components/AppStatusScreens';
import { ProtectedRoute } from './components/ProtectedRoute';
import { EmployeeOnboardingRoute } from './components/EmployeeOnboardingRoute';
import LoginPage from './pages/LoginPage';
import GoogleAuthCallbackPage from './pages/GoogleAuthCallbackPage';
import AdminReportsPage from './pages/AdminReportsPage';
import AdminAccountingPage from './pages/AdminAccountingPage';
import AdminPerformancePage from './pages/AdminPerformancePage';
import AdminStaffPage from './pages/AdminStaffPage';
import AdminSchedulesPage from './pages/AdminSchedulesPage';
import AdminRegionalSchedulingPage from './pages/AdminRegionalSchedulingPage';
import AdminLeaveCalendarPage from './pages/AdminLeaveCalendarPage';
import AdminScheduleDayPage from './pages/AdminScheduleDayPage';
import AdminProjectsPage from './pages/AdminProjectsPage';
import EmergencyMaintenancePage from './pages/EmergencyMaintenancePage';
import PhoneLookupPage from './pages/PhoneLookupPage';
import MaintenanceRecordsPage from './pages/MaintenanceRecordsPage';
import MailTrackingPage from './pages/MailTrackingPage';
import RemittanceTrackingPage from './pages/RemittanceTrackingPage';
import EmployeeTodayTasksPage from './pages/EmployeeTodayTasksPage';
import EmployeeCalendarPage from './pages/EmployeeCalendarPage';
import EmployeeDailyReportPage from './pages/EmployeeDailyReportPage';
import EmployeeReportHistoryPage from './pages/EmployeeReportHistoryPage';
import EmployeeMonthlySummaryPage from './pages/EmployeeMonthlySummaryPage';
import EmployeeMaintenanceReportPage from './pages/EmployeeMaintenanceReportPage';
import EmployeeLeavePage from './pages/EmployeeLeavePage';
import EmployeeSettingsPage from './pages/EmployeeSettingsPage';
import EmployeeOnboardingPage from './pages/EmployeeOnboardingPage';
import EmployeeRulesPage from './pages/EmployeeRulesPage';

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/spa'}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/google-callback" element={<GoogleAuthCallbackPage />} />

          <Route element={<ProtectedRoute permission="reports.view" />}>
            <Route path="/admin" element={<AdminReportsPage />} />
            <Route path="/finance" element={<AdminReportsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="accounting.manage" />}>
            <Route path="/admin/accounting" element={<AdminAccountingPage />} />
            <Route path="/admin/performance" element={<AdminPerformancePage />} />
          </Route>

          <Route element={<ProtectedRoute permission="staff.manage" />}>
            <Route path="/admin/staff" element={<AdminStaffPage />} />
            <Route path="/admin/employees" element={<Navigate to="/admin/staff" replace />} />
          </Route>

          <Route element={<ProtectedRoute permission="schedules.manage" />}>
            <Route path="/admin/schedules" element={<AdminSchedulesPage />} />
            <Route path="/admin/regional-scheduling" element={<AdminRegionalSchedulingPage />} />
            <Route path="/admin/schedules/day/:date" element={<AdminScheduleDayPage />} />
            <Route path="/admin/leaves" element={<AdminLeaveCalendarPage />} />
            <Route path="/admin/projects" element={<AdminProjectsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="phone.lookup" />}>
            <Route path="/admin/phone-lookup" element={<PhoneLookupPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="maintenance.manage" />}>
            <Route path="/admin/emergency-maintenance" element={<EmergencyMaintenancePage />} />
            <Route path="/admin/maintenance" element={<MaintenanceRecordsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="mail.tracking" />}>
            <Route path="/admin/mail-tracking" element={<MailTrackingPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="remittance.track" />}>
            <Route path="/admin/remittance-tracking" element={<RemittanceTrackingPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="employee.schedules" />}>
            <Route path="/employee/onboarding" element={<EmployeeOnboardingPage />} />
          </Route>

          <Route element={<EmployeeOnboardingRoute />}>
            <Route element={<ProtectedRoute permission="employee.schedules" />}>
              <Route path="/employee" element={<EmployeeTodayTasksPage />} />
              <Route path="/employee/calendar" element={<EmployeeCalendarPage />} />
              <Route path="/employee/leaves" element={<EmployeeLeavePage />} />
              <Route path="/employee/reports" element={<EmployeeDailyReportPage />} />
              <Route path="/employee/reports/history" element={<EmployeeReportHistoryPage />} />
              <Route path="/employee/summary" element={<EmployeeMonthlySummaryPage />} />
              <Route path="/employee/settings" element={<EmployeeSettingsPage />} />
              <Route path="/employee/rules" element={<EmployeeRulesPage />} />
            </Route>
          </Route>

          <Route element={<EmployeeOnboardingRoute />}>
            <Route element={<ProtectedRoute permission="employee.maintenance" />}>
              <Route path="/employee/maintenance" element={<EmployeeMaintenanceReportPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </AppErrorBoundary>
  );
}
