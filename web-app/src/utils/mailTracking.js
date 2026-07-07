import {
  formatDateOnly,
  getCustomerSourceOption,
  getScheduleContactId,
  parseMultiAddressNote,
  resolveScheduleDocumentType,
} from './scheduleCalendar';

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

export function mailOrderGroupKeyFromSchedule(schedule) {
  if (!schedule) {
    return '';
  }

  if (schedule.cleaning_project_id) {
    return `project-${schedule.cleaning_project_id}-${formatDateOnly(schedule.work_date) || ''}`;
  }

  const multi = parseMultiAddressNote(schedule.notes);

  if (multi) {
    const phone = normalizePhone(schedule.customer_phone);
    const name = normalizeText(schedule.customer_name);

    return `multi-${formatDateOnly(schedule.work_date) || ''}-${phone}-${name}-${multi.total}`;
  }

  return `schedule-${schedule.id}`;
}

export function mailRecipientKeyFromSchedule(schedule) {
  if (!schedule) {
    return '';
  }

  return mailOrderGroupKeyFromSchedule(schedule);
}

export function mailRecipientKeyFromRow(row) {
  const projectId = cleaningProjectIdFromRow(row);

  if (projectId) {
    return `project-${projectId}`;
  }

  if (row.mailMergeGroupId || mailMergeGroupIdFromRow(row)) {
    return `mail-merge-${row.mailMergeGroupId || mailMergeGroupIdFromRow(row)}`;
  }

  if (row.kind === 'schedule') {
    return mailOrderGroupKeyFromSchedule(row.source);
  }

  const schedule = row.source?.daily_schedule;

  if (schedule) {
    return `report-${mailOrderGroupKeyFromSchedule(schedule)}`;
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

function resolveMailBilling(schedule, report = null) {
  if (!schedule && !report) {
    return { units: 0, amount: 0 };
  }

  const project = schedule?.cleaning_project ?? schedule?.cleaningProject ?? null;

  if (project) {
    return {
      units: Number(project.billing_units ?? project.completed_units ?? project.total_ac_units ?? 0),
      amount: Number(project.billing_amount ?? project.cleaning_price ?? 0),
    };
  }

  const units = Number(
    report?.completed_units
    ?? schedule?.ac_units
    ?? 0,
  );

  let amount = 0;

  if (report?.paid_to_company) {
    amount = Number(report.billing_amount ?? schedule?.cleaning_price ?? 0);
  } else if (report?.collected_amount != null && report.collected_amount !== '') {
    amount = Number(report.collected_amount);
  } else if (schedule?.cleaning_price != null && schedule.cleaning_price !== '') {
    amount = Number(schedule.cleaning_price);
  } else if (report?.billing_amount != null && report.billing_amount !== '') {
    amount = Number(report.billing_amount);
  } else if (schedule?.billing_amount != null && schedule.billing_amount !== '') {
    amount = Number(schedule.billing_amount);
  }

  return {
    units: Number.isFinite(units) ? units : 0,
    amount: Number.isFinite(amount) ? amount : 0,
  };
}

function billingFromRow(row) {
  if (row.kind === 'schedule') {
    const report = row.source?.daily_report ?? row.source?.dailyReport;

    return resolveMailBilling(row.source, report);
  }

  return resolveMailBilling(row.source?.daily_schedule, row.source);
}

function sumBillingFromRows(rows) {
  return rows.reduce((total, row) => {
    const billing = billingFromRow(row);

    return {
      units: total.units + billing.units,
      amount: total.amount + billing.amount,
    };
  }, { units: 0, amount: 0 });
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

function extractCleaningProject(row) {
  if (row.kind === 'schedule') {
    return row.source?.cleaning_project ?? row.source?.cleaningProject ?? null;
  }

  return row.source?.daily_schedule?.cleaning_project
    ?? row.source?.daily_schedule?.cleaningProject
    ?? null;
}

function projectBillingFromRows(rows) {
  for (const row of rows) {
    const project = extractCleaningProject(row);

    if (project) {
      return {
        units: Number(project.billing_units ?? project.completed_units ?? project.total_ac_units ?? 0),
        amount: Number(project.billing_amount ?? project.cleaning_price ?? 0),
      };
    }
  }

  return sumBillingFromRows(rows);
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

  const billing = projectBillingFromRows(sortedRows);

  return {
    ...primary,
    key: `project-${projectId}`,
    cleaningProjectId: projectId,
    members: sortedRows.map(memberFromRow),
    billingUnits: billing.units,
    billingAmount: billing.amount,
    date: earliestDate,
    dateEnd: earliestDate !== latestDate ? latestDate : null,
    employee: [...new Set(sortedRows.map((row) => row.employee).filter((name) => name && name !== '-'))].join('、') || primary.employee,
    type: primary.type,
    status: sortedRows.every((row) => row.status === '已寄件完成') ? '已寄件完成' : '待處理',
  };
}

function mailMergeGroupIdFromRow(row) {
  if (row.cleaningProjectId) {
    return null;
  }

  if (row.kind === 'schedule') {
    return row.source?.mail_merge_group_id || null;
  }

  return row.source?.daily_schedule?.mail_merge_group_id || null;
}

function mergeMailGroupRows(groupId, rows) {
  const sortedRows = [...rows].sort(compareMailRows);
  const primary = sortedRows[0];
  const dates = sortedRows
    .map((row) => formatDateOnly(row.date))
    .filter(Boolean)
    .sort();
  const earliestDate = dates[0] || primary.date;
  const latestDate = dates[dates.length - 1] || primary.date;

  const billing = sumBillingFromRows(sortedRows);

  return {
    ...primary,
    key: `mail-merge-${groupId}`,
    mailMergeGroupId: groupId,
    members: sortedRows.map(memberFromRow),
    billingUnits: billing.units,
    billingAmount: billing.amount,
    date: earliestDate,
    dateEnd: earliestDate !== latestDate ? latestDate : null,
    employee: [...new Set(sortedRows.map((row) => row.employee).filter((name) => name && name !== '-'))].join('、') || primary.employee,
    type: sortedRows.map((row) => row.type).filter(Boolean).join('、') || primary.type,
    status: sortedRows.every((row) => row.status === '已寄件完成') ? '已寄件完成' : '待處理',
  };
}

function groupRowsByMailMergeGroup(rows) {
  const standalone = [];
  const mergeGroups = new Map();

  for (const row of rows) {
    const groupId = row.mailMergeGroupId || mailMergeGroupIdFromRow(row);

    if (!groupId) {
      standalone.push(row.members ? row : { ...row, members: [memberFromRow(row)] });
      continue;
    }

    if (!mergeGroups.has(groupId)) {
      mergeGroups.set(groupId, []);
    }

    mergeGroups.get(groupId).push(row);
  }

  const merged = [...standalone];

  for (const [groupId, groupRows] of mergeGroups) {
    const expandedRows = groupRows.flatMap((row) => (
      row.members?.length
        ? row.members.map((member) => mapMemberToDisplayRow(row, member))
        : [row]
    ));

    merged.push(
      expandedRows.length === 1
        ? { ...expandedRows[0], members: [memberFromRow(expandedRows[0])] }
        : mergeMailGroupRows(groupId, expandedRows),
    );
  }

  return merged.sort(compareMailRows);
}

function mapMemberToDisplayRow(parentRow, member) {
  if (member.kind === 'schedule') {
    return mapScheduleRow(member.source);
  }

  return mapReportRow(member.source);
}

function groupAllMailRows(rows) {
  return groupRowsByMailMergeGroup(groupRowsByCleaningProject(rows));
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

function resolveMailRecipient(schedule) {
  return String(schedule?.mail_recipient || schedule?.customer_name || '').trim() || null;
}

function mapScheduleRow(schedule) {
  const sourceOption = getCustomerSourceOption(schedule.customer_source);
  const billing = billingFromRow({ kind: 'schedule', source: schedule });

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
    billingUnits: billing.units,
    billingAmount: billing.amount,
    recipient: resolveMailRecipient(schedule),
    invoiceTitle: schedule.invoice_title,
    taxId: schedule.invoice_tax_id,
    phone: schedule.mail_phone || schedule.customer_phone,
    address: schedule.mail_address || schedule.customer_address,
    trackingNumber: schedule.mail_tracking_number,
    sentAt: schedule.mailed_at || schedule.invoice_sent_at,
    status: schedule.invoice_sent ? '已寄件完成' : '待處理',
  };
}

function mapReportRow(report) {
  const schedule = report?.daily_schedule;
  const sourceOption = getCustomerSourceOption(schedule?.customer_source);
  const billing = billingFromRow({ kind: 'report', source: report });

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
    billingUnits: billing.units,
    billingAmount: billing.amount,
    recipient: resolveMailRecipient(schedule),
    invoiceTitle: schedule?.invoice_title,
    taxId: schedule?.invoice_tax_id,
    phone: schedule?.mail_phone || schedule?.customer_phone,
    address: schedule?.mail_address || schedule?.customer_address,
    trackingNumber: schedule?.mail_tracking_number,
    sentAt: report.mailed_at || report.invoice_sent_at,
    status: report.invoice_sent ? '已寄件完成' : '待處理',
  };
}

export function mergePendingMailRows(schedules, reports) {
  const filteredSchedules = (schedules || []).filter((schedule) => !scheduleHasPendingReportMail(schedule));
  const rows = [
    ...(filteredSchedules || []).map((schedule) => mapScheduleRow(schedule)),
    ...(reports || []).map((report) => mapReportRow(report)),
  ];

  return dedupeMailRowsByOrder(groupAllMailRows(rows));
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
  const schedule = report?.daily_schedule;

  if (report?.needs_invoice_and_mail || schedule?.needs_invoice) {
    return '發票寄信';
  }

  if (report?.needs_receipt_and_mail || schedule?.needs_receipt || schedule?.needs_mail) {
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

  return dedupeMailRowsByOrder(groupAllMailRows([
    ...filteredSchedules,
    ...reportRows,
  ])).sort((left, right) => String(right.sentAt || '').localeCompare(String(left.sentAt || '')));
}

function dedupeMailRowsByOrder(rows) {
  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    const key = mailRecipientKeyFromRow(row);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

export function mailRowIsMerged(row) {
  return Boolean(row.cleaningProjectId || row.mailMergeGroupId || (row.members?.length || 0) > 1);
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
