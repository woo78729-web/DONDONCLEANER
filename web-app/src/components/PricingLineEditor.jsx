import {
  clonePricingLineInvoiceSettings,
  createPricingLine,
  INVOICE_TYPE_DUPLICATE,
  INVOICE_TYPE_NONE,
  INVOICE_TYPE_OPTIONS,
  INVOICE_TYPE_TRIPLICATE,
  UNIT_PRICE_OPTIONS,
} from '../utils/scheduleCalendar';
import { normalizeTaxIdInput, useTaxIdLookup } from '../utils/useTaxIdLookup';
import './schedule-calendar.css';

function PricingLineTriplicateFields({ line, onUpdate }) {
  const lookupStatus = useTaxIdLookup(line.invoice_tax_id, (title) => {
    onUpdate({ invoice_title: title });
  });

  return (
    <div className="pricing-line__invoice-triplicate">
      <label className="field">
        <span className="field-label">發票抬頭</span>
        <input
          className="field-control"
          value={line.invoice_title || ''}
          onChange={(event) => onUpdate({ invoice_title: event.target.value })}
          required
        />
      </label>
      <label className="field">
        <span className="field-label">統一編號</span>
        <input
          className="field-control"
          value={line.invoice_tax_id || ''}
          onChange={(event) => onUpdate({ invoice_tax_id: normalizeTaxIdInput(event.target.value) })}
          inputMode="numeric"
          pattern="\d{8}"
          maxLength={8}
          required
        />
      </label>
      {lookupStatus === 'loading' && (
        <p className="hint pricing-line__invoice-lookup">查詢中...</p>
      )}
      {lookupStatus === 'not_found' && (
        <p className="hint pricing-line__invoice-lookup">查無此公司，請手動填寫抬頭</p>
      )}
    </div>
  );
}

export function PricingLineEditor({
  lines,
  onChange,
  showTax = true,
  showInvoice = false,
  showAdd = false,
  showRemove = true,
  maxUnits = 99,
  className = '',
}) {
  const safeLines = Array.isArray(lines) && lines.length > 0 ? lines : [createPricingLine()];

  function updateLine(lineId, changes) {
    onChange(safeLines.map((line) => (
      line.id === lineId ? { ...line, ...changes } : line
    )));
  }

  function removeLine(lineId) {
    onChange(safeLines.filter((line) => line.id !== lineId));
  }

  function updateInvoiceType(line, invoiceType) {
    updateLine(line.id, {
      invoice_type: invoiceType,
      charge_customer_tax: invoiceType !== INVOICE_TYPE_NONE,
      invoice_title: invoiceType === INVOICE_TYPE_TRIPLICATE ? (line.invoice_title || '') : '',
      invoice_tax_id: invoiceType === INVOICE_TYPE_TRIPLICATE ? (line.invoice_tax_id || '') : '',
      is_taxable: invoiceType !== INVOICE_TYPE_NONE,
    });
  }

  function addLine() {
    const previous = safeLines[safeLines.length - 1];
    const inherited = previous ? clonePricingLineInvoiceSettings(previous) : {};

    onChange([...safeLines, createPricingLine(inherited)]);
  }

  function applyInvoiceToAll(sourceLine) {
    const settings = clonePricingLineInvoiceSettings(sourceLine);

    onChange(safeLines.map((line) => ({
      ...line,
      ...settings,
    })));
  }

  return (
    <div className={`pricing-lines-editor ${className}`.trim()}>
      {showAdd && (
        <div className="pricing-lines__header">
          <span className="field-label">清洗項目（可分段加總台數與單價）</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-pill"
            onClick={addLine}
          >
            ＋ 新增項目
          </button>
        </div>
      )}

      <div className="pricing-lines">
        {safeLines.map((line, index) => {
          const invoiceType = line.invoice_type || INVOICE_TYPE_NONE;
          const showCustomerTax = invoiceType === INVOICE_TYPE_DUPLICATE
            || invoiceType === INVOICE_TYPE_TRIPLICATE;

          return (
            <div key={line.id} className="pricing-line">
              <span className="pricing-line__label">項目 {index + 1}</span>
              <label className="field pricing-line__units">
                <span className="field-label">台數</span>
                <input
                  className="field-control"
                  type="number"
                  min="1"
                  max={maxUnits}
                  value={line.ac_units}
                  onChange={(event) => updateLine(line.id, { ac_units: event.target.value })}
                  required
                />
              </label>
              <div className="field pricing-line__price">
                <span className="field-label">單價</span>
                <div className="option-chip-group option-chip-group--price option-chip-group--price-inline">
                  {UNIT_PRICE_OPTIONS.map((price) => (
                    <button
                      key={price}
                      type="button"
                      className={`option-chip option-chip--price${String(line.unit_price) === String(price) ? ' is-active' : ''}`}
                      onClick={() => updateLine(line.id, { unit_price: String(price) })}
                    >
                      <span className="option-chip__amount">{price}</span>
                      <span className="option-chip__unit">元/台</span>
                    </button>
                  ))}
                </div>
              </div>

              {showInvoice && (
                <div className="field pricing-line__invoice">
                  <span className="field-label">發票類型</span>
                  <div className="option-chip-group" role="radiogroup" aria-label={`項目 ${index + 1} 發票類型`}>
                    {INVOICE_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={invoiceType === option.value}
                        className={`option-chip${invoiceType === option.value ? ' is-active' : ''}`}
                        onClick={() => updateInvoiceType(line, option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {invoiceType === INVOICE_TYPE_TRIPLICATE && (
                    <PricingLineTriplicateFields
                      line={line}
                      onUpdate={(changes) => updateLine(line.id, changes)}
                    />
                  )}

                  {showCustomerTax && (
                    <label className="field field-checkbox pricing-line__tax">
                      <input
                        type="checkbox"
                        checked={line.charge_customer_tax !== false}
                        onChange={(event) => updateLine(line.id, {
                          charge_customer_tax: event.target.checked,
                          is_taxable: event.target.checked,
                        })}
                      />
                      <span>向客戶加收 5% 稅金</span>
                    </label>
                  )}

                  {safeLines.length > 1 && (
                    <button
                      type="button"
                      className="pricing-line__invoice-sync"
                      onClick={() => applyInvoiceToAll(line)}
                    >
                      套用發票設定至所有項目
                    </button>
                  )}
                </div>
              )}

              {showTax && !showInvoice && (
                <label className="field field-checkbox pricing-line__tax">
                  <input
                    type="checkbox"
                    checked={Boolean(line.is_taxable)}
                    onChange={(event) => updateLine(line.id, { is_taxable: event.target.checked })}
                  />
                  <span>含稅 +5%</span>
                </label>
              )}

              {showRemove && safeLines.length > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-pill pricing-line__remove"
                  onClick={() => removeLine(line.id)}
                >
                  移除
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
