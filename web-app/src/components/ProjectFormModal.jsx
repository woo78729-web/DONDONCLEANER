import {
  applyPriceCalculation,
  createPricingLine,
  CUSTOMER_SOURCE_OPTIONS,
  DEFAULT_FIRST_SHIFT_START,
  DEFAULT_SECOND_SHIFT_START,
  getMinScheduleWorkDate,
  patchScheduleForm,
  PROJECT_STATUS_LABELS,
  UNIT_PRICE_OPTIONS,
} from '../utils/scheduleCalendar';
import { TAITUNG_SERVICE_AREAS } from '../utils/taitungAreas';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { GoogleMapsLink } from './GoogleMapsLink';
import './schedule-calendar.css';

function toggleEmployeeSelection(selectedIds, employeeId) {
  const id = String(employeeId);
  const set = new Set(selectedIds.map(String));

  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }

  return [...set];
}

export function emptyProjectForm() {
  return applyPriceCalculation({
    title: '',
    employee_ids: [],
    planned_start_date: '',
    planned_end_date: '',
    start_time: DEFAULT_FIRST_SHIFT_START,
    end_time: '17:00',
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    needs_mail: false,
    mail_same_as_customer: false,
    mail_recipient: '',
    mail_phone: '',
    mail_address: '',
    service_area: '',
    customer_source: 'phone',
    fb_display_name: '',
    line_display_name: '',
    pricing_lines: [createPricingLine()],
    ac_units: '1',
    unit_price: '1500',
    needs_invoice: false,
    cleaning_price: '1500',
    notes: '',
  });
}

export function ProjectFormModal({
  open,
  employees,
  form,
  error = '',
  userRole = 'admin',
  onChange,
  onClose,
  onSubmit,
}) {
  if (!open) {
    return null;
  }

  function handleChange(partial) {
    onChange(applyPriceCalculation(patchScheduleForm(form, partial)));
  }

  return (
    <div className="modal-overlay schedule-form-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-panel--wide schedule-form-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">新增專案派班</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">×</button>
        </div>

        {error && <div className="alert alert-error modal-alert">{error}</div>}

        <form className="form-grid cols-2" onSubmit={onSubmit}>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">專案名稱（選填）</span>
            <input
              className="field-control"
              value={form.title}
              onChange={(event) => handleChange({ title: event.target.value })}
              placeholder="例如：博物館全館清洗"
            />
          </label>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">清洗師傅（可複選）</span>
            <div className="employee-chip-select">
              {employees.map((employee) => {
                const active = form.employee_ids.map(String).includes(String(employee.id));

                return (
                  <button
                    key={employee.id}
                    type="button"
                    className={`option-chip${active ? ' is-active' : ''}`}
                    onClick={() => handleChange({
                      employee_ids: toggleEmployeeSelection(form.employee_ids, employee.id),
                    })}
                  >
                    {employee.name}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="field">
            <span className="field-label">工期開始</span>
            <input
              className="field-control"
              type="date"
              min={getMinScheduleWorkDate(userRole)}
              value={form.planned_start_date}
              onChange={(event) => handleChange({ planned_start_date: event.target.value })}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">工期結束</span>
            <input
              className="field-control"
              type="date"
              min={form.planned_start_date || getMinScheduleWorkDate(userRole)}
              value={form.planned_end_date}
              onChange={(event) => handleChange({ planned_end_date: event.target.value })}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">每日開始時間</span>
            <select
              className="field-control"
              value={form.start_time}
              onChange={(event) => handleChange({ start_time: event.target.value })}
            >
              <option value="09:00">09:00</option>
              <option value="14:00">14:00</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">每日結束時間</span>
            <input
              className="field-control"
              type="time"
              value={form.end_time}
              onChange={(event) => handleChange({ end_time: event.target.value })}
            />
          </label>

          <label className="field">
            <span className="field-label">清洗聯絡人</span>
            <input className="field-control" value={form.customer_name} onChange={(event) => handleChange({ customer_name: event.target.value })} required />
          </label>

          <label className="field">
            <span className="field-label">清洗電話</span>
            <input className="field-control" value={form.customer_phone} onChange={(event) => handleChange({ customer_phone: event.target.value })} required />
          </label>

          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">清洗地址</span>
            <div className="field-action-row">
              <AddressAutocompleteInput
                value={form.customer_address}
                onChange={(address) => handleChange({ customer_address: address })}
                placeholder="請輸入完整地址"
                required
                showFallbackHint={false}
              />
              <GoogleMapsLink address={form.customer_address} />
            </div>
          </label>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">服務區域（台東）</span>
            <div className="option-chip-group">
              {TAITUNG_SERVICE_AREAS.map((area) => (
                <button
                  key={area.value}
                  type="button"
                  className={`option-chip option-chip--area${form.service_area === area.value ? ' is-active' : ''}`}
                  onClick={() => handleChange({ service_area: area.value })}
                >
                  {area.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">清洗項目（專案總台數）</span>
            <div className="pricing-lines">
              {(form.pricing_lines || [createPricingLine()]).map((line, index) => (
                <div key={line.id} className="pricing-line">
                  <span className="pricing-line__label">項目 {index + 1}</span>
                  <label className="field pricing-line__units">
                    <span className="field-label">台數</span>
                    <input
                      className="field-control"
                      type="number"
                      min="1"
                      max="999"
                      value={line.ac_units}
                      onChange={(event) => {
                        const pricingLines = form.pricing_lines.map((item) => (
                          item.id === line.id ? { ...item, ac_units: event.target.value } : item
                        ));
                        handleChange({ pricing_lines: pricingLines });
                      }}
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
                          onClick={() => {
                            const pricingLines = form.pricing_lines.map((item) => (
                              item.id === line.id ? { ...item, unit_price: String(price) } : item
                            ));
                            handleChange({ pricing_lines: pricingLines });
                          }}
                        >
                          <span className="option-chip__amount">{price}</span>
                          <span className="option-chip__unit">元/台</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">專案合計</span>
            <div className="price-summary">
              <strong>共 {form.ac_units} 台，{form.cleaning_price || 0} 元</strong>
            </div>
          </div>

          <label className="field field-checkbox" style={{ gridColumn: '1 / -1' }}>
            <input type="checkbox" checked={Boolean(form.needs_invoice)} onChange={(event) => handleChange({ needs_invoice: event.target.checked })} />
            <span>是否開發票（統編，加 5%）</span>
          </label>

          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">備註</span>
            <textarea className="field-control" rows={2} value={form.notes} onChange={(event) => handleChange({ notes: event.target.value })} />
          </label>

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary btn-pill">建立專案並排班</button>
            <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProjectStatusBadge({ status }) {
  const label = PROJECT_STATUS_LABELS[status] || status;

  return (
    <span className={`project-status-badge project-status-badge--${status || 'in_progress'}`}>
      {label}
    </span>
  );
}
