import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';

export default function EmployeeSchedulesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadSchedules() {
    setError('');

    try {
      const result = await api.getEmployeeSchedules();
      setData(result.data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadSchedules();
  }, []);

  async function submitReport(schedule) {
    const completedUnits = Number(window.prompt('實際清洗台數', '1'));
    const collectedAmount = Number(window.prompt('實際收取金額', '11000'));

    if (Number.isNaN(completedUnits) || Number.isNaN(collectedAmount)) {
      return;
    }

    setError('');
    setMessage('');

    try {
      await api.submitReport(schedule.id, completedUnits, collectedAmount);
      setMessage('回報提交成功');
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title="我的班表">
      <section className="card">
        <div className="actions">
          <button type="button" onClick={loadSchedules}>重新整理</button>
        </div>
        {data && (
          <p className="hint">顯示 {data.date_range.today} 至 {data.date_range.tomorrow} 的班表</p>
        )}
      </section>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>地址</th>
              <th>機型/金額</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(data?.schedules ?? []).map((schedule) => (
              <tr key={schedule.id}>
                <td>{schedule.work_date?.slice?.(0, 10) ?? schedule.work_date}</td>
                <td>{schedule.customer_address}</td>
                <td>{schedule.task_details}</td>
                <td>{schedule.daily_report ? '已回報' : '未回報'}</td>
                <td>
                  {!schedule.daily_report && (
                    <button type="button" onClick={() => submitReport(schedule)}>提交回報</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Layout>
  );
}
