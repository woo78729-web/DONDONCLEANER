import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api.token) {
      setLoading(false);
      return;
    }

    api.me()
      .then((result) => setUser(result.data))
      .catch(() => {
        api.setToken('');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    setError,
    async login(account, password) {
      setError('');
      const result = await api.login(account, password);
      setUser(result.data.user);
      return result;
    },
    async logout() {
      try {
        await api.logout();
      } finally {
        setUser(null);
      }
    },
  }), [user, loading, error]);

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
