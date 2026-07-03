import { EMPLOYEE_POSTAGE_AMOUNT } from './scheduleCalendar';
export const EMPLOYEE_INVOICE_TAX_RATE = 0.08;

export function calculateEmployeeReportDraft(schedule, draft) {
  const plannedUnits = Number(schedule?.ac_units || 0);
  const completedUnits = Math.max(0, Number(draft.completed_units || 0));
  const skippedUnits = Math.max(0, plannedUnits - completedUnits);
  const hasTax = Boolean(draft.has_tax);
  const needsInvoiceAndMail = Boolean(draft.needs_invoice_and_mail);
  const needsReceiptAndMail = Boolean(draft.needs_receipt_and_mail);
  const needsInvoice = hasTax || needsInvoiceAndMail || Boolean(schedule?.needs_invoice);
  const needsMail = needsInvoiceAndMail || needsReceiptAndMail || Boolean(schedule?.needs_mail);

  const scaledLines = scalePricingLinesForCompleted(schedule?.pricing_lines, completedUnits, plannedUnits);
  const baseAmount = scaledLines.reduce(
    (total, line) => total + Number(line.ac_units) * Number(line.unit_price),
    0,
  );
  const collectedAmount = needsInvoice ? Math.round(baseAmount * 1.05) : baseAmount;
  const temporaryPostage = needsMail ? EMPLOYEE_POSTAGE_AMOUNT : 0;
  const reportInvoiceTaxCost = (hasTax || needsInvoiceAndMail)
    ? Math.round(baseAmount * EMPLOYEE_INVOICE_TAX_RATE)
    : 0;

  return {
    plannedUnits,
    completedUnits,
    skippedUnits,
    unitMismatch: skippedUnits > 0,
    needsInvoice,
    needsMail,
    collectedAmount,
    temporaryPostage,
    reportInvoiceTaxCost,
  };
}

function scalePricingLinesForCompleted(lines, completedUnits, plannedUnits) {
  const normalized = Array.isArray(lines) && lines.length > 0
    ? lines.map((line, index) => ({
      id: `line-${index}`,
      ac_units: String(line.ac_units ?? 1),
      unit_price: String(line.unit_price ?? 1500),
    }))
    : [{ id: 'line-0', ac_units: String(completedUnits || 1), unit_price: '1500' }];

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
      ac_units: String(units),
    };
  }).filter((line) => Number(line.ac_units) > 0);
}

export function buildReportPayload(schedule, draft) {
  const calculated = calculateEmployeeReportDraft(schedule, draft);

  return {
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
}

export function buildDefaultReportDraft(schedule) {
  const calculated = calculateEmployeeReportDraft(schedule, {
    completed_units: schedule?.ac_units ?? 1,
    has_tax: Boolean(schedule?.needs_invoice),
    needs_invoice_and_mail: false,
    needs_receipt_and_mail: Boolean(schedule?.needs_mail),
    paid_to_company: false,
  });

  return {
    completed_units: String(schedule?.ac_units ?? 1),
    skip_reason: '',
    has_tax: Boolean(schedule?.needs_invoice),
    needs_invoice_and_mail: false,
    needs_receipt_and_mail: Boolean(schedule?.needs_mail),
    temporary_request: '',
    collected_amount: String(calculated.collectedAmount),
    paid_to_company: false,
  };
}
