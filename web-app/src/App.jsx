import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import AdminReportsPage from './pages/AdminReportsPage';
import AdminEmployeesPage from './pages/AdminEmployeesPage';
import AdminSchedulesPage from './pages/AdminSchedulesPage';
import EmployeeSchedulesPage from './pages/EmployeeSchedulesPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute role="admin" />}>
            <Route path="/admin" element={<AdminReportsPage />} />
            <Route path="/admin/employees" element={<AdminEmployeesPage />} />
            <Route path="/admin/schedules" element={<AdminSchedulesPage />} />
          </Route>
          <Route element={<ProtectedRoute role="employee" />}>
            <Route path="/employee" element={<EmployeeSchedulesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
