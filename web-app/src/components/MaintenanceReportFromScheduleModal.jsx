import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDateOnly, formatTimeValue } from '../utils/scheduleCalendar';
import '../components/schedule-calendar.css';

function buildDraft(schedule) {
  return {
    issue_description: '',
    admin_notes: '',
  };
}

export function MaintenanceReportFromScheduleModal({
  schedule,
  open,
  onClose,
  onSuccess,
}) {
  const [draft, setDraft] = useState(() => buildDraft(schedule));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(buildDraft(schedule));
    setError('');
  }, [schedule, open]);

  if (!open || !schedule) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const issueDescription = draft.issue_description.trim();

    if (!issueDescription) {
      setError('請填寫問題描述');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.createMaintenanceRecord({
        schedule_id: schedule.id,
        assigned_user_id: schedule.user_id,
        customer_phone: schedule.customer_phone,
        customer_name: schedule.customer_name,
        customer_address: schedule.customer_address,
        fb_display_name: schedule.fb_display_name || null,
        line_display_name: schedule.line_display_name || null,
        issue_description: issueDescription,
        admin_notes: draft.admin_notes.trim() || null,
        status: 'open',
      });

      onSuccess?.(schedule);
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
            <h2 className="modal-title">報修</h2>
            <p className="hint">
              {formatDateOnly(schedule.work_date)}
              {' · '}
              {formatTimeValue(schedule.start_time)}
              {' – '}
              {formatTimeValue(schedule.end_time)}
              {' · '}
              {schedule.customer_name}
            </p>
            <p className="hint">
              將通知清洗師傅：
              {schedule.user?.name || '（未指定師傅）'}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">×</button>
        </div>

        <form className="form-grid cols-1" onSubmit={handleSubmit}>
          <div className="field">
            <span className="field-label">客戶電話</span>
            <p className="field-control field-control--readonly">{schedule.customer_phone || '-'}</p>
          </div>

          <div className="field">
            <span className="field-label">地址</span>
            <p className="field-control field-control--readonly">{schedule.customer_address || '-'}</p>
          </div>

          <label className="field">
            <span className="field-label">問題描述</span>
            <textarea
              className="field-control"
              rows={4}
              value={draft.issue_description}
              onChange={(event) => setDraft((previous) => ({ ...previous, issue_description: event.target.value }))}
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
              onChange={(event) => setDraft((previous) => ({ ...previous, admin_notes: event.target.value }))}
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
