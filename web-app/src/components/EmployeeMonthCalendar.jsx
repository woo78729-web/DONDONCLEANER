import { useMemo } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { expandLeavesToEvents, formatDateOnly } from '../utils/scheduleCalendar';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function buildLeaveDateSet(leaves, gridStart, gridEnd) {
  const events = expandLeavesToEvents(
    leaves,
    formatDateOnly(gridStart),
    formatDateOnly(gridEnd),
  );

  return new Set(events.map((event) => formatDateOnly(event.resource.leave_date)));
}

function getDayStatus(dateKey, {
  leaveDateKeys,
  scheduleCountByDate,
  checkFromDate,
  checkThroughDate,
}) {
  if (leaveDateKeys.has(dateKey)) {
    return 'leave';
  }

  const scheduleCount = scheduleCountByDate.get(dateKey) || 0;

  if (scheduleCount > 0) {
    return 'scheduled';
  }

  if (dateKey >= checkFromDate && dateKey <= checkThroughDate) {
    return 'unscheduled';
  }

  return 'neutral';
}

export function EmployeeMonthCalendar({
  visibleMonth,
  onMonthChange,
  leaves = [],
  scheduleCountByDate = new Map(),
  checkFromDate = '',
  checkThroughDate = '',
  selectedDate = '',
  onDaySelect,
  maxSelectableDate = '',
  busy = false,
  weekStartsOn = 1,
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const leaveDateKeys = useMemo(
    () => buildLeaveDateSet(leaves, gridStart, gridEnd),
    [gridEnd, gridStart, leaves],
  );

  return (
    <div className="employee-month-calendar">
      <div className="employee-month-calendar__header">
        <button
          type="button"
          className="employee-month-calendar__nav"
          onClick={() => onMonthChange?.(addMonths(visibleMonth, -1))}
          aria-label="上一個月"
          disabled={busy}
        >
          ‹
        </button>
        <p className="employee-month-calendar__title">
          {format(visibleMonth, 'yyyy年 M月', { locale: zhTW })}
        </p>
        <button
          type="button"
          className="employee-month-calendar__nav"
          onClick={() => onMonthChange?.(addMonths(visibleMonth, 1))}
          aria-label="下一個月"
          disabled={busy}
        >
          ›
        </button>
      </div>

      <div className="employee-month-calendar__legend">
        <span className="employee-month-calendar__legend-item">
          <span className="employee-month-calendar__legend-dot is-leave" aria-hidden="true" />
          排假
        </span>
        <span className="employee-month-calendar__legend-item">
          <span className="employee-month-calendar__legend-dot is-scheduled" aria-hidden="true" />
          有派工
        </span>
        <span className="employee-month-calendar__legend-item">
          <span className="employee-month-calendar__legend-dot is-unscheduled" aria-hidden="true" />
          未排班
        </span>
      </div>

      <p className="employee-month-calendar__hint">
        班表僅顯示至明天；未排班表示該日應上班但尚未派工，請聯絡管理員。
      </p>

      <div className="employee-month-calendar__weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="employee-month-calendar__weekday">{label}</span>
        ))}
      </div>

      <div className="employee-month-calendar__grid">
        {days.map((day) => {
          const key = formatDateOnly(day);
          const status = getDayStatus(key, {
            leaveDateKeys,
            scheduleCountByDate,
            checkFromDate,
            checkThroughDate,
          });
          const isOutside = !isSameMonth(day, visibleMonth);
          const isToday = isSameDay(day, today);
          const isSelected = selectedDate === key;
          const scheduleCount = scheduleCountByDate.get(key) || 0;
          const selectable = Boolean(maxSelectableDate) && key <= maxSelectableDate;

          return (
            <button
              key={key}
              type="button"
              className={[
                'employee-month-calendar__day',
                status === 'leave' ? ' is-leave' : '',
                status === 'scheduled' ? ' is-scheduled' : '',
                status === 'unscheduled' ? ' is-unscheduled' : '',
                isToday ? ' is-today' : '',
                isSelected ? ' is-selected' : '',
                isOutside ? ' is-outside' : '',
                !selectable ? ' is-disabled-select' : '',
              ].join('')}
              disabled={busy}
              onClick={() => {
                if (selectable) {
                  onDaySelect?.(key);
                }
              }}
              aria-label={`${format(day, 'M月d日', { locale: zhTW })}${
                status === 'leave' ? ' 排假'
                  : status === 'scheduled' ? ` ${scheduleCount} 件派工`
                    : status === 'unscheduled' ? ' 未排班'
                      : ''
              }`}
            >
              <span className="employee-month-calendar__day-number">{day.getDate()}</span>
              {status === 'scheduled' && scheduleCount > 0 && (
                <span className="employee-month-calendar__day-count">{scheduleCount}</span>
              )}
              {status === 'unscheduled' && (
                <span className="employee-month-calendar__day-flag">!</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
