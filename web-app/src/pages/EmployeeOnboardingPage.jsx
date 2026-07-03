import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { EmployeeRulesContent } from '../components/EmployeeRulesContent';
import { PageAlert } from '../components/PageAlert';
import { getOnboardingStep } from '../utils/onboarding';
import './employee-onboarding.css';

export default function EmployeeOnboardingPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState(() => getOnboardingStep(user));
  const [rulesRead, setRulesRead] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    password: '',
    password_confirmation: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const stepLabel = useMemo(() => {
    if (step === 'rules') {
      return '步驟 1 / 2：閱讀員工守則';
    }

    return '步驟 2 / 2：設定登入密碼';
  }, [step]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (getOnboardingStep(user) === 'done') {
    return <Navigate to="/employee" replace />;
  }

  async function handleAcceptRules() {
    if (!rulesRead) {
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await api.acceptEmployeeRules();
      const nextUser = await refreshUser();
      setStep(getOnboardingStep(nextUser));
    } catch (err) {
      setError(err.message || '確認員工守則失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await api.updatePassword(
        passwordForm.current_password,
        passwordForm.password,
        passwordForm.password_confirmation,
      );
      await refreshUser();
      navigate('/employee', { replace: true });
    } catch (err) {
      setError(err.message || '密碼設定失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="employee-onboarding-screen">
      <div className="employee-onboarding-screen__backdrop" aria-hidden="true" />

      <div className="employee-onboarding-panel glass-panel">
        <header className="employee-onboarding-panel__header">
          <p className="employee-onboarding-panel__eyebrow">首次登入設定</p>
          <h1 className="employee-onboarding-panel__title">{stepLabel}</h1>
          <p className="hint employee-onboarding-panel__intro">
            {step === 'rules'
              ? '請完整閱讀以下守則，確認後再進行密碼設定。'
              : '請設定您的個人登入密碼，完成後即可進入當日案件。'}
          </p>
        </header>

        <PageAlert type="error" message={error} />

        {step === 'rules' ? (
          <>
            <div className="employee-onboarding-panel__rules card">
              <EmployeeRulesContent />
            </div>

            <label className="employee-onboarding-check field-checkbox">
              <input
                type="checkbox"
                checked={rulesRead}
                onChange={(event) => setRulesRead(event.target.checked)}
              />
              <span>我已閱讀完畢</span>
            </label>

            <button
              type="button"
              className="btn btn-primary btn-pill employee-onboarding-panel__action"
              disabled={!rulesRead || submitting}
              onClick={handleAcceptRules}
            >
              {submitting ? '處理中...' : '下一步'}
            </button>
          </>
        ) : (
          <form className="form-grid employee-onboarding-password-form" onSubmit={handlePasswordSubmit}>
            <label className="field">
              <span className="field-label">目前密碼</span>
              <input
                className="field-control"
                type="password"
                value={passwordForm.current_password}
                onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })}
                autoComplete="current-password"
                required
              />
              <span className="hint">請輸入管理員提供的初始密碼</span>
            </label>

            <label className="field">
              <span className="field-label">新密碼</span>
              <input
                className="field-control"
                type="password"
                value={passwordForm.password}
                onChange={(event) => setPasswordForm({ ...passwordForm, password: event.target.value })}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>

            <label className="field">
              <span className="field-label">確認新密碼</span>
              <input
                className="field-control"
                type="password"
                value={passwordForm.password_confirmation}
                onChange={(event) => setPasswordForm({ ...passwordForm, password_confirmation: event.target.value })}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>

            <button
              type="submit"
              className="btn btn-primary btn-pill employee-onboarding-panel__action"
              disabled={submitting}
            >
              {submitting ? '設定中...' : '完成設定，進入當日案件'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
