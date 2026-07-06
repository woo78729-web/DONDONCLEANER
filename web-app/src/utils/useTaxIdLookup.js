import { useEffect, useRef, useState } from 'react';
import { lookupCompanyByTaxId } from './taxIdLookup';

export function useTaxIdLookup(taxId, onTitleResolved) {
  const [status, setStatus] = useState('');
  const lastLookedUpRef = useRef('');
  const abortRef = useRef(null);
  const onTitleResolvedRef = useRef(onTitleResolved);

  onTitleResolvedRef.current = onTitleResolved;

  useEffect(() => {
    const normalized = String(taxId || '').trim();

    if (!/^\d{8}$/.test(normalized)) {
      setStatus('');
      lastLookedUpRef.current = '';
      return undefined;
    }

    if (normalized === lastLookedUpRef.current) {
      return undefined;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    lastLookedUpRef.current = normalized;

    lookupCompanyByTaxId(normalized, controller.signal)
      .then((companyName) => {
        if (controller.signal.aborted) {
          return;
        }

        onTitleResolvedRef.current(companyName || '');
        setStatus(companyName ? '' : 'not_found');
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        onTitleResolvedRef.current('');
        setStatus('not_found');
      });

    return () => controller.abort();
  }, [taxId]);

  return status;
}

export function normalizeTaxIdInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}
