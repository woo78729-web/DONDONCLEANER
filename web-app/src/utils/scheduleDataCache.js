import { formatDateOnly } from './scheduleCalendar';

const BOARD_CACHE_KEY = 'ac_schedule_board';
const BOARD_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

let cache = {
  schedules: [],
  leaves: [],
  employees: [],
  schedulesAt: 0,
  leavesAt: 0,
  employeesAt: 0,
};

let boardClosed = false;
let persistTimer = 0;

function readStoredBoard() {
  try {
    const raw = localStorage.getItem(BOARD_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const stored = JSON.parse(raw);
    if (!stored?.at || Date.now() - stored.at > BOARD_CACHE_TTL_MS) {
      localStorage.removeItem(BOARD_CACHE_KEY);
      return null;
    }

    return stored;
  } catch {
    return null;
  }
}

function writeStoredBoard() {
  if (boardClosed) {
    return;
  }

  try {
    localStorage.setItem(BOARD_CACHE_KEY, JSON.stringify({
      at: Date.now(),
      schedules: cache.schedules,
      leaves: cache.leaves,
      employees: cache.employees,
    }));
  } catch {
    // The board still works for this visit when storage is full.
  }
}

const storedBoard = readStoredBoard();
if (storedBoard) {
  cache = {
    schedules: storedBoard.schedules || [],
    leaves: storedBoard.leaves || [],
    employees: storedBoard.employees || [],
    schedulesAt: storedBoard.at,
    leavesAt: storedBoard.at,
    employeesAt: storedBoard.at,
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('ac:logout', () => {
    boardClosed = true;
    cache = {
      schedules: [],
      leaves: [],
      employees: [],
      schedulesAt: 0,
      leavesAt: 0,
      employeesAt: 0,
    };
    window.clearTimeout(persistTimer);
    try {
      localStorage.removeItem(BOARD_CACHE_KEY);
    } catch {
      // Ignore storage failures while signing out.
    }
  });

  window.addEventListener('ac:login', () => {
    boardClosed = false;
  });
}

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
  if (boardClosed) {
    return cache;
  }

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
  if (typeof window !== 'undefined') {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(writeStoredBoard, 300);
  }

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
