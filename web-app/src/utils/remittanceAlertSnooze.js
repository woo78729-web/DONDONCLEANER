const STORAGE_KEY = 'remittance-alert-snooze-until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function readSnoozeMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSnoozeMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage failures.
  }
}

export function snoozeRemittanceAlertsLocally(remittanceIds = []) {
  if (!remittanceIds.length) {
    return;
  }

  const map = readSnoozeMap();
  const until = Date.now() + SNOOZE_MS;

  remittanceIds.forEach((id) => {
    map[String(id)] = until;
  });

  writeSnoozeMap(map);
}

export function filterActiveRemittanceAlerts(items = []) {
  const map = readSnoozeMap();
  const now = Date.now();
  const nextMap = { ...map };

  const active = items.filter((item) => {
    const key = String(item.id);
    const until = Number(nextMap[key] || 0);

    if (!until) {
      return true;
    }

    if (until > now) {
      return false;
    }

    delete nextMap[key];
    return true;
  });

  writeSnoozeMap(nextMap);

  return active;
}
