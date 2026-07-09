import { useEffect, useMemo, useRef, useState } from 'react';
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
import { formatDateOnly } from '../utils/scheduleCalendar';
import { loadCalendarSettings } from '../utils/calendarSettings';

const WEEKDAY_LABELS_BY_START = {
  0: ['日', '一', '二', '三', '四', '五', '六'],
  1: ['一', '二', '三', '四', '五', '六', '日'],
};

function normalizeDay(value) {
  if (!value) {
    return null;
  }

  const day = startOfDay(new Date(`${value}T12:00:00`));

  return Number.isNaN(day.getTime()) ? null : day;
}

function formatDisplayDate(value) {
  if (!value) {
    return '';
  }

  const [year, month, day] = String(value).split('-');

  if (!year || !month || !day) {
    return value;
  }

  return `${year}/${month}/${day}`;
}

export function DatePickerInput({
  value = '',
  onChange,
  min,
  required = false,
  weekStartsOn: weekStartsOnProp,
  className = '',
  id,
  placeholder = '選擇日期',
}) {
  const weekStartsOn = weekStartsOnProp ?? loadCalendarSettings().weekStartsOn ?? 1;
  const weekdayLabels = WEEKDAY_LABELS_BY_START[weekStartsOn] || WEEKDAY_LABELS_BY_START[1];
  const hostRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedDay = useMemo(() => normalizeDay(value), [value]);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDay || new Date()));

  useEffect(() => {
    if (selectedDay) {
      setVisibleMonth(startOfMonth(selectedDay));
    }
  }, [value]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!hostRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const monthStart = visibleMonth;
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function isDisabledDay(day) {
    if (!min) {
      return false;
    }

    return formatDateOnly(day) < min;
  }

  function selectDay(day) {
    if (isDisabledDay(day)) {
      return;
    }

    onChange?.(formatDateOnly(day));
    setOpen(false);
  }

  function handleClear() {
    onChange?.('');
    setOpen(false);
  }

  function handleToday() {
    const todayValue = formatDateOnly(today);

    if (min && todayValue < min) {
      return;
    }

    onChange?.(todayValue);
    setVisibleMonth(startOfMonth(today));
    setOpen(false);
  }

  const todayDisabled = Boolean(min && formatDateOnly(today) < min);

  return (
    <div className={`date-picker-input${className ? ` ${className}` : ''}`} ref={hostRef}>
      <input
        id={id}
        className="field-control date-picker-input__display"
        readOnly
        required={required}
        value={formatDisplayDate(value)}
        placeholder={placeholder}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
      />

      {open && (
        <div className="date-picker-input__popover" role="dialog" aria-label="選擇日期">
          <div className="calendar-mini-month date-picker-input__calendar">
            <div className="calendar-mini-month__header">
              <button
                type="button"
                className="calendar-mini-month__nav"
                onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
                aria-label="上一個月"
              >
                ‹
              </button>
              <p className="calendar-mini-month__title">
                {format(visibleMonth, 'yyyy年 M月', { locale: zhTW })}
              </p>
              <button
                type="button"
                className="calendar-mini-month__nav"
                onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
                aria-label="下一個月"
              >
                ›
              </button>
            </div>

            <div className="calendar-mini-month__weekdays">
              {weekdayLabels.map((label) => (
                <span key={label} className="calendar-mini-month__weekday">{label}</span>
              ))}
            </div>

            <div className="calendar-mini-month__grid">
              {days.map((day) => {
                const key = formatDateOnly(day);
                const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
                const isToday = isSameDay(day, today);
                const isOutside = !isSameMonth(day, visibleMonth);
                const isDisabled = isDisabledDay(day);

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isDisabled}
                    className={[
                      'calendar-mini-month__day',
                      isSelected ? ' is-selected' : '',
                      isToday ? ' is-today' : '',
                      isOutside ? ' is-outside' : '',
                      isDisabled ? ' is-disabled' : '',
                    ].join('')}
                    onClick={() => selectDay(day)}
                  >
                    <span>{day.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="date-picker-input__footer">
            <button type="button" className="date-picker-input__footer-btn" onClick={handleClear}>
              清除
            </button>
            <button
              type="button"
              className="date-picker-input__footer-btn"
              onClick={handleToday}
              disabled={todayDisabled}
            >
              今天
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
