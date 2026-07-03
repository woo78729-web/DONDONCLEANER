import { Link } from 'react-router-dom';
import { GoogleMapsLink } from './GoogleMapsLink';
import { ScheduleTechnicianBadge } from './ScheduleTechnicianBadge';
import { StatusBadge } from './StatusBadge';
import {
  buildScheduleCardLine,
  formatChineseTimeRange,
  formatTimeValue,
  getScheduleEventStyle,
  getProjectDurationDays,
  getProjectStatusLabel,
  hasScheduleReport,
} from '../utils/scheduleCalendar';

export function EmployeeScheduleList({
  schedules,
  onSelect,
  emptyMessage = '目前沒有班表。',
}) {
  if (!schedules.length) {
    return <p className="hint schedule-day-empty">{emptyMessage}</p>;
  }

  return (
    <div className="schedule-day-timeline">
      {schedules.map((schedule) => (
        <article className="schedule-day-block" key={schedule.id}>
          <button
            type="button"
            className="schedule-day-block__button"
            style={getScheduleEventStyle(schedule)}
            onClick={() => onSelect?.(schedule)}
          >
            <div className="schedule-day-block__header">
              <ScheduleTechnicianBadge user={schedule.user} size="sm" />
              <span className="schedule-day-block__time-text">
                {formatTimeValue(schedule.start_time)} – {formatTimeValue(schedule.end_time)}
              </span>
              <StatusBadge status={hasScheduleReport(schedule) ? 'reported' : 'pending'} />
            </div>
            <p className="schedule-day-block__line">{buildScheduleCardLine(schedule)}</p>
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
