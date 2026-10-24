import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downloadSuccessCardJpg } from '../utils/captureElement';
import {
  buildScheduleSuccessScreenshotName,
  buildScheduleSuccessScreenshotRows,
} from '../utils/scheduleCalendar';
import './schedule-calendar.css';

export function ScheduleSuccessModal({ open, summary, onConfirm }) {
  const modalRef = useRef(null);
  const downloadButtonRef = useRef(null);
  const captureTokenRef = useRef(0);
  const [screenshotHint, setScreenshotHint] = useState('');
  const [capturing, setCapturing] = useState(false);
  const title = '預約完成';

  const rows = useMemo(
    () => (summary ? buildScheduleSuccessScreenshotRows(summary) : []),
    [summary],
  );

  const captureScreenshot = useCallback(async ({ silent = false } = {}) => {
    if (!summary) {
      return false;
    }

    setCapturing(true);

    try {
      const success = await downloadSuccessCardJpg({
        filename: buildScheduleSuccessScreenshotName(summary),
        rows,
        title,
      });

      if (!silent || success) {
        setScreenshotHint(success
          ? '已自動下載截圖，可直接傳給客戶'
          : '無法自動下載，請再按一次「再次下載截圖」');
      }

      return success;
    } catch {
      setScreenshotHint('無法自動下載，請再按一次「再次下載截圖」');
      return false;
    } finally {
      setCapturing(false);
    }
  }, [rows, summary, title]);

  useEffect(() => {
    if (!open) {
      setScreenshotHint('');
      captureTokenRef.current += 1;
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !summary) {
      return undefined;
    }

    const token = captureTokenRef.current + 1;
    captureTokenRef.current = token;
    let cancelled = false;

    const run = async () => {
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      });

      if (cancelled || captureTokenRef.current !== token) {
        return;
      }

      const success = await captureScreenshot({ silent: true });

      if (!cancelled && !success) {
        downloadButtonRef.current?.focus?.();
      }
    };

    const timer = window.setTimeout(run, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, summary, captureScreenshot]);

  if (!open || !summary) {
    return null;
  }

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
          {title}
        </h3>

        <dl className="schedule-success-modal__list">
          {rows.map((row) => (
            <div
              key={row.label}
              className={`schedule-success-modal__row${row.emphasis ? ' schedule-success-modal__row--emphasis' : ''}`}
            >
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        {screenshotHint ? (
          <p className="schedule-success-modal__hint">{screenshotHint}</p>
        ) : null}

        <div className="schedule-success-modal__actions">
          <button
            ref={downloadButtonRef}
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
