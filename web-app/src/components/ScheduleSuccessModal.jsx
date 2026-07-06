import { useCallback, useEffect, useRef, useState } from 'react';
import { captureElementAsPng } from '../utils/captureElement';
import {
  buildScheduleSuccessScreenshotName,
  formatScheduleAcUnits,
  formatScheduleSuccessDateTime,
  formatScheduleTotalPrice,
} from '../utils/scheduleCalendar';
import './schedule-calendar.css';

export function ScheduleSuccessModal({ open, summary, onConfirm }) {
  const modalRef = useRef(null);
  const [screenshotHint, setScreenshotHint] = useState('');
  const [capturing, setCapturing] = useState(false);

  const captureScreenshot = useCallback(async () => {
    if (!summary || !modalRef.current) {
      return false;
    }

    setCapturing(true);

    try {
      const success = await captureElementAsPng(modalRef.current, {
        filename: buildScheduleSuccessScreenshotName(summary),
      });
      setScreenshotHint(success ? '已自動下載截圖，可直接傳給客戶' : '截圖失敗，請再試一次');
      return success;
    } catch {
      setScreenshotHint('截圖失敗，請再試一次');
      return false;
    } finally {
      setCapturing(false);
    }
  }, [summary]);

  useEffect(() => {
    if (!open) {
      setScreenshotHint('');
      return undefined;
    }

    if (!summary) {
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled || !modalRef.current) {
        return;
      }

      setCapturing(true);

      try {
        const success = await captureElementAsPng(modalRef.current, {
          filename: buildScheduleSuccessScreenshotName(summary),
        });

        if (!cancelled) {
          setScreenshotHint(success ? '已自動下載截圖，可直接傳給客戶' : '截圖失敗，請再試一次');
        }
      } catch {
        if (!cancelled) {
          setScreenshotHint('截圖失敗，請再試一次');
        }
      } finally {
        if (!cancelled) {
          setCapturing(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, summary]);

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
        ref={modalRef}
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
          <div className="schedule-success-modal__row">
            <dt>客戶電話</dt>
            <dd>{summary.customer_phone || '-'}</dd>
          </div>
          <div className="schedule-success-modal__row">
            <dt>清洗台數</dt>
            <dd>{formatScheduleAcUnits(summary)}</dd>
          </div>
          <div className="schedule-success-modal__row">
            <dt>金額</dt>
            <dd>{formatScheduleTotalPrice(summary)}</dd>
          </div>
        </dl>

        {screenshotHint ? (
          <p className="schedule-success-modal__hint">{screenshotHint}</p>
        ) : null}

        <div className="schedule-success-modal__actions">
          <button
            type="button"
            className="btn btn-secondary btn-pill schedule-success-modal__download"
            disabled={capturing}
            onClick={() => captureScreenshot()}
          >
            {capturing ? '截圖中...' : '再次下載截圖'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-pill schedule-success-modal__action"
            onClick={onConfirm}
          >
            確認
          </button>
        </div>
      </div>
    </div>
  );
}
