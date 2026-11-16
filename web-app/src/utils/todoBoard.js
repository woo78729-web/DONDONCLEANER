const STORAGE_KEY = 'todoBoardLastSeenFingerprint';

export function getTodoBoardLastSeenFingerprint() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function getTodoBoardFingerprint(data) {
  const todoCount = data?.todos?.total_count || 0;
  const latest = latestTodoBoardActivityAt(data);
  return `${todoCount}|${latest}`;
}

export function latestTodoBoardActivityAt(data) {
  const stamps = [
    ...(data?.activity || []),
    ...(data?.monthly?.activity || []),
  ]
    .map((item) => item?.at)
    .filter(Boolean)
    .sort();

  return stamps.length ? stamps[stamps.length - 1] : '';
}

export function hasTodoBoardAlert(data, lastSeenFingerprint = getTodoBoardLastSeenFingerprint()) {
  if (!data) {
    return false;
  }

  const fingerprint = getTodoBoardFingerprint(data);
  if (fingerprint === '0|') {
    return false;
  }

  return fingerprint !== lastSeenFingerprint;
}

export function markTodoBoardSeen(data) {
  const fingerprint = getTodoBoardFingerprint(data);

  try {
    window.localStorage.setItem(STORAGE_KEY, fingerprint);
  } catch {
    // ignore storage failures
  }

  return fingerprint;
}
