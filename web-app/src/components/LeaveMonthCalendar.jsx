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

function buildWeeklyDateSet(leaves, employeeId, gridStart, gridEnd) {
  if (!employeeId) {
    return new Set();
  }

  const employeeLeaves = leaves.filter(
    (leave) => leave.leave_type === 'weekly' && String(leave.user_id) === String(employeeId),
  );
  const events = expandLeavesToEvents(
    employeeLeaves,
    formatDateOnly(gridStart),
    formatDateOnly(gridEnd),
  );

  return new Set(events.map((event) => formatDateOnly(event.resource.leave_date)));
}

function getDayVisualState(dateKey, draftDateLeaves, baselineDateLeaves, weeklyDateKeys, showWeeklyLeaveDays) {
  if (showWeeklyLeaveDays && weeklyDateKeys.has(dateKey)) {
    return { kind: 'weekly', pending: null };
  }

  const inDraft = draftDateLeaves.has(dateKey);
  const inBaseline = baselineDateLeaves.has(dateKey);

  if (inDraft && !inBaseline) {
    return { kind: 'date', pending: 'add' };
  }

  if (!inDraft && inBaseline) {
    return { kind: 'date', pending: 'remove' };
  }

  if (inDraft && inBaseline) {
    return { kind: 'date', pending: null };
  }

  return { kind: null, pending: null };
}

export function LeaveMonthCalendar({
  visibleMonth,
  onMonthChange,
  leaves = [],
  employeeId = '',
  baselineDateLeaves = new Set(),
  draftDateLeaves = new Set(),
  onDayClick,
  busy = false,
  allowedMonths = [],
  showWeeklyLeaveDays = false,
  weekStartsOn = 1,
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const visibleMonthKey = format(visibleMonth, 'yyyy-MM');
  const allowedMonthIndex = allowedMonths.indexOf(visibleMonthKey);
  const canGoPrev = allowedMonths.length === 0 || allowedMonthIndex > 0;
  const canGoNext = allowedMonths.length === 0
    || (allowedMonthIndex >= 0 && allowedMonthIndex < allowedMonths.length - 1);

  const weeklyDateKeys = useMemo(
    () => buildWeeklyDateSet(leaves, employeeId, gridStart, gridEnd),
    [employeeId, gridEnd, gridStart, leaves],
  );

  return (
    <div className="leave-month-calendar">
      <div className="leave-month-calendar__header">
        <button
          type="button"
          className="leave-month-calendar__nav"
          onClick={() => {
            if (!canGoPrev) {
              return;
            }

            onMonthChange?.(addMonths(visibleMonth, -1));
          }}
          aria-label="上一個月"
          disabled={busy || !canGoPrev}
        >
          ‹
        </button>
        <p className="leave-month-calendar__title">
          {format(visibleMonth, 'yyyy年 M月', { locale: zhTW })}
        </p>
        <button
          type="button"
          className="leave-month-calendar__nav"
          onClick={() => {
            if (!canGoNext) {
              return;
            }

            onMonthChange?.(addMonths(visibleMonth, 1));
          }}
          aria-label="下一個月"
          disabled={busy || !canGoNext}
        >
          ›
        </button>
      </div>

      <div className="leave-month-calendar__legend">
        <span className="leave-month-calendar__legend-item">
          <span className="leave-month-calendar__legend-dot is-leave" aria-hidden="true" />
          指定日期休假
        </span>
        <span className="leave-month-calendar__legend-item">
          <span className="leave-month-calendar__legend-dot is-pending" aria-hidden="true" />
          待確認
        </span>
        {showWeeklyLeaveDays && (
          <span className="leave-month-calendar__legend-item">
            <span className="leave-month-calendar__legend-dot is-weekly" aria-hidden="true" />
            每週固定休
          </span>
        )}
      </div>

      <div className="leave-month-calendar__weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="leave-month-calendar__weekday">{label}</span>
        ))}
      </div>

      <div className="leave-month-calendar__grid">
        {days.map((day) => {
          const key = formatDateOnly(day);
          const visual = getDayVisualState(
            key,
            draftDateLeaves,
            baselineDateLeaves,
            weeklyDateKeys,
            showWeeklyLeaveDays,
          );
          const isOutside = !isSameMonth(day, visibleMonth);
          const isToday = isSameDay(day, today);
          const onLeave = visual.kind === 'date' || visual.kind === 'weekly';

          return (
            <button
              key={key}
              type="button"
              className={[
                'leave-month-calendar__day',
                visual.kind === 'date' && visual.pending !== 'remove' ? ' is-leave' : '',
                visual.kind === 'weekly' ? ' is-weekly-leave' : '',
                visual.pending === 'add' ? ' is-pending-add' : '',
                visual.pending === 'remove' ? ' is-pending-remove' : '',
                isToday ? ' is-today' : '',
                isOutside ? ' is-outside' : '',
              ].join('')}
              disabled={busy || !employeeId}
              onClick={() => onDayClick?.(key, visual)}
              aria-label={`${format(day, 'M月d日', { locale: zhTW })}${onLeave ? ' 休假' : ' 上班'}`}
            >
              <span>{day.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
