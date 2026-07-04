import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { canManageSchedulePricing } from '../utils/permissions';
import { MaintenanceReportFromScheduleModal } from './MaintenanceReportFromScheduleModal';
import { formatDateOnly, formatTimeValue, getCustomerSourceLabel } from '../utils/scheduleCalendar';

export function CustomerPhoneLookup({
  onSelectSchedule,
  showMaintenanceButton = true,
  onMaintenanceCreated,
  onSearchComplete,
}) {
  const { user } = useAuth();
  const showPricing = canManageSchedulePricing(user);
  const [phone, setPhone] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [maintenanceSchedule, setMaintenanceSchedule] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSearch(event) {
    event.preventDefault();

    const query = phone.trim();

    if (!query) {
      setError('請輸入客戶電話');
      setSchedules([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const result = await api.customerLookup(query);
      setSchedules(result.data.schedules ?? []);
      onSearchComplete?.(query);
    } catch (err) {
      setError(err.message);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="filter-toolbar phone-lookup__form" onSubmit={handleSearch}>
        <label className="field phone-lookup__field">
          <span className="field-label">客戶電話</span>
          <input
            className="field-control"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="例如 0912345678"
          />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
          {loading ? '查詢中...' : '查詢紀錄'}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}
      {successMessage && <div className="alert alert-success">{successMessage}</div>}

      {searched && !loading && schedules.length === 0 && !error && (
        <p className="hint phone-lookup__empty">查無符合的清洗紀錄。</p>
      )}

      {schedules.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <h3 className="section-label">清洗紀錄</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>施工日期</th>
                <th>時間</th>
                <th>客戶</th>
                <th>FB/LINE</th>
                <th>師傅</th>
                <th>來源</th>
                {showPricing && <th>金額</th>}
                {(onSelectSchedule || showMaintenanceButton) && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{formatDateOnly(schedule.work_date)}</td>
                  <td>{formatTimeValue(schedule.start_time)} – {formatTimeValue(schedule.end_time)}</td>
                  <td>{schedule.customer_name}</td>
                  <td>
                    {schedule.fb_display_name && <div>FB：{schedule.fb_display_name}</div>}
                    {schedule.line_display_name && <div>LINE：{schedule.line_display_name}</div>}
                  </td>
                  <td>{schedule.user?.name ?? '-'}</td>
                  <td>{getCustomerSourceLabel(schedule.customer_source)}</td>
                  {showPricing && <td>{schedule.cleaning_price} 元</td>}
                  {(onSelectSchedule || showMaintenanceButton) && (
                    <td>
                      <div className="button-row">
                        {onSelectSchedule && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelectSchedule(schedule)}>
                            展開
                          </button>
                        )}
                        {showMaintenanceButton && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setSuccessMessage('');
                              setMaintenanceSchedule(schedule);
                            }}
                          >
                            報修
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MaintenanceReportFromScheduleModal
        schedule={maintenanceSchedule}
        open={Boolean(maintenanceSchedule)}
        onClose={() => setMaintenanceSchedule(null)}
        onSuccess={(schedule) => {
          const technicianName = schedule.user?.name || '清洗師傅';
          setSuccessMessage(`已送出報修，${technicianName} 的帳戶可查看此案件。`);
          onMaintenanceCreated?.(schedule);
        }}
      />
    </>
  );
}
