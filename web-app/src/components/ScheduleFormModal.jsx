import {
  applyPriceCalculation,
  createPricingLine,
  DEFAULT_FIRST_SHIFT_START,
  DEFAULT_SECOND_SHIFT_START,
  getMinScheduleWorkDate,
  patchScheduleForm,
  CUSTOMER_SOURCE_OPTIONS,
  SCHEDULE_TIME_OPTIONS,
  UNIT_PRICE_OPTIONS,
} from '../utils/scheduleCalendar';
import { TAITUNG_SERVICE_AREAS } from '../utils/taitungAreas';
import { Link } from 'react-router-dom';
import { GoogleMapsLink } from './GoogleMapsLink';
import { CustomerWashHistory } from './CustomerWashHistory';
import { EmployeeDayScheduleSidebar } from './EmployeeDayScheduleSidebar';
import './schedule-calendar.css';

function updateForm(onChange, form, partial) {
  onChange(applyPriceCalculation(patchScheduleForm(form, partial)));
}

function updatePricingLine(onChange, form, lineId, partial) {
  const pricingLines = (form.pricing_lines || [createPricingLine()]).map((line) => (
    line.id === lineId ? { ...line, ...partial } : line
  ));

  updateForm(onChange, form, { pricing_lines: pricingLines });
}

export function ScheduleFormModal({
  open,
  title,
  form,
  employees,
  editId,
  canDelete = false,
  error = '',
  userRole = 'admin',
  allSchedules = [],
  leaves = [],
  onChange,
  onClose,
  onSubmit,
  onDelete,
}) {
  if (!open) {
    return null;
  }

  function handleChange(partial) {
    onChange(applyPriceCalculation(patchScheduleForm(form, partial)));
  }

  function applyHistory(schedule) {
    handleChange({
      customer_name: schedule.customer_name || form.customer_name,
      customer_phone: schedule.customer_phone || form.customer_phone,
      customer_address: schedule.customer_address || form.customer_address,
      service_area: schedule.service_area || form.service_area,
      customer_source: schedule.customer_source || form.customer_source,
    });
  }

  function toggleNeedsMail(checked) {
    if (!checked) {
      onChange(patchScheduleForm(form, {
        needs_mail: false,
        mail_same_as_customer: false,
        mail_recipient: '',
        mail_phone: '',
        mail_address: '',
      }));
      return;
    }

    onChange(patchScheduleForm(form, {
      needs_mail: true,
      mail_same_as_customer: true,
      mail_recipient: form.customer_name,
      mail_phone: form.customer_phone,
      mail_address: form.customer_address,
    }));
  }

  function toggleMailSameAsCustomer(checked) {
    if (checked) {
      onChange(patchScheduleForm(form, {
        mail_same_as_customer: true,
        mail_recipient: form.customer_name,
        mail_phone: form.customer_phone,
        mail_address: form.customer_address,
      }));
      return;
    }

    onChange(patchScheduleForm(form, { mail_same_as_customer: false }));
  }

  const showDaySchedule = Boolean(form.user_id && form.work_date);
  const dayScheduleSidebarProps = {
    employeeId: form.user_id,
    workDate: form.work_date,
    employees,
    schedules: allSchedules,
    leaves,
    highlightScheduleId: editId,
  };

  return (
    <div className="modal-overlay schedule-form-overlay" role="presentation" onClick={onClose}>
      <div
        className={`modal-panel modal-panel--wide schedule-form-modal${showDaySchedule ? ' schedule-form-modal--with-sidebar' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">×</button>
        </div>

        {error && <div className="alert alert-error modal-alert">{error}</div>}

        {editId && (
          <div className="alert alert-warning modal-alert">
            可在此調整清洗師傅；若遇突發狀況可臨時改派其他師傅。
          </div>
        )}

        <div className={`schedule-form-modal__layout${showDaySchedule ? ' schedule-form-modal__layout--with-sidebar' : ''}`}>
          {showDaySchedule && (
            <div className="schedule-form-modal__sidebar schedule-form-modal__sidebar--desktop">
              <EmployeeDayScheduleSidebar {...dayScheduleSidebarProps} />
            </div>
          )}

          <div className="schedule-form-modal__main">
        <form className="form-grid cols-2" onSubmit={onSubmit}>
          {!editId && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="field-label">派單類型</span>
              <div className="option-chip-group">
                <button type="button" className="option-chip is-active">一般派單</button>
                <Link className="option-chip" to="/admin/projects?new=1" onClick={onClose}>專案派單</Link>
              </div>
            </div>
          )}

          <label className="field schedule-form-modal__date-field">
            <span className="field-label">預約日期</span>
            <input
              className="field-control"
              type="date"
              value={form.work_date}
              min={getMinScheduleWorkDate(userRole)}
              onChange={(e) => handleChange({ work_date: e.target.value })}
              required
            />
          </label>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">{editId ? '調整清洗師傅' : '清洗師傅'}</span>
            <div className="employee-chip-select">
              {employees.map((employee) => {
                const active = String(form.user_id) === String(employee.id);

                return (
                  <button
                    key={employee.id}
                    type="button"
                    className={`option-chip${active ? ' is-active' : ''}${editId ? ' option-chip--highlight' : ''}`}
                    onClick={() => handleChange({ user_id: String(employee.id) })}
                  >
                    {employee.name}
                  </button>
                );
              })}
            </div>
          </div>

          {showDaySchedule && (
            <div className="schedule-form-modal__sidebar schedule-form-modal__sidebar--mobile">
              <EmployeeDayScheduleSidebar {...dayScheduleSidebarProps} />
            </div>
          )}

          <label className="field">
            <span className="field-label">預約開始時間</span>
            <div className="shift-preset-row">
              <button
                type="button"
                className={`btn btn-secondary btn-sm btn-pill${form.start_time === DEFAULT_FIRST_SHIFT_START ? ' is-active' : ''}`}
                onClick={() => updateForm(onChange, form, { start_time: DEFAULT_FIRST_SHIFT_START })}
              >
                第一班 9:00
              </button>
              <button
                type="button"
                className={`btn btn-secondary btn-sm btn-pill${form.start_time === DEFAULT_SECOND_SHIFT_START ? ' is-active' : ''}`}
                onClick={() => updateForm(onChange, form, { start_time: DEFAULT_SECOND_SHIFT_START })}
              >
                第二班 14:00
              </button>
            </div>
            <select className="field-control" value={form.start_time} onChange={(e) => updateForm(onChange, form, { start_time: e.target.value })} required>
              {SCHEDULE_TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">預約結束時間</span>
            <select className="field-control" value={form.end_time} onChange={(e) => onChange(patchScheduleForm(form, { end_time: e.target.value }))} required>
              {SCHEDULE_TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
            <span className="hint">依台數自動估算（每台約 1 小時），仍可手動調整</span>
          </label>

          <div className="field schedule-form-modal__pricing-section" style={{ gridColumn: '1 / -1' }}>
            <div className="pricing-lines__header">
              <span className="field-label">清洗項目（可分段加總台數與單價）</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-pill"
                onClick={() => updateForm(onChange, form, {
                  pricing_lines: [...form.pricing_lines, createPricingLine()],
                })}
              >
                ＋ 新增項目
              </button>
            </div>

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
                      max="99"
                      value={line.ac_units}
                      onChange={(e) => updatePricingLine(onChange, form, line.id, { ac_units: e.target.value })}
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
                          onClick={() => updatePricingLine(onChange, form, line.id, { unit_price: String(price) })}
                        >
                          <span className="option-chip__amount">{price}</span>
                          <span className="option-chip__unit">元/台</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.pricing_lines.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-pill pricing-line__remove"
                      onClick={() => updateForm(onChange, form, {
                        pricing_lines: form.pricing_lines.filter((item) => item.id !== line.id),
                      })}
                    >
                      移除
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">合計</span>
            <div className="price-summary">
              <strong>共 {form.ac_units} 台，{form.cleaning_price || 0} 元</strong>
              {form.needs_invoice && <span className="hint">已含 5% 發票加價</span>}
            </div>
          </div>

          <label className="field">
            <span className="field-label">清洗聯絡人</span>
            <input
              className="field-control"
              value={form.customer_name}
              onChange={(e) => handleChange({ customer_name: e.target.value })}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">清洗電話</span>
            <input
              className="field-control"
              value={form.customer_phone}
              onChange={(e) => handleChange({ customer_phone: e.target.value })}
              required
            />
          </label>

          <div style={{ gridColumn: '1 / -1' }}>
            <CustomerWashHistory phone={form.customer_phone} onApply={applyHistory} />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">服務區域（台東）</span>
            <div className="option-chip-group" role="radiogroup" aria-label="服務區域">
              {TAITUNG_SERVICE_AREAS.map((area) => (
                <button
                  key={area.value}
                  type="button"
                  role="radio"
                  aria-checked={form.service_area === area.value}
                  className={`option-chip option-chip--area${form.service_area === area.value ? ' is-active' : ''}`}
                  onClick={() => handleChange({ service_area: area.value })}
                >
                  {area.label}
                </button>
              ))}
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

          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">清洗地址</span>
            <div className="field-action-row">
              <input
                className="field-control"
                value={form.customer_address}
                onChange={(e) => handleChange({ customer_address: e.target.value })}
                placeholder="請輸入完整地址"
                required
              />
              <GoogleMapsLink address={form.customer_address} />
            </div>
          </label>

          <div className="form-options-row" style={{ gridColumn: '1 / -1' }}>
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.needs_mail)}
                onChange={(e) => toggleNeedsMail(e.target.checked)}
              />
              <span>如需寄信</span>
            </label>

            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.needs_invoice)}
                onChange={(e) => updateForm(onChange, form, { needs_invoice: e.target.checked })}
              />
              <span>是否開發票（統編，加 5%）</span>
            </label>
          </div>

          {form.needs_mail && (
            <div className="form-section" style={{ gridColumn: '1 / -1' }}>
              <div className="form-section__body">
                <label className="field field-checkbox field-checkbox--sub">
                  <input
                    type="checkbox"
                    checked={Boolean(form.mail_same_as_customer)}
                    onChange={(e) => toggleMailSameAsCustomer(e.target.checked)}
                  />
                  <span>同清洗聯絡人、電話、地址</span>
                </label>

                <div className="form-grid cols-2">
                  <label className="field">
                    <span className="field-label">寄信聯絡人</span>
                    <input
                      className="field-control"
                      value={form.mail_recipient}
                      onChange={(e) => handleChange({ mail_recipient: e.target.value, mail_same_as_customer: false })}
                      disabled={form.mail_same_as_customer}
                      placeholder="收件人姓名"
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">寄信電話</span>
                    <input
                      className="field-control"
                      value={form.mail_phone}
                      onChange={(e) => handleChange({ mail_phone: e.target.value, mail_same_as_customer: false })}
                      disabled={form.mail_same_as_customer}
                      placeholder="聯絡電話"
                    />
                  </label>

                  <label className="field" style={{ gridColumn: '1 / -1' }}>
                    <span className="field-label">寄信地址</span>
                    <input
                      className="field-control"
                      value={form.mail_address}
                      onChange={(e) => handleChange({ mail_address: e.target.value, mail_same_as_customer: false })}
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
            <textarea className="field-control" rows={3} value={form.notes} onChange={(e) => handleChange({ notes: e.target.value })} />
          </label>

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary btn-pill">{editId ? '儲存變更' : '建立行程'}</button>
            <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>取消</button>
            {canDelete && editId && (
              <button
                type="button"
                className="btn btn-danger btn-pill"
                onClick={() => {
                  if (window.confirm('確定要刪除此班表行程嗎？')) {
                    onDelete();
                  }
                }}
              >
                刪除行程
              </button>
            )}
          </div>
        </form>
          </div>
        </div>
      </div>
    </div>
  );
}
