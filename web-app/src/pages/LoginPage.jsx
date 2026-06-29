import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError, useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, login, error, setError } = useAuth();
  const [account, setAccount] = useState('admin1');
  const [password, setPassword] = useState('password123');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/employee'} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const result = await login(account.trim(), password);
      window.location.href = result.data.user.role === 'admin' ? '/admin' : '/employee';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登入失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="card login-card">
        <p className="eyebrow">冷氣清洗派班與帳務管理</p>
        <h1>登入系統</h1>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            帳號
            <input value={account} onChange={(e) => setAccount(e.target.value)} />
          </label>
          <label>
            密碼
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={submitting}>{submitting ? '登入中...' : '登入'}</button>
        </form>
        <p className="hint">測試帳號：admin1 / emp1，密碼 password123</p>
      </div>
    </div>
  );
}
