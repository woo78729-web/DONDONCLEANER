import { useState } from 'react';
import { getEmployeeAvatarUrl, getEmployeeInitials } from '../utils/employeeAvatar';

export function EmployeeAvatar({
  user,
  size = 'md',
  className = '',
}) {
  const avatarUrl = getEmployeeAvatarUrl(user);
  const initials = getEmployeeInitials(user);
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = size === 'xs'
    ? 'employee-avatar--xs'
    : size === 'sm'
      ? 'employee-avatar--sm'
      : size === 'lg'
        ? 'employee-avatar--lg'
        : '';

  return (
    <span className={`employee-avatar ${sizeClass} ${className}`.trim()} aria-hidden="true">
      {avatarUrl && !imageFailed ? (
        <img
          src={avatarUrl}
          alt=""
          className="employee-avatar__image"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="employee-avatar__initials">{initials}</span>
      )}
    </span>
  );
}
