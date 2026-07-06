import { createPricingLine, UNIT_PRICE_OPTIONS } from '../utils/scheduleCalendar';
import './schedule-calendar.css';

export function PricingLineEditor({
  lines,
  onChange,
  showTax = true,
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

  return (
    <div className={`pricing-lines-editor ${className}`.trim()}>
      {showAdd && (
        <div className="pricing-lines__header">
          <span className="field-label">清洗項目（可分段加總台數與單價）</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-pill"
            onClick={() => onChange([...safeLines, createPricingLine()])}
          >
            ＋ 新增項目
          </button>
        </div>
      )}

      <div className="pricing-lines">
        {safeLines.map((line, index) => (
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
            {showTax && (
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
        ))}
      </div>
    </div>
  );
}
