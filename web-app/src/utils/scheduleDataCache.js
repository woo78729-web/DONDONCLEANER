import { formatDateOnly } from './scheduleCalendar';

let cache = {
  schedules: [],
  leaves: [],
  employees: [],
  schedulesAt: 0,
  leavesAt: 0,
  employeesAt: 0,
};

export function readScheduleCache() {
  return cache;
}

export function scheduleCacheHasBoard() {
  return cache.schedulesAt > 0 || cache.leavesAt > 0;
}

export function schedulesOnDate(schedules, dateKey) {
  return (schedules || []).filter((schedule) => formatDateOnly(schedule.work_date) === dateKey);
}

export function commitScheduleCache(startedAt, partial) {
  const next = { ...cache };

  if (partial.schedules && startedAt >= cache.schedulesAt) {
    next.schedules = partial.schedules;
    next.schedulesAt = startedAt;
  }

  if (partial.leaves && startedAt >= cache.leavesAt) {
    next.leaves = partial.leaves;
    next.leavesAt = startedAt;
  }

  if (partial.employees && startedAt >= cache.employeesAt) {
    next.employees = partial.employees;
    next.employeesAt = startedAt;
  }

  cache = next;

  return cache;
}

export function mergeSchedulesForRange(startedAt, dateFrom, dateTo, incoming, userId = null, extra = {}) {
  if (startedAt < cache.schedulesAt) {
    commitScheduleCache(startedAt, extra);
    return cache;
  }

  const kept = cache.schedules.filter((schedule) => {
    const day = formatDateOnly(schedule.work_date);

    if (!day || day < dateFrom || day > dateTo) {
      return true;
    }

    if (userId && String(schedule.user_id) !== String(userId)) {
      return true;
    }

    return false;
  });

  return commitScheduleCache(startedAt, {
    ...extra,
    schedules: [...kept, ...(incoming || [])],
  });
}

export function mergeSchedulesForDate(startedAt, dateKey, daySchedules, extra = {}) {
  return mergeSchedulesForRange(startedAt, dateKey, dateKey, daySchedules, null, extra);
}
