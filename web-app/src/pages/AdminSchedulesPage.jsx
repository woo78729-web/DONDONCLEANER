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

function formatDate(value) {
  if (!value) {
    return '';
  }

  return String(value).slice(0, 10);
}

export default function AdminSchedulesPage() {
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    user_id: '',
    has_report: '',
    page: 1,
    per_page: 10,
  });
  const [form, setForm] = useState(emptySchedule);
  const [editId, setEditId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadEmployees() {
    const result = await api.getEmployees();
    setEmployees(result.data.filter((item) => item.is_active));
  }

  async function loadSchedules(page = filters.page) {
    setError('');

    try {
      const result = await api.getSchedules({ ...filters, page });
      setSchedules(result.data.schedules);
      setPagination(result.data.pagination);
      setFilters((prev) => ({ ...prev, page }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadEmployees().catch((err) => setError(err.message));
    loadSchedules(1);
  }, []);

  function startEdit(schedule) {
    if (schedule.daily_report) {
      setError('此班表已有回報紀錄，無法編輯');
      return;
    }

    setEditId(schedule.id);
    setForm({
      user_id: String(schedule.user_id),
      work_date: formatDate(schedule.work_date),
      customer_address: schedule.customer_address,
      customer_phone: schedule.customer_phone,
      task_details: schedule.task_details,
      notes: schedule.notes || '',
    });
    setMessage(`正在編輯班表 #${schedule.id}`);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditId(null);
    setForm(emptySchedule);
    setMessage('');
  }

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

      cancelEdit();
      await loadSchedules(1);
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
              <button type="button" className="secondary" onClick={cancelEdit}>取消編輯</button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>班表列表</h2>
        <div className="form-grid cols-4">
          <label>
            開始日期
            <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
          </label>
          <label>
            結束日期
            <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
          </label>
          <label>
            員工
            <select value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}>
              <option value="">全部</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </label>
          <label>
            回報狀態
            <select value={filters.has_report} onChange={(e) => setFilters({ ...filters, has_report: e.target.value })}>
              <option value="">全部</option>
              <option value="0">未回報</option>
              <option value="1">已回報</option>
            </select>
          </label>
        </div>
        <div className="actions" style={{ marginTop: '12px' }}>
          <button type="button" onClick={() => loadSchedules(1)}>查詢</button>
        </div>
      </section>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>員工</th>
              <th>地址</th>
              <th>機型/金額</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => (
              <tr key={schedule.id}>
                <td>{formatDate(schedule.work_date)}</td>
                <td>{schedule.user?.name}</td>
                <td>{schedule.customer_address}</td>
                <td>{schedule.task_details}</td>
                <td>{schedule.daily_report ? '已回報' : '未回報'}</td>
                <td>
                  {!schedule.daily_report && (
                    <button type="button" className="secondary" onClick={() => startEdit(schedule)}>編輯</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {pagination && (
        <div className="actions">
          <button type="button" className="secondary" disabled={pagination.current_page <= 1} onClick={() => loadSchedules(pagination.current_page - 1)}>上一頁</button>
          <span>第 {pagination.current_page} / {pagination.last_page} 頁</span>
          <button type="button" className="secondary" disabled={pagination.current_page >= pagination.last_page} onClick={() => loadSchedules(pagination.current_page + 1)}>下一頁</button>
        </div>
      )}
    </Layout>
  );
}
