import { buildTelHref, hasDialablePhone, normalizePhoneDisplay } from '../utils/phoneLink';

export function PhoneLink({
  phone,
  className = 'phone-link',
  label,
  fallback = '-',
  onClick,
}) {
  const display = label ?? normalizePhoneDisplay(phone);

  if (!display) {
    return fallback;
  }

  const href = buildTelHref(phone);

  if (!href || !hasDialablePhone(phone)) {
    return <span className="phone-link__text">{display}</span>;
  }

  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      aria-label={`撥打 ${display}`}
    >
      {display}
    </a>
  );
}
