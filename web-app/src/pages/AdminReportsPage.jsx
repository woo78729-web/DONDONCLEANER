import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { Pagination } from '../components/Pagination';
import { AdminReportEditModal } from '../components/AdminReportEditModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

export default function AdminReportsPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ date_from: '', date_to: '', user_id: '', page: 1, per_page: 15 });
  const [employees, setEmployees] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingReport, setEditingReport] = useState(null);

  const canEdit = user?.role === 'admin';

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

  async function handleSaveReport(reportId, payload) {
    await api.updateAdminReport(reportId, payload);
    setMessage('回報已更新');
    setEditingReport(null);
    await loadReports(filters.page || 1);
  }

  return (
    <Layout title="回報總覽">
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">查詢條件</h2>
        </div>
        <div className="filter-toolbar">
          <label className="field field-compact">
            <span className="field-label">開始日期</span>
            <input className="field-control" type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
          </label>
          <label className="field field-compact">
            <span className="field-label">結束日期</span>
            <input className="field-control" type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
          </label>
          <label className="field field-compact">
            <span className="field-label">員工</span>
            <select className="field-control" value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}>
              <option value="">全部</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </label>
          <div className="toolbar-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => loadReports(1)}>查詢</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.exportReports(filters)}>匯出 CSV</button>
          </div>
        </div>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />

      {data && (
        <>
          <section className="summary-row">
            <span className="stat-badge">總筆數 {data.summary.total_reports}</span>
            <span className="stat-badge">總台數 {data.summary.total_completed_units}</span>
            <span className="stat-badge">總金額 {formatMoney(data.summary.total_collected_amount)}</span>
          </section>

          <section className="card table-card">
            <div className="table-wrap">
              <table className="data-table data-table--with-address">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>員工</th>
                    <th>地址</th>
                    <th>預計</th>
                    <th>完成</th>
                    <th>金額</th>
                    <th>員工實收</th>
                    <th>公司入帳</th>
                    <th>狀態</th>
                    {canEdit && <th>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.reports.map((report) => {
                    const hasUnitChange = Boolean(report.unit_mismatch);
                    const plannedUnits = report.planned_units ?? report.daily_schedule?.ac_units;

                    return (
                    <tr key={report.id} className={hasUnitChange ? 'row-report-changed' : ''}>
                      <td>{report.daily_schedule?.work_date?.slice?.(0, 10) ?? report.daily_schedule?.work_date}</td>
                      <td>{report.daily_schedule?.user?.name}</td>
                      <td>{report.daily_schedule?.customer_address}</td>
                      <td className="num">
                        {hasUnitChange ? (
                          <span className="report-units-changed">{plannedUnits}</span>
                        ) : (
                          plannedUnits
                        )}
                      </td>
                      <td className="num">
                        {hasUnitChange ? (
                          <span className="report-units-changed">{report.completed_units}</span>
                        ) : (
                          report.completed_units
                        )}
                      </td>
                      <td className="num">
                        {formatMoney(report.total_amount ?? report.collected_amount)}
                        {report.paid_to_company && (
                          <div className="hint">客戶匯款</div>
                        )}
                      </td>
                      <td className="num">
                        {report.paid_to_company
                          ? '0'
                          : formatMoney(report.employee_received ?? report.collected_amount)}
                        {report.paid_to_company && (
                          <div className="hint">現金實收</div>
                        )}
                      </td>
                      <td className="num">
                        {report.paid_to_company
                          ? (
                            <>
                              {formatMoney(report.company_inbound_amount ?? 0)}
                              {report.company_remittance?.status_label && (
                                <span className="hint">（{report.company_remittance.status_label}）</span>
                              )}
                            </>
                          )
                          : '-'}
                      </td>
                      <td>
                        {hasUnitChange && (
                          <div className="report-change-box" title={report.skip_reason || '台數異動'}>
                            <strong>台數異動</strong>
                            <span>
                              預計 {plannedUnits} → 完成 {report.completed_units}
                            </span>
                            {report.skip_reason && <span className="report-change-box__reason">{report.skip_reason}</span>}
                          </div>
                        )}
                        {report.paid_to_company && (
                          <span className={`status-pill${report.company_remittance?.is_overdue ? ' status-pill--warn' : ''}`}>
                            {report.company_remittance?.status_label || '待入帳'}
                          </span>
                        )}
                        {report.temporary_request && (
                          <div className="hint">臨時：{report.temporary_request}</div>
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingReport(report)}>
                            調整
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <Pagination pagination={data.pagination} onPageChange={loadReports} />
        </>
      )}

      <AdminReportEditModal
        open={Boolean(editingReport)}
        report={editingReport}
        onClose={() => setEditingReport(null)}
        onSave={handleSaveReport}
      />
    </Layout>
  );
}
