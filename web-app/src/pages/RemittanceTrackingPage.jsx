import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { api } from '../api/client';

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

export default function RemittanceTrackingPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadTracking(nextYearMonth = yearMonth) {
    setLoading(true);
    setError('');

    try {
      const result = await api.getRemittanceTracking(nextYearMonth);
      setData(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTracking(yearMonth);
  }, [yearMonth]);

  async function handleRemind(remittanceId) {
    setError('');
    setMessage('');

    try {
      await api.remindRemittance(remittanceId);
      setMessage('已標記催繳，一週後若仍未入帳會再次提醒');
      await loadTracking(yearMonth);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConfirm(remittanceId) {
    setError('');
    setMessage('');

    try {
      await api.confirmRemittance(remittanceId);
      setMessage('已確認入帳，金額已列入宏逸帳戶');
      await loadTracking(yearMonth);
    } catch (err) {
      setError(err.message);
    }
  }

  function renderTable(items, { showActions = false } = {}) {
    return (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>師傅</th>
              <th>客戶</th>
              <th>地址</th>
              <th>匯款金額</th>
              <th>狀態</th>
              {showActions && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={item.is_overdue ? 'row-warning' : ''}>
                <td>{item.work_date}</td>
                <td>{item.employee_name || '-'}</td>
                <td>{item.customer_name || '-'}</td>
                <td>{item.customer_address || '-'}</td>
                <td className="num">{formatMoney(item.amount)}</td>
                <td>
                  <span className={`status-pill${item.is_overdue ? ' status-pill--warn' : ''}`}>
                    {item.status_label}
                    {item.is_overdue ? '（逾時）' : ''}
                  </span>
                </td>
                {showActions && (
                  <td>
                    <div className="toolbar-actions">
                      {item.status !== 'confirmed' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleRemind(item.id)}
                          >
                            已催繳
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleConfirm(item.id)}
                          >
                            已入帳
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={showActions ? 7 : 6} className="hint">尚無資料</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Layout title="匯款追查">
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">月份查詢</h2>
          <p className="hint">師傅回報「客戶匯款給公司」後會列入待匯款；確認入帳後才計入記帳表宏逸帳戶。</p>
        </div>
        <div className="filter-toolbar">
          <label className="field field-compact">
            <span className="field-label">月份</span>
            <input
              className="field-control"
              type="month"
              value={yearMonth}
              onChange={(event) => setYearMonth(event.target.value)}
            />
          </label>
          <div className="toolbar-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => loadTracking(yearMonth)} disabled={loading}>
              {loading ? '載入中...' : '重新整理'}
            </button>
          </div>
        </div>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />

      {data && (
        <>
          <section className="summary-row">
            <span className="stat-badge stat-badge--highlight">待匯款 {formatMoney(data.totals.pending_amount)}</span>
            <span className="stat-badge">已入帳 {formatMoney(data.totals.confirmed_amount)}</span>
          </section>

          <section className="card table-card">
            <div className="card-header" style={{ padding: '16px 16px 0' }}>
              <h2 className="card-title">當月待匯款區</h2>
              <p className="hint">超過兩週未入帳會在登入時提醒；按「已催繳」可延後一週再提醒。</p>
            </div>
            {renderTable(data.pending || [], { showActions: true })}
          </section>

          <section className="card table-card">
            <div className="card-header" style={{ padding: '16px 16px 0' }}>
              <h2 className="card-title">本月已入帳</h2>
            </div>
            {renderTable(data.confirmed || [])}
          </section>
        </>
      )}
    </Layout>
  );
}
