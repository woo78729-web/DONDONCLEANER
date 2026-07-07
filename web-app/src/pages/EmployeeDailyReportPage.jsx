import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { PricingLineEditor } from '../components/PricingLineEditor';
import { ReportConfirmModal } from '../components/ReportConfirmModal';
import { GoogleMapsLink } from '../components/GoogleMapsLink';
import { PhoneLink } from '../components/PhoneLink';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../api/client';
import {
  buildDefaultReportDraft,
  buildReportPayload,
  calculateEmployeeReportDraft,
  ensureMismatchPricingLines,
  syncDraftFromPricingLines,
} from '../utils/employeeReport';
import { formatDateOnly, formatTimeValue, isScheduleOverdueUnreported } from '../utils/scheduleCalendar';

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function EmployeeReportForm({
  schedule,
  draft,
  onDraftChange,
  onSubmit,
  submitting,
}) {
  const calculated = useMemo(
    () => calculateEmployeeReportDraft(schedule, draft),
    [schedule, draft],
  );

  function updateDraft(changes) {
    let nextDraft = { ...draft, ...changes };

    if ('completed_units' in changes) {
      nextDraft = ensureMismatchPricingLines(schedule, nextDraft);
    }

    const nextCalculated = calculateEmployeeReportDraft(schedule, nextDraft);

    if ('completed_units' in changes
      || 'pricing_lines' in changes
      || 'has_tax' in changes
      || 'needs_invoice_and_mail' in changes
      || 'needs_receipt_and_mail' in changes
      || 'paid_to_company' in changes) {
      nextDraft.collected_amount = nextDraft.paid_to_company
        ? '0'
        : String(nextCalculated.collectedAmount);
    }

    onDraftChange(nextDraft);
  }

  function updatePricingLines(pricingLines) {
    const nextDraft = syncDraftFromPricingLines(schedule, draft, pricingLines);
    const nextCalculated = calculateEmployeeReportDraft(schedule, nextDraft);

    onDraftChange({
      ...nextDraft,
      collected_amount: nextDraft.paid_to_company
        ? '0'
        : String(nextCalculated.collectedAmount),
    });
  }

  return (
    <form
      className="form-grid employee-report-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="form-grid cols-3">
        <label className="field">
          <span className="field-label">預計清洗台數</span>
          <input className="field-control" type="number" value={calculated.plannedUnits} readOnly />
        </label>
        <label className="field">
          <span className="field-label">完成台數</span>
          <input
            className="field-control"
            type="number"
            min="0"
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

      {calculated.unitMismatch && (
        <>
          <div className="field employee-report-pricing">
            <span className="field-label">台數異動 — 請確認各項目台數與單價（金額會依此重新計算）</span>
            <PricingLineEditor
              lines={draft.pricing_lines || calculated.pricingLines}
              onChange={updatePricingLines}
              showTax
              showRemove={false}
            />
          </div>

          <label className="field">
            <span className="field-label">台數異動原因</span>
            <textarea
              className="field-control"
              rows={2}
              value={draft.skip_reason}
              onChange={(event) => updateDraft({ skip_reason: event.target.value })}
              placeholder="請說明完成台數與排班不同的原因"
              required
            />
          </label>
        </>
      )}

      <label className="field field-checkbox">
        <input
          type="checkbox"
          checked={draft.has_tax}
          onChange={(event) => updateDraft({ has_tax: event.target.checked })}
        />
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
        <input
          type="checkbox"
          checked={draft.paid_to_company}
          onChange={(event) => updateDraft({ paid_to_company: event.target.checked })}
        />
        <span>客戶匯款給公司（宏逸帳戶）</span>
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
        <span className="field-label">臨時要求</span>
        <textarea
          className="field-control"
          rows={2}
          value={draft.temporary_request}
          onChange={(event) => updateDraft({ temporary_request: event.target.value })}
          placeholder="如有臨時追加需求請填寫"
        />
      </label>

      {(calculated.temporaryPostage > 0 || calculated.reportInvoiceTaxCost > 0) && (
        <div className="hint employee-report-costs">
          {calculated.temporaryPostage > 0 && <span>臨時郵資 {calculated.temporaryPostage} 元</span>}
          {calculated.reportInvoiceTaxCost > 0 && <span>稅金 8% {calculated.reportInvoiceTaxCost} 元（併入開支）</span>}
        </div>
      )}

      <div className="toolbar-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? '處理中...' : '確認送出回報'}
        </button>
      </div>
    </form>
  );
}

export default function EmployeeDailyReportPage() {
  const [workDate, setWorkDate] = useState(todayDateString());
  const [schedules, setSchedules] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSchedule, setConfirmSchedule] = useState(null);
  const [confirmDraft, setConfirmDraft] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadPending = useCallback(async (date = workDate) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const result = await api.getPendingReports(date);
      const nextSchedules = result.data.schedules || [];
      setSchedules(nextSchedules);
      setDrafts(Object.fromEntries(
        nextSchedules.map((schedule) => [schedule.id, buildDefaultReportDraft(schedule)]),
      ));
      setExpandedId(nextSchedules[0]?.id ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workDate]);

  useEffect(() => {
    loadPending(workDate);
  }, [workDate, loadPending]);

  function updateDraft(scheduleId, nextDraft) {
    setDrafts((prev) => ({ ...prev, [scheduleId]: nextDraft }));
  }

  function openConfirm(schedule) {
    const draft = drafts[schedule.id];
    const calculated = calculateEmployeeReportDraft(schedule, draft);

    if (calculated.unitMismatch && !draft.skip_reason?.trim()) {
      setError('台數異動需填寫原因');
      return;
    }

    if (draft.needs_invoice_and_mail && draft.needs_receipt_and_mail) {
      setError('發票寄信與收據寄信不可同時勾選');
      return;
    }

    setError('');
    setConfirmSchedule(schedule);
    setConfirmDraft(draft);
    setConfirmOpen(true);
  }

  async function handleConfirmSubmit() {
    if (!confirmSchedule || !confirmDraft) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.submitEmployeeReport(buildReportPayload(confirmSchedule, confirmDraft));
      setMessage('回報已送出，如需調整請聯絡管理員');
      setConfirmOpen(false);
      setConfirmSchedule(null);
      setConfirmDraft(null);
      await loadPending(workDate);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const confirmSummary = confirmSchedule && confirmDraft
    ? (() => {
      const calculated = calculateEmployeeReportDraft(confirmSchedule, confirmDraft);
      const paidToCompany = Boolean(confirmDraft.paid_to_company);

      return {
        ...calculated,
        skipReason: confirmDraft.skip_reason,
        paidToCompany,
        totalAmount: calculated.collectedAmount,
        collectedAmount: paidToCompany ? 0 : Number(confirmDraft.collected_amount ?? calculated.collectedAmount),
      };
    })()
    : null;

  return (
    <Layout title="每日回報">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">待回報班表</h2>
            <p className="hint">送出後不能更改，如需調整請聯絡管理員。</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadPending(workDate)} disabled={loading}>
            {loading ? '載入中...' : '重新整理'}
          </button>
        </div>

        <div className="filter-toolbar">
          <label className="field field-compact">
            <span className="field-label">工作日期</span>
            <input
              className="field-control"
              type="date"
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
            />
          </label>
        </div>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />

      {!schedules.length && !loading && (
        <section className="card">
          <p className="hint" style={{ padding: 16 }}>{formatDateOnly(workDate)} 沒有待回報的班表。</p>
        </section>
      )}

      {schedules.map((schedule) => {
        const expanded = expandedId === schedule.id;
        const draft = drafts[schedule.id] || buildDefaultReportDraft(schedule);

        return (
          <section className={`card employee-report-card${isScheduleOverdueUnreported(schedule) ? ' employee-report-card--overdue' : ''}`} key={schedule.id}>
            <button
              type="button"
              className="employee-report-card__toggle"
              onClick={() => setExpandedId(expanded ? null : schedule.id)}
            >
              <div>
                <div className="employee-report-card__title-row">
                  <strong>{schedule.customer_name || '客戶'}</strong>
                  {isScheduleOverdueUnreported(schedule) && <StatusBadge status="overdue" />}
                </div>
                <p className="hint">
                  {formatDateOnly(schedule.work_date)} {formatTimeValue(schedule.start_time)} – {formatTimeValue(schedule.end_time)}
                </p>
                <p className="hint">{schedule.customer_address} <GoogleMapsLink address={schedule.customer_address} /></p>
                {schedule.customer_phone && (
                  <p className="hint employee-report-card__phone">
                    聯絡電話：<PhoneLink phone={schedule.customer_phone} />
                  </p>
                )}
              </div>
              <span className="hint">{expanded ? '收起' : '填寫回報'}</span>
            </button>

            {expanded && (
              <EmployeeReportForm
                schedule={schedule}
                draft={draft}
                onDraftChange={(nextDraft) => updateDraft(schedule.id, nextDraft)}
                onSubmit={() => openConfirm(schedule)}
                submitting={submitting}
              />
            )}
          </section>
        );
      })}

      <ReportConfirmModal
        open={confirmOpen}
        summary={confirmSummary}
        onConfirm={handleConfirmSubmit}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmSchedule(null);
          setConfirmDraft(null);
        }}
        submitting={submitting}
      />
    </Layout>
  );
}
