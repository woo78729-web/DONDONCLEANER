import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  endOfMonth,
  format,
  startOfMonth,
} from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { EmployeeScheduleList } from '../components/EmployeeScheduleList';
import { EmployeeMonthCalendar } from '../components/EmployeeMonthCalendar';
import { ScheduleSnapshotModal } from '../components/ScheduleSnapshotModal';
import { api } from '../api/client';
import {
  expandLeavesToEvents,
  formatDateOnly,
  formatScheduleDateLabel,
  sortSchedulesWithOverduePinned,
} from '../utils/scheduleCalendar';
import '../components/schedule-calendar.css';

function todayDateString() {
  return formatDateOnly(new Date());
}

function tomorrowDateString() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return formatDateOnly(next);
}

function buildScheduleCountMap(schedules) {
  const counts = new Map();

  schedules.forEach((schedule) => {
    const key = formatDateOnly(schedule.work_date);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

export default function EmployeeCalendarPage() {
  const today = todayDateString();
  const tomorrow = tomorrowDateString();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(today);
  const [monthSchedules, setMonthSchedules] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [snapshotSchedule, setSnapshotSchedule] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const monthStartKey = useMemo(
    () => formatDateOnly(startOfMonth(visibleMonth)),
    [visibleMonth],
  );

  const monthEndKey = useMemo(
    () => formatDateOnly(endOfMonth(visibleMonth)),
    [visibleMonth],
  );

  const checkThroughDate = useMemo(() => {
    if (monthEndKey < tomorrow) {
      return monthEndKey;
    }

    if (monthStartKey > tomorrow) {
      return '';
    }

    return tomorrow;
  }, [monthEndKey, monthStartKey, tomorrow]);

  const scheduleCountByDate = useMemo(
    () => buildScheduleCountMap(monthSchedules),
    [monthSchedules],
  );

  const selectedDaySchedules = useMemo(
    () => sortSchedulesWithOverduePinned(
      monthSchedules.filter(
        (schedule) => formatDateOnly(schedule.work_date) === selectedDate,
      ),
    ),
    [monthSchedules, selectedDate],
  );

  const selectedDayStatus = useMemo(() => {
    if (selectedDate > tomorrow) {
      return 'future';
    }

    const onLeave = expandLeavesToEvents(leaves, selectedDate, selectedDate).length > 0;

    if (onLeave) {
      return 'leave';
    }

    if (selectedDaySchedules.length > 0) {
      return 'scheduled';
    }

    if (selectedDate >= monthStartKey && selectedDate <= checkThroughDate) {
      return 'unscheduled';
    }

    return 'neutral';
  }, [checkThroughDate, leaves, monthStartKey, selectedDate, selectedDaySchedules.length, tomorrow]);

  const dateLabel = useMemo(
    () => formatScheduleDateLabel(selectedDate),
    [selectedDate],
  );

  const loadCalendarData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [leaveResult, scheduleResult] = await Promise.all([
        api.getEmployeeLeaves(),
        api.getEmployeeSchedules({
          date_from: monthStartKey,
          date_to: monthEndKey,
        }),
      ]);

      setLeaves(leaveResult.data.leaves || []);
      setMonthSchedules(scheduleResult.data.schedules || []);
    } catch (err) {
      setError(err.message);
      setLeaves([]);
      setMonthSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [monthEndKey, monthStartKey]);

  useEffect(() => {
    loadCalendarData().catch((err) => setError(err.message));
  }, [loadCalendarData]);

  function handleDaySelect(nextDate) {
    if (!nextDate || nextDate > tomorrow) {
      return;
    }

    setError('');
    setSelectedDate(nextDate);
  }

  function handleMonthChange(nextMonth) {
    setVisibleMonth(nextMonth);
    const nextMonthStart = formatDateOnly(startOfMonth(nextMonth));
    const nextMonthEnd = formatDateOnly(endOfMonth(nextMonth));

    if (selectedDate >= nextMonthStart && selectedDate <= nextMonthEnd && selectedDate <= tomorrow) {
      return;
    }

    if (nextMonthStart <= today && today <= nextMonthEnd) {
      setSelectedDate(today);
      return;
    }

    if (nextMonthStart <= tomorrow && tomorrow <= nextMonthEnd) {
      setSelectedDate(tomorrow);
      return;
    }

    setSelectedDate(nextMonthStart > tomorrow ? tomorrow : nextMonthStart);
  }

  function renderSelectedDaySummary() {
    if (selectedDate > tomorrow) {
      return (
        <p className="hint employee-calendar-page__day-summary">
          {format(new Date(`${selectedDate}T12:00:00`), 'M月d日', { locale: zhTW })}
          尚未開放班表查詢，僅顯示排假。
        </p>
      );
    }

    if (selectedDayStatus === 'leave') {
      return (
        <p className="hint employee-calendar-page__day-summary employee-calendar-page__day-summary--leave">
          {dateLabel} 為您的排假。
        </p>
      );
    }

    if (selectedDayStatus === 'unscheduled') {
      return (
        <p className="hint employee-calendar-page__day-summary employee-calendar-page__day-summary--warning">
          {dateLabel} 尚未排班。若此日應上班，請聯絡管理員確認是否漏派。
        </p>
      );
    }

    return (
      <p className="hint employee-calendar-page__day-summary">
        {dateLabel}，共 {selectedDaySchedules.length} 件派工
      </p>
    );
  }

  return (
    <Layout title="班表查詢">
      <section className="card employee-calendar-page">
        <div className="card-header">
          <div>
            <h2 className="card-title">班表月曆</h2>
            <p className="hint">整月檢視排假與派工；可查看今天、明天與過往班表，未排班日會標示提醒。</p>
          </div>
          <div className="button-row">
            <Link to="/employee" className="btn btn-secondary btn-sm">
              回到當日案件
            </Link>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => loadCalendarData()}
              disabled={loading}
            >
              {loading ? '載入中...' : '重新整理'}
            </button>
          </div>
        </div>

        <PageAlert type="error" message={error} />

        <EmployeeMonthCalendar
          visibleMonth={visibleMonth}
          onMonthChange={handleMonthChange}
          leaves={leaves}
          scheduleCountByDate={scheduleCountByDate}
          checkFromDate={monthStartKey}
          checkThroughDate={checkThroughDate}
          selectedDate={selectedDate}
          onDaySelect={handleDaySelect}
          maxSelectableDate={tomorrow}
          busy={loading}
        />

        <div className="employee-calendar-page__detail">
          <div className="employee-calendar-page__detail-header">
            <h3 className="employee-calendar-page__detail-title">當日班表</h3>
            <div className="button-row">
              <button
                type="button"
                className={`btn btn-secondary btn-sm${selectedDate === today ? ' is-active' : ''}`}
                onClick={() => handleDaySelect(today)}
              >
                今天
              </button>
              <button
                type="button"
                className={`btn btn-secondary btn-sm${selectedDate === tomorrow ? ' is-active' : ''}`}
                onClick={() => handleDaySelect(tomorrow)}
              >
                明天
              </button>
            </div>
          </div>

          {renderSelectedDaySummary()}

          {selectedDate <= tomorrow && selectedDayStatus === 'scheduled' && (
            <div className="schedule-workspace schedule-workspace--day-list">
              <EmployeeScheduleList
                schedules={selectedDaySchedules}
                onSelect={setSnapshotSchedule}
                referenceDate={selectedDate}
                emptyMessage={`${dateLabel} 沒有派工。`}
              />
            </div>
          )}
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
