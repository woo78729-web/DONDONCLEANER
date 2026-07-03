import { Navigate } from 'react-big-calendar';
import TimeGridModule from 'react-big-calendar/lib/TimeGrid';

const TimeGrid = TimeGridModule?.default ?? TimeGridModule;

export function createMultiDayView(dayCount) {
  const safeCount = Math.min(7, Math.max(2, Number(dayCount) || 2));

  if (typeof TimeGrid !== 'function') {
    throw new Error('無法載入行事曆多日檢視元件');
  }

  function MultiDayView(props) {
    const {
      date,
      localizer,
      min = localizer.startOf(new Date(), 'day'),
      max = localizer.endOf(new Date(), 'day'),
      scrollToTime = localizer.startOf(new Date(), 'day'),
      enableAutoScroll = true,
      ...rest
    } = props;
    const range = MultiDayView.range(date, { localizer });

    return (
      <TimeGrid
        {...rest}
        date={date}
        localizer={localizer}
        range={range}
        eventOffset={15}
        min={min}
        max={max}
        scrollToTime={scrollToTime}
        enableAutoScroll={enableAutoScroll}
      />
    );
  }

  MultiDayView.range = (date, { localizer }) => {
    const start = localizer.startOf(date, 'day');
    const end = localizer.endOf(localizer.add(start, safeCount - 1, 'day'), 'day');

    return localizer.range(start, end);
  };

  MultiDayView.navigate = (date, action, { localizer }) => {
    switch (action) {
      case Navigate.PREVIOUS:
        return localizer.add(date, -safeCount, 'day');
      case Navigate.NEXT:
        return localizer.add(date, safeCount, 'day');
      default:
        return date;
    }
  };

  MultiDayView.title = (date, { localizer }) => {
    const range = MultiDayView.range(date, { localizer });
    const start = range[0];
    const end = range[range.length - 1];

    return localizer.format({ start, end }, 'dayRangeHeaderFormat');
  };

  return MultiDayView;
}
