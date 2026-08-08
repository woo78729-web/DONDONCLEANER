import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { StatusBadge } from '../components/StatusBadge';
import { StaffAvatarUpload } from '../components/StaffAvatarUpload';
import { api } from '../api/client';
import {
  ROLE_OPTIONS,
  formatPermissionList,
} from '../utils/permissions';
import { CLOTHING_SIZE_OPTIONS } from '../utils/staffProfile';

const defaultForm = {
  account: '',
  password: '',
  name: '',
  role: 'employee',
  phone: '',
  bank_account: '',
  clothing_size: '',
  google_email: '',
};

function LineBindStatus({ bound, lineUserId }) {
  const title = bound
    ? `LINE 已綁定成功${lineUserId ? `：${lineUserId}` : ''}`
    : '尚未綁定 LINE';

  return (
    <span
      className={`staff-line-bind${bound ? ' is-bound' : ''}`}
      title={title}
      aria-label={title}
    >
      <svg className="staff-line-bind__icon" viewBox="0 0 36 36" aria-hidden="true">
        <rect width="36" height="36" rx="10" />
        <path
          fill="currentColor"
          d="M18 8.2c-5.4 0-9.8 3.5-9.8 7.8 0 3.5 2.9 6.5 7 7.5.3.1.6.3.7.6l.4 1.5c.1.3.4.4.7.3l1.8-.9c.2-.1.4-.1.6 0 2.1.5 4.3.2 6.1-.9 3.3-2 5.3-5.1 5.3-8.1 0-4.3-4.4-7.8-9.8-7.8Zm-4.2 6.4c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-2.2c0-.5.4-.9.9-.9s.9.4.9.9v2.2Zm2.9 0c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-2.2c0-.5.4-.9.9-.9s.9.4.9.9v2.2Zm5.1.9h-2.1c-.5 0-.9-.4-.9-.9v-2.2c0-.5.4-.9.9-.9h2.1c.5 0 .9.4.9.9s-.4.9-.9.9h-1.2v1.3c0 .5-.4.9-.9.9Zm3.4 0c-.5 0-.9-.4-.9-.9v-2.2c0-.5.4-.9.9-.9s.9.4.9.9v2.2c0 .5-.4.9-.9.9Z"
        />
      </svg>
      <span className="staff-line-bind__text">{bound ? '已綁定' : '未綁定'}</span>
    </span>
  );
}

function PasswordField({
  value,
  onChange,
  placeholder = '至少 6 碼',
  autoComplete = 'new-password',
  className = 'field-control',
  inputClassName = '',
  required = false,
  'aria-label': ariaLabel,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`password-field-inline${inputClassName ? ` ${inputClassName}` : ''}`}>
      <input
        className={`${className} password-field-inline__input`}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm password-field-inline__toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? '隱藏密碼' : '顯示密碼'}
      >
        {visible ? '隱藏' : '顯示'}
      </button>
    </div>
  );
}

function buildDraft(staff) {
  return {
    account: staff.account ?? '',
    name: staff.name ?? '',
    phone: staff.phone ?? '',
    bank_account: staff.bank_account ?? '',
    clothing_size: staff.clothing_size ?? '',
    google_email: staff.google_email ?? '',
    role: staff.role,
    password: '',
  };
}

function isDraftDirty(staff, draft) {
  if (!draft) {
    return false;
  }

  return draft.account !== (staff.account ?? '')
    || draft.name !== (staff.name ?? '')
    || draft.phone !== (staff.phone ?? '')
    || draft.bank_account !== (staff.bank_account ?? '')
    || (draft.clothing_size || null) !== (staff.clothing_size || null)
    || draft.google_email !== (staff.google_email ?? '')
    || draft.role !== staff.role;
}

export default function AdminStaffPage() {
  const [staffList, setStaffList] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [resettingPasswordId, setResettingPasswordId] = useState(null);
  const [settingPasswordId, setSettingPasswordId] = useState(null);

  async function loadStaff() {
    const result = await api.getStaff();
    setStaffList(result.data);
    setDrafts(Object.fromEntries(result.data.map((staff) => [staff.id, buildDraft(staff)])));
  }

  useEffect(() => {
    loadStaff().catch((err) => setError(err.message));
  }, []);

  function updateDraft(staffId, field, value) {
    setDrafts((current) => ({
      ...current,
      [staffId]: {
        ...current[staffId],
        [field]: value,
      },
    }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      await api.createStaff({
        ...form,
        account: form.account.trim(),
        phone: form.phone.trim() || null,
        bank_account: form.bank_account.trim() || null,
        clothing_size: form.clothing_size || null,
        google_email: form.google_email.trim() || null,
      });
      setForm(defaultForm);
      setMessage('人員建立成功');
      await loadStaff();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveStaffDetails(staff) {
    const draft = drafts[staff.id];

    if (!draft || !isDraftDirty(staff, draft)) {
      return;
    }

    setError('');
    setMessage('');
    setSavingId(staff.id);

    try {
      await api.updateStaff(staff.id, {
        account: draft.account.trim(),
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        bank_account: draft.bank_account.trim() || null,
        clothing_size: draft.clothing_size || null,
        google_email: draft.google_email.trim() || null,
        role: draft.role,
      });
      setMessage(`${draft.name.trim() || staff.name} 的資料已更新`);
      await loadStaff();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(staff) {
    setError('');
    setMessage('');

    try {
      await api.updateStaff(staff.id, { is_active: !staff.is_active });
      setMessage(staff.is_active ? '人員已停用' : '人員已啟用');
      await loadStaff();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteStaff(staff) {
    if (!window.confirm(`確定刪除「${staff.name}（${staff.account}）」？\n刪除後無法登入，但歷史班表仍保留供查詢。`)) {
      return;
    }

    setError('');
    setMessage('');
    setDeletingId(staff.id);

    try {
      await api.deleteStaff(staff.id);
      setMessage(`${staff.name} 的帳號已刪除`);
      await loadStaff();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function setStaffPassword(staff) {
    const draft = drafts[staff.id] ?? buildDraft(staff);
    const password = String(draft.password || '').trim();

    if (password.length < 6) {
      setError('密碼至少 6 碼');
      return;
    }

    if (!window.confirm(`確定將「${draft.name || staff.name}」的密碼改為您輸入的新密碼？`)) {
      return;
    }

    setError('');
    setMessage('');
    setSettingPasswordId(staff.id);

    try {
      await api.updateStaff(staff.id, { password });
      setDrafts((current) => ({
        ...current,
        [staff.id]: {
          ...(current[staff.id] ?? buildDraft(staff)),
          password: '',
        },
      }));
      setMessage(`${draft.name || staff.name} 的密碼已更新`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSettingPasswordId(null);
    }
  }

  async function resetPasswordToPhone(staff) {
    const draft = drafts[staff.id] ?? buildDraft(staff);
    const phone = String(draft.phone || '').trim().replace(/\s+/g, '');

    if (!phone) {
      setError('請先填寫電話');
      return;
    }

    if (phone.length < 6) {
      setError('電話至少 6 碼才能設為密碼');
      return;
    }

    if (!window.confirm(`確定將「${draft.name || staff.name}」的密碼重設為電話 ${phone}？`)) {
      return;
    }

    setError('');
    setMessage('');
    setResettingPasswordId(staff.id);

    try {
      await api.updateStaff(staff.id, { password: phone });
      setMessage(`${draft.name || staff.name} 的密碼已重設為電話號碼`);
    } catch (err) {
      setError(err.message);
    } finally {
      setResettingPasswordId(null);
    }
  }

  async function uploadStaffAvatar(staff, file) {
    setError('');
    setMessage('');

    try {
      await api.uploadStaffAvatar(staff.id, file);
      setMessage(`${staff.name} 的頭像已更新`);
      await loadStaff();
    } catch (err) {
      setError(err.message);
    }
  }

  function renderStaffItem(staff) {
    const draft = drafts[staff.id] ?? buildDraft(staff);
    const dirty = isDraftDirty(staff, draft);
    const passwordDraft = String(draft.password || '').trim();
    const canSetPassword = passwordDraft.length >= 6;

    return (
      <article key={staff.id} className="staff-card">
        <div className="staff-card__row staff-card__row--main">
          <div className="staff-field staff-field--avatar">
            <span className="staff-field__label">頭像</span>
            <StaffAvatarUpload
              staff={staff}
              onUpload={uploadStaffAvatar}
            />
          </div>

          <label className="staff-field">
            <span className="staff-field__label">姓名</span>
            <input
              className="field-control"
              value={draft.name}
              onChange={(e) => updateDraft(staff.id, 'name', e.target.value)}
              aria-label={`${staff.account} 姓名`}
            />
          </label>

          <label className="staff-field">
            <span className="staff-field__label">帳號</span>
            <input
              className="field-control"
              value={draft.account}
              onChange={(e) => updateDraft(staff.id, 'account', e.target.value)}
              autoComplete="off"
              aria-label={`${staff.name} 帳號`}
            />
          </label>

          <label className="staff-field">
            <span className="staff-field__label">角色</span>
            <select
              className="field-control"
              value={draft.role}
              onChange={(e) => updateDraft(staff.id, 'role', e.target.value)}
              aria-label={`${staff.account} 角色`}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="staff-field staff-field--status">
            <span className="staff-field__label">狀態</span>
            <StatusBadge status={staff.is_active ? 'active' : 'inactive'} />
          </div>

          <label className="staff-field staff-field--password">
            <span className="staff-field__label">新密碼</span>
            <PasswordField
              value={draft.password}
              onChange={(e) => updateDraft(staff.id, 'password', e.target.value)}
              placeholder="至少6碼"
              aria-label={`${staff.account} 新密碼`}
            />
          </label>

          <label className="staff-field">
            <span className="staff-field__label">電話</span>
            <input
              className="field-control"
              value={draft.phone}
              onChange={(e) => updateDraft(staff.id, 'phone', e.target.value)}
              placeholder="0912345678"
              aria-label={`${staff.account} 電話`}
            />
          </label>

          <div className="staff-field staff-field--line">
            <span className="staff-field__label">LINE</span>
            <LineBindStatus
              bound={Boolean(staff.line_bound || staff.line_user_id)}
              lineUserId={staff.line_user_id}
            />
          </div>

          <label className="staff-field">
            <span className="staff-field__label">Google</span>
            <input
              className="field-control"
              type="email"
              value={draft.google_email}
              onChange={(e) => updateDraft(staff.id, 'google_email', e.target.value)}
              placeholder="gmail.com"
              autoComplete="off"
              aria-label={`${staff.account} Google 信箱`}
            />
          </label>

          <label className="staff-field">
            <span className="staff-field__label">匯款</span>
            <input
              className="field-control"
              value={draft.bank_account}
              onChange={(e) => updateDraft(staff.id, 'bank_account', e.target.value)}
              placeholder="銀行/帳號"
              aria-label={`${staff.account} 匯款帳號`}
            />
          </label>

          <label className="staff-field">
            <span className="staff-field__label">SIZE</span>
            <select
              className="field-control"
              value={draft.clothing_size}
              onChange={(e) => updateDraft(staff.id, 'clothing_size', e.target.value)}
              aria-label={`${staff.account} 衣服 SIZE`}
            >
              {CLOTHING_SIZE_OPTIONS.map((option) => (
                <option key={option.value || 'unset'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="staff-card__actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!dirty || savingId === staff.id}
              onClick={() => saveStaffDetails(staff)}
            >
              {savingId === staff.id ? '儲存中...' : '儲存'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!canSetPassword || settingPasswordId === staff.id}
              onClick={() => setStaffPassword(staff)}
            >
              {settingPasswordId === staff.id ? '設定中...' : '設密碼'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={resettingPasswordId === staff.id || !String(draft.phone || '').trim()}
              onClick={() => resetPasswordToPhone(staff)}
            >
              {resettingPasswordId === staff.id ? '重設中...' : '密碼初始'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleActive(staff)}>
              {staff.is_active ? '停用' : '啟用'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={deletingId === staff.id}
              onClick={() => deleteStaff(staff)}
            >
              {deletingId === staff.id ? '刪除中...' : '刪除'}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <Layout title="系統人員建檔">
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">新增人員</h2>
          <p className="hint">請自行輸入帳號與初始密碼；建立後員工可自行變更密碼。</p>
        </div>
        <form className="form-grid cols-2" onSubmit={handleCreate}>
          <label className="field">
            <span className="field-label">姓名</span>
            <input className="field-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="field">
            <span className="field-label">帳號</span>
            <input
              className="field-control"
              value={form.account}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
              autoComplete="off"
              placeholder="自行設定，勿留空"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">初始密碼</span>
            <PasswordField
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="至少 6 碼"
              required
              aria-label="初始密碼"
            />
          </label>
          <label className="field">
            <span className="field-label">角色</span>
            <select className="field-control" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">電話</span>
            <input className="field-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0912345678" />
          </label>
          <label className="field">
            <span className="field-label">匯款帳號</span>
            <input className="field-control" value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} placeholder="銀行代碼 / 帳號" />
          </label>
          <label className="field">
            <span className="field-label">衣服 SIZE</span>
            <select className="field-control" value={form.clothing_size} onChange={(e) => setForm({ ...form, clothing_size: e.target.value })}>
              {CLOTHING_SIZE_OPTIONS.map((option) => (
                <option key={option.value || 'unset'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Google 信箱</span>
            <input
              className="field-control"
              type="email"
              value={form.google_email}
              onChange={(e) => setForm({ ...form, google_email: e.target.value })}
              placeholder="name@gmail.com（供 Google 登入綁定）"
              autoComplete="off"
            />
          </label>
          <div className="toolbar-actions" style={{ gridColumn: '1 / -1' }}>
            <p className="hint">此角色權限：{formatPermissionList(form.role)}</p>
            <button type="submit" className="btn btn-primary">建立人員</button>
          </div>
        </form>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />

      <section className="card staff-list-card">
        <div className="card-header" style={{ padding: '16px 16px 0' }}>
          <h2 className="card-title">人員列表</h2>
          <p className="hint">帳號可直接修改。刪除帳號後無法登入，歷史班表仍保留；派班時不會再顯示已刪除人員。</p>
        </div>
        <div className="staff-list">
          {staffList.map((staff) => renderStaffItem(staff))}
        </div>
      </section>
    </Layout>
  );
}
