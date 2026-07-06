import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialYearMonth = searchParams.get('year_month') || currentYearMonth();
  const [yearMonth, setYearMonth] = useState(initialYearMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [editDraft, setEditDraft] = useState({ expected_remittance_date: '', confirmed_at: '' });
  const [savingEdit, setSavingEdit] = useState(false);

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

  useEffect(() => {
    const next = searchParams.get('year_month');
    if (next && next !== yearMonth) {
      setYearMonth(next);
    }
  }, [searchParams, yearMonth]);

  function handleYearMonthChange(value) {
    setYearMonth(value);
    setSearchParams(value ? { year_month: value } : {}, { replace: true });
  }

  function openEditModal(item) {
    setEditItem(item);
    setEditDraft({
      expected_remittance_date: item.expected_remittance_date || item.work_date || '',
      confirmed_at: item.confirmed_at ? item.confirmed_at.slice(0, 10) : '',
    });
  }

  function closeEditModal() {
    setEditItem(null);
    setEditDraft({ expected_remittance_date: '', confirmed_at: '' });
  }

  async function handleSaveEdit(event) {
    event.preventDefault();

    if (!editItem) {
      return;
    }

    setSavingEdit(true);
    setError('');
    setMessage('');

    try {
      await api.updateRemittance(editItem.id, {
        expected_remittance_date: editDraft.expected_remittance_date || null,
        confirmed_at: editDraft.confirmed_at || null,
      });
      setMessage('匯款紀錄已更新');
      closeEditModal();
      await loadTracking(yearMonth);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

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
      setMessage('已確認入帳');
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
              <th>預計匯款</th>
              <th>實際入帳</th>
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
                <td>{item.expected_remittance_date || item.work_date || '-'}</td>
                <td>{item.confirmed_at ? item.confirmed_at.slice(0, 10) : '-'}</td>
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
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEditModal(item)}
                      >
                        編輯
                      </button>
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
                <td colSpan={showActions ? 9 : 8} className="hint">尚無資料</td>
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
          <p className="hint">師傅回報或專案勾選「客戶報帳匯款」後會列入待匯款；營業額與宏逸 8% 代墊依工單日期計入當月，不受入帳狀態影響。</p>
        </div>
        <div className="filter-toolbar">
          <label className="field field-compact">
            <span className="field-label">月份</span>
            <input
              className="field-control"
              type="month"
              value={yearMonth}
              onChange={(event) => handleYearMonthChange(event.target.value)}
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
            {renderTable(data.confirmed || [], { showActions: true })}
          </section>
        </>
      )}

      {editItem && (
        <div className="modal-backdrop" onClick={closeEditModal}>
          <form className="modal-card" onClick={(event) => event.stopPropagation()} onSubmit={handleSaveEdit}>
            <div className="card-header">
              <h2 className="card-title">編輯匯款紀錄</h2>
              <p className="hint">{editItem.customer_name} · {editItem.work_date}</p>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">預計匯款日期</span>
                <input
                  className="field-control"
                  type="date"
                  value={editDraft.expected_remittance_date}
                  onChange={(event) => setEditDraft((draft) => ({
                    ...draft,
                    expected_remittance_date: event.target.value,
                  }))}
                />
              </label>
              <label className="field">
                <span className="field-label">實際入帳日期</span>
                <input
                  className="field-control"
                  type="date"
                  value={editDraft.confirmed_at}
                  onChange={(event) => setEditDraft((draft) => ({
                    ...draft,
                    confirmed_at: event.target.value,
                  }))}
                />
                <span className="hint">填寫後會標記為已入帳；清空可改回待匯款。</span>
              </label>
            </div>
            <div className="toolbar-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={closeEditModal} disabled={savingEdit}>
                取消
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                {savingEdit ? '儲存中...' : '儲存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}
