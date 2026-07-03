import {
  buildScheduleCardLine,
  formatScheduleDisplayTimeRange,
} from '../utils/scheduleCalendar';
import { ScheduleTechnicianBadge } from './ScheduleTechnicianBadge';

export function CalendarScheduleEvent({ event, view }) {
  const schedule = event.resource;
  const compact = view === 'month';

  if (schedule?.type === 'leave') {
    if (compact) {
      return (
        <div className="calendar-event-content calendar-event-content--compact">
          <ScheduleTechnicianBadge user={schedule.user} size="xs" centered showName={false} />
          <span className="calendar-event-content__title">休假</span>
        </div>
      );
    }

    return (
      <div className="calendar-event-detail calendar-event-detail--leave">
        <ScheduleTechnicianBadge
          user={schedule.user}
          size="xs"
          centered
          showName
          className="calendar-event-detail__technician"
        />
        <p className="calendar-event-detail__line">休假</p>
        <p className="calendar-event-detail__time">{formatScheduleDisplayTimeRange(schedule)}</p>
      </div>
    );
  }

  if (compact || !schedule) {
    return (
      <div className="calendar-event-content calendar-event-content--compact">
        {schedule && (
          <ScheduleTechnicianBadge user={schedule.user} size="xs" centered showName={false} />
        )}
        <span className="calendar-event-content__title">{event.title}</span>
      </div>
    );
  }

  return (
    <div className="calendar-event-detail" data-schedule-id={schedule.id}>
      <ScheduleTechnicianBadge
        user={schedule.user}
        size="xs"
        centered
        className="calendar-event-detail__technician"
      />
      <p className="calendar-event-detail__line">{buildScheduleCardLine(schedule)}</p>
      <p className="calendar-event-detail__time">{formatScheduleDisplayTimeRange(schedule)}</p>
    </div>
  );
}
