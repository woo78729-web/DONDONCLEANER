import {
  calculatePricingLineTotals,
  createPricingLine,
  EMPLOYEE_POSTAGE_AMOUNT,
  migratePricingLineFields,
} from './scheduleCalendar';

export const EMPLOYEE_INVOICE_TAX_RATE = 0.08;

function enrichLineForReportPricing(line, needsInvoice) {
  if (line.invoice_type && line.invoice_type !== 'none') {
    return line;
  }

  if (!needsInvoice) {
    return {
      ...line,
      invoice_type: 'none',
      charge_customer_tax: false,
    };
  }

  return {
    ...line,
    invoice_type: 'duplicate',
    charge_customer_tax: line.charge_customer_tax !== false,
  };
}

export function cloneSchedulePricingLines(schedule) {
  const lines = schedule?.pricing_lines;

  if (Array.isArray(lines) && lines.length > 0) {
    return lines.map((line, index) => migratePricingLineFields({
      id: `line-${index}`,
      ac_units: String(line.ac_units ?? 1),
      unit_price: String(line.unit_price ?? 1500),
      is_taxable: Boolean(line.is_taxable),
      invoice_type: line.invoice_type,
      charge_customer_tax: line.charge_customer_tax,
      invoice_title: line.invoice_title ?? '',
      invoice_tax_id: line.invoice_tax_id ?? '',
    }, schedule));
  }

  return [migratePricingLineFields(createPricingLine({
    ac_units: String(schedule?.ac_units ?? 1),
    unit_price: String(schedule?.unit_price ?? 1500),
    is_taxable: Boolean(schedule?.needs_invoice),
  }), schedule)];
}

export function scalePricingLinesForCompleted(lines, completedUnits, plannedUnits) {
  const normalized = Array.isArray(lines) && lines.length > 0
    ? lines.map((line, index) => ({
      ...line,
      id: line.id || `line-${index}`,
      ac_units: String(line.ac_units ?? 1),
      unit_price: String(line.unit_price ?? 1500),
    }))
    : [{ id: 'line-0', ac_units: String(completedUnits || 1), unit_price: '1500', invoice_type: 'none', charge_customer_tax: false }];

  if (plannedUnits < 1 || completedUnits === plannedUnits) {
    return normalized;
  }

  const ratio = completedUnits / plannedUnits;
  let assigned = 0;

  return normalized.map((line, index) => {
    const units = index === normalized.length - 1
      ? Math.max(0, completedUnits - assigned)
      : Math.max(0, Math.round(Number(line.ac_units) * ratio));

    if (index !== normalized.length - 1) {
      assigned += units;
    }

    return {
      ...line,
      ac_units: String(Math.max(0, units)),
    };
  }).filter((line) => Number(line.ac_units) > 0);
}

function summarizePricingLineTotals(lines, needsInvoice, schedule = null) {
  let untaxedBase = 0;
  let collectedAmount = 0;

  for (const rawLine of lines) {
    const migrated = migratePricingLineFields(rawLine, schedule);
    const pricingLine = enrichLineForReportPricing(migrated, needsInvoice);
    const totals = calculatePricingLineTotals(pricingLine);

    untaxedBase += totals.subtotal;
    collectedAmount += totals.customerAmount;
  }

  return { untaxedBase, collectedAmount };
}

function getEffectivePricingLines(schedule, draft, completedUnits, plannedUnits) {
  if (Array.isArray(draft.pricing_lines) && draft.pricing_lines.length > 0) {
    return draft.pricing_lines.map((line, index) => migratePricingLineFields({
      ...line,
      id: line.id || `line-${index}`,
    }, schedule));
  }

  return scalePricingLinesForCompleted(
    cloneSchedulePricingLines(schedule),
    completedUnits,
    plannedUnits,
  );
}

export function calculateEmployeeReportDraft(schedule, draft) {
  const plannedUnits = Number(schedule?.ac_units || 0);
  const completedUnits = Math.max(0, Number(draft.completed_units || 0));
  const skippedUnits = Math.max(0, plannedUnits - completedUnits);
  const unitMismatch = completedUnits !== plannedUnits;
  const hasTax = Boolean(draft.has_tax);
  const needsInvoiceAndMail = Boolean(draft.needs_invoice_and_mail);
  const needsReceiptAndMail = Boolean(draft.needs_receipt_and_mail);
  const needsInvoice = hasTax || needsInvoiceAndMail || Boolean(schedule?.needs_invoice);
  const needsMail = needsInvoiceAndMail || needsReceiptAndMail || Boolean(schedule?.needs_mail);

  const pricingLines = getEffectivePricingLines(schedule, draft, completedUnits, plannedUnits);
  const { untaxedBase, collectedAmount } = summarizePricingLineTotals(pricingLines, needsInvoice, schedule);
  const temporaryPostage = needsMail ? EMPLOYEE_POSTAGE_AMOUNT : 0;
  const reportInvoiceTaxCost = (hasTax || needsInvoiceAndMail)
    ? Math.round(untaxedBase * EMPLOYEE_INVOICE_TAX_RATE)
    : 0;

  return {
    plannedUnits,
    completedUnits,
    skippedUnits,
    unitMismatch,
    pricingLines,
    needsInvoice,
    needsMail,
    collectedAmount,
    temporaryPostage,
    reportInvoiceTaxCost,
  };
}

export function buildReportPayload(schedule, draft) {
  const calculated = calculateEmployeeReportDraft(schedule, draft);

  const payload = {
    schedule_id: schedule.id,
    completed_units: calculated.completedUnits,
    skip_reason: calculated.unitMismatch ? draft.skip_reason?.trim() || null : null,
    has_tax: Boolean(draft.has_tax),
    needs_invoice_and_mail: Boolean(draft.needs_invoice_and_mail),
    needs_receipt_and_mail: Boolean(draft.needs_receipt_and_mail),
    temporary_request: draft.temporary_request?.trim() || null,
    collected_amount: Number(draft.collected_amount ?? calculated.collectedAmount),
    paid_to_company: Boolean(draft.paid_to_company),
    travel_allowance: Number(draft.travel_allowance ?? 0),
  };

  if (calculated.unitMismatch && Array.isArray(draft.pricing_lines) && draft.pricing_lines.length > 0) {
    payload.pricing_lines = draft.pricing_lines.map((line) => ({
      ac_units: Number(line.ac_units || 0),
      unit_price: Number(line.unit_price || 0),
      is_taxable: Boolean(line.is_taxable),
      invoice_type: line.invoice_type,
      charge_customer_tax: line.charge_customer_tax !== false,
    }));
  }

  return payload;
}

export function defaultMailFlagsFromSchedule(schedule) {
  const needsInvoice = Boolean(schedule?.needs_invoice);
  const needsReceipt = Boolean(schedule?.needs_receipt);
  const needsMail = Boolean(schedule?.needs_mail);

  return {
    needs_invoice_and_mail: needsInvoice,
    needs_receipt_and_mail: needsReceipt || (needsMail && !needsInvoice),
  };
}

export function buildDefaultReportDraft(schedule) {
  const mailFlags = defaultMailFlagsFromSchedule(schedule);
  const calculated = calculateEmployeeReportDraft(schedule, {
    completed_units: schedule?.ac_units ?? 1,
    has_tax: Boolean(schedule?.needs_invoice),
    ...mailFlags,
    paid_to_company: false,
  });

  return {
    completed_units: String(schedule?.ac_units ?? 1),
    skip_reason: '',
    has_tax: Boolean(schedule?.needs_invoice),
    ...mailFlags,
    temporary_request: '',
    collected_amount: String(calculated.collectedAmount),
    paid_to_company: false,
  };
}

export function ensureMismatchPricingLines(schedule, draft) {
  const plannedUnits = Number(schedule?.ac_units || 0);
  const completedUnits = Math.max(0, Number(draft.completed_units || 0));

  if (completedUnits === plannedUnits) {
    const next = { ...draft };
    delete next.pricing_lines;
    return next;
  }

  return {
    ...draft,
    pricing_lines: scalePricingLinesForCompleted(
      draft.pricing_lines?.length ? draft.pricing_lines : cloneSchedulePricingLines(schedule),
      completedUnits,
      plannedUnits,
    ),
  };
}

export function syncDraftFromPricingLines(schedule, draft, pricingLines) {
  const completedUnits = pricingLines.reduce(
    (total, line) => total + Number(line.ac_units || 0),
    0,
  );

  return ensureMismatchPricingLines(schedule, {
    ...draft,
    pricing_lines: pricingLines,
    completed_units: String(completedUnits),
  });
}
