import { Link } from 'react-router-dom';
import { PricingLineEditor } from './PricingLineEditor';
import {
  applyPriceCalculation,
  createPricingLine,
  CUSTOMER_SOURCE_OPTIONS,
  DEFAULT_FIRST_SHIFT_START,
  getFormContactId,
  getMinScheduleWorkDate,
  patchFormContactId,
  patchScheduleForm,
  PROJECT_STATUS_LABELS,
  resolveMailContactFields,
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
    needs_receipt: false,
    expects_company_remittance: false,
    invoice_tax_id: '',
    invoice_title: '',
    invoice_charge_customer_tax: false,
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

  function toggleNeedsMail(checked) {
    if (!checked) {
      handleChange({
        needs_mail: false,
        mail_same_as_customer: false,
        mail_recipient: '',
        mail_phone: '',
        mail_address: '',
      });
      return;
    }

    const contact = resolveMailContactFields(form);

    handleChange({
      needs_mail: true,
      mail_same_as_customer: true,
      mail_phone: contact.phone,
      mail_address: contact.address,
    });
  }

  function toggleMailSameAsCustomer(checked) {
    if (checked) {
      const contact = resolveMailContactFields(form);
      handleChange({
        mail_same_as_customer: true,
        mail_phone: contact.phone,
        mail_address: contact.address,
      });
      return;
    }

    handleChange({ mail_same_as_customer: false });
  }

  const contactIdLabel = form.customer_source === 'line'
    ? 'LINE ID'
    : form.customer_source === 'fb'
      ? 'FB ID'
      : '聯絡人 ID';

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

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">客戶來源</span>
            <div className="option-chip-group" role="radiogroup" aria-label="客戶來源">
              {CUSTOMER_SOURCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={form.customer_source === option.value}
                  className={`option-chip option-chip--source${form.customer_source === option.value ? ' is-active' : ''}`}
                  style={{ '--chip-color': option.color }}
                  onClick={() => handleChange({ customer_source: option.value })}
                >
                  <span className="option-chip__dot" />
                  {option.label}
                </button>
              ))}
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
            <span className="field-label">{contactIdLabel}</span>
            <input
              className="field-control"
              value={getFormContactId(form)}
              onChange={(event) => handleChange(patchFormContactId(form, event.target.value))}
              required
              placeholder={form.customer_source === 'phone' ? '客戶姓名或代稱' : '請填寫社群 ID'}
            />
          </label>

          <label className="field">
            <span className="field-label">清洗電話</span>
            <input className="field-control" value={form.customer_phone} onChange={(event) => handleChange({ customer_phone: event.target.value })} required />
          </label>

          <label className="field service-address-row__address-field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">清洗地址</span>
            <AddressAutocompleteInput
              value={form.customer_address}
              onChange={(address) => handleChange({ customer_address: address })}
              placeholder="請輸入完整地址"
              required
              showFallbackHint={false}
            />
            <GoogleMapsLink
              address={form.customer_address}
              className="btn btn-secondary btn-sm map-link-btn service-address-row__map-link"
            />
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
            <PricingLineEditor
              lines={form.pricing_lines || [createPricingLine()]}
              onChange={(pricing_lines) => handleChange({ pricing_lines })}
              showInvoice
              showTax={false}
              showAdd
              maxUnits={9999}
            />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">專案合計</span>
            <div className="price-summary">
              <div>共 {form.ac_units} 台</div>
              <div>
                客戶應付總尾款：<strong>{form.cleaning_price || 0} 元</strong>
              </div>
              {Number(form.hongyi_fee) > 0 && (
                <div className="price-summary__hongyi">
                  撥給宏逸金流：<strong>{form.hongyi_fee} 元</strong>
                  <span className="hint">（代墊發票稅 8%，與是否向客戶加收 5% 無關）</span>
                </div>
              )}
            </div>
          </div>

          <div className="form-options-row" style={{ gridColumn: '1 / -1' }}>
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.needs_mail)}
                onChange={(event) => toggleNeedsMail(event.target.checked)}
              />
              <span>郵寄</span>
            </label>

            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.needs_receipt)}
                onChange={(event) => handleChange({ needs_receipt: event.target.checked })}
              />
              <span>收據</span>
            </label>

            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.expects_company_remittance)}
                onChange={(event) => handleChange({ expects_company_remittance: event.target.checked })}
              />
              <span>客戶報帳匯款</span>
            </label>
          </div>

          {form.expects_company_remittance && (
            <p className="hint" style={{ gridColumn: '1 / -1' }}>
              建立專案後將導向
              {' '}
              <Link to="/admin/remittance-tracking">匯款追查</Link>
              ，員工回報時請勾選「客戶已匯款至公司帳戶」。
            </p>
          )}

          {form.needs_mail && (
            <div className="form-section" style={{ gridColumn: '1 / -1' }}>
              <div className="form-section__body">
                <label className="field field-checkbox field-checkbox--sub">
                  <input
                    type="checkbox"
                    checked={Boolean(form.mail_same_as_customer)}
                    onChange={(event) => toggleMailSameAsCustomer(event.target.checked)}
                  />
                  <span>同清洗電話、地址</span>
                </label>

                <div className="form-grid cols-2">
                  <label className="field">
                    <span className="field-label">寄信聯絡人</span>
                    <input
                      className="field-control"
                      value={form.mail_recipient}
                      onChange={(event) => handleChange({ mail_recipient: event.target.value })}
                      placeholder="收件人姓名"
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">寄信電話</span>
                    <input
                      className="field-control"
                      value={form.mail_phone}
                      onChange={(event) => handleChange({ mail_phone: event.target.value, mail_same_as_customer: false })}
                      disabled={form.mail_same_as_customer}
                      placeholder="聯絡電話"
                    />
                  </label>

                  <label className="field" style={{ gridColumn: '1 / -1' }}>
                    <span className="field-label">寄信地址</span>
                    <input
                      className="field-control"
                      value={form.mail_address}
                      onChange={(event) => handleChange({ mail_address: event.target.value, mail_same_as_customer: false })}
                      disabled={form.mail_same_as_customer}
                      placeholder="寄送地址"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

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
