import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MaintenanceRecordDetailModal, compensationLabel, formatAmount } from './MaintenanceRecordDetailModal';
import { canEditMaintenanceCompensation, canViewMaintenanceCompensation } from '../utils/permissions';

export function MaintenanceHistoryPanel({
  initialPhone = '',
  refreshToken = 0,
}) {
  const { user } = useAuth();
  const canViewCompensation = canViewMaintenanceCompensation(user);
  const canEditCompensation = canEditMaintenanceCompensation(user);
  const [phone, setPhone] = useState(initialPhone);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhone(initialPhone);
  }, [initialPhone]);

  useEffect(() => {
    if (!initialPhone.trim()) {
      return;
    }

    loadRecords(initialPhone);
  }, [refreshToken, initialPhone]);

  async function loadRecords(nextPhone = phone) {
    const query = nextPhone.trim();

    if (!query) {
      setError('請輸入客戶電話');
      setRecords([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const result = await api.getMaintenanceRecords({
        customer_phone: query,
        per_page: 50,
      });

      setRecords(result.data.records || []);
    } catch (err) {
      setError(err.message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    await loadRecords(phone);
  }

  async function handleSave(payload) {
    if (!selected || !canEditCompensation) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.updateMaintenanceRecord(selected.id, payload);
      setSelected(null);
      await loadRecords(phone);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card emergency-maintenance">
      <div className="card-header">
        <div>
          <h2 className="card-title">歷史維修紀錄</h2>
          <p className="hint">輸入電話查詢過往報修、後續處理方式與維修金額。</p>
        </div>
        <Link to="/admin/maintenance" className="btn btn-secondary btn-sm">
          全部維修紀錄
        </Link>
      </div>

      <form className="filter-toolbar phone-lookup__form" onSubmit={handleSearch}>
        <label className="field phone-lookup__field">
          <span className="field-label">客戶電話</span>
          <input
            className="field-control"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="查詢歷史維修紀錄"
          />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
          {loading ? '查詢中…' : '查詢'}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {!searched && !loading && (
        <p className="hint phone-lookup__empty">輸入電話後查詢，即可查看歷史維修紀錄。</p>
      )}

      {searched && !loading && records.length === 0 && !error && (
        <p className="hint phone-lookup__empty">查無符合的維修紀錄。</p>
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
                <th>後續處理方式</th>
                <th>是否賠款</th>
                {canViewCompensation && <th>賠款總額</th>}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.created_at?.slice?.(0, 16) ?? record.created_at}</td>
                  <td>{record.customer_name || '-'}</td>
                  <td>{record.customer_phone}</td>
                  <td>{record.issue_description?.slice?.(0, 24)}{(record.issue_description?.length > 24) ? '…' : ''}</td>
                  <td>{record.status_label}</td>
                  <td>{record.assignee?.name || record.reporter?.name || '-'}</td>
                  <td>{record.follow_up_method?.slice?.(0, 20) || '-'}{(record.follow_up_method?.length > 20) ? '…' : ''}</td>
                  <td>{compensationLabel(record.requires_compensation)}</td>
                  {canViewCompensation && <td>{formatAmount(record.service_amount)}</td>}
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

      <MaintenanceRecordDetailModal
        record={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onSave={handleSave}
        saving={saving}
        canViewCompensation={canViewCompensation}
        canEditCompensation={canEditCompensation}
      />
    </section>
  );
}
