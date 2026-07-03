import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refreshUser = useCallback(async () => {
    const result = await api.me();
    setUser(result.data);
    return result.data;
  }, []);

  useEffect(() => {
    api.syncTokenFromStorage();

    function handleUnauthorized() {
      if (userRef.current) {
        setError('登入已過期，請重新登入');
      }

      setUser(null);
    }

    window.addEventListener('ac:unauthorized', handleUnauthorized);

    if (!api.getToken()) {
      setLoading(false);
      return () => window.removeEventListener('ac:unauthorized', handleUnauthorized);
    }

    api.me()
      .then((result) => setUser(result.data))
      .catch(() => {
        api.setToken('');
        setUser(null);
        setError('');
      })
      .finally(() => setLoading(false));

    return () => window.removeEventListener('ac:unauthorized', handleUnauthorized);
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
      setUser(result.data.user);
      return result;
    },
    async loginWithToken(token, remember = false) {
      setError('');
      api.setToken(token, { remember });
      const result = await api.me();
      setUser(result.data);
      return result.data;
    },
    async logout() {
      try {
        await api.logout();
      } finally {
        setUser(null);
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
