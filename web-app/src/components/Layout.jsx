import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Layout({ title, children }) {
  const { user, logout } = useAuth();

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">冷氣清洗派班與帳務管理</p>
          <h1>{title}</h1>
        </div>
        <div className="header-actions">
          {user && (
            <span className="badge">{user.name} · {user.role}</span>
          )}
          <button type="button" className="secondary" onClick={logout}>登出</button>
        </div>
      </header>
      <nav className="nav">
        {user?.role === 'admin' && (
          <>
            <Link to="/admin">回報總覽</Link>
            <Link to="/admin/employees">員工管理</Link>
            <Link to="/admin/schedules">班表管理</Link>
          </>
        )}
        {user?.role === 'employee' && (
          <Link to="/employee">我的班表</Link>
        )}
      </nav>
      <main>{children}</main>
    </div>
  );
}
