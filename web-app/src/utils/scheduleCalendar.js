import { getServiceAreaLabel } from './taitungAreas';

export const UNIT_PRICE_OPTIONS = [1500, 1300, 1000];

export const INVOICE_SURCHARGE_RATE = 0.05;

export const HONGYI_TAX_RATE = 0.08;

export const INVOICE_TYPE_NONE = 'none';

export const INVOICE_TYPE_DUPLICATE = 'duplicate';

export const INVOICE_TYPE_TRIPLICATE = 'triplicate';

export const INVOICE_TYPE_OPTIONS = [
  { value: INVOICE_TYPE_NONE, label: '不開' },
  { value: INVOICE_TYPE_DUPLICATE, label: '二聯' },
  { value: INVOICE_TYPE_TRIPLICATE, label: '三聯' },
];

export const EMPLOYEE_POSTAGE_AMOUNT = 28;

export function createPricingLine(overrides = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ac_units: '1',
    unit_price: '1500',
    is_taxable: false,
    invoice_type: INVOICE_TYPE_NONE,
    invoice_title: '',
    invoice_tax_id: '',
    charge_customer_tax: false,
    ...overrides,
  };
}

export function resolveSegmentPricingLine(lines, index) {
  const normalized = normalizePricingLines(lines);

  if (normalized.length === 0) {
    return createPricingLine();
  }

  return normalized[index] ?? normalized[normalized.length - 1];
}

export function clonePricingLineInvoiceSettings(line) {
  const invoiceType = line?.invoice_type || INVOICE_TYPE_NONE;
  const chargeCustomerTax = line?.charge_customer_tax !== false;

  return {
    invoice_type: invoiceType,
    charge_customer_tax: invoiceType === INVOICE_TYPE_NONE ? false : chargeCustomerTax,
    is_taxable: invoiceType === INVOICE_TYPE_NONE ? false : chargeCustomerTax,
    invoice_title: invoiceType === INVOICE_TYPE_TRIPLICATE
      ? String(line?.invoice_title || '')
      : '',
    invoice_tax_id: invoiceType === INVOICE_TYPE_TRIPLICATE
      ? String(line?.invoice_tax_id || '')
      : '',
  };
}

export function lineHasInvoice(line) {
  return line?.invoice_type === INVOICE_TYPE_DUPLICATE
    || line?.invoice_type === INVOICE_TYPE_TRIPLICATE;
}

export function hasInvoicedPricingLine(lines) {
  return (lines || []).some(lineHasInvoice);
}

export function migratePricingLineFields(line, scheduleContext = null) {
  if (line?.invoice_type && INVOICE_TYPE_OPTIONS.some((option) => option.value === line.invoice_type)) {
    return {
      ...line,
      charge_customer_tax: lineHasInvoice(line) ? line.charge_customer_tax !== false : false,
    };
  }

  if (line?.is_taxable) {
    return {
      ...line,
      invoice_type: INVOICE_TYPE_DUPLICATE,
      charge_customer_tax: true,
      invoice_title: '',
      invoice_tax_id: '',
    };
  }

  if (scheduleContext?.needs_invoice) {
    const hasTriplicate = Boolean(
      String(scheduleContext.invoice_title || '').trim()
      || String(scheduleContext.invoice_tax_id || '').trim(),
    );

    if (hasTriplicate) {
      return {
        ...line,
        invoice_type: INVOICE_TYPE_TRIPLICATE,
        invoice_title: scheduleContext.invoice_title || '',
        invoice_tax_id: scheduleContext.invoice_tax_id || '',
        charge_customer_tax: true,
      };
    }

    return {
      ...line,
      invoice_type: INVOICE_TYPE_DUPLICATE,
      charge_customer_tax: Boolean(scheduleContext.invoice_charge_customer_tax),
      invoice_title: '',
      invoice_tax_id: '',
    };
  }

  return {
    ...line,
    invoice_type: INVOICE_TYPE_NONE,
    charge_customer_tax: false,
    invoice_title: '',
    invoice_tax_id: '',
  };
}

export function calculatePricingLineTotals(line) {
  const units = Number(line.ac_units) || 0;
  const unitPrice = Number(line.unit_price) || 0;
  const subtotal = units * unitPrice;
  const hasInvoice = lineHasInvoice(line);
  const chargeCustomerTax = hasInvoice && line.charge_customer_tax !== false;
  const customerAmount = subtotal + (chargeCustomerTax
    ? Math.round(subtotal * INVOICE_SURCHARGE_RATE)
    : 0);
  const hongyiFee = hasInvoice ? Math.round(subtotal * HONGYI_TAX_RATE) : 0;

  return {
    subtotal,
    customerAmount,
    hongyiFee,
    hasInvoice,
    chargeCustomerTax,
  };
}

export function createServiceAddress(overrides = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ac_units: '1',
    address: '',
    phone: '',
    same_as_customer: true,
    station_note: '',
    ...overrides,
  };
}

export function hasTaxablePricingLine(lines) {
  return (lines || []).some((line) => Boolean(line.is_taxable));
}

export function deriveNeedsInvoice(form) {
  return Boolean(form.needs_invoice) || hasInvoicedPricingLine(form.pricing_lines);
}

export function isTriplicateInvoice(form) {
  if ((form.pricing_lines || []).some((line) => line.invoice_type === INVOICE_TYPE_TRIPLICATE)) {
    return true;
  }

  return Boolean(form.needs_invoice)
    && Boolean(String(form.invoice_title || '').trim() || String(form.invoice_tax_id || '').trim());
}

export function shouldChargeCustomerTax(form) {
  const lines = form.pricing_lines || [];

  if (hasInvoicedPricingLine(lines)) {
    return lines.some((line) => lineHasInvoice(line) && line.charge_customer_tax !== false);
  }

  if (form.needs_invoice) {
    return isTriplicateInvoice(form) || Boolean(form.invoice_charge_customer_tax);
  }

  return hasTaxablePricingLine(lines);
}

export function syncInvoiceTaxFlags(form) {
  const pricingLines = (form.pricing_lines || [createPricingLine()]).map((line) => ({
    ...line,
    is_taxable: lineHasInvoice(line)
      ? line.charge_customer_tax !== false
      : Boolean(line.is_taxable),
  }));

  const triplicateLine = pricingLines.find((line) => line.invoice_type === INVOICE_TYPE_TRIPLICATE);

  return {
    ...form,
    pricing_lines: pricingLines,
    needs_invoice: deriveNeedsInvoice({ ...form, pricing_lines: pricingLines }),
    invoice_charge_customer_tax: pricingLines.some(
      (line) => line.invoice_type === INVOICE_TYPE_DUPLICATE && line.charge_customer_tax !== false,
    ) || Boolean(form.invoice_charge_customer_tax),
    invoice_title: triplicateLine?.invoice_title ?? form.invoice_title ?? '',
    invoice_tax_id: triplicateLine?.invoice_tax_id ?? form.invoice_tax_id ?? '',
  };
}

export function getScheduleContactId(schedule) {
  if (!schedule) {
    return '';
  }

  if (schedule.customer_source === 'line') {
    return schedule.line_display_name || schedule.customer_name || '';
  }

  if (schedule.customer_source === 'fb') {
    return schedule.fb_display_name || schedule.customer_name || '';
  }

  return schedule.customer_name || '';
}

export function getFormContactId(form) {
  if (form.customer_source === 'line') {
    return form.line_display_name || form.customer_name || '';
  }

  if (form.customer_source === 'fb') {
    return form.fb_display_name || form.customer_name || '';
  }

  return form.customer_name || '';
}

export function patchFormContactId(form, value) {
  const trimmed = String(value || '').trim();

  if (form.customer_source === 'line') {
    return { line_display_name: trimmed, customer_name: trimmed };
  }

  if (form.customer_source === 'fb') {
    return { fb_display_name: trimmed, customer_name: trimmed };
  }

  return { customer_name: trimmed };
}

export function resolveScheduleDocumentType(schedule) {
  if (!schedule) {
    return '';
  }

  if (schedule.needs_receipt) {
    return '收據';
  }

  if (schedule.needs_invoice) {
    return isTriplicateInvoice(schedule) ? '三聯' : '二聯';
  }

  if (schedule.needs_mail) {
    return '郵寄';
  }

  return '';
}

export function scheduleHasMailTrackingItem(schedule) {
  return Boolean(schedule?.needs_mail || schedule?.needs_invoice || schedule?.needs_receipt);
}

export function getTotalPricingUnits(form) {
  return normalizePricingLines(form?.pricing_lines).reduce(
    (total, line) => total + (Number(line.ac_units) || 0),
    0,
  );
}

export function getTotalAddressUnits(addresses) {
  return (addresses || []).reduce(
    (total, row) => total + (Number(row.ac_units) || 0),
    0,
  );
}

export function parseMultiAddressNote(notes) {
  const text = String(notes || '');
  const match = text.match(/\[多址\s+(\d+)\/(\d+)(?:·共(\d+)離(\d+))?\]/);

  if (!match) {
    return null;
  }

  return {
    index: Number(match[1]),
    total: Number(match[2]),
    groupUnits: match[3] ? Number(match[3]) : null,
    groupPrice: match[4] ? Number(match[4]) : null,
  };
}

function sameMultiAddressCustomer(left, right) {
  if (!left || !right) {
    return false;
  }

  return formatDateOnly(left.work_date) === formatDateOnly(right.work_date)
    && String(left.customer_phone || '').trim() === String(right.customer_phone || '').trim()
    && String(left.customer_name || '').trim() === String(right.customer_name || '').trim();
}

export function resolveMultiAddressGroupTotals(schedule, relatedSchedules = []) {
  const multi = parseMultiAddressNote(schedule?.notes);

  if (!multi) {
    return null;
  }

  if (multi.groupUnits && multi.groupPrice != null) {
    return {
      groupUnits: multi.groupUnits,
      groupPrice: multi.groupPrice,
    };
  }

  for (const candidate of relatedSchedules) {
    if (candidate.id === schedule.id || !sameMultiAddressCustomer(schedule, candidate)) {
      continue;
    }

    const otherMulti = parseMultiAddressNote(candidate?.notes);

    if (!otherMulti || otherMulti.total !== multi.total) {
      continue;
    }

    if (otherMulti.groupUnits && otherMulti.groupPrice != null) {
      return {
        groupUnits: otherMulti.groupUnits,
        groupPrice: otherMulti.groupPrice,
      };
    }
  }

  return null;
}

export function getMultiAddressSegmentDisplayPrice(schedule, groupTotals) {
  if (!groupTotals?.groupUnits || groupTotals.groupPrice == null) {
    return null;
  }

  const units = Number(getScheduleDisplayUnits(schedule)) || 0;

  if (units <= 0) {
    return null;
  }

  return Math.round((groupTotals.groupPrice * units) / groupTotals.groupUnits);
}

export function parseStationNote(notes) {
  const text = String(notes || '');
  const match = text.match(/\[站備\]\s*([^\n\[]+)/);

  return match ? match[1].trim() : '';
}

export function stripInternalScheduleNotes(notes) {
  return String(notes || '')
    .replace(/\[多址\s+\d+\/\d+(?:·共\d+離\d+)?\]/g, '')
    .replace(/\[站備\]\s*[^\n\[]+/g, '')
    .trim();
}

export function composeScheduleNotes(baseNotes, { stationNote = '' } = {}) {
  const base = String(baseNotes || '')
    .replace(/\[站備\]\s*[^\n\[]+/g, '')
    .trim();
  const note = String(stationNote || '').trim();
  const parts = [];

  if (base) {
    parts.push(base);
  }

  if (note) {
    parts.push(`[站備] ${note}`);
  }

  return parts.join('\n') || null;
}

function getPricingLineSummaryLabel(line) {
  if (!lineHasInvoice(line)) {
    return '未稅';
  }

  if (line.invoice_type === INVOICE_TYPE_TRIPLICATE) {
    return line.charge_customer_tax !== false ? '三聯含稅' : '三聯';
  }

  return line.charge_customer_tax !== false ? '含稅' : '二聯';
}

export function buildPricingLinesSummaryTag(schedule) {
  const lines = normalizePricingLines(
    schedule?.pricing_lines,
    schedule?.ac_units ?? 1,
    inferUnitPrice(schedule),
    schedule,
  );

  if (lines.length <= 1) {
    return '';
  }

  const multiplePrices = new Set(lines.map((line) => String(line.unit_price))).size > 1;
  const segments = lines.map((line) => {
    const units = Number(line.ac_units) || 0;
    const taxLabel = getPricingLineSummaryLabel(line);

    if (multiplePrices) {
      return `${units}台${line.unit_price}${taxLabel}`;
    }

    return `${units}台${taxLabel}`;
  });

  return `[明細: ${segments.join(' / ')}]`;
}

export function getSchedulePricingLineDetails(schedule) {
  const lines = normalizePricingLines(
    schedule?.pricing_lines,
    schedule?.ac_units ?? 1,
    inferUnitPrice(schedule),
    schedule,
  );

  return lines.map((line, index) => {
    const totals = calculatePricingLineTotals(line);
    const invoiceOption = INVOICE_TYPE_OPTIONS.find((option) => option.value === line.invoice_type);

    return {
      index: index + 1,
      units: Number(line.ac_units) || 0,
      unitPrice: Number(line.unit_price) || 0,
      customerAmount: totals.customerAmount,
      invoiceTypeLabel: invoiceOption?.label || '不開',
      invoiceTitle: String(line.invoice_title || '').trim(),
      invoiceTaxId: String(line.invoice_tax_id || '').trim(),
      summaryLabel: getPricingLineSummaryLabel(line),
      chargeCustomerTax: totals.chargeCustomerTax,
    };
  });
}

export function normalizeServiceAddresses(form) {
  if (Array.isArray(form.service_addresses) && form.service_addresses.length > 0) {
    return form.service_addresses.map((row, index) => ({
      id: row.id || `addr-${index}`,
      ac_units: String(row.ac_units ?? 1),
      address: String(row.address ?? '').trim(),
      phone: String(row.phone ?? '').trim(),
      same_as_customer: row.same_as_customer !== false,
      station_note: String(row.station_note ?? '').trim(),
    }));
  }

  return [createServiceAddress({
    id: 'primary',
    ac_units: String(form.ac_units || 1),
    address: String(form.customer_address || '').trim(),
    phone: String(form.customer_phone || '').trim(),
    same_as_customer: true,
  })];
}

export function normalizePricingLines(lines, fallbackUnits = 1, fallbackUnitPrice = 1500, scheduleContext = null) {
  if (Array.isArray(lines) && lines.length > 0) {
    return lines.map((line, index) => {
      const migrated = migratePricingLineFields({
        id: line.id || `line-${index}`,
        ac_units: String(line.ac_units ?? 1),
        unit_price: String(line.unit_price ?? fallbackUnitPrice),
        is_taxable: Boolean(line.is_taxable),
        invoice_type: line.invoice_type,
        invoice_title: line.invoice_title ?? '',
        invoice_tax_id: line.invoice_tax_id ?? '',
        charge_customer_tax: line.charge_customer_tax,
      }, scheduleContext);

      return {
        ...migrated,
        is_taxable: lineHasInvoice(migrated) ? migrated.charge_customer_tax !== false : Boolean(migrated.is_taxable),
      };
    });
  }

  return [createPricingLine({
    ac_units: String(fallbackUnits),
    unit_price: String(fallbackUnitPrice),
  })];
}

export function summarizePricingLines(lines, fallbackUnits = 1, fallbackUnitPrice = 1500, scheduleContext = null) {
  const normalized = normalizePricingLines(lines, fallbackUnits, fallbackUnitPrice, scheduleContext);
  let totalUnits = 0;
  let customerTotal = 0;
  let hongyiFee = 0;

  normalized.forEach((line) => {
    const totals = calculatePricingLineTotals(line);
    totalUnits += Number(line.ac_units) || 0;
    customerTotal += totals.customerAmount;
    hongyiFee += totals.hongyiFee;
  });

  return {
    pricing_lines: normalized,
    ac_units: String(totalUnits || 1),
    unit_price: normalized[0]?.unit_price || '1500',
    cleaning_price: String(customerTotal),
    customer_total: String(customerTotal),
    hongyi_fee: String(hongyiFee),
    needs_invoice: hasInvoicedPricingLine(normalized),
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
  const synced = syncInvoiceTaxFlags(form);
  const pricing = summarizePricingLines(
    synced.pricing_lines,
    synced.ac_units ?? 1,
    synced.unit_price ?? 1500,
    synced,
  );
  const serviceAddresses = normalizeServiceAddresses(synced);
  const acUnits = serviceAddresses.length > 1
    ? serviceAddresses.reduce((total, row) => total + (Number(row.ac_units) || 0), 0)
    : Number(pricing.ac_units) || Number(synced.ac_units) || 0;

  return {
    mode,
    work_date: synced.work_date,
    start_time: synced.start_time,
    end_time: synced.end_time,
    customer_name: synced.customer_name,
    customer_address: synced.customer_address,
    customer_phone: synced.customer_phone,
    employee_name: employee?.name || '未指定',
    ac_units: acUnits,
    cleaning_price: Number(pricing.cleaning_price) || 0,
    pricing_lines: pricing.pricing_lines,
  };
}

export function buildScheduleSuccessScreenshotName(summary) {
  const prefix = summary?.mode === 'update' ? '班表更新' : '預約完成';
  const customerName = String(summary?.customer_name || '客戶').replace(/[\\/:*?"<>|]/g, '').trim() || '客戶';
  const dateText = formatDateOnly(summary?.work_date) || 'date';

  return `${prefix}-${customerName}-${dateText}.png`;
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
  const synced = syncInvoiceTaxFlags(form);
  const summary = summarizePricingLines(
    synced.pricing_lines,
    synced.ac_units ?? 1,
    synced.unit_price ?? 1500,
    synced,
  );
  let serviceAddresses = normalizeServiceAddresses(synced);
  if (serviceAddresses.length === 1) {
    serviceAddresses = serviceAddresses.map((row) => ({
      ...row,
      ac_units: String(summary.ac_units),
    }));
  }
  const timelineUnits = serviceAddresses.length > 1
    ? getTotalAddressUnits(serviceAddresses)
    : Number(summary.ac_units);
  const end_time = calculateEndTimeFromUnits(
    synced.start_time || DEFAULT_FIRST_SHIFT_START,
    timelineUnits,
  );
  const primaryAddress = serviceAddresses[0];

  return applyMailSync({
    ...synced,
    ...summary,
    needs_invoice: deriveNeedsInvoice(synced),
    customer_address: primaryAddress?.address || synced.customer_address,
    service_addresses: serviceAddresses,
    end_time,
  });
}

export function resolveMailContactFields(form) {
  const addresses = normalizeServiceAddresses(form);
  const primary = addresses[0];
  const phone = primary?.same_as_customer !== false
    ? String(form.customer_phone || '').trim()
    : String(primary?.phone || form.customer_phone || '').trim();
  const address = String(primary?.address || form.customer_address || '').trim();

  return { phone, address };
}

export function mailMatchesCustomer(form) {
  const { phone, address } = resolveMailContactFields(form);

  return form.mail_phone === phone && form.mail_address === address;
}

export function applyMailSync(form) {
  if (!form.mail_same_as_customer) {
    return form;
  }

  const { phone, address } = resolveMailContactFields(form);

  return {
    ...form,
    mail_phone: phone,
    mail_address: address,
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
  const scheduleEvents = schedules.map((schedule) => scheduleToEvent(schedule, {
    ...options,
    relatedSchedules: schedules,
  }));
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

export function isScheduleOverdueUnreported(schedule, now = new Date()) {
  if (hasScheduleReport(schedule)) {
    return false;
  }

  if (schedule?.is_overdue_unreported != null) {
    return Boolean(schedule.is_overdue_unreported);
  }

  const workDate = formatDateOnly(schedule?.work_date);

  if (!workDate) {
    return false;
  }

  const todayKey = formatDateOnly(now);

  if (workDate < todayKey) {
    return true;
  }

  if (workDate === todayKey) {
    const endTime = formatTimeValue(schedule?.end_time);
    const slotEnd = new Date(`${workDate}T${endTime}:00`);

    return now > slotEnd;
  }

  return false;
}

export function sortSchedulesWithOverduePinned(schedules, now = new Date()) {
  const overdue = [];
  const rest = [];

  (schedules || []).forEach((schedule) => {
    if (isScheduleOverdueUnreported(schedule, now)) {
      overdue.push(schedule);
    } else {
      rest.push(schedule);
    }
  });

  const compareByDateTime = (left, right) => {
    const dateCompare = formatDateOnly(left.work_date).localeCompare(formatDateOnly(right.work_date));

    if (dateCompare !== 0) {
      return dateCompare;
    }

    const startCompare = formatTimeValue(left.start_time).localeCompare(formatTimeValue(right.start_time));

    if (startCompare !== 0) {
      return startCompare;
    }

    return Number(left.id || 0) - Number(right.id || 0);
  };

  overdue.sort(compareByDateTime);
  rest.sort(compareByDateTime);

  return [...overdue, ...rest];
}

export function buildScheduleEventTitle(schedule, options = {}) {
  return buildScheduleCardLine(schedule, options);
}

export function buildScheduleCardLine(schedule, { hidePrice = false, relatedSchedules = [] } = {}) {
  const customerName = String(schedule.customer_name || '').trim() || '客';
  const address = String(schedule.customer_address || '').trim();
  const phone = String(schedule.customer_phone || '').trim().replace(/\s+/g, '');
  const unitsPrice = buildScheduleUnitsPriceTag(schedule, { hidePrice, relatedSchedules });
  const projectTag = schedule?.cleaning_project_id ? '[專]' : '';
  const parts = [`${projectTag}${customerName})${address}`];

  if (phone) {
    parts.push(phone);
  }

  if (unitsPrice) {
    parts.push(unitsPrice);
  }

  const pricingSummary = buildPricingLinesSummaryTag(schedule);
  if (pricingSummary) {
    parts.push(pricingSummary);
  }

  return parts.join(' ');
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

export function getSchedulePlannedPrice(schedule) {
  const hasPricingLines = Array.isArray(schedule?.pricing_lines) && schedule.pricing_lines.length > 0;

  if (hasPricingLines) {
    const lines = normalizePricingLines(
      schedule.pricing_lines,
      schedule?.ac_units ?? 1,
      inferUnitPrice(schedule),
      schedule,
    );
    const total = Number(summarizePricingLines(lines).cleaning_price) || 0;

    if (total > 0) {
      return total;
    }
  }

  if (schedule?.cleaning_price != null && schedule.cleaning_price !== '') {
    const stored = Number(schedule.cleaning_price);

    if (Number.isFinite(stored) && stored > 0) {
      return stored;
    }
  }

  return parseTaskDetails(schedule?.task_details).cleaning_price;
}

export function getScheduleDisplayPrice(schedule) {
  const report = getScheduleReport(schedule);

  if (report?.collected_amount != null && report.collected_amount !== '') {
    const collected = Number(report.collected_amount);
    if (Number.isFinite(collected)) {
      return collected;
    }
  }

  return getSchedulePlannedPrice(schedule);
}

export function getScheduleSegmentTotal(schedule) {
  const units = Number(getScheduleDisplayUnits(schedule)) || 0;

  if (units <= 0) {
    return 0;
  }

  const collected = Number(schedule?.cleaning_price);

  if (Number.isFinite(collected) && collected > 0) {
    return collected;
  }

  const unitPrice = Number(schedule?.unit_price);

  if (Number.isFinite(unitPrice) && unitPrice > 0) {
    return units * unitPrice;
  }

  const parsed = parseTaskDetails(schedule?.task_details);
  const parsedUnitPrice = Number(parsed.cleaning_price);

  if (Number.isFinite(parsedUnitPrice) && parsedUnitPrice > 0) {
    return units * parsedUnitPrice;
  }

  return 0;
}

export function getScheduleSegmentDisplayPrice(schedule, relatedSchedules = []) {
  const multi = parseMultiAddressNote(schedule?.notes);
  const groupTotals = resolveMultiAddressGroupTotals(schedule, relatedSchedules);
  const fromGroup = getMultiAddressSegmentDisplayPrice(schedule, groupTotals);

  if (fromGroup != null && fromGroup > 0) {
    return fromGroup;
  }

  const lines = normalizePricingLines(schedule?.pricing_lines);

  if (lines.length > 0) {
    const segmentTotal = Number(summarizePricingLines(lines).cleaning_price) || 0;

    if (segmentTotal > 0) {
      return segmentTotal;
    }
  }

  const stored = Number(schedule?.cleaning_price);

  if (Number.isFinite(stored) && stored > 0) {
    if (multi?.index === 1 && groupTotals?.groupPrice != null && stored === groupTotals.groupPrice) {
      return getMultiAddressSegmentDisplayPrice(schedule, groupTotals) || 0;
    }

    return stored;
  }

  return getScheduleSegmentTotal(schedule);
}

export function buildScheduleUnitsPriceTag(schedule, { hidePrice = false, relatedSchedules = [] } = {}) {
  const units = getScheduleDisplayUnits(schedule);
  const multi = parseMultiAddressNote(schedule?.notes);
  const groupTotals = resolveMultiAddressGroupTotals(schedule, relatedSchedules);

  if (multi) {
    if (hidePrice) {
      return units ? `[${units}台]` : '';
    }

    const segmentPrice = getScheduleSegmentDisplayPrice(schedule, relatedSchedules);
    const localTag = segmentPrice > 0
      ? `[${units || '-'}離${segmentPrice}]`
      : `[${units || '-'}離]`;

    if (groupTotals?.groupUnits && groupTotals.groupPrice != null) {
      return `${localTag}[共${groupTotals.groupUnits}離${groupTotals.groupPrice}]`;
    }

    return localTag;
  }

  if (hidePrice) {
    return units ? `[${units}台]` : '';
  }

  const total = getSchedulePlannedPrice(schedule);

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
  const total = getSchedulePlannedPrice(schedule);

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
  const total = getSchedulePlannedPrice(schedule);
  return total ? `${total} 元` : '-';
}

export function formatScheduleMailInvoiceSummary(schedule) {
  if (!schedule) {
    return '-';
  }

  const parts = [];

  if (schedule.needs_mail) {
    const mailParts = ['郵寄'];
    if (schedule.mail_recipient) {
      mailParts.push(`收件：${schedule.mail_recipient}`);
    }
    if (schedule.mail_address) {
      mailParts.push(`地址：${schedule.mail_address}`);
    }
    parts.push(mailParts.join(' · '));
  }

  if (schedule.needs_invoice) {
    const docType = resolveScheduleDocumentType(schedule);
    const invoiceParts = [`發票（${docType}）`];
    if (schedule.invoice_title) {
      invoiceParts.push(`抬頭：${schedule.invoice_title}`);
    }
    if (schedule.invoice_tax_id) {
      invoiceParts.push(`統編：${schedule.invoice_tax_id}`);
    }
    parts.push(invoiceParts.join(' · '));
  }

  if (schedule.needs_receipt) {
    parts.push('收據');
  }

  if (schedule.invoice_planned_date) {
    parts.push(`預計開票：${formatDateOnly(schedule.invoice_planned_date)}`);
  }

  return parts.length ? parts.join('；') : '無郵資／發票／收據';
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

  const source = schedule?.customer_source || 'phone';
  const sourceClass = (source === 'line' || source === 'fb' || source === 'phone')
    ? `rbc-event-source-${source}`
    : 'rbc-event-source-phone';
  const classes = [sourceClass];

  if (schedule?.cleaning_project_id) {
    classes.push('rbc-event-project');
  }

  if (hasScheduleReport(schedule)) {
    classes.push('rbc-event-reported');
  }

  return classes.join(' ');
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
  const { relatedSchedules = [], ...titleOptions } = options;

  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  }

  return {
    id: schedule.id,
    title: buildScheduleEventTitle(schedule, { ...titleOptions, relatedSchedules }),
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
  service_addresses: [createServiceAddress()],
  needs_mail: false,
  needs_receipt: false,
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
  invoice_charge_customer_tax: false,
  invoice_pre_issue: false,
  invoice_planned_date: '',
  invoice_tax_id: '',
  invoice_title: '',
  cleaning_price: '1500',
  hongyi_fee: '0',
  notes: '',
};

export function scheduleToForm(schedule) {
  const parsed = parseTaskDetails(schedule.task_details);
  const pricingLines = normalizePricingLines(
    schedule.pricing_lines,
    schedule.ac_units ?? parsed.ac_units ?? 1,
    inferUnitPrice(schedule),
    schedule,
  );

  return applyPriceCalculation({
    user_id: String(schedule.user_id),
    work_date: formatDateOnly(schedule.work_date),
    start_time: snapScheduleTime(schedule.start_time),
    end_time: snapScheduleTime(schedule.end_time, '12:00'),
    customer_name: schedule.customer_name || '',
    customer_address: schedule.customer_address ?? '',
    customer_phone: schedule.customer_phone ?? '',
    service_addresses: [createServiceAddress({
      id: 'primary',
      ac_units: String(schedule.ac_units ?? pricingLines[0]?.ac_units ?? 1),
      address: schedule.customer_address ?? '',
      phone: schedule.customer_phone ?? '',
      same_as_customer: true,
      station_note: parseStationNote(schedule.notes),
    })],
    needs_mail: Boolean(schedule.needs_mail),
    needs_receipt: Boolean(schedule.needs_receipt),
    mail_recipient: schedule.mail_recipient ?? '',
    mail_phone: schedule.mail_phone ?? '',
    mail_address: schedule.mail_address ?? '',
    mail_same_as_customer: mailMatchesCustomer({
      customer_phone: schedule.customer_phone ?? '',
      customer_address: schedule.customer_address ?? '',
      mail_phone: schedule.mail_phone ?? '',
      mail_address: schedule.mail_address ?? '',
    }),
    service_area: schedule.service_area ?? '',
    customer_source: schedule.customer_source || 'phone',
    fb_display_name: schedule.fb_display_name || '',
    line_display_name: schedule.line_display_name || '',
    pricing_lines: pricingLines,
    needs_invoice: Boolean(schedule.needs_invoice),
    invoice_charge_customer_tax: Boolean(schedule.invoice_charge_customer_tax),
    invoice_pre_issue: Boolean(schedule.invoice_planned_date),
    invoice_planned_date: formatDateOnly(schedule.invoice_planned_date) || '',
    invoice_tax_id: schedule.invoice_tax_id ?? '',
    invoice_title: schedule.invoice_title ?? '',
    hongyi_fee: String(schedule.hongyi_fee ?? 0),
    notes: stripInternalScheduleNotes(schedule.notes),
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

export function canBypassScheduleTimeRestrictions(userRole = 'admin') {
  return userRole === 'admin' || userRole === 'customer_service';
}

export function canForceMutateReportedSchedule(userRole = 'admin') {
  return canBypassScheduleTimeRestrictions(userRole);
}

export function canEditSchedule(schedule, userRole = 'admin') {
  if (!canModifyScheduleByMonth(schedule, userRole)) {
    return false;
  }

  if (hasScheduleReport(schedule) && !canForceMutateReportedSchedule(userRole)) {
    return false;
  }

  return true;
}

export function canDeleteSchedule(schedule, userRole = 'admin') {
  return canEditSchedule(schedule, userRole);
}

export function canMutateScheduleWorkDate(workDate, { userRole = 'admin', original = null } = {}) {
  if (original) {
    const originalDate = formatDateOnly(original.work_date);

    if (isWorkDateBeforeCurrentMonth(originalDate) && !canBypassScheduleTimeRestrictions(userRole)) {
      return '已跨月的班表僅管理員或客服可修改';
    }
  }

  if (isWorkDateBeforeCurrentMonth(workDate) && !canBypassScheduleTimeRestrictions(userRole)) {
    return '僅能調整當月班表，跨月後請由管理員或客服修改';
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

  if (hasScheduleReport(schedule) && !canForceMutateReportedSchedule(userRole)) {
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
  if (canBypassScheduleTimeRestrictions(userRole)) {
    return undefined;
  }

  return getCurrentMonthStartDate();
}

export function isScheduleInPast(workDate, startTime) {
  const scheduledAt = combineDateTime(workDate, startTime);
  return scheduledAt.getTime() < Date.now();
}

export function isSlotInPast(slot, { userRole = 'admin' } = {}) {
  if (canBypassScheduleTimeRestrictions(userRole)) {
    return false;
  }

  const start = slot?.start instanceof Date ? slot.start : new Date();

  if (isWorkDateInCurrentMonth(start)) {
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

  if (isScheduleInPast(form.work_date, form.start_time) && !canBypassScheduleTimeRestrictions(userRole)) {
    return '不可預約過去的日期或時間，請選擇現在之後的時段';
  }

  return null;
}

export function slotToForm(slot, { schedules = [], userId = '', userRole = 'admin' } = {}) {
  const now = new Date();
  let start = slot.start instanceof Date ? slot.start : new Date();

  if (!isWorkDateInCurrentMonth(start) && !(canBypassScheduleTimeRestrictions(userRole) && isWorkDateBeforeCurrentMonth(start))) {
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

export function appendMultiAddressNote(notes, index, total, { groupUnits = null, groupPrice = null } = {}) {
  const groupPart = groupUnits && groupPrice != null
    ? `·共${groupUnits}離${groupPrice}`
    : '';
  const marker = `[多址 ${index + 1}/${total}${groupPart}]`;
  const base = String(notes || '').trim();

  if (index === 0) {
    return base ? `${base} ${marker}` : marker;
  }

  return base || marker;
}

function isEndTimeAfterStart(startTime, endTime) {
  const start = formatTimeValue(startTime);
  const end = formatTimeValue(endTime);
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);

  return (endHour * 60 + endMinute) > (startHour * 60 + startMinute);
}

export function validateScheduleForm(form, { userRole = 'admin', original = null } = {}) {
  const messages = [];
  const hidePricing = userRole === 'customer_service';
  const canManagePricing = !hidePricing;
  const serviceAddresses = normalizeServiceAddresses(form);
  const needsInvoice = Boolean(form.needs_invoice);

  if (!form.user_id) {
    messages.push('請選擇清洗師傅');
  }

  if (!String(form.work_date || '').trim()) {
    messages.push('請選擇施工日期');
  }

  if (!String(form.customer_name || '').trim()) {
    messages.push('請填寫清洗聯絡人');
  }

  if (!String(form.customer_phone || '').trim()) {
    messages.push('請填寫清洗電話');
  }

  serviceAddresses.forEach((row, index) => {
    const label = serviceAddresses.length > 1 ? `第 ${index + 1} 站` : '清洗';

    if (!row.address) {
      messages.push(`請填寫${label}地址`);
    }

    if (!row.same_as_customer && !row.phone) {
      messages.push(`請填寫${label}聯絡電話，或勾選同總聯絡人`);
    }
  });

  if (!SCHEDULE_TIME_OPTIONS.includes(form.start_time)) {
    messages.push('請選擇有效的預約開始時間');
  }

  if (!SCHEDULE_TIME_OPTIONS.includes(form.end_time)) {
    messages.push('請選擇有效的預約結束時間');
  }

  if (
    SCHEDULE_TIME_OPTIONS.includes(form.start_time)
    && SCHEDULE_TIME_OPTIONS.includes(form.end_time)
    && !isEndTimeAfterStart(form.start_time, form.end_time)
  ) {
    messages.push('預約結束時間需晚於開始時間');
  }

  const timingError = validateScheduleTiming(form, { original, userRole });
  if (timingError) {
    messages.push(timingError);
  }

  const pricingLines = normalizePricingLines(form.pricing_lines);
  if (pricingLines.some((line) => !Number(line.ac_units) || Number(line.ac_units) < 1)) {
    messages.push('請填寫有效的冷氣台數');
  }

  if (canManagePricing && pricingLines.some((line) => !UNIT_PRICE_OPTIONS.includes(Number(line.unit_price)))) {
    messages.push('請為每個清洗品項選擇有效單價');
  }

  if (form.needs_mail) {
    if (!String(form.mail_recipient || '').trim()) {
      messages.push('請填寫寄信聯絡人');
    }
    if (!String(form.mail_phone || '').trim()) {
      messages.push('請填寫寄信電話');
    }
    if (!String(form.mail_address || '').trim()) {
      messages.push('請填寫寄信地址');
    }
  }

  if (canManagePricing) {
    pricingLines.forEach((line, index) => {
      if (line.invoice_type === INVOICE_TYPE_TRIPLICATE) {
        if (!String(line.invoice_title || '').trim()) {
          messages.push(`項目 ${index + 1}：三聯發票請填寫發票抬頭`);
        }

        const taxId = String(line.invoice_tax_id || '').trim();

        if (!taxId) {
          messages.push(`項目 ${index + 1}：三聯發票請填寫統一編號`);
        } else if (!/^\d{8}$/.test(taxId)) {
          messages.push(`項目 ${index + 1}：統一編號須為 8 碼數字`);
        }
      }
    });
  }

  if (needsInvoice && !canManagePricing) {
    const taxId = String(form.invoice_tax_id || '').trim();
    if (taxId && !/^\d{8}$/.test(taxId)) {
      messages.push('統一編號須為 8 碼數字');
    }
  }

  if (serviceAddresses.length > 1) {
    const pricingUnits = getTotalPricingUnits(form);
    const addressUnits = getTotalAddressUnits(serviceAddresses);

    if (addressUnits !== pricingUnits) {
      messages.push(`各站台數加總（${addressUnits} 台）需等於清洗台數（${pricingUnits} 台）`);
    }
  }

  return {
    ok: messages.length === 0,
    messages,
  };
}

export function formatScheduleValidationAlert(messages) {
  if (!messages.length) {
    return '';
  }

  return [
    '無法送出，請先補齊以下項目：',
    '',
    ...messages.map((message, index) => `${index + 1}. ${message}`),
  ].join('\n');
}

export function buildSchedulePayload(form, { original = null, userRole = 'admin' } = {}) {
  const timingError = validateScheduleTiming(form, { original, userRole });

  if (timingError) {
    throw new Error(timingError);
  }

  const hidePricing = userRole === 'customer_service';
  const synced = syncInvoiceTaxFlags(form);
  const summary = summarizePricingLines(
    synced.pricing_lines,
    synced.ac_units ?? 1,
    synced.unit_price ?? 1500,
    synced,
  );
  const needsInvoice = Boolean(summary.needs_invoice || synced.needs_invoice);
  const pricingLines = summary.pricing_lines.map((line) => ({
    ac_units: Number(line.ac_units),
    unit_price: Number(line.unit_price),
    is_taxable: lineHasInvoice(line) && line.charge_customer_tax !== false,
    invoice_type: line.invoice_type || INVOICE_TYPE_NONE,
    invoice_title: line.invoice_type === INVOICE_TYPE_TRIPLICATE
      ? String(line.invoice_title || '').trim() || null
      : null,
    invoice_tax_id: line.invoice_type === INVOICE_TYPE_TRIPLICATE
      ? String(line.invoice_tax_id || '').trim() || null
      : null,
    charge_customer_tax: lineHasInvoice(line) ? line.charge_customer_tax !== false : false,
  }));
  const triplicateLine = summary.pricing_lines.find((line) => line.invoice_type === INVOICE_TYPE_TRIPLICATE);
  const serviceAddresses = normalizeServiceAddresses(form);
  const primaryAddress = serviceAddresses[0];

  if (pricingLines.some((line) => !Number.isFinite(line.ac_units) || line.ac_units < 1)) {
    throw new Error('請填寫有效的冷氣台數');
  }

  if (!hidePricing && pricingLines.some((line) => !UNIT_PRICE_OPTIONS.includes(line.unit_price))) {
    throw new Error('請選擇有效的單價');
  }

  if (serviceAddresses.some((row) => !row.address)) {
    throw new Error('請填寫所有清洗地址');
  }

  if (serviceAddresses.some((row) => !row.same_as_customer && !row.phone)) {
    throw new Error('請填寫各地址聯絡電話，或勾選同總聯絡人');
  }

  if (!SCHEDULE_TIME_OPTIONS.includes(form.start_time) || !SCHEDULE_TIME_OPTIONS.includes(form.end_time)) {
    throw new Error('預約時間僅能選擇整點或 30 分');
  }

  const payload = {
    user_id: Number(form.user_id),
    work_date: form.work_date,
    start_time: form.start_time,
    end_time: form.end_time,
    customer_name: form.customer_name.trim(),
    customer_phone: form.customer_phone.trim(),
    customer_address: (primaryAddress?.address || form.customer_address).trim(),
    needs_mail: Boolean(form.needs_mail),
    mail_recipient: form.needs_mail ? form.mail_recipient?.trim() || null : null,
    mail_phone: form.needs_mail ? form.mail_phone?.trim() || null : null,
    mail_address: form.needs_mail ? form.mail_address?.trim() || null : null,
    service_area: form.service_area || null,
    customer_source: form.customer_source || 'phone',
    fb_display_name: form.fb_display_name?.trim() || null,
    line_display_name: form.line_display_name?.trim() || null,
    pricing_lines: pricingLines,
    needs_invoice: needsInvoice,
    needs_receipt: Boolean(form.needs_receipt),
    invoice_charge_customer_tax: pricingLines.some((line) => line.charge_customer_tax),
    hongyi_fee: Number(summary.hongyi_fee) || 0,
    invoice_planned_date: form.invoice_pre_issue && form.invoice_planned_date
      ? form.invoice_planned_date
      : null,
    invoice_tax_id: needsInvoice
      ? (triplicateLine?.invoice_tax_id?.trim() || form.invoice_tax_id?.trim() || null)
      : null,
    invoice_title: needsInvoice
      ? (triplicateLine?.invoice_title?.trim() || form.invoice_title?.trim() || null)
      : null,
    notes: composeScheduleNotes(form.notes, {
      stationNote: primaryAddress?.station_note,
    }),
  };

  if (form.multi_address_part) {
    payload.multi_address_part = form.multi_address_part;
  }

  return enforceMailTrackingPayload(payload, form);
}

export function buildProjectPayload(form) {
  const synced = syncInvoiceTaxFlags(form);
  const summary = summarizePricingLines(
    synced.pricing_lines,
    synced.ac_units ?? 1,
    synced.unit_price ?? 1500,
    synced,
  );
  const needsInvoice = deriveNeedsInvoice({ ...synced, pricing_lines: summary.pricing_lines });
  const pricingLines = summary.pricing_lines.map((line) => ({
    ac_units: Number(line.ac_units),
    unit_price: Number(line.unit_price),
    is_taxable: lineHasInvoice(line) && line.charge_customer_tax !== false,
    invoice_type: line.invoice_type || INVOICE_TYPE_NONE,
    invoice_title: line.invoice_type === INVOICE_TYPE_TRIPLICATE
      ? String(line.invoice_title || '').trim() || null
      : null,
    invoice_tax_id: line.invoice_type === INVOICE_TYPE_TRIPLICATE
      ? String(line.invoice_tax_id || '').trim() || null
      : null,
    charge_customer_tax: lineHasInvoice(line) ? line.charge_customer_tax !== false : false,
  }));
  const triplicateLine = summary.pricing_lines.find((line) => line.invoice_type === INVOICE_TYPE_TRIPLICATE);

  if (pricingLines.some((line) => !Number.isFinite(line.ac_units) || line.ac_units < 1)) {
    throw new Error('請填寫有效的冷氣台數');
  }

  if (pricingLines.some((line) => !UNIT_PRICE_OPTIONS.includes(line.unit_price))) {
    throw new Error('請選擇有效的單價');
  }

  return {
    title: form.title?.trim() || null,
    employee_ids: form.employee_ids.map(Number),
    planned_start_date: form.planned_start_date,
    planned_end_date: form.planned_end_date,
    start_time: form.start_time,
    end_time: form.end_time,
    customer_name: form.customer_name.trim(),
    customer_phone: form.customer_phone.trim(),
    customer_address: form.customer_address.trim(),
    service_area: form.service_area || null,
    customer_source: form.customer_source || 'phone',
    fb_display_name: form.fb_display_name?.trim() || null,
    line_display_name: form.line_display_name?.trim() || null,
    pricing_lines: pricingLines,
    needs_invoice: needsInvoice,
    needs_receipt: Boolean(form.needs_receipt),
    expects_company_remittance: Boolean(form.expects_company_remittance),
    needs_mail: Boolean(form.needs_mail),
    mail_recipient: form.needs_mail ? form.mail_recipient?.trim() || null : null,
    mail_phone: form.needs_mail ? form.mail_phone?.trim() || null : null,
    mail_address: form.needs_mail ? form.mail_address?.trim() || null : null,
    invoice_tax_id: needsInvoice
      ? (triplicateLine?.invoice_tax_id?.trim() || form.invoice_tax_id?.trim() || null)
      : null,
    invoice_title: needsInvoice
      ? (triplicateLine?.invoice_title?.trim() || form.invoice_title?.trim() || null)
      : null,
    notes: form.notes?.trim() || null,
  };
}

function enforceMailTrackingPayload(payload, form) {
  const hasMailable = Boolean(form.needs_receipt)
    || hasInvoicedPricingLine(form.pricing_lines)
    || Boolean(form.needs_invoice);

  if (!form.needs_mail || !hasMailable) {
    return {
      ...payload,
      needs_mail: false,
      mail_recipient: null,
      mail_phone: null,
      mail_address: null,
    };
  }

  return {
    ...payload,
    needs_mail: true,
    mail_recipient: payload.mail_recipient || form.mail_recipient?.trim() || payload.customer_name,
    mail_phone: payload.mail_phone || form.mail_phone?.trim() || payload.customer_phone,
    mail_address: payload.mail_address || form.mail_address?.trim() || payload.customer_address,
  };
}

export function buildSchedulePayloads(form, options = {}) {
  const addresses = normalizeServiceAddresses(form);
  const synced = syncInvoiceTaxFlags(form);
  const summary = summarizePricingLines(
    synced.pricing_lines,
    synced.ac_units ?? 1,
    synced.unit_price ?? 1500,
    synced,
  );
  const totalUnits = getTotalPricingUnits(synced);
  const groupPrice = Number(summary.cleaning_price) || 0;
  const normalizedLines = normalizePricingLines(synced.pricing_lines);
  const needsInvoice = deriveNeedsInvoice(synced);
  const triplicateLine = normalizedLines.find((line) => line.invoice_type === INVOICE_TYPE_TRIPLICATE);

  if (addresses.length <= 1) {
    const row = addresses[0];
    return [buildSchedulePayload({
      ...form,
      customer_address: row.address,
      customer_phone: row.same_as_customer ? form.customer_phone : (row.phone || form.customer_phone),
    }, options)];
  }

  const addressUnits = getTotalAddressUnits(addresses);
  if (addressUnits !== totalUnits) {
    throw new Error(`各站台數加總（${addressUnits} 台）需等於清洗台數（${totalUnits} 台）`);
  }

  let currentStart = form.start_time;
  const payloads = [];

  addresses.forEach((row, index) => {
    const units = Math.max(1, Number(row.ac_units) || 1);
    const endTime = calculateEndTimeFromUnits(currentStart, units);
    const isFirst = index === 0;
    const segmentLine = resolveSegmentPricingLine(normalizedLines, index);
    const primaryInvoiceSettings = clonePricingLineInvoiceSettings(normalizedLines[0]);

    payloads.push(buildSchedulePayload({
      ...form,
      start_time: currentStart,
      end_time: endTime,
      customer_address: row.address,
      customer_phone: row.same_as_customer ? form.customer_phone : (row.phone || form.customer_phone),
      pricing_lines: [{
        ...segmentLine,
        ...primaryInvoiceSettings,
        ac_units: String(units),
      }],
      needs_mail: isFirst ? form.needs_mail : false,
      needs_invoice: isFirst ? needsInvoice : false,
      needs_receipt: isFirst ? form.needs_receipt : false,
      invoice_pre_issue: isFirst ? form.invoice_pre_issue : false,
      invoice_planned_date: isFirst ? form.invoice_planned_date : '',
      invoice_charge_customer_tax: isFirst ? form.invoice_charge_customer_tax : false,
      invoice_tax_id: isFirst && needsInvoice
        ? (triplicateLine?.invoice_tax_id?.trim() || form.invoice_tax_id?.trim() || '')
        : '',
      invoice_title: isFirst && needsInvoice
        ? (triplicateLine?.invoice_title?.trim() || form.invoice_title?.trim() || '')
        : '',
      multi_address_part: {
        index: index + 1,
        total: addresses.length,
        segment_units: units,
        group_units: totalUnits,
        group_price: groupPrice,
      },
      notes: composeScheduleNotes(
        appendMultiAddressNote(form.notes, index, addresses.length, {
          groupUnits: totalUnits,
          groupPrice: groupPrice,
        }),
        { stationNote: row.station_note },
      ),
    }, options));

    currentStart = endTime;
  });

  return payloads;
}
