const STORAGE_KEY = 'schedule-calendar-settings';

export const DEFAULT_CALENDAR_SETTINGS = {
  defaultView: 'week',
  weekStartsOn: 1,
  startHour: 5,
  endHour: 24,
  slotMinutes: 30,
  colorMode: 'source',
  displayDays: 7,
};

export function loadCalendarSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { ...DEFAULT_CALENDAR_SETTINGS };
    }

    const parsed = JSON.parse(raw);
    const merged = {
      ...DEFAULT_CALENDAR_SETTINGS,
      ...parsed,
      displayDays: Math.min(7, Math.max(1, Number(parsed.displayDays) || DEFAULT_CALENDAR_SETTINGS.displayDays)),
    };

    if (merged.startHour === 7 && merged.endHour === 21) {
      merged.startHour = 5;
      merged.endHour = 24;
      saveCalendarSettings(merged);
    }

    merged.startHour = clampHour(merged.startHour, 5, 23);
    merged.endHour = clampHour(merged.endHour, 6, 24);

    if (merged.endHour <= merged.startHour) {
      merged.startHour = DEFAULT_CALENDAR_SETTINGS.startHour;
      merged.endHour = DEFAULT_CALENDAR_SETTINGS.endHour;
    }

    return merged;
  } catch {
    return { ...DEFAULT_CALENDAR_SETTINGS };
  }
}

function clampHour(value, min, max) {
  const hour = Number(value);

  if (!Number.isFinite(hour)) {
    return min;
  }

  return Math.min(max, Math.max(min, hour));
}

export function saveCalendarSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function hourToCalendarDate(hour) {
  const normalized = Number(hour);

  if (!Number.isFinite(normalized)) {
    return new Date(1970, 0, 1, 5, 0, 0);
  }

  // react-big-calendar merges only the clock time onto the visible day.
  // Midnight (24:00) must stay on the same day as 23:59:59, not 00:00.
  if (normalized >= 24) {
    return new Date(1970, 0, 1, 23, 59, 59);
  }

  return new Date(1970, 0, 1, normalized, 0, 0);
}

export function getTimeslots(slotMinutes) {
  return Math.max(1, Math.floor(60 / slotMinutes));
}
