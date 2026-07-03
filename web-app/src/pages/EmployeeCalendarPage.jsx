import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { EmployeeScheduleList } from '../components/EmployeeScheduleList';
import { ScheduleSnapshotModal } from '../components/ScheduleSnapshotModal';
import { api } from '../api/client';
import {
  formatDateOnly,
  formatScheduleDateLabel,
} from '../utils/scheduleCalendar';

function todayDateString() {
  return formatDateOnly(new Date());
}

function tomorrowDateString() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return formatDateOnly(next);
}

function shiftDate(dateStr, days) {
  const next = new Date(`${dateStr}T12:00:00`);
  next.setDate(next.getDate() + days);
  return formatDateOnly(next);
}

export default function EmployeeCalendarPage() {
  const today = todayDateString();
  const tomorrow = tomorrowDateString();
  const [selectedDate, setSelectedDate] = useState(tomorrow);
  const [schedules, setSchedules] = useState([]);
  const [snapshotSchedule, setSnapshotSchedule] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const dateLabel = useMemo(
    () => formatScheduleDateLabel(selectedDate),
    [selectedDate],
  );

  const loadSchedules = useCallback(async (date = selectedDate) => {
    setLoading(true);
    setError('');

    try {
      const result = await api.getEmployeeSchedules({
        date_from: date,
        date_to: date,
      });

      setSchedules(result.data.schedules || []);
    } catch (err) {
      setError(err.message);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadSchedules(selectedDate);
  }, [selectedDate, loadSchedules]);

  function handleDateChange(nextDate) {
    if (!nextDate) {
      return;
    }

    if (nextDate > tomorrow) {
      setError('僅可查看今天、明天與過往班表');
      setSelectedDate(tomorrow);
      return;
    }

    setError('');
    setSelectedDate(nextDate);
  }

  return (
    <Layout title="班表查詢">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">班表查詢</h2>
            <p className="hint">可查看明天與過往派工，詳細回報請至「每日回報」。</p>
          </div>
          <div className="button-row">
            <Link to="/employee" className="btn btn-secondary btn-sm">
              回到當日案件
            </Link>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadSchedules()} disabled={loading}>
              {loading ? '載入中...' : '重新整理'}
            </button>
          </div>
        </div>

        <div className="schedule-day-toolbar">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDateChange(shiftDate(selectedDate, -1))}
          >
            前一天
          </button>
          <label className="field field-compact">
            <span className="field-label">日期</span>
            <input
              className="field-control"
              type="date"
              value={selectedDate}
              max={tomorrow}
              onChange={(event) => handleDateChange(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDateChange(today)}
          >
            今天
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDateChange(tomorrow)}
          >
            明天
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDateChange(shiftDate(selectedDate, 1))}
            disabled={selectedDate >= tomorrow}
          >
            後一天
          </button>
        </div>

        <p className="hint" style={{ padding: '0 16px 12px' }}>{dateLabel}，共 {schedules.length} 件</p>

        <PageAlert type="error" message={error} />

        <div className="schedule-workspace schedule-workspace--day-list">
          <EmployeeScheduleList
            schedules={schedules}
            onSelect={setSnapshotSchedule}
            emptyMessage={`${dateLabel} 沒有派工。`}
          />
        </div>
      </section>

      <ScheduleSnapshotModal
        open={Boolean(snapshotSchedule)}
        schedule={snapshotSchedule}
        onClose={() => setSnapshotSchedule(null)}
        showActions={false}
      />
    </Layout>
  );
}
