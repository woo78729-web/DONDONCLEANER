import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ account: '', password: '', name: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadEmployees() {
    const result = await api.getEmployees();
    setEmployees(result.data);
  }

  useEffect(() => {
    loadEmployees().catch((err) => setError(err.message));
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      await api.createEmployee(form.account, form.password, form.name);
      setForm({ account: '', password: '', name: '' });
      setMessage('員工建立成功');
      await loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(employee) {
    setError('');
    setMessage('');

    try {
      await api.updateEmployee(employee.id, { is_active: !employee.is_active });
      setMessage(employee.is_active ? '員工已停用' : '員工已啟用');
      await loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title="員工管理">
      <section className="card">
        <h2>新增員工</h2>
        <form className="form-grid cols-3" onSubmit={handleCreate}>
          <label>帳號<input value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} required /></label>
          <label>密碼<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          <label>姓名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <button type="submit">建立員工</button>
        </form>
      </section>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>帳號</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td>{employee.name}</td>
                <td>{employee.account}</td>
                <td>{employee.is_active ? '啟用' : '停用'}</td>
                <td>
                  <button type="button" className="secondary" onClick={() => toggleActive(employee)}>
                    {employee.is_active ? '停用' : '啟用'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Layout>
  );
}
