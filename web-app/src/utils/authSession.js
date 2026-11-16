const ROLE_KEY = 'ac_last_role';
const USER_CACHE_KEY = 'ac_user_cache';

export function readStoredToken() {
  try {
    return localStorage.getItem('ac_token_persist')
      || sessionStorage.getItem('ac_token')
      || localStorage.getItem('ac_token')
      || '';
  } catch {
    return '';
  }
}

export function readLastRole() {
  try {
    return localStorage.getItem(ROLE_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberLastRole(role) {
  if (!role) {
    return;
  }

  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // The next open still works; it just waits for /api/me again.
  }
}

export function rememberCachedUser(user) {
  if (!user?.id || !user?.role) {
    return;
  }

  rememberLastRole(user.role);

  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // A missing cache only means the next open waits for /api/me.
  }
}

export function readCachedUser() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.id && user?.role) {
        return user;
      }
    }
  } catch {
    // Fall through to the role-only shortcut.
  }

  const role = readLastRole();
  return role ? { role, name: '' } : null;
}

export function forgetCachedUser() {
  try {
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // Signing out still clears the in-memory session.
  }
}
