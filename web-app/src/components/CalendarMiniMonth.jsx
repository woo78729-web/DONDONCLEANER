import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addMonths,
  differenceInCalendarDays,
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
import { formatDateOnly, isDateInVisibleRange } from '../utils/scheduleCalendar';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function normalizeDay(day) {
  return startOfDay(day instanceof Date ? day : new Date(day));
}

function buildRange(startDay, endDay) {
  const start = normalizeDay(startDay);
  const end = normalizeDay(endDay);
  const first = start <= end ? start : end;
  const last = start <= end ? end : start;
  const displayDays = Math.min(7, differenceInCalendarDays(last, first) + 1);

  return {
    rangeStart: first,
    displayDays,
  };
}

export function CalendarMiniMonth({
  rangeStart,
  displayDays = 7,
  onRangeChange,
  schedules = [],
  weekStartsOn = 1,
}) {
  const rangeStartKey = formatDateOnly(rangeStart);
  const anchorDay = useMemo(
    () => normalizeDay(rangeStartKey || new Date()),
    [rangeStartKey],
  );
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(anchorDay));
  const [dragAnchor, setDragAnchor] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [stripAnchor, setStripAnchor] = useState(null);
  const clickRef = useRef({ day: null, moved: false });

  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    setVisibleMonth(startOfMonth(anchorDay));
  }, [rangeStartKey]);

  const monthStart = visibleMonth;
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const dragPreviewRange = useMemo(() => {
    if (!dragAnchor || !dragCurrent) {
      return null;
    }

    return buildRange(dragAnchor, dragCurrent);
  }, [dragAnchor, dragCurrent]);

  const previewRange = useMemo(() => {
    if (dragPreviewRange) {
      return dragPreviewRange;
    }

    if (stripAnchor !== null) {
      const count = Math.min(7, Math.max(1, stripAnchor + 1));

      return {
        rangeStart: anchorDay,
        displayDays: count,
      };
    }

    return {
      rangeStart: anchorDay,
      displayDays,
    };
  }, [anchorDay, displayDays, dragPreviewRange, stripAnchor]);

  const scheduleCounts = useMemo(() => {
    const counts = new Map();

    schedules.forEach((schedule) => {
      const key = formatDateOnly(schedule.work_date);
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return counts;
  }, [schedules]);

  useEffect(() => {
    function handleMouseUp() {
      if (dragPreviewRange) {
        onRangeChange?.(dragPreviewRange);
      }

      setDragAnchor(null);
      setDragCurrent(null);
      setStripAnchor(null);
    }

    window.addEventListener('mouseup', handleMouseUp);

    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [dragPreviewRange, onRangeChange]);

  function handleDayMouseDown(day, event) {
    if (event.button !== 0) {
      return;
    }

    clickRef.current = { day, moved: false };
    setDragAnchor(day);
    setDragCurrent(day);
    setStripAnchor(null);
  }

  function handleDayMouseEnter(day) {
    if (!dragAnchor) {
      return;
    }

    if (!isSameDay(day, dragAnchor)) {
      clickRef.current.moved = true;
    }

    setDragCurrent(day);
  }

  function handleDayClick(day, event) {
    event.preventDefault();

    if (clickRef.current.moved) {
      return;
    }

    onRangeChange?.({
      rangeStart: normalizeDay(day),
      displayDays,
    });
  }

  function handleDayDoubleClick(day, event) {
    event.preventDefault();

    onRangeChange?.({
      rangeStart: normalizeDay(day),
      displayDays: 1,
    });
  }

  function handleStripMouseDown(index, event) {
    if (event.button !== 0) {
      return;
    }

    setStripAnchor(index);
    setDragAnchor(null);
    setDragCurrent(null);
  }

  function handleStripMouseEnter(index) {
    if (stripAnchor === null) {
      return;
    }

    const count = Math.abs(index - stripAnchor) + 1;
    onRangeChange?.({
      rangeStart: anchorDay,
      displayDays: Math.min(7, count),
    });
  }

  return (
    <div className="calendar-mini-month">
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

      <div className="calendar-mini-month__range-panel">
        <span className="calendar-mini-month__range-label">顯示 {previewRange.displayDays} 天</span>
        <div className="calendar-mini-month__range-strip" aria-label="拖曳選擇顯示天數">
          {Array.from({ length: 7 }, (_, index) => (
            <button
              key={index}
              type="button"
              className={[
                'calendar-mini-month__range-slot',
                index < previewRange.displayDays ? ' is-active' : '',
                stripAnchor !== null && index <= Math.max(stripAnchor, previewRange.displayDays - 1) ? ' is-dragging' : '',
              ].join('')}
              aria-label={`${index + 1} 天`}
              onMouseDown={(event) => handleStripMouseDown(index, event)}
              onMouseEnter={() => handleStripMouseEnter(index)}
            />
          ))}
        </div>
        <p className="calendar-mini-month__range-hint">拖曳色條選天數，在月曆拖曳選起始日；雙擊單日只看一天</p>
      </div>

      <div className="calendar-mini-month__weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="calendar-mini-month__weekday">{label}</span>
        ))}
      </div>

      <div className="calendar-mini-month__grid">
        {days.map((day) => {
          const key = formatDateOnly(day);
          const count = scheduleCounts.get(key) || 0;
          const inVisibleRange = isDateInVisibleRange(day, previewRange.rangeStart, previewRange.displayDays);
          const isRangeStart = isSameDay(day, previewRange.rangeStart);
          const isToday = isSameDay(day, today);
          const isOutside = !isSameMonth(day, visibleMonth);
          const isDragPreview = dragPreviewRange
            ? isDateInVisibleRange(day, dragPreviewRange.rangeStart, dragPreviewRange.displayDays)
            : false;

          return (
            <button
              key={key}
              type="button"
              className={[
                'calendar-mini-month__day',
                inVisibleRange || isDragPreview ? ' is-in-range' : '',
                isRangeStart ? ' is-range-start' : '',
                isToday ? ' is-today' : '',
                isOutside ? ' is-outside' : '',
                count > 0 ? ' has-events' : '',
              ].join('')}
              onMouseDown={(event) => handleDayMouseDown(day, event)}
              onMouseEnter={() => handleDayMouseEnter(day)}
              onClick={(event) => handleDayClick(day, event)}
              onDoubleClick={(event) => handleDayDoubleClick(day, event)}
            >
              <span>{day.getDate()}</span>
              {count > 0 && <span className="calendar-mini-month__dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
