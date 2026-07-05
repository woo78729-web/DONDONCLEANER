import { useLayoutEffect, useState } from 'react';
import { GoogleMapsLink } from './GoogleMapsLink';
import { PhoneLink } from './PhoneLink';
import {
  canModifyScheduleByMonth,
  formatScheduleAcUnits,
  formatScheduleDateLabel,
  formatScheduleDisplayTimeRange,
  formatScheduleMailInvoiceSummary,
  formatScheduleTotalPrice,
  getScheduleBlockColor,
} from '../utils/scheduleCalendar';
import { canManageSchedulePricing } from '../utils/permissions';
import { computeSchedulePopoverStyle } from '../utils/schedulePopover';

export function ScheduleSnapshotModal({
  open,
  schedule,
  anchor = null,
  onClose,
  onEdit,
  onDelete,
  showActions = true,
  userRole = 'admin',
}) {
  const [popoverStyle, setPopoverStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !schedule) {
      setPopoverStyle(null);
      return undefined;
    }

    function updatePosition() {
      setPopoverStyle(computeSchedulePopoverStyle(anchor));
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, schedule, anchor]);

  if (!open || !schedule) {
    return null;
  }

  const blockColor = getScheduleBlockColor(schedule);
  const canModify = showActions && !schedule.daily_report && canModifyScheduleByMonth(schedule, userRole);
  const canManagePricing = canManageSchedulePricing(userRole);
  const isAnchored = Boolean(anchor && popoverStyle);
  const dateTimeLabel = [
    formatScheduleDateLabel(schedule.work_date),
    formatScheduleDisplayTimeRange(schedule),
  ].filter(Boolean).join(' · ');

  return (
    <div
      className={`modal-overlay schedule-popover-overlay${isAnchored ? ' schedule-popover-overlay--anchored' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`schedule-popover${isAnchored ? ' schedule-popover--anchored' : ''}`}
        style={isAnchored ? popoverStyle : undefined}
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
            <li>
              <span className="schedule-popover__label">清洗師傅</span>
              <span className="schedule-popover__value">{schedule.user?.name || '未指定'}</span>
            </li>
            <li>
              <span className="schedule-popover__label">清洗台數</span>
              <span className="schedule-popover__value">{formatScheduleAcUnits(schedule)}</span>
            </li>
            {canManagePricing && (
            <li>
              <span className="schedule-popover__label">總金額</span>
              <span className="schedule-popover__value">{formatScheduleTotalPrice(schedule)}</span>
            </li>
            )}
            <li>
              <span className="schedule-popover__label">備註</span>
              <span className="schedule-popover__value">{schedule.notes?.trim() || '-'}</span>
            </li>
            <li>
              <span className="schedule-popover__label">郵寄／統編</span>
              <span className="schedule-popover__value">{formatScheduleMailInvoiceSummary(schedule)}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
