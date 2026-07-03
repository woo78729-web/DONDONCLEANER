export function getEmployeeAvatarUrl(user) {
  if (user && typeof user === 'object') {
    return user.avatar_url || null;
  }

  return null;
}

export function getEmployeeInitials(user) {
  const name = String(user?.name || user?.account || '?').trim();

  if (!name) {
    return '?';
  }

  const employeeMatch = name.match(/^員工(.+)$/);

  if (employeeMatch) {
    return employeeMatch[1].slice(0, 1) || '員';
  }

  return [...name][0] ?? '?';
}
