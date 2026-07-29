import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatDateOnly, formatTimeValue } from '../utils/scheduleCalendar';
import './schedule-calendar.css';

function buildDraft(initialPhone = '') {
  return {
    customer_phone: initialPhone,
    customer_name: '',
    customer_address: '',
    assigned_user_id: '',
    schedule_id: '',
    issue_description: '',
    admin_notes: '',
  };
}

export function MaintenanceCreateModal({
  open,
  onClose,
  onSuccess,
  initialPhone = '',
}) {
  const [draft, setDraft] = useState(() => buildDraft(initialPhone));
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(buildDraft(initialPhone));
    setSchedules([]);
    setError('');

    api.getEmployees()
      .then((result) => {
        setEmployees((result.data || []).filter(
          (employee) => employee.role === 'employee' && employee.is_active,
        ));
      })
      .catch((err) => setError(err.message));
  }, [open, initialPhone]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const query = draft.customer_phone.trim();

    if (query.length < 6) {
      setSchedules([]);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setLookupLoading(true);

      try {
        const result = await api.customerLookup(query);
        setSchedules(result.data.schedules || []);
      } catch {
        setSchedules([]);
      } finally {
        setLookupLoading(false);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [draft.customer_phone, open]);

  if (!open) {
    return null;
  }

  function updateDraft(changes) {
    setDraft((previous) => ({ ...previous, ...changes }));
  }

  function handleScheduleSelect(scheduleId) {
    const schedule = schedules.find((item) => String(item.id) === String(scheduleId));

    if (!schedule) {
      updateDraft({ schedule_id: '' });
      return;
    }

    updateDraft({
      schedule_id: String(schedule.id),
      customer_phone: schedule.customer_phone || draft.customer_phone,
      customer_name: schedule.customer_name || '',
      customer_address: schedule.customer_address || '',
      assigned_user_id: schedule.user_id ? String(schedule.user_id) : draft.assigned_user_id,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const issueDescription = draft.issue_description.trim();
    const customerPhone = draft.customer_phone.trim();

    if (!customerPhone) {
      setError('請填寫客戶電話');
      return;
    }

    if (!issueDescription) {
      setError('請填寫問題描述');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        customer_phone: customerPhone,
        customer_name: draft.customer_name.trim() || null,
        customer_address: draft.customer_address.trim() || null,
        issue_description: issueDescription,
        admin_notes: draft.admin_notes.trim() || null,
        status: 'open',
      };

      if (draft.schedule_id) {
        payload.schedule_id = Number(draft.schedule_id);
      }

      if (draft.assigned_user_id) {
        payload.assigned_user_id = Number(draft.assigned_user_id);
      }

      await api.createMaintenanceRecord(payload);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay schedule-form-overlay" role="presentation" onClick={onClose}>
      <div className="modal-panel mail-tracking-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">新增報修</h2>
            <p className="hint">
              建立後會通知指定師傅；若未指定，師傅仍可在維修回報查看。
              也可至
              {' '}
              <Link to="/admin/phone-lookup" onClick={onClose}>電話查詢</Link>
              {' '}
              從清洗紀錄報修。
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">×</button>
        </div>

        <form className="form-grid cols-1" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">客戶電話</span>
            <input
              className="field-control"
              value={draft.customer_phone}
              onChange={(event) => updateDraft({
                customer_phone: event.target.value,
                schedule_id: '',
              })}
              placeholder="例如 0912345678"
              required
            />
          </label>

          {lookupLoading && (
            <p className="hint">查詢清洗紀錄中…</p>
          )}

          {!lookupLoading && schedules.length > 0 && (
            <label className="field">
              <span className="field-label">關聯清洗紀錄（選填）</span>
              <select
                className="field-control"
                value={draft.schedule_id}
                onChange={(event) => handleScheduleSelect(event.target.value)}
              >
                <option value="">不關聯（手動填寫客戶資料）</option>
                {schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {formatDateOnly(schedule.work_date)}
                    {' '}
                    {formatTimeValue(schedule.start_time)}
                    {' · '}
                    {schedule.customer_name || '客戶'}
                    {' · '}
                    {schedule.user?.name || '未指定師傅'}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span className="field-label">客戶姓名（選填）</span>
            <input
              className="field-control"
              value={draft.customer_name}
              onChange={(event) => updateDraft({ customer_name: event.target.value })}
            />
          </label>

          <label className="field">
            <span className="field-label">地址（選填）</span>
            <input
              className="field-control"
              value={draft.customer_address}
              onChange={(event) => updateDraft({ customer_address: event.target.value })}
            />
          </label>

          <label className="field">
            <span className="field-label">通知師傅（選填）</span>
            <select
              className="field-control"
              value={draft.assigned_user_id}
              onChange={(event) => updateDraft({ assigned_user_id: event.target.value })}
            >
              <option value="">稍後再指定</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">問題描述</span>
            <textarea
              className="field-control"
              rows={4}
              value={draft.issue_description}
              onChange={(event) => updateDraft({ issue_description: event.target.value })}
              placeholder="請描述客戶反映的問題"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">備註（選填）</span>
            <textarea
              className="field-control"
              rows={2}
              value={draft.admin_notes}
              onChange={(event) => updateDraft({ admin_notes: event.target.value })}
              placeholder="給師傅的補充說明"
            />
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary btn-pill" disabled={saving}>
              {saving ? '送出中…' : '完成報修'}
            </button>
            <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
