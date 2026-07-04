export const ROLE_LABELS = {
  admin: '管理員',
  employee: '員工',
  finance: '財務人員',
  customer_service: '客服',
};

export const PERMISSIONS = {
  'staff.manage': ['admin'],
  'schedules.manage': ['admin', 'customer_service'],
  'phone.lookup': ['admin', 'customer_service'],
  'maintenance.manage': ['admin', 'customer_service'],
  'mail.tracking': ['admin', 'customer_service'],
  'remittance.track': ['admin', 'customer_service', 'finance'],
  'accounting.manage': ['admin'],
  'reports.view': ['admin', 'finance', 'customer_service'],
  'reports.export': ['admin', 'finance'],
  'employee.schedules': ['employee'],
  'employee.reports': ['employee'],
  'employee.maintenance': ['employee'],
};

export const PERMISSION_LABELS = {
  'staff.manage': '人員建檔',
  'schedules.manage': '派班管理',
  'phone.lookup': '電話查詢',
  'maintenance.manage': '維修紀錄',
  'mail.tracking': '寄件追蹤',
  'remittance.track': '匯款追查',
  'accounting.manage': '記帳表單',
  'reports.view': '回報查詢',
  'reports.export': '回報匯出',
  'employee.schedules': '當日案件',
  'employee.reports': '施工回報',
  'employee.maintenance': '維修回報',
};

export const ROLE_OPTIONS = [
  { value: 'admin', label: ROLE_LABELS.admin },
  { value: 'employee', label: ROLE_LABELS.employee },
  { value: 'finance', label: ROLE_LABELS.finance },
  { value: 'customer_service', label: ROLE_LABELS.customer_service },
];

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export function getHomePath(role) {
  if (role === 'employee') {
    return '/employee';
  }

  if (role === 'finance') {
    return '/finance';
  }

  if (role === 'admin' || role === 'customer_service') {
    return '/admin/schedules';
  }

  return '/admin';
}

export function canAccess(user, permission) {
  if (!user?.role) {
    return false;
  }

  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions.includes(permission);
  }

  return (PERMISSIONS[permission] || []).includes(user.role);
}

export function getPermissionsForRole(role) {
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([permission]) => permission);
}

export function formatPermissionList(role) {
  return getPermissionsForRole(role)
    .map((permission) => PERMISSION_LABELS[permission] || permission)
    .join('、');
}

export function canViewMaintenanceCompensation(user) {
  return ['admin', 'customer_service', 'finance'].includes(user?.role);
}

export function canEditMaintenanceCompensation(user) {
  return ['admin', 'customer_service'].includes(user?.role);
}

export function canManageSchedulePricing(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return role === 'admin';
}
