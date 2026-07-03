import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
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
    return (
      <div className="app-shell">
        <div className="app-shell__backdrop" aria-hidden="true" />
        <div className="app-shell__content page-content">
          <div className="card">
            <p className="hint">載入中...</p>
          </div>
        </div>
      </div>
    );
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
