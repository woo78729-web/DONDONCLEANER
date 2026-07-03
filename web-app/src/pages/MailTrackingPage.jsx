import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { api } from '../api/client';
import { formatDateOnly } from '../utils/scheduleCalendar';
import '../components/schedule-calendar.css';

function formatSentAt(value) {
  if (!value) {
    return '-';
  }

  return value.replace('T', ' ').slice(0, 16);
}

function scheduleTypeLabel(schedule) {
  if (schedule?.needs_invoice && schedule?.needs_mail) {
    return '發票＋收據';
  }

  if (schedule?.needs_invoice) {
    return '發票';
  }

  if (schedule?.needs_mail) {
    return '收據／郵寄';
  }

  return '寄件';
}

function reportTypeLabel(report) {
  const labels = [];

  if (report?.needs_invoice_and_mail) {
    labels.push('發票寄信');
  }

  if (report?.needs_receipt_and_mail) {
    labels.push('收據寄信');
  }

  return labels.join('、') || '寄件';
}

function buildScheduleDraft(schedule) {
  return {
    mail_recipient: schedule?.mail_recipient || schedule?.customer_name || '',
    mail_phone: schedule?.mail_phone || schedule?.customer_phone || '',
    mail_address: schedule?.mail_address || schedule?.customer_address || '',
    invoice_tax_id: schedule?.invoice_tax_id || '',
    invoice_title: schedule?.invoice_title || '',
    mail_tracking_number: schedule?.mail_tracking_number || '',
    invoice_sent: Boolean(schedule?.invoice_sent),
  };
}

function buildReportDraft(report) {
  const schedule = report?.daily_schedule;

  return {
    mail_recipient: schedule?.mail_recipient || schedule?.customer_name || '',
    mail_phone: schedule?.mail_phone || schedule?.customer_phone || '',
    mail_address: schedule?.mail_address || schedule?.customer_address || '',
    invoice_tax_id: schedule?.invoice_tax_id || '',
    invoice_title: schedule?.invoice_title || '',
    mail_tracking_number: schedule?.mail_tracking_number || '',
    invoice_sent: Boolean(report?.invoice_sent),
  };
}

function MailTrackingEditModal({ item, kind, open, onClose, onSave, saving, sentEdit = false }) {
  const [draft, setDraft] = useState(() => (
    kind === 'schedule' ? buildScheduleDraft(item) : buildReportDraft(item)
  ));

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(kind === 'schedule' ? buildScheduleDraft(item) : buildReportDraft(item));
  }, [item, kind, open]);

  if (!open || !item) {
    return null;
  }

  const schedule = kind === 'schedule' ? item : item.daily_schedule;
  const title = sentEdit
    ? '修改寄件資料'
    : (kind === 'schedule' ? '班表寄件資料' : '回報寄件資料');
  const showTrackingNumber = sentEdit || draft.invoice_sent;

  return (
    <div className="modal-overlay schedule-form-overlay" role="presentation" onClick={onClose}>
      <div className="modal-panel mail-tracking-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{title}</h2>
            <p className="hint">
              {formatDateOnly(schedule?.work_date)}
              {' · '}
              {schedule?.user?.name || '-'}
              {' · '}
              {kind === 'schedule' ? scheduleTypeLabel(item) : reportTypeLabel(item)}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">×</button>
        </div>

        <form
          className="form-grid cols-1"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          <label className="field">
            <span className="field-label">店名／收件人</span>
            <input
              className="field-control"
              value={draft.mail_recipient}
              onChange={(event) => setDraft((previous) => ({ ...previous, mail_recipient: event.target.value }))}
              placeholder="請輸入店名或收件人"
            />
          </label>

          <label className="field">
            <span className="field-label">電話</span>
            <input
              className="field-control"
              value={draft.mail_phone}
              onChange={(event) => setDraft((previous) => ({ ...previous, mail_phone: event.target.value }))}
              placeholder="請輸入聯絡電話"
            />
          </label>

          <label className="field">
            <span className="field-label">寄送地址</span>
            <input
              className="field-control"
              value={draft.mail_address}
              onChange={(event) => setDraft((previous) => ({ ...previous, mail_address: event.target.value }))}
              placeholder="請輸入寄送地址"
            />
          </label>

          <label className="field">
            <span className="field-label">統編</span>
            <input
              className="field-control"
              value={draft.invoice_tax_id}
              onChange={(event) => setDraft((previous) => ({ ...previous, invoice_tax_id: event.target.value }))}
              placeholder="請輸入統一編號"
            />
          </label>

          <label className="field">
            <span className="field-label">抬頭</span>
            <input
              className="field-control"
              value={draft.invoice_title}
              onChange={(event) => setDraft((previous) => ({ ...previous, invoice_title: event.target.value }))}
              placeholder="請輸入發票抬頭"
            />
          </label>

          <label className="field field-checkbox mail-tracking-modal__sent">
            <input
              type="checkbox"
              checked={Boolean(draft.invoice_sent)}
              disabled={sentEdit}
              onChange={(event) => setDraft((previous) => ({ ...previous, invoice_sent: event.target.checked }))}
            />
            <span>已完成寄出</span>
          </label>

          {showTrackingNumber && (
            <label className="field">
              <span className="field-label">郵件號碼</span>
              <input
                className="field-control"
                value={draft.mail_tracking_number}
                onChange={(event) => setDraft((previous) => ({ ...previous, mail_tracking_number: event.target.value }))}
                placeholder="請輸入郵局掛號或包裹編號"
              />
            </label>
          )}

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary btn-pill" disabled={saving}>
              {saving ? '儲存中…' : '儲存'}
            </button>
            <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MailTrackingTable({
  rows,
  emptyText,
  showSentAt = false,
  showTrackingNumber = false,
  onEdit,
  editButtonLabel = '填寫／處理',
}) {
  if (!rows.length) {
    return <p className="hint mail-tracking-empty">{emptyText}</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>師傅</th>
            <th>客戶</th>
            <th>類型</th>
            <th>抬頭／電話</th>
            {showTrackingNumber && <th>郵件號碼</th>}
            {showSentAt && <th>寄出時間</th>}
            {onEdit && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{formatDateOnly(row.date)}</td>
              <td>{row.employee}</td>
              <td>{row.customer}</td>
              <td>{row.type}</td>
              <td>
                <div className="mail-tracking-contact">
                  <span>{row.invoiceTitle || row.recipient || '-'}</span>
                  <span className="hint">{row.phone || '-'}</span>
                  {row.taxId && <span className="hint">統編 {row.taxId}</span>}
                </div>
              </td>
              {showTrackingNumber && <td>{row.trackingNumber || '-'}</td>}
              {showSentAt && <td>{formatSentAt(row.sentAt)}</td>}
              {onEdit && (
                <td>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(row.source, row.kind)}>
                    {editButtonLabel}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function mapScheduleRows(schedules) {
  return (schedules || []).map((schedule) => ({
    key: `schedule-${schedule.id}`,
    kind: 'schedule',
    source: schedule,
    date: schedule.work_date,
    employee: schedule.user?.name || '-',
    customer: schedule.customer_name,
    type: scheduleTypeLabel(schedule),
    recipient: schedule.mail_recipient,
    invoiceTitle: schedule.invoice_title,
    taxId: schedule.invoice_tax_id,
    phone: schedule.mail_phone,
    trackingNumber: schedule.mail_tracking_number,
    sentAt: schedule.invoice_sent_at,
  }));
}

function mapReportRows(reports) {
  return (reports || []).map((report) => ({
    key: `report-${report.id}`,
    kind: 'report',
    source: report,
    date: report.daily_schedule?.work_date,
    employee: report.daily_schedule?.user?.name || '-',
    customer: report.daily_schedule?.customer_name || '-',
    type: reportTypeLabel(report),
    recipient: report.daily_schedule?.mail_recipient,
    invoiceTitle: report.daily_schedule?.invoice_title,
    taxId: report.daily_schedule?.invoice_tax_id,
    phone: report.daily_schedule?.mail_phone,
    trackingNumber: report.daily_schedule?.mail_tracking_number,
    sentAt: report.invoice_sent_at,
  }));
}

function mergeHistoryRows(schedules, reports) {
  return [
    ...mapScheduleRows(schedules),
    ...mapReportRows(reports),
  ].sort((left, right) => String(right.sentAt || '').localeCompare(String(left.sentAt || '')));
}

export default function MailTrackingPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [historyQuery, setHistoryQuery] = useState({ tax_id: '', title: '', phone: '' });
  const [historyRows, setHistoryRows] = useState([]);
  const [historySearched, setHistorySearched] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  async function loadTracking() {
    setLoading(true);
    setError('');

    try {
      const result = await api.getMailTracking();
      setData(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTracking();
  }, []);

  async function handleSaveDraft(draft) {
    if (!editTarget) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      if (editTarget.kind === 'schedule') {
        await api.updateScheduleMailTracking(editTarget.item.id, draft);
      } else {
        await api.updateReportMailTracking(editTarget.item.id, draft);
      }

      setMessage(editTarget.sentEdit || !draft.invoice_sent ? '寄件資料已更新' : '已標記寄出完成');
      setEditTarget(null);
      await loadTracking();

      if (historySearched) {
        await refreshHistorySearch();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleHistorySearch(event) {
    if (event) {
      event.preventDefault();
    }

    const taxId = historyQuery.tax_id.trim();
    const title = historyQuery.title.trim();
    const phone = historyQuery.phone.trim();

    if (!taxId && !title && !phone) {
      setHistoryError('請至少輸入一項查詢條件');
      return;
    }

    setHistoryLoading(true);
    setHistoryError('');
    setHistorySearched(true);

    try {
      const result = await api.searchMailHistory({
        tax_id: taxId || undefined,
        title: title || undefined,
        phone: phone || undefined,
      });

      setHistoryRows(mergeHistoryRows(result.data?.schedules, result.data?.reports));
    } catch (err) {
      setHistoryError(err.message);
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshHistorySearch() {
    const taxId = historyQuery.tax_id.trim();
    const title = historyQuery.title.trim();
    const phone = historyQuery.phone.trim();

    if (!taxId && !title && !phone) {
      return;
    }

    try {
      const result = await api.searchMailHistory({
        tax_id: taxId || undefined,
        title: title || undefined,
        phone: phone || undefined,
      });

      setHistoryRows(mergeHistoryRows(result.data?.schedules, result.data?.reports));
    } catch (err) {
      setHistoryError(err.message);
    }
  }

  function openEdit(item, kind, sentEdit = false) {
    setEditTarget({ item, kind, sentEdit });
  }

  const pendingRows = mergeHistoryRows(data?.pending?.schedules, data?.pending?.reports)
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));

  const sentThisMonthRows = mergeHistoryRows(data?.sent_this_month?.schedules, data?.sent_this_month?.reports);

  return (
    <Layout title="寄件追蹤">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">發票／收據寄信追蹤</h2>
            <p className="hint">開單勾選需寄發票或收據後，會出現在待寄清單；填寫店名、統編、抬頭，完成寄出時可填郵件號碼。</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadTracking} disabled={loading}>
            重新整理
          </button>
        </div>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />

      {loading && !data && <p className="hint" style={{ padding: '0 4px' }}>載入中…</p>}

      {data && (
        <>
          <section className="card table-card">
            <h3 className="section-label mail-tracking-section-title">待寄清單</h3>
            <MailTrackingTable
              rows={pendingRows}
              emptyText="目前沒有待寄項目。開單時請勾選「如需寄信」或「是否開發票」。"
              onEdit={(item, kind) => openEdit(item, kind, false)}
            />
          </section>

          <section className="card table-card">
            <h3 className="section-label mail-tracking-section-title">當月寄出紀錄</h3>
            <MailTrackingTable
              rows={sentThisMonthRows}
              emptyText="本月尚無寄出紀錄。"
              showSentAt
              showTrackingNumber
              editButtonLabel="修改"
              onEdit={(item, kind) => openEdit(item, kind, true)}
            />
          </section>

          <section className="card table-card">
            <h3 className="section-label mail-tracking-section-title">歷史寄信查詢</h3>
            <form className="mail-tracking-search" onSubmit={handleHistorySearch}>
              <label className="field">
                <span className="field-label">統編</span>
                <input
                  className="field-control"
                  value={historyQuery.tax_id}
                  onChange={(event) => setHistoryQuery((previous) => ({ ...previous, tax_id: event.target.value }))}
                  placeholder="統一編號"
                />
              </label>
              <label className="field">
                <span className="field-label">抬頭</span>
                <input
                  className="field-control"
                  value={historyQuery.title}
                  onChange={(event) => setHistoryQuery((previous) => ({ ...previous, title: event.target.value }))}
                  placeholder="發票抬頭"
                />
              </label>
              <label className="field">
                <span className="field-label">電話</span>
                <input
                  className="field-control"
                  value={historyQuery.phone}
                  onChange={(event) => setHistoryQuery((previous) => ({ ...previous, phone: event.target.value }))}
                  placeholder="聯絡電話"
                />
              </label>
              <button type="submit" className="btn btn-primary btn-sm" disabled={historyLoading}>
                {historyLoading ? '查詢中…' : '查詢'}
              </button>
            </form>

            <PageAlert type="error" message={historyError} />

            {historySearched && (
              <MailTrackingTable
                rows={historyRows}
                emptyText="查無符合條件的寄信紀錄。"
                showSentAt
                showTrackingNumber
                editButtonLabel="修改"
                onEdit={(item, kind) => openEdit(item, kind, true)}
              />
            )}

            {!historySearched && (
              <p className="hint mail-tracking-empty">輸入統編、抬頭或電話後按查詢，即可搜尋歷史寄信紀錄。</p>
            )}
          </section>
        </>
      )}

      <MailTrackingEditModal
        item={editTarget?.item}
        kind={editTarget?.kind}
        sentEdit={Boolean(editTarget?.sentEdit)}
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveDraft}
        saving={saving}
      />
    </Layout>
  );
}
