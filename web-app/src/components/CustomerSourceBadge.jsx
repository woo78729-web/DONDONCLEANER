import { getCustomerSourceOption } from '../utils/scheduleCalendar';

export function CustomerSourceBadge({ source, className = '' }) {
  const option = getCustomerSourceOption(source);

  return (
    <span className={`source-badge${className ? ` ${className}` : ''}`}>
      <span className="source-badge__dot" style={{ backgroundColor: option.color }} />
      {option.label}
    </span>
  );
}
