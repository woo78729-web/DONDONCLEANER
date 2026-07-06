import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GoogleMapsLink } from './GoogleMapsLink';
import { ScheduleTechnicianBadge } from './ScheduleTechnicianBadge';
import { StatusBadge } from './StatusBadge';
import {
  buildScheduleCardLine,
  formatChineseTimeRange,
  formatDateOnly,
  formatScheduleDateLabel,
  formatTimeValue,
  getScheduleEventStyle,
  getProjectDurationDays,
  getProjectStatusLabel,
  hasScheduleReport,
  isScheduleOverdueUnreported,
  sortSchedulesWithOverduePinned,
} from '../utils/scheduleCalendar';

function scheduleStatus(schedule) {
  if (hasScheduleReport(schedule)) {
    return 'reported';
  }

  if (isScheduleOverdueUnreported(schedule)) {
    return 'overdue';
  }

  return 'pending';
}

export function EmployeeScheduleList({
  schedules,
  onSelect,
  emptyMessage = '目前沒有班表。',
  referenceDate,
}) {
  const sortedSchedules = useMemo(
    () => sortSchedulesWithOverduePinned(schedules),
    [schedules],
  );
  const todayKey = referenceDate || formatDateOnly(new Date());
  const overdueCount = useMemo(
    () => sortedSchedules.filter((schedule) => isScheduleOverdueUnreported(schedule)).length,
    [sortedSchedules],
  );
  const firstRegularIndex = useMemo(
    () => sortedSchedules.findIndex((schedule) => !isScheduleOverdueUnreported(schedule)),
    [sortedSchedules],
  );

  if (!sortedSchedules.length) {
    return <p className="hint schedule-day-empty">{emptyMessage}</p>;
  }

  return (
    <div className="schedule-day-timeline">
      {overdueCount > 0 && (
        <p className="hint employee-schedule-overdue-hint">
          過期未回報 {overdueCount} 件已置頂，請優先完成回報。
        </p>
      )}

      {sortedSchedules.map((schedule, index) => (
        <div key={schedule.id}>
          {index === firstRegularIndex && firstRegularIndex > 0 && (
            <p className="hint employee-schedule-section-divider">以下為當日班表</p>
          )}

          <article className={`schedule-day-block${isScheduleOverdueUnreported(schedule) ? ' schedule-day-block--overdue' : ''}`}>
            <button
              type="button"
              className="schedule-day-block__button"
              style={getScheduleEventStyle(schedule)}
              onClick={() => onSelect?.(schedule)}
            >
              <div className="schedule-day-block__header">
                <ScheduleTechnicianBadge user={schedule.user} size="sm" />
                <span className="schedule-day-block__time-text">
                  {formatDateOnly(schedule.work_date) !== todayKey && (
                    <>
                      {formatScheduleDateLabel(schedule.work_date)}
                      {' · '}
                    </>
                  )}
                  {formatTimeValue(schedule.start_time)} – {formatTimeValue(schedule.end_time)}
                </span>
                <StatusBadge status={scheduleStatus(schedule)} />
              </div>
              <p className="schedule-day-block__line">{buildScheduleCardLine(schedule, { relatedSchedules: schedules })}</p>
              {schedule.cleaning_project && (
                <p className="schedule-day-block__project hint">
                  專案 {schedule.cleaning_project.project_code || schedule.cleaning_project.title || ''}
                  {' · '}
                  工期 {getProjectDurationDays(schedule.cleaning_project) || '-'} 天
                  {' · '}
                  合計 {schedule.cleaning_project.total_ac_units || '-'} 台
                  {' · '}
                  {getProjectStatusLabel(schedule.cleaning_project.status)}
                </p>
              )}
              <p className="schedule-day-block__time">{formatChineseTimeRange(schedule)}</p>
              <p className="schedule-day-block__maps">
                {schedule.customer_address}
                <GoogleMapsLink address={schedule.customer_address} />
              </p>
            </button>
          </article>
        </div>
      ))}
    </div>
  );
}

export function EmployeeScheduleNavHint() {
  return (
    <p className="hint employee-schedule-nav-hint">
      需要查看明天或過往班表，請至
      {' '}
      <Link to="/employee/calendar">班表查詢</Link>
      。
    </p>
  );
}
