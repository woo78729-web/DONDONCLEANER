import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { api } from '../api/client';
import { formatDateOnly, resolveScheduleDocumentType } from '../utils/scheduleCalendar';
import {
  collectScheduleIdsFromMailRow,
  mergeHistoryRows,
  mergePendingMailRows,
} from '../utils/mailTracking';
import '../components/schedule-calendar.css';

function formatSentAt(value) {
  if (!value) {
    return '-';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return value.replace('T', ' ').slice(0, 16);
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function resolveMailedAt(source) {
  return source?.mailed_at?.slice(0, 10)
    || source?.invoice_sent_at?.slice(0, 10)
    || '';
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

function scheduleTypeLabel(schedule) {
  return resolveScheduleDocumentType(schedule) || '寄件';
}

function reportTypeLabel(report) {
  const schedule = report?.daily_schedule;

  if (report?.needs_invoice_and_mail || schedule?.needs_invoice) {
    return '發票寄信';
  }

  if (report?.needs_receipt_and_mail || schedule?.needs_receipt || schedule?.needs_mail) {
    return '收據寄信';
  }

  return '寄件';
}

const emptyManualPostageDraft = () => ({
  mail_recipient: '',
  mail_phone: '',
  mail_address: '',
  notes: '',
  mailed_at: todayDateString(),
});

function ManualPostageModal({ open, onClose, onSave, saving }) {
  const [draft, setDraft] = useState(emptyManualPostageDraft);

  useEffect(() => {
    if (open) {
      setDraft(emptyManualPostageDraft());
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay schedule-form-overlay" role="presentation" onClick={onClose}>
      <div className="modal-panel mail-tracking-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">新增補寄郵資</h2>
            <p className="hint">填寫收件資料與原因；依「實際寄出時間」歸屬月份，每筆計 28 元郵資。</p>
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
            <span className="field-label">聯絡人／收件人</span>
            <input
              className="field-control"
              value={draft.mail_recipient}
              onChange={(event) => setDraft((previous) => ({ ...previous, mail_recipient: event.target.value }))}
              placeholder="請輸入聯絡人或店名"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">電話</span>
            <input
              className="field-control"
              value={draft.mail_phone}
              onChange={(event) => setDraft((previous) => ({ ...previous, mail_phone: event.target.value }))}
              placeholder="請輸入聯絡電話"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">地址</span>
            <input
              className="field-control"
              value={draft.mail_address}
              onChange={(event) => setDraft((previous) => ({ ...previous, mail_address: event.target.value }))}
              placeholder="請輸入寄送地址"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">原因說明</span>
            <input
              className="field-control"
              value={draft.notes}
              onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))}
              placeholder="例：發票抬頭更正補寄"
              maxLength={255}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">實際寄出時間</span>
            <input
              className="field-control"
              type="date"
              value={draft.mailed_at}
              onChange={(event) => setDraft((previous) => ({ ...previous, mailed_at: event.target.value }))}
              required
            />
            <span className="hint">補登舊帳時請改為實際寄出日期，會計入該月自動開支。</span>
          </label>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary btn-pill" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="btn btn-primary btn-pill" disabled={saving}>
              {saving ? '新增中…' : '確認新增 28 元'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
    mailed_at: resolveMailedAt(schedule) || todayDateString(),
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
    mailed_at: resolveMailedAt(report) || todayDateString(),
  };
}

function MailTrackingEditModal({ item, kind, open, onClose, onSave, saving, sentEdit = false, mergedCount = 1 }) {
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
              {mergedCount > 1 && ` · 已合併 ${mergedCount} 筆同天寄件`}
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

          <label className="field">
            <span className="field-label">郵件號碼</span>
            <input
              className="field-control"
              value={draft.mail_tracking_number}
              onChange={(event) => setDraft((previous) => ({ ...previous, mail_tracking_number: event.target.value }))}
              placeholder="請輸入郵局掛號或包裹編號"
            />
            <span className="hint">填寫後儲存，方便後續追蹤寄件狀態。</span>
          </label>

          <label className="field field-checkbox mail-tracking-modal__sent">
            <input
              type="checkbox"
              checked={Boolean(draft.invoice_sent)}
              disabled={sentEdit}
              onChange={(event) => {
                const checked = event.target.checked;

                setDraft((previous) => ({
                  ...previous,
                  invoice_sent: checked,
                  mailed_at: checked ? (previous.mailed_at || todayDateString()) : previous.mailed_at,
                }));
              }}
            />
            <span>已寄件完成</span>
          </label>

          {(draft.invoice_sent || sentEdit) && (
            <label className="field">
              <span className="field-label">實際寄出時間</span>
              <input
                className="field-control"
                type="date"
                value={draft.mailed_at || todayDateString()}
                onChange={(event) => setDraft((previous) => ({ ...previous, mailed_at: event.target.value }))}
                required
              />
              <span className="hint">補登舊帳時請改為實際寄出日期；月結郵資依此日期歸屬月份。</span>
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
  onDelete,
  editButtonLabel = '填寫／處理',
  selectable = false,
  selectedKeys = [],
  onToggleRow,
  onUnmerge,
}) {
  if (!rows.length) {
    return <p className="hint mail-tracking-empty">{emptyText}</p>;
  }

  const selectedKeySet = new Set(selectedKeys);

  return (
    <div className="table-wrap">
      <table className="data-table mail-tracking-table">
        <thead>
          <tr>
            {selectable && <th aria-label="選取" />}
            {onDelete && <th>刪除</th>}
            <th aria-label="來源" />
            <th>日期</th>
            <th>Line／FB ID</th>
            <th>收件人</th>
            <th>電話</th>
            <th>地址</th>
            <th>類型</th>
            <th className="num">台數</th>
            <th className="num">開立金額</th>
            <th>抬頭／統編</th>
            <th>處理狀況</th>
            {showTrackingNumber && <th>郵件號碼</th>}
            {showSentAt && <th>寄出時間</th>}
            {onEdit && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.plannedDate ? 'mail-tracking-row--planned' : ''}>
              {selectable && (
                <td>
                  <input
                    type="checkbox"
                    checked={selectedKeySet.has(row.key)}
                    disabled={Boolean(row.cleaningProjectId)}
                    onChange={() => onToggleRow?.(row)}
                    aria-label={`選取 ${formatDateOnly(row.date)} 寄件`}
                  />
                </td>
              )}
              {onDelete && (
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm mail-tracking-delete-btn"
                    onClick={() => onDelete(row)}
                  >
                    刪除
                  </button>
                </td>
              )}
              <td>
                <span
                  className="mail-tracking-source-dot"
                  style={{ backgroundColor: row.sourceColor }}
                  title={row.sourceLabel}
                />
              </td>
              <td>
                {formatDateOnly(row.date)}
                {row.dateEnd && (
                  <div className="hint">至 {formatDateOnly(row.dateEnd)}</div>
                )}
                {row.plannedDate && (
                  <div className="hint">預開 {formatDateOnly(row.plannedDate)}</div>
                )}
                {row.cleaningProjectId && (
                  <div className="hint">專案合併</div>
                )}
                {row.mailMergeGroupId && (
                  <div className="hint">合併寄件（28 元）</div>
                )}
              </td>
              <td>{row.contactId || '-'}</td>
              <td>{row.recipient || '-'}</td>
              <td>{row.phone || '-'}</td>
              <td className="mail-tracking-address">{row.address || '-'}</td>
              <td>{row.type}</td>
              <td className="num">{row.billingUnits ? `${row.billingUnits} 台` : '-'}</td>
              <td className="num">{row.billingAmount ? `${formatMoney(row.billingAmount)} 元` : '-'}</td>
              <td>
                <div className="mail-tracking-contact">
                  <span>{row.invoiceTitle || '-'}</span>
                  {row.taxId && <span className="hint">統編 {row.taxId}</span>}
                </div>
              </td>
              <td>{row.status || '-'}</td>
              {showTrackingNumber && <td>{row.trackingNumber || '-'}</td>}
              {showSentAt && <td>{formatSentAt(row.sentAt)}</td>}
              {onEdit && (
                <td>
                  <div className="button-row">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onEdit(row)}
                    >
                      {editButtonLabel}
                    </button>
                    {onUnmerge && row.mailMergeGroupId && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onUnmerge(row)}
                      >
                        取消合併
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MailTrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [manualPostageEntries, setManualPostageEntries] = useState([]);
  const [manualPostageOpen, setManualPostageOpen] = useState(false);
  const [manualPostageSaving, setManualPostageSaving] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [yearMonth, setYearMonth] = useState(() => searchParams.get('year_month') || currentYearMonth());

  async function loadTracking(nextYearMonth = yearMonth) {
    setLoading(true);
    setError('');

    try {
      const trackingResult = await api.getMailTracking({ year_month: nextYearMonth });
      setData(trackingResult.data);
      setManualPostageEntries(trackingResult.data?.manual_postage_entries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTracking(yearMonth);
  }, [yearMonth]);

  useEffect(() => {
    const next = searchParams.get('year_month');
    if (next && next !== yearMonth) {
      setYearMonth(next);
    }
  }, [searchParams, yearMonth]);

  function handleYearMonthChange(value) {
    setYearMonth(value);
    setSearchParams(value ? { year_month: value } : {}, { replace: true });
  }

  async function handleSaveDraft(draft) {
    if (!editTarget) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const members = editTarget.members || [{ kind: editTarget.kind, source: editTarget.item }];

      for (const member of members) {
        if (member.kind === 'schedule') {
          await api.updateScheduleMailTracking(member.source.id, draft);
        } else {
          await api.updateReportMailTracking(member.source.id, draft);
        }
      }

      const mergedCount = members.length;
      setMessage(
        editTarget.sentEdit || !draft.invoice_sent
          ? (mergedCount > 1 ? `已更新 ${mergedCount} 筆合併寄件資料` : '寄件資料已更新')
          : (mergedCount > 1 ? `已標記 ${mergedCount} 筆同天寄件完成` : '已標記寄出完成'),
      );
      setEditTarget(null);
      await loadTracking(yearMonth);

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

  function openEdit(row, sentEdit = false) {
    const primary = row.members?.[0] || { kind: row.kind, source: row.source };

    setEditTarget({
      item: primary.source,
      kind: primary.kind,
      members: row.members || [{ kind: row.kind, source: row.source }],
      sentEdit,
    });
  }

  async function handleAddManualPostage(draft) {
    const mail_recipient = draft.mail_recipient?.trim();
    const mail_phone = draft.mail_phone?.trim();
    const mail_address = draft.mail_address?.trim();
    const notes = draft.notes?.trim();

    if (!mail_recipient || !mail_phone || !mail_address || !notes) {
      setError('請填寫聯絡人、電話、地址與原因說明');
      return;
    }

    setManualPostageSaving(true);
    setError('');
    setMessage('');

    try {
      await api.createManualPostage({
        mailed_at: draft.mailed_at || todayDateString(),
        mail_recipient,
        mail_phone,
        mail_address,
        notes,
      });
      setManualPostageOpen(false);
      setMessage('補寄郵資已新增');
      const mailedMonth = (draft.mailed_at || todayDateString()).slice(0, 7);
      if (mailedMonth !== yearMonth) {
        handleYearMonthChange(mailedMonth);
      } else {
        await loadTracking(yearMonth);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setManualPostageSaving(false);
    }
  }

  async function handleDeleteManualPostage(entryId) {
    if (!window.confirm('確定刪除此筆補寄郵資？')) {
      return;
    }

    setError('');
    setMessage('');

    try {
      await api.deleteManualPostage(entryId);
      setMessage('補寄郵資已刪除');
      await loadTracking(yearMonth);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteRow(row) {
    const scheduleIds = collectScheduleIdsFromMailRow(row);

    if (!scheduleIds.length) {
      return;
    }

    const mergedCount = row.members?.length || 1;
    const confirmMessage = mergedCount > 1
      ? `確定刪除這 ${mergedCount} 筆合併工單？相關回報、郵資、匯款紀錄將一併刪除。`
      : '確定刪除此工單？相關回報、郵資、匯款紀錄將一併刪除。';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setError('');
    setMessage('');

    try {
      for (const scheduleId of scheduleIds) {
        await api.deleteSchedule(scheduleId);
      }

      setMessage('工單與相關資料已刪除');
      await loadTracking(yearMonth);

      if (historySearched) {
        await refreshHistorySearch();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function togglePendingRowSelection(row) {
    if (row.cleaningProjectId) {
      return;
    }

    setSelectedRowKeys((previous) => (
      previous.includes(row.key)
        ? previous.filter((key) => key !== row.key)
        : [...previous, row.key]
    ));
  }

  async function handleMergeMail() {
    const scheduleIds = [...new Set(
      selectedRowKeys.flatMap((rowKey) => {
        const row = pendingRows.find((item) => item.key === rowKey);
        return row ? collectScheduleIdsFromMailRow(row) : [];
      }),
    )];

    if (scheduleIds.length < 2) {
      setError('請至少勾選兩筆同一客戶的待寄項目');
      return;
    }

    setMergeSaving(true);
    setError('');
    setMessage('');

    try {
      await api.mergeMailTracking({ schedule_ids: scheduleIds });
      setSelectedRowKeys([]);
      setMessage('已合併寄件，郵資僅計 28 元');
      await loadTracking(yearMonth);
    } catch (err) {
      setError(err.message);
    } finally {
      setMergeSaving(false);
    }
  }

  async function handleUnmergeMail(row) {
    const scheduleIds = collectScheduleIdsFromMailRow(row);

    if (!scheduleIds.length) {
      return;
    }

    setMergeSaving(true);
    setError('');
    setMessage('');

    try {
      await api.unmergeMailTracking({ schedule_ids: scheduleIds });
      setSelectedRowKeys((previous) => previous.filter((key) => key !== row.key));
      setMessage('已取消合併寄件');
      await loadTracking(yearMonth);
    } catch (err) {
      setError(err.message);
    } finally {
      setMergeSaving(false);
    }
  }

  const pendingRows = mergePendingMailRows(data?.pending?.schedules, data?.pending?.reports);

  const sentMonthRows = mergeHistoryRows(
    data?.sent_month?.schedules || data?.sent_this_month?.schedules,
    data?.sent_month?.reports || data?.sent_this_month?.reports,
  );

  const postageTotals = data?.totals || {};
  const isCurrentMonth = yearMonth === currentYearMonth();
  const sentSectionTitle = isCurrentMonth ? '當月寄出紀錄' : `${yearMonth} 寄出紀錄`;
  const sentEmptyText = isCurrentMonth ? '本月尚無寄出紀錄。' : `${yearMonth} 尚無寄出紀錄。`;
  const manualPostageHint = isCurrentMonth
    ? '填寫收件資料與原因；依「實際寄出時間」歸屬月份，每筆計 28 元郵資。'
    : `以下為 ${yearMonth} 的補寄郵資紀錄；切換月份可查看其他月份。`;

  return (
    <Layout title="寄件追蹤">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">發票／收據寄信追蹤</h2>
            <p className="hint">郵寄、發票、收據項目會出現在此；同天同客戶（同電話）多址仍只計 28 元郵資。不同天同一客戶可勾選後「合併寄件」，也只計一次 28 元。</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadTracking(yearMonth)} disabled={loading}>
            重新整理
          </button>
        </div>
        <div className="filter-toolbar">
          <label className="field field-compact">
            <span className="field-label">郵寄紀錄月份</span>
            <input
              className="field-control"
              type="month"
              value={yearMonth}
              onChange={(event) => handleYearMonthChange(event.target.value)}
            />
          </label>
          <div className="toolbar-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => loadTracking(yearMonth)} disabled={loading}>
              {loading ? '載入中…' : '查詢月份'}
            </button>
          </div>
        </div>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />

      {loading && !data && <p className="hint" style={{ padding: '0 4px' }}>載入中…</p>}

      <section className="card">
        <h3 className="section-label mail-tracking-section-title">補寄郵資（發票更正等）</h3>
        <p className="hint">{manualPostageHint}</p>
        <p className="hint">不需重新派工時，可在此新增 28 元補寄郵資；依實際寄出時間歸屬月份。</p>
        <div className="mail-tracking-manual-postage">
          <button
            type="button"
            className="btn btn-primary btn-sm btn-pill"
            onClick={() => setManualPostageOpen(true)}
          >
            ＋ 新增 28 元
          </button>
        </div>
        {manualPostageEntries.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>收件人</th>
                  <th>電話</th>
                  <th>地址</th>
                  <th>說明</th>
                  <th>金額</th>
                  <th>寄出時間</th>
                  <th>建立時間</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {manualPostageEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.mail_recipient || '-'}</td>
                    <td>{entry.mail_phone || '-'}</td>
                    <td className="mail-tracking-address">{entry.mail_address || '-'}</td>
                    <td>{entry.notes}</td>
                    <td className="num">{entry.amount} 元</td>
                    <td>{formatSentAt(entry.mailed_at)}</td>
                    <td>{formatSentAt(entry.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm mail-tracking-delete-btn"
                        onClick={() => handleDeleteManualPostage(entry.id)}
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data && (
        <>
          <section className="card table-card">
            <div className="card-header">
              <div>
                <h3 className="section-label mail-tracking-section-title">待寄清單</h3>
                <p className="hint">勾選多筆同一客戶（同電話）後，可合併成一次寄出。</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={mergeSaving || selectedRowKeys.length < 2}
                onClick={handleMergeMail}
              >
                {mergeSaving ? '處理中…' : `合併寄件（已選 ${selectedRowKeys.length} 筆）`}
              </button>
            </div>
            <MailTrackingTable
              rows={pendingRows}
              emptyText="目前沒有待處理項目。開單時請勾選「郵寄」、「發票」或「收據」。"
              showTrackingNumber
              selectable
              selectedKeys={selectedRowKeys}
              onToggleRow={togglePendingRowSelection}
              onEdit={(row) => openEdit(row, false)}
              onDelete={handleDeleteRow}
              onUnmerge={handleUnmergeMail}
            />
          </section>

          <section className="card table-card">
            <h3 className="section-label mail-tracking-section-title">{sentSectionTitle}</h3>
            <p className="hint">
              依「實際寄出時間（mailed_at）」篩選 {yearMonth} 已寄件完成項目，與月結郵資一致。
              {postageTotals.postage_total > 0 && (
                <>
                  {' '}
                  派工寄件 {postageTotals.schedule_postage_count || 0} 筆
                  {postageTotals.manual_postage_count > 0 ? `、補寄 ${postageTotals.manual_postage_count} 筆` : ''}
                  ，郵資合計 {formatMoney(postageTotals.postage_total)} 元。
                </>
              )}
            </p>
            <MailTrackingTable
              rows={sentMonthRows}
              emptyText={sentEmptyText}
              showSentAt
              showTrackingNumber
              editButtonLabel="修改"
              onEdit={(row) => openEdit(row, true)}
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
                onEdit={(row) => openEdit(row, true)}
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
        mergedCount={editTarget?.members?.length || 1}
      />

      <ManualPostageModal
        open={manualPostageOpen}
        onClose={() => setManualPostageOpen(false)}
        onSave={handleAddManualPostage}
        saving={manualPostageSaving}
      />
    </Layout>
  );
}
