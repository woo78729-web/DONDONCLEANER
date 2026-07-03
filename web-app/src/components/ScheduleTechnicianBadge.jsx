import { EmployeeAvatar } from './EmployeeAvatar';

export function ScheduleTechnicianBadge({
  user,
  size = 'sm',
  className = '',
  centered = false,
  showName = true,
}) {
  const name = user?.name || user?.account || '未指定師傅';

  return (
    <span className={`schedule-technician-badge${centered ? ' schedule-technician-badge--centered' : ''} ${className}`.trim()}>
      <EmployeeAvatar user={user} size={size} />
      {showName && <span className="schedule-technician-badge__name">{name}</span>}
    </span>
  );
}
