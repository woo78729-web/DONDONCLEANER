import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { api } from '../api/client';
import '../components/schedule-calendar.css';

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
  const [editDraft, setEditDraft] = useState({
    expected_remittance_date: '',
    confirmed_at: '',
    amount: '',
    split_amount: '',
    split_expected_remittance_date: '',
  });
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
      amount: String(item.amount || ''),
      split_amount: '',
      split_expected_remittance_date: item.expected_remittance_date || item.work_date || '',
    });
  }

  function closeEditModal() {
    setEditItem(null);
    setEditDraft({
      expected_remittance_date: '',
      confirmed_at: '',
      amount: '',
      split_amount: '',
      split_expected_remittance_date: '',
    });
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
        amount: Number(editDraft.amount || editItem.amount),
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

  async function handleSplitFromEdit(event) {
    event.preventDefault();

    if (!editItem) {
      return;
    }

    const splitAmount = Number(editDraft.split_amount);

    if (!Number.isFinite(splitAmount) || splitAmount < 1 || splitAmount >= Number(editItem.amount || 1)) {
      setError(`拆分金額需大於 0 且小於 ${formatMoney(editItem.amount)} 元`);
      return;
    }

    setSavingEdit(true);
    setError('');
    setMessage('');

    try {
      await api.splitRemittance(editItem.id, {
        split_amount: splitAmount,
        expected_remittance_date: editDraft.split_expected_remittance_date || null,
      });
      setMessage('匯款紀錄已拆分');
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
                <td>
                  {item.employee_name || '-'}
                  {item.is_project_total && item.project_code && (
                    <div className="hint">
                      專案 {item.project_code}
                      {item.split_total_count > 1 && (
                        <> · 第 {item.split_index}/{item.split_total_count} 筆</>
                      )}
                    </div>
                  )}
                </td>
                <td>{item.customer_name || '-'}</td>
                <td>{item.customer_address || '-'}</td>
                <td>{item.expected_remittance_date || item.work_date || '-'}</td>
                <td>{item.confirmed_at ? item.confirmed_at.slice(0, 10) : '-'}</td>
                <td className="num">
                  {formatMoney(item.amount)}
                  {item.order_total_amount && item.split_total_count > 1 && (
                    <div className="hint">全案 {formatMoney(item.order_total_amount)}</div>
                  )}
                  {item.amount_mismatch && (
                    <div className="hint hint--warning">拆帳總額與訂單不符</div>
                  )}
                </td>
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

  const isConfirmed = editItem?.status === 'confirmed';
  const canSplit = editItem?.can_split && !isConfirmed;
  const remainingAfterSplit = editItem
    ? Math.max(0, Number(editItem.amount || 0) - Number(editDraft.split_amount || 0))
    : 0;

  return (
    <Layout title="匯款追查">
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">月份查詢</h2>
          <p className="hint">專案工單只產生一筆主匯款（總尾款），可於編輯內無限次拆帳分批入帳；營業額與宏逸 8% 仍依工單日期計入。</p>
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
        <div className="modal-overlay schedule-form-overlay" role="presentation" onClick={closeEditModal}>
          <div
            className="modal-panel modal-panel--wide schedule-form-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2 className="modal-title">編輯匯款紀錄</h2>
                <p className="hint">
                  {editItem.customer_name} · {editItem.work_date}
                  {editItem.order_total_amount ? ` · 訂單總額 ${formatMoney(editItem.order_total_amount)} 元` : ''}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={closeEditModal} aria-label="關閉">×</button>
            </div>

            <form className="form-grid cols-2" onSubmit={handleSaveEdit}>
              <label className="field">
                <span className="field-label">匯款金額</span>
                <input
                  className="field-control"
                  type="number"
                  min="1"
                  value={editDraft.amount}
                  disabled={isConfirmed}
                  onChange={(event) => setEditDraft((draft) => ({
                    ...draft,
                    amount: event.target.value,
                  }))}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">預計匯款日期</span>
                <input
                  className="field-control"
                  type="date"
                  value={editDraft.expected_remittance_date}
                  disabled={isConfirmed}
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

              {canSplit && (
                <div className="form-section" style={{ gridColumn: '1 / -1' }}>
                  <div className="form-section__body">
                    <h3 className="card-subtitle">拆帳（分次匯款）</h3>
                    <p className="hint">從此筆獨立拆分出一筆新紀錄，原紀錄會扣除拆分金額，兩筆皆綁定同一訂單。</p>
                    <div className="form-grid cols-2">
                      <label className="field">
                        <span className="field-label">拆分金額</span>
                        <input
                          className="field-control"
                          type="number"
                          min="1"
                          max={Math.max(1, Number(editItem.amount || 1) - 1)}
                          value={editDraft.split_amount}
                          onChange={(event) => setEditDraft((draft) => ({
                            ...draft,
                            split_amount: event.target.value,
                          }))}
                          placeholder="例如 10000"
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">新紀錄預計匯款日</span>
                        <input
                          className="field-control"
                          type="date"
                          value={editDraft.split_expected_remittance_date}
                          onChange={(event) => setEditDraft((draft) => ({
                            ...draft,
                            split_expected_remittance_date: event.target.value,
                          }))}
                        />
                      </label>
                    </div>
                    {Number(editDraft.split_amount) > 0 && (
                      <p className="hint">
                        拆分後此筆剩餘 {formatMoney(remainingAfterSplit)} 元，新紀錄 {formatMoney(editDraft.split_amount)} 元。
                      </p>
                    )}
                    <div className="toolbar-actions" style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={savingEdit || !editDraft.split_amount}
                        onClick={handleSplitFromEdit}
                      >
                        {savingEdit ? '處理中...' : '確認拆帳'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="button" className="btn btn-secondary btn-pill" onClick={closeEditModal} disabled={savingEdit}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary btn-pill" disabled={savingEdit}>
                  {savingEdit ? '儲存中...' : '儲存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
