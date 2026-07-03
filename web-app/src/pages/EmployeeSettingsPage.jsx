import { useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function EmployeeSettingsPage() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({
    current_password: '',
    password: '',
    password_confirmation: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      await api.updatePassword(form.current_password, form.password, form.password_confirmation);
      await refreshUser();
      setMessage('密碼已更新');
      setForm({
        current_password: '',
        password: '',
        password_confirmation: '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout title="帳戶設定">
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">帳戶資訊</h2>
        </div>
        <dl className="schedule-detail">
          <div>
            <dt>姓名</dt>
            <dd>{user?.name || '-'}</dd>
          </div>
          <div>
            <dt>帳號</dt>
            <dd>{user?.account || '-'}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">變更密碼</h2>
          <p className="hint">帳號由管理員建立，您可自行更新登入密碼。</p>
        </div>

        <PageAlert type="success" message={message} />
        <PageAlert type="error" message={error} />

        <form className="form-grid cols-2" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">目前密碼</span>
            <input
              className="field-control"
              type="password"
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">新密碼</span>
            <input
              className="field-control"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">確認新密碼</span>
            <input
              className="field-control"
              type="password"
              value={form.password_confirmation}
              onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <div className="toolbar-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '更新中...' : '更新密碼'}
            </button>
          </div>
        </form>
      </section>
    </Layout>
  );
}
