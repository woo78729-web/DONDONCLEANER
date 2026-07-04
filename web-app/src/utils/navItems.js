import { canAccess } from './permissions';

const NAV_GROUP_META = {
  finance: { label: '帳務追蹤', shortLabel: '帳務', tabOrder: 5 },
  maintenance: { label: '維修', shortLabel: '維修', tabOrder: 8 },
  employee_work: { label: '班表', shortLabel: '班表', tabOrder: 2 },
  employee_report: { label: '回報', shortLabel: '回報', tabOrder: 3 },
  employee_personal: { label: '個人', shortLabel: '個人', tabOrder: 4 },
};

function pushItem(items, user, { permission, to, end, label, shortLabel, tabOrder, group }) {
  if (!canAccess(user, permission)) {
    return;
  }

  items.push({
    to,
    end: Boolean(end),
    label,
    shortLabel: shortLabel || label,
    tabOrder: tabOrder ?? 99,
    group: group || null,
  });
}

export function getNavItems(user) {
  if (!user) {
    return [];
  }

  const items = [];
  const prefersSchedulesHome = ['admin', 'customer_service'].includes(user.role);

  pushItem(items, user, {
    permission: 'schedules.manage',
    to: '/admin/schedules',
    end: false,
    label: '派班行事曆',
    shortLabel: '派班',
    tabOrder: prefersSchedulesHome ? 1 : 2,
  });

  pushItem(items, user, {
    permission: 'schedules.manage',
    to: '/admin/regional-scheduling',
    label: '區域排班',
    shortLabel: '區域',
    tabOrder: prefersSchedulesHome ? 1.25 : 2.25,
  });

  pushItem(items, user, {
    permission: 'schedules.manage',
    to: '/admin/leaves',
    end: true,
    label: '排假行事曆',
    shortLabel: '排假',
    tabOrder: prefersSchedulesHome ? 1.5 : 2.5,
  });

  pushItem(items, user, {
    permission: 'reports.view',
    to: user.role === 'finance' ? '/finance' : '/admin',
    end: true,
    label: '回報總覽',
    shortLabel: '總覽',
    tabOrder: prefersSchedulesHome ? 2 : 1,
  });

  pushItem(items, user, {
    permission: 'accounting.manage',
    to: '/admin/accounting',
    label: '記帳表單',
    shortLabel: '記帳',
    tabOrder: 5,
    group: 'finance',
  });

  pushItem(items, user, {
    permission: 'accounting.manage',
    to: '/admin/performance',
    label: '歷年績效',
    shortLabel: '績效',
    tabOrder: 5.1,
    group: 'finance',
  });

  pushItem(items, user, {
    permission: 'mail.tracking',
    to: '/admin/mail-tracking',
    label: '寄件追蹤',
    shortLabel: '寄件',
    tabOrder: 5.2,
    group: 'finance',
  });

  pushItem(items, user, {
    permission: 'remittance.track',
    to: '/admin/remittance-tracking',
    label: '匯款追查',
    shortLabel: '匯款',
    tabOrder: 5.3,
    group: 'finance',
  });

  pushItem(items, user, {
    permission: 'maintenance.manage',
    to: '/admin/emergency-maintenance',
    label: '緊急維修',
    shortLabel: '緊急',
    tabOrder: 8,
    group: 'maintenance',
  });

  pushItem(items, user, {
    permission: 'maintenance.manage',
    to: '/admin/maintenance',
    label: '維修紀錄',
    shortLabel: '紀錄',
    tabOrder: 8.1,
    group: 'maintenance',
  });

  pushItem(items, user, {
    permission: 'staff.manage',
    to: '/admin/staff',
    label: '系統人員',
    shortLabel: '人員',
    tabOrder: 9,
  });

  pushItem(items, user, {
    permission: 'employee.schedules',
    to: '/employee',
    end: true,
    label: '當日案件',
    shortLabel: '當日',
    tabOrder: user.role === 'employee' ? 1 : 11,
  });

  pushItem(items, user, {
    permission: 'employee.schedules',
    to: '/employee/calendar',
    label: '班表月曆',
    shortLabel: '月曆',
    tabOrder: user.role === 'employee' ? 2 : 12,
    group: 'employee_work',
  });

  pushItem(items, user, {
    permission: 'employee.schedules',
    to: '/employee/leaves',
    label: '排假登記',
    shortLabel: '排假',
    tabOrder: 2.1,
    group: 'employee_work',
  });

  pushItem(items, user, {
    permission: 'employee.reports',
    to: '/employee/reports',
    label: '每日回報',
    shortLabel: '回報',
    tabOrder: user.role === 'employee' ? 3 : 14,
    group: 'employee_report',
  });

  pushItem(items, user, {
    permission: 'employee.maintenance',
    to: '/employee/maintenance',
    label: '維修回報',
    shortLabel: '維修',
    tabOrder: 3.1,
    group: 'employee_report',
  });

  pushItem(items, user, {
    permission: 'employee.schedules',
    to: '/employee/reports/history',
    label: '回報紀錄',
    shortLabel: '紀錄',
    tabOrder: 3.2,
    group: 'employee_report',
  });

  pushItem(items, user, {
    permission: 'employee.schedules',
    to: '/employee/summary',
    label: '本月帳務',
    shortLabel: '帳務',
    tabOrder: 3.3,
    group: 'employee_report',
  });

  pushItem(items, user, {
    permission: 'employee.schedules',
    to: '/employee/rules',
    label: '員工守則',
    shortLabel: '守則',
    tabOrder: user.role === 'employee' ? 4 : 19,
    group: 'employee_personal',
  });

  pushItem(items, user, {
    permission: 'employee.schedules',
    to: '/employee/settings',
    label: '帳戶設定',
    shortLabel: '設定',
    tabOrder: 4.1,
    group: 'employee_personal',
  });

  return items;
}

export function getNavStructure(user) {
  const items = getNavItems(user);
  const groupMap = new Map();
  const structure = [];

  items.forEach((item) => {
    if (!item.group) {
      structure.push({
        type: 'link',
        sortOrder: item.tabOrder,
        item,
      });
      return;
    }

    if (!groupMap.has(item.group)) {
      const meta = NAV_GROUP_META[item.group];
      const groupEntry = {
        type: 'group',
        key: item.group,
        label: meta.label,
        shortLabel: meta.shortLabel,
        sortOrder: meta.tabOrder,
        items: [],
      };

      groupMap.set(item.group, groupEntry);
      structure.push(groupEntry);
    }

    groupMap.get(item.group).items.push(item);
  });

  return structure.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getMobileTabItems(user, limit = 4) {
  return getNavItems(user)
    .slice()
    .sort((a, b) => a.tabOrder - b.tabOrder)
    .slice(0, limit);
}
