import { useTaxIdLookup, normalizeTaxIdInput } from '../utils/useTaxIdLookup';

export function InvoiceTaxIdFields({ invoiceTitle, invoiceTaxId, onChange }) {
  const lookupStatus = useTaxIdLookup(invoiceTaxId, (title) => {
    onChange({ invoice_title: title });
  });

  function handleTaxIdChange(event) {
    onChange({ invoice_tax_id: normalizeTaxIdInput(event.target.value) });
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
