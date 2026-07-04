import { getServiceAreaLabel } from './taitungAreas';

export const UNIT_PRICE_OPTIONS = [1500, 1300, 1000];

export const INVOICE_SURCHARGE_RATE = 0.05;

export const EMPLOYEE_POSTAGE_AMOUNT = 28;

export function createPricingLine(overrides = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ac_units: '1',
    unit_price: '1500',
    ...overrides,
  };
}

export function normalizePricingLines(lines, fallbackUnits = 1, fallbackUnitPrice = 1500) {
  if (Array.isArray(lines) && lines.length > 0) {
    return lines.map((line, index) => ({
      id: line.id || `line-${index}`,
      ac_units: String(line.ac_units ?? 1),
      unit_price: String(line.unit_price ?? fallbackUnitPrice),
    }));
  }

  return [createPricingLine({
    ac_units: String(fallbackUnits),
    unit_price: String(fallbackUnitPrice),
  })];
}

export function summarizePricingLines(lines, needsInvoice = false) {
  const normalized = normalizePricingLines(lines);
  let totalUnits = 0;
  let base = 0;

  normalized.forEach((line) => {
    const units = Number(line.ac_units) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    totalUnits += units;
    base += units * unitPrice;
  });

  const cleaningPrice = needsInvoice ? Math.round(base * (1 + INVOICE_SURCHARGE_RATE)) : base;

  return {
    pricing_lines: normalized,
    ac_units: String(totalUnits || 1),
    unit_price: normalized[0]?.unit_price || '1500',
    cleaning_price: String(cleaningPrice),
  };
}

export const SCHEDULE_TIME_OPTIONS = (() => {
  const options = [];

  for (let hour = 7; hour <= 21; hour += 1) {
    options.push(`${String(hour).padStart(2, '0')}:00`);

    if (hour < 21) {
      options.push(`${String(hour).padStart(2, '0')}:30`);
    }
  }

  return options;
})();

export const MINUTES_PER_AC_UNIT = 60;

export const DEFAULT_FIRST_SHIFT_START = '09:00';

export const DEFAULT_SECOND_SHIFT_START = '14:00';

export const SCHEDULE_DAY_END = '21:00';

export function calculateEndTimeFromUnits(startTime, totalUnits) {
  const units = Math.max(1, Number(totalUnits) || 1);
  const [hour, minute] = formatTimeValue(startTime || DEFAULT_FIRST_SHIFT_START).split(':').map(Number);
  const endMinutes = Math.min(
    (hour * 60) + minute + (units * MINUTES_PER_AC_UNIT),
    21 * 60,
  );
  const endHour = Math.floor(endMinutes / 60);
  const endMinute = endMinutes % 60;

  return snapScheduleTime(
    `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
    SCHEDULE_DAY_END,
  );
}

export function getDefaultStartTime(workDate, userId, schedules = []) {
  const dateKey = formatDateOnly(workDate);

  if (!dateKey) {
    return DEFAULT_FIRST_SHIFT_START;
  }

  const daySchedules = schedules.filter((schedule) => (
    formatDateOnly(schedule.work_date) === dateKey
    && (!userId || String(schedule.user_id) === String(userId))
  ));

  if (daySchedules.length === 0) {
    return DEFAULT_FIRST_SHIFT_START;
  }

  if (daySchedules.length === 1) {
    return DEFAULT_SECOND_SHIFT_START;
  }

  const latestEnd = daySchedules
    .map((schedule) => formatTimeValue(schedule.end_time))
    .sort()
    .pop();

  return snapScheduleTime(latestEnd || DEFAULT_SECOND_SHIFT_START);
}

export function buildScheduleSuccessSummary(form, employees = [], { mode = 'create' } = {}) {
  const employee = employees.find((item) => String(item.id) === String(form.user_id));

  return {
    mode,
    work_date: form.work_date,
    start_time: form.start_time,
    end_time: form.end_time,
    customer_name: form.customer_name,
    customer_address: form.customer_address,
    customer_phone: form.customer_phone,
    employee_name: employee?.name || '未指定',
  };
}

export function roundToScheduleTime(value) {
  const text = formatTimeValue(value);
  const [hourText, minuteText] = text.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return '09:00';
  }

  const totalMinutes = hour * 60 + minute;
  const rounded = Math.round(totalMinutes / 30) * 30;
  const normalized = ((rounded % (24 * 60)) + (24 * 60)) % (24 * 60);
  const nextHour = Math.floor(normalized / 60);
  const nextMinute = normalized % 60;

  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
}

export function snapScheduleTime(value, fallback = '09:00') {
  const rounded = roundToScheduleTime(value);

  return SCHEDULE_TIME_OPTIONS.includes(rounded) ? rounded : fallback;
}

export function inferUnitPrice(schedule) {
  if (schedule?.unit_price && UNIT_PRICE_OPTIONS.includes(Number(schedule.unit_price))) {
    return Number(schedule.unit_price);
  }

  const acUnits = Number(schedule?.ac_units) || 1;
  const cleaningPrice = Number(schedule?.cleaning_price) || 0;
  const needsInvoice = Boolean(schedule?.needs_invoice);
  const base = needsInvoice
    ? Math.round(cleaningPrice / (1 + INVOICE_SURCHARGE_RATE))
    : cleaningPrice;
  const inferred = Math.round(base / acUnits);

  return UNIT_PRICE_OPTIONS.find((price) => price === inferred) ?? 1500;
}

export function applyPriceCalculation(form) {
  const summary = summarizePricingLines(form.pricing_lines, Boolean(form.needs_invoice));
  const end_time = calculateEndTimeFromUnits(
    form.start_time || DEFAULT_FIRST_SHIFT_START,
    summary.ac_units,
  );

  return applyMailSync({
    ...form,
    ...summary,
    end_time,
  });
}

export function mailMatchesCustomer(form) {
  return form.mail_recipient === form.customer_name
    && form.mail_phone === form.customer_phone
    && form.mail_address === form.customer_address;
}

export function applyMailSync(form) {
  if (!form.mail_same_as_customer) {
    return form;
  }

  return {
    ...form,
    mail_recipient: form.customer_name,
    mail_phone: form.customer_phone,
    mail_address: form.customer_address,
  };
}

export function patchScheduleForm(form, partial) {
  const next = { ...form, ...partial };

  if (next.mail_same_as_customer) {
    return applyMailSync(next);
  }

  return next;
}

export const CUSTOMER_SOURCE_OPTIONS = [
  { value: 'fb', label: 'FB', color: '#1E88E5' },
  { value: 'line', label: 'LINE', color: '#43A047' },
  { value: 'phone', label: '電聯', color: '#E53935' },
];

export function getCustomerSourceOption(source) {
  return CUSTOMER_SOURCE_OPTIONS.find((option) => option.value === source)
    ?? CUSTOMER_SOURCE_OPTIONS.find((option) => option.value === 'phone');
}

export function getCustomerSourceLabel(source) {
  return getCustomerSourceOption(source).label;
}

export function formatDateOnly(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  return '';
}

export function formatTimeValue(value) {
  if (!value) {
    return '09:00';
  }

  return String(value).slice(0, 5);
}

export function getMonthRange(date) {
  const base = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);

  return {
    date_from: formatDateOnly(start),
    date_to: formatDateOnly(end),
  };
}

export function getCalendarLoadRange(date) {
  const month = getMonthRange(date);
  const future = new Date();
  future.setDate(future.getDate() + 14);

  return {
    date_from: month.date_from,
    date_to: month.date_to >= formatDateOnly(future) ? month.date_to : formatDateOnly(future),
  };
}

export function getVisibleScheduleRange(rangeStart, displayDays = 7) {
  const startDate = rangeStart instanceof Date && !Number.isNaN(rangeStart.getTime())
    ? new Date(rangeStart)
    : new Date();
  startDate.setHours(0, 0, 0, 0);

  const safeDays = Math.min(7, Math.max(1, Number(displayDays) || 1));
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + safeDays - 1);

  return {
    date_from: formatDateOnly(startDate),
    date_to: formatDateOnly(endDate),
  };
}

export function getCalendarDisplayRange(view, rangeStart, displayDays = 7) {
  if (view === 'month') {
    return getMonthRange(rangeStart);
  }

  if (view === 'agenda') {
    return getCalendarLoadRange(rangeStart);
  }

  return getVisibleScheduleRange(rangeStart, displayDays);
}

export function buildScheduleCalendarEvents(schedules, leaves, dateFrom, dateTo, options = {}) {
  const scheduleEvents = schedules.map((schedule) => scheduleToEvent(schedule, options));
  const leaveEvents = expandLeavesToEvents(leaves, dateFrom, dateTo);

  return [...leaveEvents, ...scheduleEvents];
}

export function getAdminCalendarFetchRange(rangeStart, displayDays = 7) {
  const visible = getVisibleScheduleRange(rangeStart, displayDays);
  const month = getCalendarLoadRange(rangeStart);

  return {
    date_from: visible.date_from < month.date_from ? visible.date_from : month.date_from,
    date_to: visible.date_to > month.date_to ? visible.date_to : month.date_to,
  };
}

export function isDateInVisibleRange(day, rangeStart, displayDays = 7) {
  const dateKey = formatDateOnly(day);
  const { date_from: start, date_to: end } = getVisibleScheduleRange(rangeStart, displayDays);

  return Boolean(dateKey) && dateKey >= start && dateKey <= end;
}

export function getAvailabilityLoadRange(lookaheadDays, anchorDate = new Date()) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const calendarRange = getCalendarLoadRange(anchorDate);
  const end = new Date(today);
  end.setDate(end.getDate() + Math.max(1, Number(lookaheadDays) || 14));

  const todayStr = formatDateOnly(today);
  const endStr = formatDateOnly(end);

  return {
    date_from: calendarRange.date_from < todayStr ? calendarRange.date_from : todayStr,
    date_to: endStr > calendarRange.date_to ? endStr : calendarRange.date_to,
  };
}

export function combineDateTime(dateStr, timeStr) {
  const date = formatDateOnly(dateStr);
  const time = formatTimeValue(timeStr);

  if (!date) {
    return new Date();
  }

  return new Date(`${date}T${time}:00`);
}

export function getCustomerSurname(customerName) {
  const name = String(customerName || '').trim();

  if (!name) {
    return '客';
  }

  return [...name][0] ?? '客';
}

export function hasScheduleReport(schedule) {
  return Boolean(schedule?.daily_report || schedule?.dailyReport);
}

export function buildScheduleEventTitle(schedule, options = {}) {
  return buildScheduleCardLine(schedule, options);
}

export function buildScheduleCardLine(schedule, { hidePrice = false } = {}) {
  const surname = getCustomerSurname(schedule.customer_name);
  const address = String(schedule.customer_address || '').trim();
  const phone = String(schedule.customer_phone || '').trim().replace(/\s+/g, '');
  const unitsPrice = buildScheduleUnitsPriceTag(schedule, { hidePrice });
  const prefix = surname ? `${surname})` : '';
  const projectTag = schedule?.cleaning_project_id ? '[專]' : '';

  return `${projectTag}${prefix}${address}${phone}${unitsPrice}`;
}

export function getScheduleReport(schedule) {
  return schedule?.daily_report || schedule?.dailyReport || null;
}

export function getScheduleDisplayUnits(schedule) {
  const report = getScheduleReport(schedule);

  if (report?.completed_units != null && report.completed_units !== '') {
    const completed = Number(report.completed_units);
    return Number.isFinite(completed) ? completed : Number(schedule?.ac_units) || 0;
  }

  return Number(schedule?.ac_units) || 0;
}

export function getScheduleDisplayPrice(schedule) {
  const report = getScheduleReport(schedule);

  if (report?.collected_amount != null && report.collected_amount !== '') {
    const collected = Number(report.collected_amount);
    if (Number.isFinite(collected)) {
      return collected;
    }
  }

  if (schedule?.cleaning_price != null && schedule.cleaning_price !== '') {
    return schedule.cleaning_price;
  }

  return parseTaskDetails(schedule?.task_details).cleaning_price;
}

export function buildScheduleUnitsPriceTag(schedule, { hidePrice = false } = {}) {
  const units = getScheduleDisplayUnits(schedule);

  if (hidePrice) {
    return units ? `[${units}台]` : '';
  }

  const total = getScheduleDisplayPrice(schedule);

  if (units || total) {
    return `[${units || '-'}離${total || '-'}]`;
  }

  const parsed = parseTaskDetails(schedule?.task_details);

  if (!parsed.ac_units && !parsed.cleaning_price) {
    return '';
  }

  return `[${parsed.ac_units || '-'}離${parsed.cleaning_price || '-'}]`;
}

export function formatScheduleUnitsAndTotal(schedule) {
  const units = getScheduleDisplayUnits(schedule);
  const total = getScheduleDisplayPrice(schedule);

  if (!units && !total) {
    return '';
  }

  return `${units || '-'} 台｜${total || '-'} 元`;
}

export function formatScheduleAcUnits(schedule) {
  const units = getScheduleDisplayUnits(schedule);
  return units ? `${units} 台` : '-';
}

export function formatScheduleTotalPrice(schedule) {
  const total = getScheduleDisplayPrice(schedule);
  return total ? `${total} 元` : '-';
}

export function formatScheduleMailInvoiceSummary(schedule) {
  if (!schedule) {
    return '-';
  }

  const parts = [];

  if (schedule.needs_mail) {
    const mailParts = ['需郵寄'];
    if (schedule.mail_recipient) {
      mailParts.push(`收件：${schedule.mail_recipient}`);
    }
    if (schedule.mail_address) {
      mailParts.push(`地址：${schedule.mail_address}`);
    }
    parts.push(mailParts.join(' · '));
  } else {
    parts.push('不需郵寄');
  }

  if (schedule.needs_invoice) {
    const invoiceParts = ['需統編/發票'];
    if (schedule.invoice_title) {
      invoiceParts.push(`抬頭：${schedule.invoice_title}`);
    }
    if (schedule.invoice_tax_id) {
      invoiceParts.push(`統編：${schedule.invoice_tax_id}`);
    }
    parts.push(invoiceParts.join(' · '));
  } else {
    parts.push('不需統編/發票');
  }

  return parts.join('；');
}

export function formatChineseTimeValue(value) {
  const [hourText, minuteText] = formatTimeValue(value).split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = hour < 12 ? '上午' : '下午';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  if (!minute) {
    return `${period}${hour12}點`;
  }

  return `${period}${hour12}:${String(minute).padStart(2, '0')}`;
}

export function formatChineseTimeRange(schedule) {
  return `${formatChineseTimeValue(schedule.start_time)} - ${formatChineseTimeValue(schedule.end_time)}`;
}

export function formatScheduleDateLabel(workDate) {
  const dateText = formatDateOnly(workDate);

  if (!dateText) {
    return '';
  }

  const parsed = new Date(`${dateText}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return dateText;
  }

  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  return `${month}月 ${day}日 (星期${weekdays[parsed.getDay()]})`;
}

export function formatScheduleSuccessDateTime(summary) {
  if (!summary) {
    return '-';
  }

  const dateText = formatDateOnly(summary.work_date);
  const parsed = dateText ? new Date(`${dateText}T12:00:00`) : null;
  const monthDay = parsed && !Number.isNaN(parsed.getTime())
    ? `${parsed.getMonth() + 1}月${parsed.getDate()}日`
    : formatScheduleDateLabel(summary.work_date);
  const timeRange = formatChineseTimeRange({
    start_time: summary.start_time,
    end_time: summary.end_time,
  });

  return [monthDay, timeRange].filter(Boolean).join(' ') || '-';
}

export const LEAVE_EVENT_COLOR = {
  backgroundColor: '#FBC02D',
  borderColor: '#F9A825',
  textColor: '#ffffff',
};

export const LEAVE_DAY_FILL = '#FBC02D';

export const LEAVE_DAY_BORDER = '#F9A825';

export const LEAVE_SCHEDULE_BACKGROUND = '#FBC02D';

export const PROJECT_STATUS_LABELS = {
  in_progress: '施作中',
  pending_invoice: '完工待發票',
  pending_payment: '待請款流程',
  closed: '已結案',
};

export function getProjectStatusLabel(status) {
  return PROJECT_STATUS_LABELS[status] || status || '施作中';
}

export function getProjectDurationDays(project) {
  const start = formatDateOnly(project?.planned_start_date);
  const end = formatDateOnly(project?.planned_end_date);

  if (!start || !end) {
    return null;
  }

  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);

  return diff + 1;
}

export function getScheduleBlockColor(schedule) {
  if (!schedule || schedule.type === 'leave') {
    return {
      backgroundColor: LEAVE_EVENT_COLOR.backgroundColor,
      borderColor: LEAVE_EVENT_COLOR.borderColor,
      textColor: LEAVE_EVENT_COLOR.textColor,
    };
  }

  if (hasScheduleReport(schedule)) {
    return {
      backgroundColor: '#2E7D32',
      borderColor: '#1B5E20',
      textColor: '#ffffff',
    };
  }

  const palette = {
    line: {
      backgroundColor: '#43A047',
      borderColor: '#2E7D32',
      textColor: '#ffffff',
    },
    fb: {
      backgroundColor: '#1E88E5',
      borderColor: '#1565C0',
      textColor: '#ffffff',
    },
    phone: {
      backgroundColor: '#E53935',
      borderColor: '#C62828',
      textColor: '#ffffff',
    },
  };

  return palette[schedule.customer_source] || palette.phone;
}

export function getScheduleEventClassName(schedule) {
  if (schedule?.type === 'leave') {
    return 'rbc-event-leave';
  }

  if (schedule?.cleaning_project_id) {
    return 'rbc-event-project';
  }

  if (hasScheduleReport(schedule)) {
    return 'rbc-event-reported';
  }

  const source = schedule?.customer_source || 'phone';

  if (source === 'line' || source === 'fb' || source === 'phone') {
    return `rbc-event-source-${source}`;
  }

  return 'rbc-event-source-phone';
}

export function getLeaveEventStyle() {
  return {
    backgroundColor: LEAVE_EVENT_COLOR.backgroundColor,
    border: 'none',
    color: LEAVE_EVENT_COLOR.textColor,
    fontWeight: 700,
    boxShadow: 'none',
  };
}

export function getScheduleEventStyle(schedule) {
  if (!schedule) {
    return {
      backgroundColor: '#9e9e9e',
      border: 'none',
      color: '#ffffff',
      fontWeight: 600,
      boxShadow: 'none',
    };
  }

  if (schedule?.type === 'leave') {
    return getLeaveEventStyle();
  }

  const colors = getScheduleBlockColor(schedule);
  const style = {
    backgroundColor: colors.backgroundColor,
    border: 'none',
    color: colors.textColor,
    fontWeight: 600,
    boxShadow: 'none',
  };

  if (schedule?.cleaning_project_id) {
    style.boxShadow = '0 0 0 2px #7b1fa2';
  }

  return style;
}

export const LEAVE_BAND_START_HOUR = 9;

export const LEAVE_BAND_END_HOUR = 21;

export const PROJECT_BAND_START_HOUR = 9;

export const PROJECT_BAND_END_HOUR = 21;

export function getScheduleDisplayTimes(schedule) {
  if (schedule?.type === 'leave') {
    return {
      start_time: `${String(LEAVE_BAND_START_HOUR).padStart(2, '0')}:00`,
      end_time: `${String(LEAVE_BAND_END_HOUR).padStart(2, '0')}:00`,
    };
  }

  if (schedule?.cleaning_project_id) {
    return {
      start_time: `${String(PROJECT_BAND_START_HOUR).padStart(2, '0')}:00`,
      end_time: `${String(PROJECT_BAND_END_HOUR).padStart(2, '0')}:00`,
    };
  }

  return {
    start_time: schedule?.start_time,
    end_time: schedule?.end_time,
  };
}

export function formatScheduleDisplayTimeRange(schedule) {
  return formatChineseTimeRange(getScheduleDisplayTimes(schedule));
}

export function getLeaveBandStyle(startHour, endHour, bandStart = LEAVE_BAND_START_HOUR, bandEnd = LEAVE_BAND_END_HOUR) {
  const visibleStart = Number(startHour) || LEAVE_BAND_START_HOUR;
  const visibleEnd = Number(endHour) >= 24 ? 24 : Number(endHour) || LEAVE_BAND_END_HOUR;
  const totalMinutes = Math.max(1, (visibleEnd - visibleStart) * 60);
  const bandStartMinutes = Math.max(0, (bandStart - visibleStart) * 60);
  const bandEndMinutes = Math.min(totalMinutes, (bandEnd - visibleStart) * 60);

  return {
    top: `${(bandStartMinutes / totalMinutes) * 100}%`,
    height: `${Math.max(0, (bandEndMinutes - bandStartMinutes) / totalMinutes) * 100}%`,
  };
}

export function buildLeaveDateLabelMap(leaves, dateFrom, dateTo) {
  const map = new Map();

  expandLeavesToEvents(leaves, dateFrom, dateTo).forEach((event) => {
    const dateKey = formatDateOnly(event.start);

    if (!dateKey || map.has(dateKey)) {
      return;
    }

    map.set(dateKey, event.title);
  });

  return map;
}

export function buildLeaveBackgroundEvents(leaves, dateFrom, dateTo) {
  const byDate = new Map();

  expandLeavesToEvents(leaves, dateFrom, dateTo).forEach((event) => {
    const dateKey = formatDateOnly(event.start);

    if (!dateKey || byDate.has(dateKey)) {
      return;
    }

    byDate.set(dateKey, event);
  });

  return [...byDate.values()];
}

export function buildLeavesByDate(leaves, dateFrom, dateTo) {
  const byDate = new Map();

  expandLeavesToEvents(leaves, dateFrom, dateTo).forEach((event) => {
    const dateKey = formatDateOnly(event.start);

    if (!dateKey) {
      return;
    }

    const list = byDate.get(dateKey) || [];
    list.push(event.resource);
    byDate.set(dateKey, list);
  });

  return byDate;
}

export function buildLeaveEvents(leaves, dateFrom, dateTo) {
  return buildLeaveBackgroundEvents(leaves, dateFrom, dateTo);
}

export function expandLeavesToEvents(leaves, dateFrom, dateTo) {
  const start = new Date(`${formatDateOnly(dateFrom)}T00:00:00`);
  const end = new Date(`${formatDateOnly(dateTo)}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const events = [];

  leaves.forEach((leave) => {
    if (leave.leave_type === 'date' && leave.leave_date) {
      const dateKey = formatDateOnly(leave.leave_date);

      if (dateKey >= formatDateOnly(start) && dateKey <= formatDateOnly(end)) {
        events.push(leaveToEvent(leave, dateKey));
      }

      return;
    }

    if (leave.leave_type === 'weekly' && leave.weekday !== null && leave.weekday !== undefined) {
      const cursor = new Date(start);

      while (cursor <= end) {
        if (cursor.getDay() === Number(leave.weekday)) {
          events.push(leaveToEvent(leave, formatDateOnly(cursor)));
        }

        cursor.setDate(cursor.getDate() + 1);
      }
    }
  });

  return events;
}

export function extractDateLeaveKeys(leaves, dateFrom, dateTo, userId = null) {
  const startKey = formatDateOnly(dateFrom);
  const endKey = formatDateOnly(dateTo);

  return new Set(
    leaves
      .filter((leave) => {
        if (leave.leave_type !== 'date' || !leave.leave_date) {
          return false;
        }

        if (userId !== null && String(leave.user_id) !== String(userId)) {
          return false;
        }

        const dateKey = formatDateOnly(leave.leave_date);

        return dateKey >= startKey && dateKey <= endKey;
      })
      .map((leave) => formatDateOnly(leave.leave_date)),
  );
}

export function leaveToEvent(leave, dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(year, month - 1, day, LEAVE_BAND_START_HOUR, 0, 0, 0);
  const end = new Date(year, month - 1, day, LEAVE_BAND_END_HOUR, 0, 0, 0);
  const name = leave.user?.name || leave.user?.account || '師傅';

  return {
    id: `leave-${leave.id}-${dateStr}`,
    title: `${name} 休假`,
    start,
    end,
    allDay: false,
    resource: {
      type: 'leave',
      ...leave,
      leave_date: dateStr,
    },
  };
}

export function parseTaskDetails(taskDetails) {
  const text = String(taskDetails || '');
  const totalMatch = text.match(/=(\d+)\s*$/);
  const unitsMatch = text.match(/(\d+)[台離]/);

  if (totalMatch && unitsMatch) {
    return {
      ac_units: unitsMatch[1],
      cleaning_price: totalMatch[1],
    };
  }

  const match = text.match(/(\d+)[台離](\d+)/);

  if (!match) {
    return { ac_units: '1', cleaning_price: '' };
  }

  return {
    ac_units: match[1],
    cleaning_price: match[2],
  };
}

export function scheduleToEvent(schedule, options = {}) {
  const displayTimes = getScheduleDisplayTimes(schedule);
  const start = combineDateTime(schedule.work_date, displayTimes.start_time);
  let end = combineDateTime(schedule.work_date, displayTimes.end_time);

  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  }

  return {
    id: schedule.id,
    title: buildScheduleEventTitle(schedule, options),
    start,
    end,
    resource: schedule,
  };
}

export const emptyScheduleForm = {
  user_id: '',
  work_date: '',
  start_time: DEFAULT_FIRST_SHIFT_START,
  end_time: '10:00',
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  needs_mail: false,
  mail_same_as_customer: false,
  mail_recipient: '',
  mail_phone: '',
  mail_address: '',
  service_area: '',
  customer_source: 'phone',
  fb_display_name: '',
  line_display_name: '',
  pricing_lines: [createPricingLine()],
  ac_units: '1',
  unit_price: '1500',
  needs_invoice: false,
  invoice_tax_id: '',
  invoice_title: '',
  cleaning_price: '1500',
  notes: '',
};

export function scheduleToForm(schedule) {
  const parsed = parseTaskDetails(schedule.task_details);
  const pricingLines = normalizePricingLines(
    schedule.pricing_lines,
    schedule.ac_units ?? parsed.ac_units ?? 1,
    inferUnitPrice(schedule),
  );

  return applyPriceCalculation({
    user_id: String(schedule.user_id),
    work_date: formatDateOnly(schedule.work_date),
    start_time: snapScheduleTime(schedule.start_time),
    end_time: snapScheduleTime(schedule.end_time, '12:00'),
    customer_name: schedule.customer_name || '',
    customer_address: schedule.customer_address ?? '',
    customer_phone: schedule.customer_phone ?? '',
    needs_mail: Boolean(schedule.needs_mail || schedule.mail_recipient || schedule.mail_phone || schedule.mail_address),
    mail_recipient: schedule.mail_recipient ?? '',
    mail_phone: schedule.mail_phone ?? '',
    mail_address: schedule.mail_address ?? '',
    mail_same_as_customer: mailMatchesCustomer({
      customer_name: schedule.customer_name || '',
      customer_phone: schedule.customer_phone ?? '',
      customer_address: schedule.customer_address ?? '',
      mail_recipient: schedule.mail_recipient ?? '',
      mail_phone: schedule.mail_phone ?? '',
      mail_address: schedule.mail_address ?? '',
    }),
    service_area: schedule.service_area ?? '',
    customer_source: schedule.customer_source || 'phone',
    fb_display_name: schedule.fb_display_name || '',
    line_display_name: schedule.line_display_name || '',
    pricing_lines: pricingLines,
    needs_invoice: Boolean(schedule.needs_invoice),
    invoice_tax_id: schedule.invoice_tax_id ?? '',
    invoice_title: schedule.invoice_title ?? '',
    notes: schedule.notes || '',
  });
}

export function getCurrentMonthStartDate(anchor = new Date()) {
  const base = anchor instanceof Date && !Number.isNaN(anchor.getTime()) ? anchor : new Date();

  return formatDateOnly(new Date(base.getFullYear(), base.getMonth(), 1));
}

export function isWorkDateInCurrentMonth(workDate, anchor = new Date()) {
  const dateKey = formatDateOnly(workDate);

  if (!dateKey) {
    return false;
  }

  const start = getCurrentMonthStartDate(anchor);
  const end = formatDateOnly(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));

  return dateKey >= start && dateKey <= end;
}

export function isWorkDateBeforeCurrentMonth(workDate, anchor = new Date()) {
  const dateKey = formatDateOnly(workDate);

  return Boolean(dateKey) && dateKey < getCurrentMonthStartDate(anchor);
}

export function canMutateScheduleWorkDate(workDate, { userRole = 'admin', original = null } = {}) {
  if (original) {
    const originalDate = formatDateOnly(original.work_date);

    if (isWorkDateBeforeCurrentMonth(originalDate) && userRole !== 'admin') {
      return '已跨月的班表僅管理員可修改';
    }
  }

  if (isWorkDateBeforeCurrentMonth(workDate) && userRole !== 'admin') {
    return '僅能調整當月班表，跨月後請由管理員修改';
  }

  return null;
}

export function canModifyScheduleByMonth(schedule, userRole = 'admin') {
  if (!schedule) {
    return false;
  }

  return !canMutateScheduleWorkDate(formatDateOnly(schedule.work_date), { userRole });
}

export function dateToScheduleTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hour = String(value.getHours()).padStart(2, '0');
    const minute = String(value.getMinutes()).padStart(2, '0');

    return snapScheduleTime(`${hour}:${minute}`);
  }

  return snapScheduleTime(value);
}

export function calendarInteractionToScheduleUpdate(schedule, start, end, { eventStart, eventEnd } = {}) {
  const originalWorkDate = formatDateOnly(schedule.work_date);
  const start_time = dateToScheduleTime(start);
  let end_time = dateToScheduleTime(end);

  const beforeDay = eventStart ? formatDateOnly(eventStart) : originalWorkDate;
  const afterDay = formatDateOnly(start);
  const work_date = beforeDay === afterDay ? originalWorkDate : afterDay;

  if (eventStart && eventEnd) {
    const durationMs = eventEnd.getTime() - eventStart.getTime();

    if (durationMs > 0 && beforeDay === afterDay) {
      end_time = dateToScheduleTime(new Date(start.getTime() + durationMs));
    }
  }

  if (combineDateTime(work_date, end_time) <= combineDateTime(work_date, start_time)) {
    end_time = calculateEndTimeFromUnits(start_time, schedule?.ac_units || 1);
  }

  return { work_date, start_time, end_time };
}

export function canDragScheduleEvent(schedule, userRole = 'admin') {
  if (!schedule || schedule.type === 'leave') {
    return false;
  }

  if (hasScheduleReport(schedule)) {
    return false;
  }

  return !canMutateScheduleWorkDate(formatDateOnly(schedule.work_date), { userRole });
}

export function buildScheduleTimePatch(form, { original = null, userRole = 'admin' } = {}) {
  const accessError = canMutateScheduleWorkDate(form.work_date, { userRole, original });

  if (accessError) {
    throw new Error(accessError);
  }

  const timingError = validateScheduleTiming(form, { original, userRole });

  if (timingError) {
    throw new Error(timingError);
  }

  if (!SCHEDULE_TIME_OPTIONS.includes(form.start_time) || !SCHEDULE_TIME_OPTIONS.includes(form.end_time)) {
    throw new Error('預約時間僅能選擇整點或 30 分');
  }

  return {
    work_date: form.work_date,
    start_time: form.start_time,
    end_time: form.end_time,
  };
}

export function getMinWorkDate() {
  return formatDateOnly(new Date());
}

export function getMinScheduleWorkDate(userRole = 'admin') {
  if (userRole === 'admin') {
    return undefined;
  }

  return getCurrentMonthStartDate();
}

export function isScheduleInPast(workDate, startTime) {
  const scheduledAt = combineDateTime(workDate, startTime);
  return scheduledAt.getTime() < Date.now();
}

export function isSlotInPast(slot, { userRole = 'admin' } = {}) {
  const start = slot?.start instanceof Date ? slot.start : new Date();

  if (isWorkDateInCurrentMonth(start)) {
    return false;
  }

  if (userRole === 'admin' && isWorkDateBeforeCurrentMonth(start)) {
    return false;
  }

  return start.getTime() < Date.now();
}

export function validateScheduleTiming(form, { original = null, userRole = 'admin' } = {}) {
  const accessError = canMutateScheduleWorkDate(form.work_date, { userRole, original });

  if (accessError) {
    return accessError;
  }

  if (original) {
    const originalDate = formatDateOnly(original.work_date);
    const originalStart = formatTimeValue(original.start_time);

    if (form.work_date === originalDate && form.start_time === originalStart) {
      return null;
    }
  }

  if (isWorkDateInCurrentMonth(form.work_date)) {
    return null;
  }

  if (isWorkDateBeforeCurrentMonth(form.work_date)) {
    return null;
  }

  if (isScheduleInPast(form.work_date, form.start_time)) {
    return '不可預約過去的日期或時間，請選擇現在之後的時段';
  }

  return null;
}

export function slotToForm(slot, { schedules = [], userId = '', userRole = 'admin' } = {}) {
  const now = new Date();
  let start = slot.start instanceof Date ? slot.start : new Date();

  if (!isWorkDateInCurrentMonth(start) && !(userRole === 'admin' && isWorkDateBeforeCurrentMonth(start))) {
    if (start.getTime() < now.getTime()) {
      start = new Date(now);
    }
  }

  const workDate = formatDateOnly(start);
  const startTime = slot.useDefaultShift
    ? getDefaultStartTime(workDate, userId, schedules)
    : snapScheduleTime(start);

  return applyPriceCalculation({
    ...emptyScheduleForm,
    work_date: workDate,
    start_time: startTime,
  });
}

export function buildSchedulePayload(form, { original = null, userRole = 'admin' } = {}) {
  const timingError = validateScheduleTiming(form, { original, userRole });

  if (timingError) {
    throw new Error(timingError);
  }

  const hidePricing = userRole === 'customer_service';
  const summary = hidePricing
    ? summarizePricingLines(form.pricing_lines, false)
    : summarizePricingLines(form.pricing_lines, Boolean(form.needs_invoice));
  const pricingLines = summary.pricing_lines.map(({ ac_units, unit_price }) => ({
    ac_units: Number(ac_units),
    unit_price: Number(unit_price),
  }));

  if (pricingLines.some((line) => !Number.isFinite(line.ac_units) || line.ac_units < 1)) {
    throw new Error('請填寫有效的冷氣台數');
  }

  if (!hidePricing && pricingLines.some((line) => !UNIT_PRICE_OPTIONS.includes(line.unit_price))) {
    throw new Error('請選擇有效的單價');
  }

  if (!SCHEDULE_TIME_OPTIONS.includes(form.start_time) || !SCHEDULE_TIME_OPTIONS.includes(form.end_time)) {
    throw new Error('預約時間僅能選擇整點或 30 分');
  }

  return {
    user_id: Number(form.user_id),
    work_date: form.work_date,
    start_time: form.start_time,
    end_time: form.end_time,
    customer_name: form.customer_name.trim(),
    customer_phone: form.customer_phone.trim(),
    customer_address: form.customer_address.trim(),
    needs_mail: Boolean(form.needs_mail),
    mail_recipient: form.needs_mail ? form.mail_recipient?.trim() || null : null,
    mail_phone: form.needs_mail ? form.mail_phone?.trim() || null : null,
    mail_address: form.needs_mail ? form.mail_address?.trim() || null : null,
    service_area: form.service_area || null,
    customer_source: form.customer_source || 'phone',
    fb_display_name: form.fb_display_name?.trim() || null,
    line_display_name: form.line_display_name?.trim() || null,
    pricing_lines: pricingLines,
    needs_invoice: Boolean(form.needs_invoice),
    invoice_tax_id: form.needs_invoice ? form.invoice_tax_id?.trim() || null : null,
    invoice_title: form.needs_invoice ? form.invoice_title?.trim() || null : null,
    notes: form.notes?.trim() || null,
  };
}
