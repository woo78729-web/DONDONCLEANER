import {
  formatDateOnly,
  getCustomerSourceOption,
  getScheduleContactId,
  resolveScheduleDocumentType,
} from './scheduleCalendar';

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

export function mailRecipientKeyFromSchedule(schedule) {
  if (!schedule) {
    return '';
  }

  const date = formatDateOnly(schedule.work_date) || '';
  const phone = normalizePhone(schedule.mail_phone || schedule.customer_phone);
  const address = normalizeText(schedule.mail_address || schedule.customer_address);

  return [date, phone, address].join('|');
}

export function mailRecipientKeyFromRow(row) {
  const projectId = cleaningProjectIdFromRow(row);

  if (projectId) {
    return `project-${projectId}`;
  }

  if (row.kind === 'schedule') {
    return `schedule-${row.source.id}`;
  }

  return `report-${row.source.id}`;
}

function cleaningProjectIdFromRow(row) {
  if (row.kind === 'schedule') {
    return row.source?.cleaning_project_id || null;
  }

  return row.source?.daily_schedule?.cleaning_project_id || null;
}

function memberFromRow(row) {
  return { kind: row.kind, source: row.source };
}

function compareMailRows(left, right) {
  const leftPlanned = formatDateOnly(left.plannedDate);
  const rightPlanned = formatDateOnly(right.plannedDate);

  if (leftPlanned && !rightPlanned) {
    return -1;
  }

  if (!leftPlanned && rightPlanned) {
    return 1;
  }

  if (leftPlanned && rightPlanned && leftPlanned !== rightPlanned) {
    return leftPlanned.localeCompare(rightPlanned);
  }

  return String(right.date || '').localeCompare(String(left.date || ''));
}

function mergeProjectMailRows(projectId, rows) {
  const sortedRows = [...rows].sort(compareMailRows);
  const primary = sortedRows[0];
  const dates = sortedRows
    .map((row) => formatDateOnly(row.date))
    .filter(Boolean)
    .sort();
  const earliestDate = dates[0] || primary.date;
  const latestDate = dates[dates.length - 1] || primary.date;

  return {
    ...primary,
    key: `project-${projectId}`,
    cleaningProjectId: projectId,
    members: sortedRows.map(memberFromRow),
    date: earliestDate,
    dateEnd: earliestDate !== latestDate ? latestDate : null,
    employee: [...new Set(sortedRows.map((row) => row.employee).filter((name) => name && name !== '-'))].join('、') || primary.employee,
    type: primary.type,
    status: sortedRows.every((row) => row.status === '已寄件完成') ? '已寄件完成' : '待處理',
  };
}

function groupRowsByCleaningProject(rows) {
  const standalone = [];
  const projectGroups = new Map();

  for (const row of rows) {
    const projectId = cleaningProjectIdFromRow(row);

    if (!projectId) {
      standalone.push(row);
      continue;
    }

    if (!projectGroups.has(projectId)) {
      projectGroups.set(projectId, []);
    }

    projectGroups.get(projectId).push(row);
  }

  const merged = [...standalone];

  for (const [projectId, groupRows] of projectGroups) {
    merged.push(
      groupRows.length === 1
        ? { ...groupRows[0], members: [memberFromRow(groupRows[0])] }
        : mergeProjectMailRows(projectId, groupRows),
    );
  }

  return merged.sort(compareMailRows);
}

function scheduleHasPendingReportMail(schedule) {
  const report = schedule?.daily_report ?? schedule?.dailyReport;

  if (!report || report.invoice_sent) {
    return false;
  }

  return Boolean(report.needs_invoice_and_mail || report.needs_receipt_and_mail);
}

function mapScheduleRow(schedule) {
  const sourceOption = getCustomerSourceOption(schedule.customer_source);

  return {
    key: `schedule-${schedule.id}`,
    kind: 'schedule',
    source: schedule,
    date: schedule.work_date,
    plannedDate: schedule.invoice_planned_date,
    sourceColor: sourceOption.color,
    sourceLabel: sourceOption.label,
    contactId: getScheduleContactId(schedule),
    employee: schedule.user?.name || '-',
    customer: schedule.customer_name,
    type: resolveScheduleDocumentType(schedule) || scheduleTypeLabel(schedule),
    recipient: schedule.mail_recipient,
    invoiceTitle: schedule.invoice_title,
    taxId: schedule.invoice_tax_id,
    phone: schedule.mail_phone || schedule.customer_phone,
    address: schedule.mail_address || schedule.customer_address,
    trackingNumber: schedule.mail_tracking_number,
    sentAt: schedule.invoice_sent_at,
    status: schedule.invoice_sent ? '已寄件完成' : '待處理',
  };
}

function mapReportRow(report) {
  const schedule = report?.daily_schedule;
  const sourceOption = getCustomerSourceOption(schedule?.customer_source);

  return {
    key: `report-${report.id}`,
    kind: 'report',
    source: report,
    date: schedule?.work_date,
    plannedDate: schedule?.invoice_planned_date,
    sourceColor: sourceOption.color,
    sourceLabel: sourceOption.label,
    contactId: getScheduleContactId(schedule),
    employee: schedule?.user?.name || '-',
    customer: schedule?.customer_name || '-',
    type: reportTypeLabel(report),
    recipient: schedule?.mail_recipient,
    invoiceTitle: schedule?.invoice_title,
    taxId: schedule?.invoice_tax_id,
    phone: schedule?.mail_phone || schedule?.customer_phone,
    address: schedule?.mail_address || schedule?.customer_address,
    trackingNumber: schedule?.mail_tracking_number,
    sentAt: report.invoice_sent_at,
    status: report.invoice_sent ? '已寄件完成' : '待處理',
  };
}

export function mergePendingMailRows(schedules, reports) {
  const filteredSchedules = (schedules || []).filter((schedule) => !scheduleHasPendingReportMail(schedule));
  const rows = [
    ...(filteredSchedules || []).map((schedule) => mapScheduleRow(schedule)),
    ...(reports || []).map((report) => mapReportRow(report)),
  ];

  return groupRowsByCleaningProject(rows);
}

function scheduleTypeLabel(schedule) {
  if (schedule?.needs_receipt) {
    return '收據';
  }

  if (schedule?.needs_invoice) {
    return resolveScheduleDocumentType(schedule);
  }

  if (schedule?.needs_mail) {
    return '郵寄';
  }

  return '寄件';
}

function reportTypeLabel(report) {
  if (report?.needs_invoice_and_mail) {
    return '發票寄信';
  }

  if (report?.needs_receipt_and_mail) {
    return '收據寄信';
  }

  return '寄件';
}

export function mapScheduleRows(schedules) {
  return (schedules || []).map(mapScheduleRow);
}

export function mapReportRows(reports) {
  return (reports || []).map(mapReportRow);
}

export function mergeHistoryRows(schedules, reports) {
  const scheduleRows = mapScheduleRows(schedules);
  const reportRows = mapReportRows(reports);
  const reportScheduleIds = new Set(
    reportRows
      .map((row) => row.source?.daily_schedule?.id)
      .filter(Boolean),
  );

  const filteredSchedules = scheduleRows.filter((row) => {
    if (row.kind !== 'schedule') {
      return true;
    }

    const report = row.source?.daily_report ?? row.source?.dailyReport;

    if (report && (report.needs_invoice_and_mail || report.needs_receipt_and_mail)) {
      return false;
    }

    if (reportScheduleIds.has(row.source.id)) {
      return false;
    }

    return true;
  });

  return groupRowsByCleaningProject([
    ...filteredSchedules,
    ...reportRows,
  ]).sort((left, right) => String(right.sentAt || '').localeCompare(String(left.sentAt || '')));
}

export function collectScheduleIdsFromMailRow(row) {
  if (row.members?.length) {
    const scheduleIds = new Set();

    for (const member of row.members) {
      if (member.kind === 'schedule') {
        scheduleIds.add(member.source.id);
        continue;
      }

      const scheduleId = member.source?.daily_schedule?.id;

      if (scheduleId) {
        scheduleIds.add(scheduleId);
      }
    }

    return [...scheduleIds];
  }

  if (row.kind === 'schedule') {
    return [row.source.id];
  }

  const scheduleId = row.source?.daily_schedule?.id;

  return scheduleId ? [scheduleId] : [];
}
