import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';

const emptySchedule = {
  user_id: '',
  work_date: '',
  customer_address: '',
  customer_phone: '',
  task_details: '',
  notes: '',
};

export default function AdminSchedulesPage() {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptySchedule);
  const [editId, setEditId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getEmployees().then((result) => setEmployees(result.data.filter((item) => item.is_active)));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const payload = {
      ...form,
      user_id: Number(form.user_id),
    };

    try {
      if (editId) {
        await api.updateSchedule(editId, payload);
        setMessage('班表更新成功');
      } else {
        await api.createSchedule(payload);
        setMessage('班表建立成功');
      }

      setForm(emptySchedule);
      setEditId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title="班表管理">
      <section className="card">
        <h2>{editId ? `編輯班表 #${editId}` : '新增班表'}</h2>
        <form className="form-grid cols-2" onSubmit={handleSubmit}>
          <label>
            員工
            <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
              <option value="">請選擇</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </label>
          <label>工作日期<input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} required /></label>
          <label>客戶地址<input value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} required /></label>
          <label>客戶電話<input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} required /></label>
          <label>機型/金額<input value={form.task_details} onChange={(e) => setForm({ ...form, task_details: e.target.value })} required /></label>
          <label>備註<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="actions">
            <button type="submit">{editId ? '更新班表' : '建立班表'}</button>
            {editId && (
              <button type="button" className="secondary" onClick={() => { setEditId(null); setForm(emptySchedule); }}>取消編輯</button>
            )}
          </div>
        </form>
        <p className="hint">編輯請直接輸入班表 ID 後載入（Demo 版）。已回報的班表無法編輯。</p>
        <div className="actions">
          <input placeholder="輸入班表 ID" id="scheduleIdInput" />
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const id = document.getElementById('scheduleIdInput').value;
              if (id) {
                setEditId(Number(id));
                setMessage(`請修改下方表單後送出以更新班表 #${id}`);
              }
            }}
          >
            載入班表 ID
          </button>
        </div>
      </section>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </Layout>
  );
}
