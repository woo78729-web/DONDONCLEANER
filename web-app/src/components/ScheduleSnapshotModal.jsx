import { GoogleMapsLink } from './GoogleMapsLink';
import { PhoneLink } from './PhoneLink';
import {
  buildPricingLinesSummaryTag,
  canEditSchedule,
  formatScheduleAcUnits,
  formatScheduleDateLabel,
  formatScheduleDisplayTimeRange,
  formatScheduleMailInvoiceSummary,
  formatScheduleTotalPrice,
  getScheduleBlockColor,
  getSchedulePricingLineDetails,
  parseMultiAddressNote,
  parseStationNote,
  stripInternalScheduleNotes,
} from '../utils/scheduleCalendar';
import { canManageSchedulePricing } from '../utils/permissions';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

export function ScheduleSnapshotModal({
  open,
  schedule,
  onClose,
  onEdit,
  onDelete,
  showActions = true,
  userRole = 'admin',
}) {
  if (!open || !schedule) {
    return null;
  }

  const blockColor = getScheduleBlockColor(schedule);
  const canModify = showActions && canEditSchedule(schedule, userRole);
  const canManagePricing = canManageSchedulePricing(userRole);
  const dateTimeLabel = [
    formatScheduleDateLabel(schedule.work_date),
    formatScheduleDisplayTimeRange(schedule),
  ].filter(Boolean).join(' · ');
  const multiAddress = parseMultiAddressNote(schedule.notes);
  const stationNote = parseStationNote(schedule.notes);
  const generalNotes = stripInternalScheduleNotes(schedule.notes);
  const pricingLines = getSchedulePricingLineDetails(schedule);
  const pricingSummary = buildPricingLinesSummaryTag(schedule);

  return (
    <div
      className="modal-overlay schedule-popover-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="schedule-popover"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="schedule-popover__toolbar">
          {canModify && onEdit && (
            <button type="button" className="schedule-popover__icon-btn" onClick={() => onEdit(schedule)} title="編輯">
              ✎
            </button>
          )}
          {canModify && onDelete && (
            <button type="button" className="schedule-popover__icon-btn" onClick={() => onDelete(schedule)} title="刪除">
              🗑
            </button>
          )}
          <button type="button" className="schedule-popover__icon-btn" onClick={onClose} title="關閉">
            ×
          </button>
        </div>

        <div className="schedule-popover__accent" style={{ backgroundColor: blockColor.backgroundColor }} />

        <div className="schedule-popover__body">
          <ul className="schedule-popover__list schedule-popover__list--compact">
            <li>
              <span className="schedule-popover__label">清洗時間</span>
              <span className="schedule-popover__value">{dateTimeLabel || '-'}</span>
            </li>
            {multiAddress && (
              <li>
                <span className="schedule-popover__label">多站點</span>
                <span className="schedule-popover__value">
                  第 {multiAddress.index} / {multiAddress.total} 站
                  {multiAddress.index === 1 && multiAddress.groupUnits && multiAddress.groupPrice != null && (
                    <>
                      {' '}
                      · 全案共 {multiAddress.groupUnits} 台 / {formatMoney(multiAddress.groupPrice)} 元
                    </>
                  )}
                </span>
              </li>
            )}
            <li>
              <span className="schedule-popover__label">客戶名稱</span>
              <span className="schedule-popover__value">{schedule.customer_name || '-'}</span>
            </li>
            <li>
              <span className="schedule-popover__label">聯絡電話</span>
              <span className="schedule-popover__value">
                <PhoneLink
                  phone={schedule.customer_phone}
                  className="phone-link schedule-popover__phone-link"
                />
              </span>
            </li>
            <li>
              <span className="schedule-popover__label">清洗地址</span>
              <span className="schedule-popover__value">
                {schedule.customer_address || '-'}
                {schedule.customer_address && (
                  <GoogleMapsLink address={schedule.customer_address} label="地圖" className="schedule-popover__map-link" />
                )}
              </span>
            </li>
            {stationNote && (
              <li>
                <span className="schedule-popover__label">站點備註</span>
                <span className="schedule-popover__value schedule-popover__value--emphasis">{stationNote}</span>
              </li>
            )}
            <li>
              <span className="schedule-popover__label">清洗師傅</span>
              <span className="schedule-popover__value">{schedule.user?.name || '未指定'}</span>
            </li>
            <li>
              <span className="schedule-popover__label">清洗台數</span>
              <span className="schedule-popover__value">{formatScheduleAcUnits(schedule)}</span>
            </li>
            <li>
              <span className="schedule-popover__label">總金額</span>
              <span className="schedule-popover__value schedule-popover__value--emphasis">
                {formatScheduleTotalPrice(schedule)}
              </span>
            </li>
            {pricingSummary && (
              <li>
                <span className="schedule-popover__label">項目摘要</span>
                <span className="schedule-popover__value">{pricingSummary}</span>
              </li>
            )}
            {generalNotes && (
              <li>
                <span className="schedule-popover__label">備註</span>
                <span className="schedule-popover__value">{generalNotes}</span>
              </li>
            )}
            {!pricingLines.length && (
              <li>
                <span className="schedule-popover__label">郵寄／統編</span>
                <span className="schedule-popover__value">{formatScheduleMailInvoiceSummary(schedule)}</span>
              </li>
            )}
          </ul>

          {pricingLines.length > 0 && (
            <div className="schedule-popover__pricing">
              <p className="schedule-popover__section-title">清洗項目明細</p>
              <ul className="schedule-popover__pricing-list">
                {pricingLines.map((line) => (
                  <li key={`pricing-line-${line.index}`} className="schedule-popover__pricing-item">
                    <div className="schedule-popover__pricing-head">
                      <strong>
                        項目 {line.index}
                        {' · '}
                        {line.units} 台 × {formatMoney(line.unitPrice)} 元
                      </strong>
                      <span className="schedule-popover__pricing-amount">
                        應收 {formatMoney(line.customerAmount)} 元
                      </span>
                    </div>
                    <p className="hint">
                      發票：{line.invoiceTypeLabel}
                      {line.summaryLabel ? `（${line.summaryLabel}）` : ''}
                    </p>
                    {(line.invoiceTitle || line.invoiceTaxId) && (
                      <p className="hint">
                        {line.invoiceTitle && <>抬頭：{line.invoiceTitle}</>}
                        {line.invoiceTitle && line.invoiceTaxId && ' · '}
                        {line.invoiceTaxId && <>統編：{line.invoiceTaxId}</>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canManagePricing && pricingLines.length > 0 && (
            <p className="hint schedule-popover__mail-hint">
              郵寄／其他：{formatScheduleMailInvoiceSummary(schedule)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
