import {
  formatChineseTimeValue,
  formatDateOnly,
  formatScheduleDateLabel,
} from '../utils/scheduleCalendar';
import { getServiceAreaLabel } from '../utils/taitungAreas';

function isEmployeeOnLeave(leaves, employeeId, workDate) {
  const date = formatDateOnly(workDate);

  if (!date || !employeeId) {
    return false;
  }

  const weekday = new Date(`${date}T12:00:00`).getDay();

  return (leaves || []).some((leave) => {
    if (String(leave.user_id) !== String(employeeId)) {
      return false;
    }

    if (leave.leave_type === 'date') {
      return formatDateOnly(leave.leave_date) === date;
    }

    if (leave.leave_type === 'weekly') {
      return Number(leave.weekday) === weekday;
    }

    return false;
  });
}

function sortByStartTime(left, right) {
  return String(left.start_time).localeCompare(String(right.start_time));
}

export function EmployeeDayScheduleSidebar({
  employeeId,
  workDate,
  employees = [],
  schedules = [],
  leaves = [],
  highlightScheduleId = null,
  title = '當日班表',
}) {
  if (!employeeId || !workDate) {
    return null;
  }

  const employee = employees.find((item) => String(item.id) === String(employeeId));
  const dateText = formatDateOnly(workDate);
  const onLeave = isEmployeeOnLeave(leaves, employeeId, workDate);
  const daySchedules = schedules
    .filter((schedule) => (
      schedule.type !== 'leave'
      && String(schedule.user_id ?? schedule.user?.id) === String(employeeId)
      && formatDateOnly(schedule.work_date) === dateText
    ))
    .sort((left, right) => sortByStartTime(left, right));

  return (
    <aside className="employee-day-schedule-sidebar" aria-label={`${employee?.name || '師傅'}當日班表`}>
      <div className="employee-day-schedule-sidebar__header">
        <h3 className="employee-day-schedule-sidebar__title">{title}</h3>
        <p className="employee-day-schedule-sidebar__meta">
          {employee?.name || '師傅'}
          <span className="employee-day-schedule-sidebar__date">{formatScheduleDateLabel(workDate)}</span>
        </p>
      </div>

      {onLeave && (
        <div className="employee-day-schedule-sidebar__leave">當日休假</div>
      )}

      {!onLeave && daySchedules.length === 0 && (
        <p className="hint employee-day-schedule-sidebar__empty">目前無其他行程，時段可自由安排。</p>
      )}

      <ul className="employee-day-schedule-sidebar__list">
        {daySchedules.map((schedule) => {
          const isCurrent = highlightScheduleId && String(schedule.id) === String(highlightScheduleId);

          return (
            <li
              key={schedule.id}
              className={`employee-day-schedule-sidebar__item${isCurrent ? ' is-current' : ''}`}
            >
              <div className="employee-day-schedule-sidebar__time">
                {formatChineseTimeValue(schedule.start_time)}
                {' '}
                →
                {' '}
                {formatChineseTimeValue(schedule.end_time)}
              </div>
              <div className="employee-day-schedule-sidebar__area">
                {schedule.service_area_label || getServiceAreaLabel(schedule.service_area)}
                {schedule.ac_units ? ` · ${schedule.ac_units} 台` : ''}
              </div>
              {(schedule.customer_name || schedule.customer_address) && (
                <div className="employee-day-schedule-sidebar__customer">
                  {schedule.customer_name || '客戶'}
                  {schedule.customer_address ? ` · ${schedule.customer_address}` : ''}
                </div>
              )}
              {isCurrent && (
                <span className="employee-day-schedule-sidebar__badge">編輯中</span>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
