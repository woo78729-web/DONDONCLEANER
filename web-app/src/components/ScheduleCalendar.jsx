import { useCallback, useEffect, useMemo, useState } from 'react';

import { flushSync } from 'react-dom';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';

import { format, getDay, parse, startOfWeek } from 'date-fns';

import { zhTW } from 'date-fns/locale';

import {

  DEFAULT_CALENDAR_SETTINGS,

  getTimeslots,

  hourToCalendarDate,

} from '../utils/calendarSettings';

import { createMultiDayView } from '../utils/customCalendarViews';

import {

  buildScheduleCalendarEvents,

  getCalendarDisplayRange,

  getScheduleEventClassName,

  getScheduleEventStyle,

} from '../utils/scheduleCalendar';

import { CalendarScheduleEvent } from './CalendarScheduleEvent';

import 'react-big-calendar/lib/css/react-big-calendar.css';

import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

import './schedule-calendar.css';



const locales = { 'zh-TW': zhTW };



const messages = {

  allDay: '全天',

  previous: '上一頁',

  next: '下一頁',

  today: '今天',

  month: '月',

  week: '週',

  day: '日',

  agenda: '列表',

  date: '日期',

  time: '時間',

  event: '行程',

  noEventsInRange: '此區間沒有班表',

  showMore: (total) => `+${total} 更多`,

};



function createLocalizer(weekStartsOn) {

  return dateFnsLocalizer({

    format,

    parse,

    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn }),

    getDay,

    locales,

  });

}



function useDragAndDropCalendar(enabled) {

  const [CalendarComponent, setCalendarComponent] = useState(() => Calendar);



  useEffect(() => {

    if (!enabled) {

      setCalendarComponent(() => Calendar);

      return undefined;

    }



    let cancelled = false;



    import('react-big-calendar/lib/addons/dragAndDrop')

      .then((module) => {

        if (cancelled) {

          return;

        }



        const withDragAndDrop = module.default?.default ?? module.default ?? module;



        if (typeof withDragAndDrop !== 'function') {

          throw new Error('withDragAndDrop is not a function');

        }



        setCalendarComponent(() => withDragAndDrop(Calendar));

      })

      .catch((error) => {

        console.error('Failed to load calendar drag-and-drop addon', error);

        if (!cancelled) {

          setCalendarComponent(() => Calendar);

        }

      });



    return () => {

      cancelled = true;

    };

  }, [enabled]);



  return CalendarComponent;

}



export function ScheduleCalendar({

  schedules,

  leaves = [],

  leaveRange = null,

  currentDate,

  displayDays = 7,

  onNavigate,

  onSelectEvent,

  onSelectSlot,

  onDrillDown,

  onEventDrop,

  onEventResize,

  canDragEvent,

  selectable = false,

  colorMode = 'status',

  settings = DEFAULT_CALENDAR_SETTINGS,

  onViewChange,

  initialView = null,

  hidePrice = false,

}) {

  const safeDisplayDays = Math.min(7, Math.max(1, Number(displayDays) || 1));

  const [view, setView] = useState(() => {
    if (initialView) {
      return initialView;
    }

    return safeDisplayDays === 1 ? 'day' : 'week';
  });

  const dragEnabled = Boolean(onEventDrop);

  const CalendarComponent = useDragAndDropCalendar(dragEnabled);

  const localizer = useMemo(

    () => createLocalizer(settings.weekStartsOn),

    [settings.weekStartsOn],

  );



  const weekView = useMemo(() => {
    try {
      const dayCount = safeDisplayDays <= 1 ? 7 : safeDisplayDays;
      return createMultiDayView(dayCount);
    } catch (error) {
      console.error('Failed to create week calendar view', error);
      return false;
    }
  }, [safeDisplayDays]);

  const views = useMemo(() => {
    const nextViews = {
      day: true,
      month: true,
      agenda: true,
    };

    if (weekView) {
      nextViews.week = weekView;
    }

    return nextViews;
  }, [weekView]);

  useEffect(() => {
    setView((previous) => {
      if (previous === 'month' || previous === 'agenda') {
        return previous;
      }

      return safeDisplayDays === 1 ? 'day' : 'week';
    });
  }, [safeDisplayDays]);



  const calendarKey = `${safeDisplayDays}-${view}-${currentDate instanceof Date ? currentDate.getTime() : currentDate}`;



  const displayRange = useMemo(
    () => getCalendarDisplayRange(view, currentDate, safeDisplayDays),
    [currentDate, safeDisplayDays, view],
  );

  const baseCalendarEvents = useMemo(
    () => buildScheduleCalendarEvents(
      schedules,
      leaves,
      displayRange.date_from,
      displayRange.date_to,
      { hidePrice },
    ),
    [displayRange, hidePrice, leaves, schedules],
  );

  const [eventOverrides, setEventOverrides] = useState(() => new Map());

  const events = useMemo(() => {

    if (!eventOverrides.size) {

      return baseCalendarEvents;

    }

    return baseCalendarEvents.map((event) => {

      const override = eventOverrides.get(event.id);

      if (!override || String(event.id).startsWith('leave-')) {

        return event;

      }

      return { ...event, start: override.start, end: override.end };

    });

  }, [baseCalendarEvents, eventOverrides]);



  const clearEventOverride = useCallback((eventId) => {

    setEventOverrides((previous) => {

      if (!previous.has(eventId)) {

        return previous;

      }



      const next = new Map(previous);

      next.delete(eventId);

      return next;

    });

  }, []);



  const handleEventDrop = useCallback((info) => {

    flushSync(() => {

      setEventOverrides((previous) => {

        const next = new Map(previous);

        next.set(info.event.id, { start: info.start, end: info.end });

        return next;

      });

    });



    const accepted = onEventDrop?.(info);



    if (accepted === false) {

      flushSync(() => {

        clearEventOverride(info.event.id);

      });

      return;

    }



    clearEventOverride(info.event.id);

  }, [clearEventOverride, onEventDrop]);



  const handleEventResize = useCallback((info) => {

    flushSync(() => {

      setEventOverrides((previous) => {

        const next = new Map(previous);

        next.set(info.event.id, { start: info.start, end: info.end });

        return next;

      });

    });



    const accepted = onEventResize?.(info);



    if (accepted === false) {

      flushSync(() => {

        clearEventOverride(info.event.id);

      });

      return;

    }



    clearEventOverride(info.event.id);

  }, [clearEventOverride, onEventResize]);



  const components = useMemo(() => ({
    event: (props) => <CalendarScheduleEvent {...props} view={view} hidePrice={hidePrice} relatedSchedules={schedules} />,
  }), [hidePrice, schedules, view]);



  const dragAccessors = useMemo(() => {

    if (!dragEnabled) {

      return {};

    }



    const isEditable = (event) => canDragEvent?.(event.resource) ?? false;



    return {

      draggableAccessor: isEditable,

      resizableAccessor: isEditable,

      onEventDrop: handleEventDrop,

      onEventResize: handleEventResize,

      resizable: Boolean(onEventResize),

    };

  }, [canDragEvent, dragEnabled, handleEventDrop, handleEventResize, onEventResize]);



  const handleSelectEvent = useCallback((event, clickEvent) => {
    onSelectEvent?.(event, clickEvent);
  }, [onSelectEvent]);

  const scrollToTime = useMemo(() => {
    const now = new Date();
    const scrollHour = Math.max(settings.startHour, Math.min(settings.endHour - 1, now.getHours()));
    return new Date(1970, 0, 1, scrollHour, now.getMinutes(), 0);
  }, [settings.endHour, settings.startHour]);

  function handleViewChange(nextView) {
    setView(nextView);
    onViewChange?.(nextView);
  }



  function eventStyleGetter(event) {

    const schedule = event.resource;



    return {

      style: getScheduleEventStyle(schedule),

      className: getScheduleEventClassName(schedule),

    };

  }



  return (

    <div className={`schedule-workspace schedule-calendar schedule-calendar--view-${view}${colorMode === 'employee' ? ' schedule-calendar--avatars' : ''}${onDrillDown ? ' schedule-calendar--drilldown' : ''}${dragEnabled ? ' schedule-calendar--draggable' : ''}`}>

      <div
        className={`schedule-calendar-scroll${view === 'week' && safeDisplayDays > 1 ? ' schedule-calendar-scroll--wide' : ''}${view === 'month' ? ' schedule-calendar-scroll--month' : ''}`}
        style={{ '--calendar-day-count': safeDisplayDays }}
      >

      <CalendarComponent

        key={calendarKey}

        localizer={localizer}

        culture="zh-TW"

        messages={messages}

        events={events}

        showMultiDayTimes

        allDayAccessor={(event) => (event.resource?.type === 'leave' ? false : Boolean(event.allDay))}

        date={currentDate}

        view={view}

        views={views}

        onView={handleViewChange}

        onNavigate={onNavigate}

        onSelectEvent={handleSelectEvent}

        onSelectSlot={onSelectSlot}

        onDrillDown={onDrillDown}

        selectable={selectable}

        scrollToTime={scrollToTime}

        longPressThreshold={dragEnabled ? 180 : undefined}

        popup

        step={settings.slotMinutes}

        timeslots={getTimeslots(settings.slotMinutes)}

        min={hourToCalendarDate(settings.startHour)}

        max={hourToCalendarDate(settings.endHour)}

        eventPropGetter={eventStyleGetter}

        components={components}

        dayLayoutAlgorithm="no-overlap"

        dayPropGetter={(date) => {
          const classNames = [];
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const target = new Date(date);
          target.setHours(0, 0, 0, 0);

          if (target < today) {
            classNames.push('rbc-past-day');
          }

          return classNames.length ? { className: classNames.join(' ') } : {};
        }}

        {...dragAccessors}

      />

      </div>

    </div>

  );

}


