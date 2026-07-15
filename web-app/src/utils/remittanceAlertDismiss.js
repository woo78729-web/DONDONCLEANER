const STORAGE_KEY = 'remittance-alert-suppressed';

export function buildRemittanceAlertFingerprint(items = []) {
  return items
    .map((item) => `${item.id}:${item.status}:${item.reminded_at || ''}`)
    .sort()
    .join('|');
}

export function getSuppressedRemittanceAlertFingerprint() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function suppressRemittanceAlerts(items = []) {
  try {
    if (!items.length) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    sessionStorage.setItem(STORAGE_KEY, buildRemittanceAlertFingerprint(items));
  } catch {
    // Ignore storage failures; alerts may re-open on navigation.
  }
}

export function clearSuppressedRemittanceAlerts() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function shouldAutoOpenRemittanceAlerts(items = []) {
  if (!items.length) {
    clearSuppressedRemittanceAlerts();
    return false;
  }

  return buildRemittanceAlertFingerprint(items) !== getSuppressedRemittanceAlertFingerprint();
}
