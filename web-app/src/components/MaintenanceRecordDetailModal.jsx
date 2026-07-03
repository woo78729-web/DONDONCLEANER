import { useEffect, useMemo, useState } from 'react';
import '../components/schedule-calendar.css';

function formatAmount(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return `${Number(value).toLocaleString()} 元`;
}

function compensationLabel(requiresCompensation) {
  return requiresCompensation ? '需賠款' : '不需賠款';
}

function computeShares(serviceAmount, isWarrantyCase, requiresCompensation) {
  const amount = Number(serviceAmount) || 0;

  if (!requiresCompensation || amount <= 0) {
    return { employee: 0, company: 0 };
  }

  if (isWarrantyCase) {
    const employee = Math.floor(amount / 2);
    return { employee, company: amount - employee };
  }

  return { employee: amount, company: 0 };
}

export function MaintenanceRecordDetailModal({
  record,
  open,
  onClose,
  onSave,
  saving = false,
  editable = true,
  employeeMode = false,
  canViewCompensation = false,
  canEditCompensation = false,
}) {
  const [draft, setDraft] = useState({
    follow_up_method: '',
    requires_compensation: false,
    is_warranty_case: false,
    service_amount: '',
    status: 'open',
    admin_notes: '',
  });
  const [clientError, setClientError] = useState('');

  useEffect(() => {
    if (!open || !record) {
      return;
    }

    setDraft({
      follow_up_method: record.follow_up_method || '',
      requires_compensation: Boolean(record.requires_compensation),
      is_warranty_case: Boolean(record.is_warranty_case),
      service_amount: record.service_amount ? String(record.service_amount) : '',
      status: record.status || 'open',
      admin_notes: record.admin_notes || '',
    });
    setClientError('');
  }, [record, open]);

  const shares = useMemo(
    () => computeShares(draft.service_amount, draft.is_warranty_case, draft.requires_compensation),
    [draft.service_amount, draft.is_warranty_case, draft.requires_compensation],
  );

  const isResolving = draft.status === 'resolved';

  if (!open || !record) {
    return null;
  }

  function buildEmployeePayload() {
    return {
      follow_up_method: draft.follow_up_method.trim() || null,
      requires_compensation: Boolean(draft.requires_compensation),
    };
  }

  function buildAdminPayload() {
    return {
      follow_up_method: draft.follow_up_method.trim() || null,
      requires_compensation: Boolean(draft.requires_compensation),
      is_warranty_case: Boolean(draft.is_warranty_case),
      service_amount: draft.service_amount === '' ? 0 : Number(draft.service_amount),
      status: draft.status,
      admin_notes: draft.admin_notes.trim() || null,
    };
  }

  function handleSubmit() {
    setClientError('');

    if (!employeeMode && canEditCompensation && isResolving && draft.requires_compensation) {
      const amount = Number(draft.service_amount) || 0;

      if (amount <= 0) {
        setClientError('結案需賠款時請填寫賠款總額');
        return;
      }
    }

    onSave(employeeMode ? buildEmployeePayload() : buildAdminPayload());
  }

  function submitLabel() {
    if (employeeMode) {
      return saving ? '儲存中…' : '儲存';
    }

    if (isResolving) {
      return saving
        ? '結案中…'
        : (draft.requires_compensation ? '確認結案並入帳' : '確認結案');
    }

    return saving ? '儲存中…' : '儲存';
  }

  return (
    <div className="modal-overlay schedule-form-overlay" role="presentation" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">維修紀錄 #{record.id}</h2>
            <p className="hint">
              {record.customer_name || '-'}
              {' · '}
              {record.customer_phone}
              {' · '}
              {record.status_label}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">×</button>
        </div>

        <div className="form-grid cols-1">
          <div className="field">
            <span className="field-label">問題描述</span>
            <p className="field-control field-control--readonly">{record.issue_description}</p>
          </div>

          <div className="field">
            <span className="field-label">負責師傅</span>
            <p className="field-control field-control--readonly">{record.assignee?.name || record.reporter?.name || '-'}</p>
          </div>

          {editable ? (
            <>
              <label className="field">
                <span className="field-label">回報後續處理方式</span>
                <textarea
                  className="field-control"
                  rows={3}
                  value={draft.follow_up_method}
                  onChange={(event) => setDraft((previous) => ({ ...previous, follow_up_method: event.target.value }))}
                  placeholder="例如：加冷媒、清洗室外機、更換零件…"
                />
              </label>

              <label className="field field-checkbox mail-tracking-modal__sent">
                <input
                  type="checkbox"
                  checked={Boolean(draft.requires_compensation)}
                  onChange={(event) => setDraft((previous) => ({ ...previous, requires_compensation: event.target.checked }))}
                />
                <span>是否賠款</span>
              </label>

              {canEditCompensation && (
                <>
                  <label className="field">
                    <span className="field-label">追蹤狀態</span>
                    <select
                      className="field-control"
                      value={draft.status}
                      onChange={(event) => setDraft((previous) => ({ ...previous, status: event.target.value }))}
                    >
                      <option value="open">待處理</option>
                      <option value="in_progress">處理中</option>
                      <option value="resolved">已結案</option>
                    </select>
                  </label>

                  {isResolving && (
                    <div className="maintenance-resolve-panel">
                      <h3 className="section-label">結案</h3>
                      {draft.requires_compensation ? (
                        <>
                          <p className="hint">此案件需賠款，請填寫金額後確認結案，將自動列入公司代墊；師傅分擔款應入公司帳（由阿泰代收）。</p>

                          <label className="field field-checkbox mail-tracking-modal__sent">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.is_warranty_case)}
                              onChange={(event) => setDraft((previous) => ({ ...previous, is_warranty_case: event.target.checked }))}
                            />
                            <span>保內賠款（公司與員工對半分擔）</span>
                          </label>

                          <label className="field">
                            <span className="field-label">賠款總額</span>
                            <input
                              className="field-control"
                              type="number"
                              min="0"
                              step="1"
                              value={draft.service_amount}
                              onChange={(event) => setDraft((previous) => ({ ...previous, service_amount: event.target.value }))}
                              placeholder="請填寫賠款總額"
                              autoFocus
                            />
                          </label>

                          {Number(draft.service_amount) > 0 && (
                            <div className="field">
                              <span className="field-label">分擔試算</span>
                              <p className="field-control field-control--readonly">
                                公司 {formatAmount(shares.company)}／員工 {formatAmount(shares.employee)}
                                {draft.is_warranty_case ? '（保內對半，師傅須入公司）' : '（非保內由師傅負擔並入公司）'}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="hint">確認結案後，此案件將標記為已完成。</p>
                      )}
                    </div>
                  )}

                  {!isResolving && draft.requires_compensation && (
                    <p className="hint">已標記需賠款，追蹤完成後請將狀態改為「已結案」並填寫賠款金額。</p>
                  )}

                  <label className="field">
                    <span className="field-label">備註</span>
                    <textarea
                      className="field-control"
                      rows={2}
                      value={draft.admin_notes}
                      onChange={(event) => setDraft((previous) => ({ ...previous, admin_notes: event.target.value }))}
                    />
                  </label>
                </>
              )}

              {!canEditCompensation && canViewCompensation && (
                <div className="field">
                  <span className="field-label">賠款資訊</span>
                  <p className="field-control field-control--readonly">
                    {compensationLabel(record.requires_compensation)}
                    {record.service_amount ? ` · 總額 ${formatAmount(record.service_amount)}` : ''}
                  </p>
                </div>
              )}

              {clientError && (
                <div className="alert alert-error">{clientError}</div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-pill"
                  disabled={saving}
                  onClick={handleSubmit}
                >
                  {submitLabel()}
                </button>
                <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>關閉</button>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <span className="field-label">回報後續處理方式</span>
                <p className="field-control field-control--readonly">{record.follow_up_method || '-'}</p>
              </div>
              <div className="field">
                <span className="field-label">是否賠款</span>
                <p className="field-control field-control--readonly">{compensationLabel(record.requires_compensation)}</p>
              </div>
              {Number(record.employee_compensation_due_to_company ?? record.employee_compensation_due_to_atai) > 0 && (
                <div className="field">
                  <span className="field-label">賠償應入公司</span>
                  <p className="field-control field-control--readonly">
                    {formatAmount(record.employee_compensation_due_to_company ?? record.employee_compensation_due_to_atai)}
                    （公司代墊賠款，請將分擔款交給阿泰代收）
                  </p>
                </div>
              )}
              {canViewCompensation && (
                <>
                  <div className="field">
                    <span className="field-label">賠款總額</span>
                    <p className="field-control field-control--readonly">{formatAmount(record.service_amount)}</p>
                  </div>
                  {record.requires_compensation && Number(record.service_amount) > 0 && (
                    <div className="field">
                      <span className="field-label">分擔</span>
                      <p className="field-control field-control--readonly">
                        公司 {formatAmount(record.company_compensation_share)}／員工 {formatAmount(record.employee_compensation_share)}
                        （師傅分擔須入公司帳）
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>關閉</button>
              </div>
            </>
          )}

          {record.photos?.length > 0 && (
            <div className="maintenance-photo-grid">
              {record.photos.map((photo) => (
                <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                  <img src={photo.url} alt={photo.caption || '問題照片'} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { formatAmount, compensationLabel };