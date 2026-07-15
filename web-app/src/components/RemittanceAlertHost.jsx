import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { canAccess } from '../utils/permissions';
import { RemittanceAlertModal } from './RemittanceAlertModal';

export function RemittanceAlertHost() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const autoOpenedRef = useRef(false);
  const canTrackRemittance = user ? canAccess(user, 'remittance.track') : false;

  useEffect(() => {
    if (!canTrackRemittance) {
      setAlerts([]);
      setOpen(false);
      autoOpenedRef.current = false;
      return undefined;
    }

    let cancelled = false;

    function loadRemittanceAlerts() {
      api.getRemittanceAlerts()
        .then((result) => {
          if (cancelled) {
            return;
          }

          const items = result.data?.items || [];
          setAlerts(items);

          if (!items.length) {
            setOpen(false);
            autoOpenedRef.current = false;
            return;
          }

          if (!autoOpenedRef.current) {
            setOpen(true);
            autoOpenedRef.current = true;
          }
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setAlerts([]);
          setOpen(false);
        });
    }

    loadRemittanceAlerts();
    window.addEventListener('ac:remittance-alerts-refresh', loadRemittanceAlerts);

    return () => {
      cancelled = true;
      window.removeEventListener('ac:remittance-alerts-refresh', loadRemittanceAlerts);
    };
  }, [canTrackRemittance]);

  async function handleClose() {
    if (!alerts.length) {
      setOpen(false);
      return;
    }

    setDismissing(true);

    try {
      await api.dismissRemittanceAlerts(alerts.map((item) => item.id));
      setAlerts([]);
      setOpen(false);
      autoOpenedRef.current = false;
    } catch {
      setOpen(false);
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
