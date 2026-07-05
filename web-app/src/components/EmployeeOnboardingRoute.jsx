import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLoadingScreen } from './AppStatusScreens';
import {
  EMPLOYEE_ONBOARDING_PATH,
  needsEmployeeOnboarding,
} from '../utils/onboarding';
import { getHomePath } from '../utils/permissions';

export function EmployeeOnboardingRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'employee') {
    return <Navigate to={getHomePath(user.role)} replace />;
  }

  const onboarding = needsEmployeeOnboarding(user);
  const onOnboardingPage = location.pathname === EMPLOYEE_ONBOARDING_PATH;
  const onRulesPage = location.pathname === '/employee/rules';

  if (onboarding && !onOnboardingPage) {
    return <Navigate to={EMPLOYEE_ONBOARDING_PATH} replace />;
  }

  if (!onboarding && onOnboardingPage) {
    return <Navigate to="/employee" replace />;
  }

  if (onboarding && onRulesPage) {
    return <Navigate to={EMPLOYEE_ONBOARDING_PATH} replace />;
  }

  return <Outlet />;
}
