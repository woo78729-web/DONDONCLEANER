import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';

export default function AdminReportsPage() {
  const [filters, setFilters] = useState({ date_from: '', date_to: '', user_id: '', page: 1, per_page: 15 });
  const [employees, setEmployees] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getEmployees().then((result) => setEmployees(result.data)).catch(() => {});
  }, []);

  async function loadReports(page = 1) {
    setError('');

    try {
      const result = await api.getReports({ ...filters, page });
      setData(result.data);
      setFilters((prev) => ({ ...prev, page }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadReports(1);
  }, []);

  return (
    <Layout title="回報總覽">
      <section className="card">
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
          <div className="actions align-end">
            <button type="button" onClick={() => loadReports(1)}>查詢</button>
            <button type="button" className="secondary" onClick={() => api.exportReports(filters)}>匯出 CSV</button>
          </div>
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      {data && (
        <>
          <section className="summary-row">
            <span className="badge">總筆數 {data.summary.total_reports}</span>
            <span className="badge">總台數 {data.summary.total_completed_units}</span>
            <span className="badge">總金額 {data.summary.total_collected_amount}</span>
          </section>

          <section className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>員工</th>
                  <th>地址</th>
                  <th>台數</th>
                  <th>金額</th>
                </tr>
              </thead>
              <tbody>
                {data.reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.daily_schedule?.work_date?.slice?.(0, 10) ?? report.daily_schedule?.work_date}</td>
                    <td>{report.daily_schedule?.user?.name}</td>
                    <td>{report.daily_schedule?.customer_address}</td>
                    <td>{report.completed_units}</td>
                    <td>{report.collected_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="actions">
            <button type="button" className="secondary" disabled={data.pagination.current_page <= 1} onClick={() => loadReports(data.pagination.current_page - 1)}>上一頁</button>
            <span>第 {data.pagination.current_page} / {data.pagination.last_page} 頁</span>
            <button type="button" className="secondary" disabled={data.pagination.current_page >= data.pagination.last_page} onClick={() => loadReports(data.pagination.current_page + 1)}>下一頁</button>
          </div>
        </>
      )}
    </Layout>
  );
}
