import { useEffect, useRef, useState } from 'react';
import { lookupCompanyByTaxId } from '../utils/taxIdLookup';

export function InvoiceTaxIdFields({ invoiceTitle, invoiceTaxId, onChange }) {
  const [lookupStatus, setLookupStatus] = useState('');
  const lastLookedUpRef = useRef('');
  const abortRef = useRef(null);
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  useEffect(() => {
    const taxId = String(invoiceTaxId || '').trim();

    if (!/^\d{8}$/.test(taxId)) {
      setLookupStatus('');
      lastLookedUpRef.current = '';
      return undefined;
    }

    if (taxId === lastLookedUpRef.current) {
      return undefined;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLookupStatus('loading');
    lastLookedUpRef.current = taxId;

    lookupCompanyByTaxId(taxId, controller.signal)
      .then((companyName) => {
        if (controller.signal.aborted) {
          return;
        }

        if (companyName) {
          onChangeRef.current({ invoice_title: companyName });
          setLookupStatus('');
          return;
        }

        onChangeRef.current({ invoice_title: '' });
        setLookupStatus('not_found');
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        onChangeRef.current({ invoice_title: '' });
        setLookupStatus('not_found');
      });

    return () => controller.abort();
  }, [invoiceTaxId]);

  function handleTaxIdChange(event) {
    const value = event.target.value.replace(/\D/g, '').slice(0, 8);
    onChange({ invoice_tax_id: value });
  }

  return (
    <>
      <p className="hint" style={{ marginBottom: 10 }}>
        二聯式可不填；三聯式請填統編，抬頭會自動帶入或手動輸入。
      </p>
      <div className="form-grid cols-2">
        <label className="field">
          <span className="field-label">發票抬頭（選填）</span>
          <input
            className="field-control"
            value={invoiceTitle || ''}
            onChange={(event) => onChange({ invoice_title: event.target.value })}
            placeholder="三聯式才需填寫"
          />
        </label>

        <label className="field">
          <span className="field-label">統一編號（選填）</span>
          <input
            className="field-control"
            value={invoiceTaxId || ''}
            onChange={handleTaxIdChange}
            placeholder="三聯式才需填寫"
            inputMode="numeric"
            maxLength={8}
          />
        </label>
      </div>

      {lookupStatus === 'loading' && (
        <p className="hint" style={{ marginTop: 8 }}>查詢中...</p>
      )}
      {lookupStatus === 'not_found' && (
        <p className="hint" style={{ marginTop: 8 }}>查無此公司</p>
      )}
    </>
  );
}
