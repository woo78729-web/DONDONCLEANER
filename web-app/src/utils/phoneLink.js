export function normalizePhoneDisplay(value) {
  return String(value || '').trim();
}

export function buildTelHref(phone) {
  const cleaned = String(phone || '').replace(/[\s\-()]/g, '');

  if (!cleaned) {
    return null;
  }

  const digits = cleaned.replace(/[^\d+]/g, '');

  if (digits.replace(/\D/g, '').length < 6) {
    return null;
  }

  return `tel:${digits}`;
}

export function hasDialablePhone(phone) {
  return Boolean(buildTelHref(phone));
}
