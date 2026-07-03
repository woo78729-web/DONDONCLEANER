import { formatScheduleSuccessDateTime } from '../utils/scheduleCalendar';
import './schedule-calendar.css';

export function ScheduleSuccessModal({ open, summary, onConfirm }) {
  if (!open || !summary) {
    return null;
  }

  const isUpdate = summary.mode === 'update';

  return (
    <div
      className="modal-overlay schedule-success-overlay"
      role="presentation"
      onClick={onConfirm}
    >
      <div
        className="schedule-success-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-success-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="schedule-success-modal__icon" aria-hidden="true">✓</div>
        <h3 id="schedule-success-title" className="schedule-success-modal__title">
          {isUpdate ? '班表已更新' : '預約完成'}
        </h3>

        <dl className="schedule-success-modal__list">
          <div className="schedule-success-modal__row">
            <dt>清洗時間</dt>
            <dd>{formatScheduleSuccessDateTime(summary)}</dd>
          </div>
          <div className="schedule-success-modal__row">
            <dt>清洗人</dt>
            <dd>{summary.employee_name || '未指定'}</dd>
          </div>
          <div className="schedule-success-modal__row">
            <dt>清洗地址</dt>
            <dd>{summary.customer_address || '-'}</dd>
          </div>
        </dl>

        <button
          type="button"
          className="btn btn-primary btn-pill schedule-success-modal__action"
          onClick={onConfirm}
        >
          確認
        </button>
      </div>
    </div>
  );
}
