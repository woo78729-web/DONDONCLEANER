import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

const PENDING_STATUSES = new Set(['open', 'in_progress']);

export function EmergencyMaintenancePanel({ compact = false, showHeader = true }) {
  const [records, setRecords] = useState([]);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  async function loadRecords(nextPhone = phone) {
    setLoading(true);
    setError('');

    try {
      const result = await api.getMaintenanceRecords({
        customer_phone: nextPhone.trim() || undefined,
        per_page: compact ? 8 : 30,
      });

      const pending = (result.data.records || []).filter((record) => PENDING_STATUSES.has(record.status));
      setRecords(pending);
    } catch (err) {
      setError(err.message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecords('');
  }, []);

  const openCount = useMemo(
    () => records.filter((record) => record.status === 'open').length,
    [records],
  );

  async function handleSearch(event) {
    event.preventDefault();
    await loadRecords(phone);
  }

  async function updateStatus(record, nextStatus) {
    setError('');

    try {
      await api.updateMaintenanceRecord(record.id, { status: nextStatus });
      setSelected(null);
      await loadRecords(phone);
    } catch (err) {
      setError(err.message);
    }
  }

  const content = (
    <>
      <form className="filter-toolbar phone-lookup__form" onSubmit={handleSearch}>
        <label className="field phone-lookup__field">
          <span className="field-label">客戶電話</span>
          <input
            className="field-control"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="查詢待處理維修"
          />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
          {loading ? '查詢中...' : '查詢'}
        </button>
        {!compact && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadRecords('')} disabled={loading}>
            顯示全部待處理
          </button>
        )}
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {!records.length && !loading && (
        <p className="hint phone-lookup__empty">目前沒有待處理的緊急維修。</p>
      )}

      {records.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>回報時間</th>
                <th>客戶</th>
                <th>電話</th>
                <th>問題</th>
                <th>狀態</th>
                <th>師傅</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.created_at?.slice?.(0, 16) ?? record.created_at}</td>
                  <td>{record.customer_name || '-'}</td>
                  <td>{record.customer_phone}</td>
                  <td>{record.issue_description?.slice?.(0, 36)}{(record.issue_description?.length > 36) ? '…' : ''}</td>
                  <td>{record.status_label}</td>
                  <td>{record.assignee?.name || record.reporter?.name || '-'}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(record)}>
                      詳情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {compact && records.length > 0 && (
        <div className="schedule-day-toolbar">
          <Link to="/admin/emergency-maintenance" className="btn btn-secondary btn-sm">
            查看全部緊急維修
          </Link>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" role="presentation" onClick={() => setSelected(null)}>
          <div className="modal-panel modal-panel--wide" role="dialog" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">緊急維修 #{selected.id}</h2>
              <button type="button" className="modal-close" onClick={() => setSelected(null)} aria-label="關閉">×</button>
            </div>
            <p>{selected.issue_description}</p>
            <p className="hint">
              客戶：{selected.customer_name || '-'}｜{selected.customer_phone}
            </p>
            <p className="hint">狀態：{selected.status_label}</p>
            {selected.photos?.length > 0 && (
              <div className="maintenance-photo-grid">
                {selected.photos.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                    <img src={photo.url} alt={photo.caption || '問題照片'} />
                  </a>
                ))}
              </div>
            )}
            <div className="toolbar-actions">
              {selected.status !== 'in_progress' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateStatus(selected, 'in_progress')}>
                  標記處理中
                </button>
              )}
              {selected.status !== 'resolved' && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => updateStatus(selected, 'resolved')}>
                  標記已結案
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (!showHeader) {
    return content;
  }

  return (
    <section className={`card emergency-maintenance${compact ? ' emergency-maintenance--compact' : ''}`}>
      <div className="card-header">
        <div>
          <h2 className="card-title">緊急維修處理</h2>
          <p className="hint">
            待處理 {openCount} 件
            {compact ? '。可在此快速查詢，或前往完整頁面。' : '。獨立查詢待處理與處理中的維修案件。'}
          </p>
        </div>
        {!compact && (
          <Link to="/admin/maintenance" className="btn btn-secondary btn-sm">
            全部維修紀錄
          </Link>
        )}
      </div>
      {content}
    </section>
  );
}
