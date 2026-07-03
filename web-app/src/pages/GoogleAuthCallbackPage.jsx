import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, useAuth } from '../context/AuthContext';
import { getPostLoginPath } from '../utils/onboarding';
import './LoginPage.css';

export default function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithToken, setError } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const remember = searchParams.get('remember') === '1';

    if (!token) {
      setError('Google 登入失敗');
      navigate('/login', { replace: true });
      return;
    }

    loginWithToken(token, remember)
      .then((user) => {
        navigate(getPostLoginPath(user), { replace: true });
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Google 登入失敗');
        navigate('/login', { replace: true });
      });
  }, [loginWithToken, navigate, searchParams, setError]);

  return (
    <div className="login-screen">
      <div className="login-screen__backdrop" aria-hidden="true">
        <div className="login-screen__overlay" />
      </div>
      <div className="login-card">
        <div className="login-card__body">
          <p className="login-google-callback">Google 登入中，請稍候…</p>
        </div>
      </div>
    </div>
  );
}
