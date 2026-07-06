import { useEffect, useMemo, useState } from 'react';
import {
  buildReportPayload,
  calculateEmployeeReportDraft,
} from '../utils/employeeReport';

export function AdminReportEditModal({
  open,
  report,
  onClose,
  onSave,
}) {
  const schedule = report?.daily_schedule;
  const [draft, setDraft] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && report && schedule) {
      setDraft({
        completed_units: String(report.completed_units ?? schedule.ac_units ?? 1),
        skip_reason: report.skip_reason || '',
        has_tax: Boolean(report.has_tax),
        needs_invoice_and_mail: Boolean(report.needs_invoice_and_mail),
        needs_receipt_and_mail: Boolean(report.needs_receipt_and_mail),
        temporary_request: report.temporary_request || '',
        collected_amount: String(report.collected_amount ?? 0),
        paid_to_company: Boolean(report.paid_to_company),
        travel_allowance: String(report.travel_allowance ?? 0),
      });
      setSubmitting(false);
      setError('');
    }
  }, [open, report, schedule]);

  const calculated = useMemo(
    () => (schedule && draft ? calculateEmployeeReportDraft(schedule, draft) : null),
    [schedule, draft],
  );

  if (!open || !report || !schedule || !draft) {
    return null;
  }

  function updateDraft(changes) {
    setDraft((prev) => {
      const nextDraft = { ...prev, ...changes };
      const nextCalculated = calculateEmployeeReportDraft(schedule, nextDraft);

      if ('completed_units' in changes
        || 'has_tax' in changes
        || 'needs_invoice_and_mail' in changes
        || 'needs_receipt_and_mail' in changes
        || 'paid_to_company' in changes) {
        nextDraft.collected_amount = nextDraft.paid_to_company
          ? '0'
          : String(nextCalculated.collectedAmount);
      }

      return nextDraft;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    setSubmitting(true);

    try {
      const payload = buildReportPayload(schedule, draft);
      delete payload.schedule_id;
      await onSave(report.id, payload);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">調整回報</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">×</button>
        </div>

        <p className="hint">{schedule.customer_address}</p>

        {error && <p className="form-error">{error}</p>}

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-grid cols-3">
            <label className="field">
              <span className="field-label">預計台數</span>
              <input className="field-control" type="number" value={calculated.plannedUnits} readOnly />
            </label>
            <label className="field">
              <span className="field-label">完成台數</span>
              <input
                className="field-control"
                type="number"
                min="0"
                max={calculated.plannedUnits}
                value={draft.completed_units}
                onChange={(event) => updateDraft({ completed_units: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">未洗台數</span>
              <input className="field-control" type="number" value={calculated.skippedUnits} readOnly />
            </label>
          </div>

          {calculated.skippedUnits > 0 && (
            <label className="field">
              <span className="field-label">未洗原因（選填）</span>
              <textarea
                className="field-control"
                rows={2}
                value={draft.skip_reason}
                onChange={(event) => updateDraft({ skip_reason: event.target.value })}
              />
            </label>
          )}

          <label className="field field-checkbox">
            <input type="checkbox" checked={draft.has_tax} onChange={(event) => updateDraft({ has_tax: event.target.checked })} />
            <span>有稅金（+5% 發票）</span>
          </label>

          <label className="field field-checkbox">
            <input
              type="checkbox"
              checked={draft.needs_invoice_and_mail}
              onChange={(event) => updateDraft({
                needs_invoice_and_mail: event.target.checked,
                needs_receipt_and_mail: event.target.checked ? false : draft.needs_receipt_and_mail,
              })}
            />
            <span>要發票稅金並寄信（+5%）</span>
          </label>

          <label className="field field-checkbox">
            <input
              type="checkbox"
              checked={draft.needs_receipt_and_mail}
              onChange={(event) => updateDraft({
                needs_receipt_and_mail: event.target.checked,
                needs_invoice_and_mail: event.target.checked ? false : draft.needs_invoice_and_mail,
              })}
            />
            <span>不用發票但要收據並寄信</span>
          </label>

          <label className="field field-checkbox">
            <input type="checkbox" checked={draft.paid_to_company} onChange={(event) => updateDraft({ paid_to_company: event.target.checked })} />
            <span>客戶匯款給公司</span>
          </label>

          <label className="field">
            <span className="field-label">實收金額</span>
            <input
              className="field-control"
              type="number"
              min="0"
              value={draft.collected_amount}
              onChange={(event) => updateDraft({ collected_amount: event.target.value })}
              disabled={draft.paid_to_company}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">車馬費加給</span>
            <input
              className="field-control"
              type="number"
              min="0"
              value={draft.travel_allowance}
              onChange={(event) => updateDraft({ travel_allowance: event.target.value })}
            />
          </label>

          <label className="field">
            <span className="field-label">臨時要求</span>
            <textarea
              className="field-control"
              rows={2}
              value={draft.temporary_request}
              onChange={(event) => updateDraft({ temporary_request: event.target.value })}
            />
          </label>

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '儲存中...' : '儲存調整'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
