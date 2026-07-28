import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { canAccess } from '../utils/permissions';
import {
  filterActiveRemittanceAlerts,
  snoozeRemittanceAlertsLocally,
} from '../utils/remittanceAlertSnooze';
import { RemittanceAlertModal } from './RemittanceAlertModal';

export function RemittanceAlertHost() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const hasAutoOpenedRef = useRef(false);
  const canTrackRemittance = user ? canAccess(user, 'remittance.track') : false;

  const applyAlerts = useCallback((items) => {
    const activeItems = filterActiveRemittanceAlerts(items);

    setAlerts(activeItems);

    if (!activeItems.length) {
      setOpen(false);
      hasAutoOpenedRef.current = false;
      return;
    }

    if (!hasAutoOpenedRef.current) {
      setOpen(true);
      hasAutoOpenedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!canTrackRemittance) {
      setAlerts([]);
      setOpen(false);
      hasAutoOpenedRef.current = false;
      return undefined;
    }

    let cancelled = false;
    let idleId = null;
    let timeoutId = null;

    function loadRemittanceAlerts() {
      api.getRemittanceAlerts()
        .then((result) => {
          if (cancelled) {
            return;
          }

          applyAlerts(result.data?.items || []);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setAlerts([]);
          setOpen(false);
        });
    }

    // Defer until after first paint so login/home is not blocked by remittance heal.
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(loadRemittanceAlerts, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(loadRemittanceAlerts, 800);
    }

    window.addEventListener('ac:remittance-alerts-refresh', loadRemittanceAlerts);

    return () => {
      cancelled = true;
      if (idleId != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener('ac:remittance-alerts-refresh', loadRemittanceAlerts);
    };
  }, [applyAlerts, canTrackRemittance]);

  async function handleClose() {
    if (!alerts.length) {
      setOpen(false);
      return;
    }

    const remittanceIds = alerts.map((item) => item.id);

    setDismissing(true);
    snoozeRemittanceAlertsLocally(remittanceIds);
    setAlerts([]);
    setOpen(false);
    hasAutoOpenedRef.current = false;

    try {
      await api.dismissRemittanceAlerts(remittanceIds);
    } catch {
      await Promise.all(
        remittanceIds.map((id) => api.remindRemittance(id).catch(() => null)),
      );
    } finally {
      setDismissing(false);
    }
  }

  return (
    <RemittanceAlertModal
      open={open}
      items={alerts}
      onClose={handleClose}
      dismissing={dismissing}
    />
  );
}
