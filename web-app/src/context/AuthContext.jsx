import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { forgetCachedUser, readCachedUser, readStoredToken, rememberCachedUser } from '../utils/authSession';

const AuthContext = createContext(null);
const AUTH_BOOT_TIMEOUT_MS = 15000;

const cachedUser = readStoredToken() ? readCachedUser() : null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(cachedUser);
  const [loading, setLoading] = useState(() => Boolean(readStoredToken()) && !cachedUser);
  const [error, setError] = useState('');
  const userRef = useRef(cachedUser);
  const trustedCacheRef = useRef(Boolean(cachedUser));

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refreshUser = useCallback(async () => {
    const result = await api.me();
    rememberCachedUser(result.data);
    setUser(result.data);
    return result.data;
  }, []);

  useEffect(() => {
    let cancelled = false;

    api.syncTokenFromStorage();

    function handleUnauthorized() {
      if (userRef.current) {
        setError('登入已過期，請重新登入');
      }

      forgetCachedUser();
      setUser(null);
      window.dispatchEvent(new CustomEvent('ac:logout'));
    }

    window.addEventListener('ac:unauthorized', handleUnauthorized);

    function finishBoot() {
      if (!cancelled) {
        setLoading(false);
      }
    }

    if (!api.getToken()) {
      finishBoot();
      return () => {
        cancelled = true;
        window.removeEventListener('ac:unauthorized', handleUnauthorized);
      };
    }

    const timeoutId = window.setTimeout(() => {
      if (!trustedCacheRef.current) {
        api.setToken('');
        forgetCachedUser();
        setUser(null);
        setError('連線逾時，請重新登入');
        window.dispatchEvent(new CustomEvent('ac:logout'));
      }

      finishBoot();
    }, AUTH_BOOT_TIMEOUT_MS);

    api.me()
      .then((result) => {
        if (!cancelled) {
          rememberCachedUser(result.data);
          trustedCacheRef.current = true;
          setUser(result.data);
          setError('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          api.setToken('');
          forgetCachedUser();
          setUser(null);
          setError('');
          window.dispatchEvent(new CustomEvent('ac:logout'));
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        finishBoot();
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener('ac:unauthorized', handleUnauthorized);
    };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    setError,
    refreshUser,
    async login(account, password, remember = false) {
      setError('');
      const result = await api.login(account, password, remember);
      rememberCachedUser(result.data.user);
      trustedCacheRef.current = true;
      setUser(result.data.user);
      window.dispatchEvent(new CustomEvent('ac:login'));
      return result;
    },
    async loginWithToken(token, remember = false) {
      setError('');
      api.setToken(token, { remember });
      const result = await api.me();
      rememberCachedUser(result.data);
      trustedCacheRef.current = true;
      setUser(result.data);
      window.dispatchEvent(new CustomEvent('ac:login'));
      return result.data;
    },
    async logout() {
      try {
        await api.logout();
      } finally {
        forgetCachedUser();
        setUser(null);
        window.dispatchEvent(new CustomEvent('ac:logout'));
      }
    },
  }), [user, loading, error, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}

export { ApiError };
