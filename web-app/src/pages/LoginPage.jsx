import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, useAuth } from '../context/AuthContext';
import { assetUrl } from '../utils/assetUrl';
import { getPostLoginPath } from '../utils/onboarding';
import './LoginPage.css';

function UserIcon() {
  return (
    <svg className="login-field__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="login-field__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 10h-1V7a4 4 0 0 0-8 0v3H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-3 0h-4V7a2 2 0 1 1 4 0Z" fill="currentColor" />
    </svg>
  );
}

function EyeIcon({ hidden }) {
  if (hidden) {
    return (
      <svg className="login-field__toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 7a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5Zm0 8a3 3 0 1 1 3-3 3 3 0 0 1-3 3Zm8.94-1.17a1 1 0 0 0 0-.66C19.06 9.64 15.94 5 12 5S4.94 9.64 3.06 13.17a1 1 0 0 0 0 .66C4.94 18.36 8.06 23 12 23s7.06-4.64 8.94-9.17Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg className="login-field__toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5C7.06 5 3.06 9.64 1.06 13.17a1 1 0 0 0 0 .66C3.06 18.36 7.06 23 12 23s8.94-4.64 10.94-9.17a1 1 0 0 0 0-.66C20.94 9.64 16.94 5 12 5Zm0 14a5 5 0 1 1 5-5 5 5 0 0 1-5 5Z" fill="currentColor" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="login-google__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading, login, error, setError } = useAuth();
  const [account, setAccount] = useState(() => localStorage.getItem('ac_remember_account') || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem('ac_remember_account')));
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const urlError = searchParams.get('error');

    if (urlError) {
      setError(urlError);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setError, setSearchParams]);

  if (loading) {
    return (
      <div className="login-screen">
        <div className="login-screen__backdrop" aria-hidden="true">
          <div className="login-screen__photo login-screen__photo--left" />
          <div className="login-screen__photo login-screen__photo--right" />
          <div className="login-screen__overlay" />
        </div>
        <div className="login-card auth-loading-card">
          <p className="hint">正在連線...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to={getPostLoginPath(user)} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (rememberMe) {
        localStorage.setItem('ac_remember_account', account.trim());
      } else {
        localStorage.removeItem('ac_remember_account');
      }

      const result = await login(account.trim(), password.trim(), rememberMe);
      navigate(getPostLoginPath(result.data.user), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登入失敗');
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoogleLogin() {
    setError('');
    const remember = rememberMe ? '1' : '0';
    window.location.href = `/auth/google/redirect?remember=${remember}`;
  }

  return (
    <div className="login-screen">
      <div className="login-screen__backdrop" aria-hidden="true">
        <div className="login-screen__photo login-screen__photo--left" />
        <div className="login-screen__photo login-screen__photo--right" />
        <div className="login-screen__overlay" />
        <div className="login-screen__accent" />
      </div>

      <div className="login-card">
        <header className="login-card__header">
          <img
            className="login-card__logo"
            src={assetUrl('/images/logo.png')}
            alt="DONN DONN 東東冷氣專業清洗"
          />
          <p className="login-card__brand-cn">東東冷氣專業清洗</p>
          <h1 className="login-card__title">內部員工系統</h1>
        </header>

        <div className="login-card__divider" aria-hidden="true" />

        <div className="login-card__body">
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <UserIcon />
              <input
                className="login-field__control"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="員編 / 帳號"
                autoComplete="username"
                required
              />
            </label>

            <label className="login-field">
              <LockIcon />
              <input
                className="login-field__control"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密碼"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-field__toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
              >
                <EyeIcon hidden={!showPassword} />
              </button>
            </label>

            <label className="login-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>記住我</span>
            </label>

            {error && <div className="login-alert">{error}</div>}

            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting ? '登入中...' : '登入'}
            </button>
          </form>

          <div className="login-or" aria-hidden="true">
            <span>或</span>
          </div>

          <button
            type="button"
            className="login-google"
            onClick={handleGoogleLogin}
          >
            <GoogleIcon />
            <span>使用 Google 帳號登入</span>
          </button>
        </div>
      </div>
    </div>
  );
}
