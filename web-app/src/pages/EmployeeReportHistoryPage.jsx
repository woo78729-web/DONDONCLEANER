import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { api } from '../api/client';
import { formatDateOnly, formatTimeValue } from '../utils/scheduleCalendar';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

function defaultDateRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);

  const toString = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  return {
    date_from: toString(from),
    date_to: toString(now),
  };
}

export default function EmployeeReportHistoryPage() {
  const [filters, setFilters] = useState(defaultDateRange);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadHistory(nextFilters = filters) {
    setLoading(true);
    setError('');

    try {
      const result = await api.getReportHistory(nextFilters);
      setReports(result.data.reports || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <Layout title="回報紀錄">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">歷史回報</h2>
            <p className="hint">可往前查詢已送出的台數與金額，如需修改請聯絡管理員。</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadHistory()} disabled={loading}>
            {loading ? '載入中...' : '重新整理'}
          </button>
        </div>

        <div className="filter-toolbar">
          <label className="field field-compact">
            <span className="field-label">開始日期</span>
            <input
              className="field-control"
              type="date"
              value={filters.date_from}
              onChange={(event) => setFilters({ ...filters, date_from: event.target.value })}
            />
          </label>
          <label className="field field-compact">
            <span className="field-label">結束日期</span>
            <input
              className="field-control"
              type="date"
              value={filters.date_to}
              onChange={(event) => setFilters({ ...filters, date_to: event.target.value })}
            />
          </label>
          <div className="toolbar-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => loadHistory(filters)}>
              查詢
            </button>
          </div>
        </div>
      </section>

      <PageAlert type="error" message={error} />

      <section className="card table-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>客戶</th>
                <th>預計</th>
                <th>完成</th>
                <th>未洗</th>
                <th>實收</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>
                    {formatDateOnly(report.daily_schedule?.work_date)}
                    <div className="hint">
                      {formatTimeValue(report.daily_schedule?.start_time)} – {formatTimeValue(report.daily_schedule?.end_time)}
                    </div>
                  </td>
                  <td>
                    {report.daily_schedule?.customer_name || '-'}
                    <div className="hint">{report.daily_schedule?.customer_address}</div>
                  </td>
                  <td className="num">{report.planned_units}</td>
                  <td className="num">{report.completed_units}</td>
                  <td className="num">
                    {report.skipped_units}
                    {report.unit_mismatch && <span className="status-pill status-pill--warn">不符</span>}
                  </td>
                  <td className="num">{formatMoney(report.collected_amount)}</td>
                  <td>
                    {report.skip_reason && <div>未洗：{report.skip_reason}</div>}
                    {report.temporary_request && <div>臨時：{report.temporary_request}</div>}
                    {report.paid_to_company && <div className="hint">匯款給公司</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!reports.length && !loading && (
          <p className="hint" style={{ padding: 16 }}>此區間沒有回報紀錄。</p>
        )}
      </section>
    </Layout>
  );
}
