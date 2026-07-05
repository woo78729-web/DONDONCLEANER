import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AuthLoadingScreen } from './AppStatusScreens';
import { canAccess, getHomePath } from '../utils/permissions';

export function ProtectedRoute({ allowedRoles, permission }) {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && user && !api.getToken()) {
      logout().finally(() => navigate('/login', { replace: true }));
    }
  }, [loading, user, logout, navigate]);

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getHomePath(user.role)} replace />;
  }

  if (permission && !canAccess(user, permission)) {
    return <Navigate to={getHomePath(user.role)} replace />;
  }

  return <Outlet />;
}
