import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { EmployeeScheduleList, EmployeeScheduleNavHint } from '../components/EmployeeScheduleList';
import { ScheduleSnapshotModal } from '../components/ScheduleSnapshotModal';
import { api } from '../api/client';
import { formatDateOnly, formatScheduleDateLabel, hasScheduleReport, isScheduleOverdueUnreported } from '../utils/scheduleCalendar';

function todayDateString() {
  const now = new Date();
  return formatDateOnly(now);
}

export default function EmployeeTodayTasksPage() {
  const [schedules, setSchedules] = useState([]);
  const [workDate, setWorkDate] = useState('');
  const [snapshotSchedule, setSnapshotSchedule] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [overdueCount, setOverdueCount] = useState(0);

  const pendingCount = useMemo(
    () => schedules.filter((schedule) => !hasScheduleReport(schedule)).length,
    [schedules],
  );

  const loadToday = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await api.getEmployeeTodaySchedules();
      setSchedules(result.data.schedules || []);
      setWorkDate(result.data.work_date || todayDateString());
      setOverdueCount(result.data.overdue_unreported_count
        ?? (result.data.schedules || []).filter((schedule) => isScheduleOverdueUnreported(schedule)).length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  return (
    <Layout title="當日須完成案件">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">當日須完成案件</h2>
            <p className="hint">
              {workDate ? `${formatScheduleDateLabel(workDate)}，` : ''}
              共 {schedules.length} 件，待回報 {pendingCount} 件
              {overdueCount > 0 ? `（逾時未回報 ${overdueCount} 件已置頂）` : ''}。
            </p>
          </div>
          <div className="button-row">
            <Link to="/employee/calendar" className="btn btn-secondary btn-sm">
              班表查詢
            </Link>
            {pendingCount > 0 && (
              <Link to="/employee/reports" className="btn btn-primary btn-sm">
                前往每日回報
              </Link>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadToday} disabled={loading}>
              {loading ? '載入中...' : '重新整理'}
            </button>
          </div>
        </div>

        <PageAlert type="error" message={error} />

        <div className="schedule-workspace schedule-workspace--day-list">
          <EmployeeScheduleList
            schedules={schedules}
            onSelect={setSnapshotSchedule}
            referenceDate={workDate || todayDateString()}
            emptyMessage={`${formatScheduleDateLabel(workDate || todayDateString())} 目前沒有派工。`}
          />
        </div>

        <EmployeeScheduleNavHint />
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
