import { PricingLineEditor } from './PricingLineEditor';
import {
  applyPriceCalculation,
  clonePricingLineInvoiceSettings,
  createPricingLine,
  createServiceAddress,
  DEFAULT_FIRST_SHIFT_START,
  DEFAULT_SECOND_SHIFT_START,
  formatScheduleValidationAlert,
  getFormContactId,
  getMinScheduleWorkDate,
  getTotalAddressUnits,
  hasScheduleReport,
  hasInvoicedPricingLine,
  isTriplicateInvoice,
  normalizePricingLines,
  resolveMailContactFields,
  patchFormContactId,
  patchScheduleForm,
  syncInvoiceTaxFlags,
  validateScheduleForm,
  CUSTOMER_SOURCE_OPTIONS,
  SCHEDULE_TIME_OPTIONS,
} from '../utils/scheduleCalendar';
import { TAITUNG_SERVICE_AREAS } from '../utils/taitungAreas';
import { canManageSchedulePricing } from '../utils/permissions';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { GoogleMapsLink } from './GoogleMapsLink';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { CustomerWashHistory } from './CustomerWashHistory';
import { EmployeeDayScheduleSidebar } from './EmployeeDayScheduleSidebar';
import { InvoiceTaxIdFields } from './InvoiceTaxIdFields';
import './schedule-calendar.css';

function updateForm(onChange, form, partial) {
  onChange(applyPriceCalculation(patchScheduleForm(form, partial)));
}

export function ScheduleFormModal({
  open,
  title,
  form,
  employees,
  editId,
  canDelete = false,
  error = '',
  originalSchedule = null,
  userRole = 'admin',
  allSchedules = [],
  leaves = [],
  onChange,
  onClose,
  onSubmit,
  onDelete,
}) {
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (open) {
      setValidationError('');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    setValidationError('');

    const validation = validateScheduleForm(form, {
      userRole,
      original: originalSchedule,
    });

    if (!validation.ok) {
      const alertMessage = formatScheduleValidationAlert(validation.messages);
      setValidationError(validation.messages.join('、'));
      window.alert(alertMessage);
      return;
    }

    onSubmit(event);
  }

  function handleChange(partial) {
    onChange(applyPriceCalculation(patchScheduleForm(form, partial)));
  }

  function applyHistory(schedule) {
    handleChange({
      customer_name: schedule.customer_name || form.customer_name,
      customer_phone: schedule.customer_phone || form.customer_phone,
      customer_address: schedule.customer_address || form.customer_address,
      service_addresses: [{
        ...(form.service_addresses?.[0] || createServiceAddress()),
        address: schedule.customer_address || form.customer_address,
        phone: schedule.customer_phone || form.customer_phone,
        same_as_customer: true,
      }],
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

    const contact = resolveMailContactFields(form);

    onChange(patchScheduleForm(form, {
      needs_mail: true,
      mail_same_as_customer: true,
      mail_phone: contact.phone,
      mail_address: contact.address,
    }));
  }

  function toggleMailSameAsCustomer(checked) {
    if (checked) {
      const contact = resolveMailContactFields(form);

      onChange(patchScheduleForm(form, {
        mail_same_as_customer: true,
        mail_phone: contact.phone,
        mail_address: contact.address,
      }));
      return;
    }

    onChange(patchScheduleForm(form, { mail_same_as_customer: false }));
  }

  const showDaySchedule = Boolean(form.user_id && form.work_date);
  const canManagePricing = canManageSchedulePricing(userRole);
  const showInvoiceOption = canManagePricing || userRole === 'customer_service';

  function toggleNeedsInvoice(checked) {
    const patch = checked
      ? { needs_invoice: true, needs_receipt: false }
      : {
        needs_invoice: false,
        invoice_tax_id: '',
        invoice_title: '',
        invoice_charge_customer_tax: false,
        invoice_pre_issue: false,
        invoice_planned_date: '',
        pricing_lines: (form.pricing_lines || [createPricingLine()]).map((line) => ({
          ...line,
          is_taxable: false,
          invoice_type: 'none',
          charge_customer_tax: false,
          invoice_title: '',
          invoice_tax_id: '',
        })),
      };

    const next = syncInvoiceTaxFlags(patchScheduleForm(form, patch));

    if (canManagePricing) {
      onChange(applyPriceCalculation(next));
      return;
    }

    onChange(next);
  }

  function toggleNeedsReceipt(checked) {
    onChange(patchScheduleForm(form, {
      needs_receipt: checked,
      ...(checked ? {
        needs_invoice: false,
        invoice_tax_id: '',
        invoice_title: '',
        invoice_charge_customer_tax: false,
        invoice_pre_issue: false,
        invoice_planned_date: '',
      } : {}),
    }));
  }

  function toggleInvoiceChargeCustomerTax(checked) {
    const next = syncInvoiceTaxFlags(patchScheduleForm(form, { invoice_charge_customer_tax: checked }));
    onChange(canManagePricing ? applyPriceCalculation(next) : next);
  }

  function handleInvoiceFieldChange(partial) {
    const next = syncInvoiceTaxFlags(patchScheduleForm(form, partial));
    onChange(canManagePricing ? applyPriceCalculation(next) : next);
  }

  const serviceAddresses = form.service_addresses?.length
    ? form.service_addresses
    : [createServiceAddress({
      address: form.customer_address,
      phone: form.customer_phone,
      ac_units: form.ac_units || '1',
    })];
  const hasMultipleAddresses = serviceAddresses.length > 1;
  const addressUnitsSum = getTotalAddressUnits(serviceAddresses);
  const pricingUnitsTotal = Number(form.ac_units) || 0;
  const addressUnitsMismatch = hasMultipleAddresses && addressUnitsSum !== pricingUnitsTotal;
  const invoiceAutoEnabled = hasInvoicedPricingLine(form.pricing_lines);
  const triplicateInvoice = isTriplicateInvoice(form);
  const contactIdLabel = form.customer_source === 'line'
    ? 'LINE ID'
    : form.customer_source === 'fb'
      ? 'FB ID'
      : '聯絡人 ID';

  function updateServiceAddress(rowId, partial) {
    const nextRows = serviceAddresses.map((row) => (
      row.id === rowId ? { ...row, ...partial } : row
    ));
    const changedIndex = nextRows.findIndex((row) => row.id === rowId);
    const patch = {
      service_addresses: nextRows,
      customer_address: nextRows[0]?.address || '',
    };

    if (partial.ac_units != null && hasMultipleAddresses && changedIndex >= 0) {
      const pricingLines = normalizePricingLines(form.pricing_lines);

      if (pricingLines[changedIndex]) {
        patch.pricing_lines = pricingLines.map((line, index) => (
          index === changedIndex
            ? { ...line, ac_units: partial.ac_units }
            : line
        ));
      }
    }

    handleChange(patch);
  }

  function addServiceAddress() {
    const totalUnits = pricingUnitsTotal || 1;
    const pricingLines = normalizePricingLines(form.pricing_lines);

    if (serviceAddresses.length === 1) {
      const firstUnits = Math.max(1, Math.floor(totalUnits / 2));
      const secondUnits = Math.max(1, totalUnits - firstUnits);
      let nextPricingLines = pricingLines;

      if (pricingLines.length === 1) {
        const inherited = clonePricingLineInvoiceSettings(pricingLines[0]);
        nextPricingLines = [
          { ...pricingLines[0], ac_units: String(firstUnits) },
          createPricingLine({ ...inherited, ac_units: String(secondUnits) }),
        ];
      } else if (pricingLines.length >= 2) {
        nextPricingLines = pricingLines.map((line, index) => {
          if (index === 0) {
            return { ...line, ac_units: String(firstUnits) };
          }

          if (index === 1) {
            return { ...line, ac_units: String(secondUnits) };
          }

          return line;
        });
      }

      handleChange({
        service_addresses: [
          { ...serviceAddresses[0], ac_units: String(firstUnits) },
          createServiceAddress({ ac_units: String(secondUnits) }),
        ],
        pricing_lines: nextPricingLines,
      });
      return;
    }

    const remaining = Math.max(1, totalUnits - addressUnitsSum);
    handleChange({
      service_addresses: [...serviceAddresses, createServiceAddress({ ac_units: String(remaining) })],
    });
  }

  function removeServiceAddress(rowId) {
    if (serviceAddresses.length <= 1) {
      return;
    }

    handleChange({
      service_addresses: serviceAddresses.filter((row) => row.id !== rowId),
    });
  }

  function toggleServiceAddressSameAsCustomer(rowId, checked) {
    updateServiceAddress(rowId, {
      same_as_customer: checked,
      phone: checked ? form.customer_phone : serviceAddresses.find((row) => row.id === rowId)?.phone || '',
    });
  }

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
        <form className="form-grid cols-2" noValidate onSubmit={handleFormSubmit}>
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
            {!employees.length && (
              <span className="hint">無法載入師傅名單，請重新整理頁面或聯絡管理員。</span>
            )}
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

          {canManagePricing ? (
          <div className="field schedule-form-modal__pricing-section" style={{ gridColumn: '1 / -1' }}>
            <PricingLineEditor
              lines={form.pricing_lines || [createPricingLine()]}
              onChange={(pricing_lines) => updateForm(onChange, form, { pricing_lines })}
              showInvoice
              showTax={false}
              showAdd
            />
          </div>
          ) : (
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">清洗台數</span>
            <input
              className="field-control"
              type="number"
              min="1"
              max="99"
              value={(form.pricing_lines || [createPricingLine()])[0]?.ac_units || '1'}
              onChange={(e) => updateForm(onChange, form, {
                pricing_lines: [{
                  ...(form.pricing_lines?.[0] || createPricingLine()),
                  ac_units: e.target.value,
                }],
              })}
              required
            />
            <span className="hint">僅供排班估算時間，金額由管理員後續確認</span>
          </label>
          )}

          {canManagePricing && (
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">合計</span>
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
          )}

          <label className="field">
            <span className="field-label">{contactIdLabel}</span>
            <input
              className="field-control"
              value={getFormContactId(form)}
              onChange={(e) => handleChange(patchFormContactId(form, e.target.value))}
              required
              placeholder={form.customer_source === 'phone' ? '客戶姓名或代稱' : '請填寫社群 ID'}
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

          <div className="field service-addresses" style={{ gridColumn: '1 / -1' }}>
            <div className="service-addresses__header">
              <span className="field-label">清洗地址</span>
              {!editId && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-pill"
                  onClick={addServiceAddress}
                >
                  ＋ 多一個地址
                </button>
              )}
            </div>

            {hasMultipleAddresses && (
              <p className={`hint${addressUnitsMismatch ? ' hint--warning' : ''}`}>
                各站台數加總：{addressUnitsSum} / {pricingUnitsTotal} 台
                {addressUnitsMismatch ? '（需相等才能送出）' : '（依序排在時間軸，每站一個工作框）'}
              </p>
            )}

            <div className="service-addresses__list">
              {serviceAddresses.map((row, index) => (
                <div key={row.id} className="service-address-row">
                  <div className="service-address-row__heading">
                    <span className="service-address-row__sequence">
                      {hasMultipleAddresses ? `第 ${index + 1} 站 · ${row.ac_units} 台` : '清洗地址'}
                    </span>
                    {hasMultipleAddresses && !editId && serviceAddresses.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm btn-pill"
                        onClick={() => removeServiceAddress(row.id)}
                      >
                        移除
                      </button>
                    )}
                  </div>

                  <div className={`service-address-row__grid${hasMultipleAddresses ? ' service-address-row__grid--multi' : ''}`}>
                    {hasMultipleAddresses && (
                      <label className="field">
                        <span className="field-label">本站台數</span>
                        <input
                          className="field-control"
                          type="number"
                          min="1"
                          max="99"
                          value={row.ac_units}
                          onChange={(e) => updateServiceAddress(row.id, { ac_units: e.target.value })}
                          required
                        />
                      </label>
                    )}

                    <label
                      className="field service-address-row__address-field"
                      style={{ gridColumn: hasMultipleAddresses ? 'span 2' : '1 / -1' }}
                    >
                      <span className="field-label">{hasMultipleAddresses ? `${row.ac_units} 台 · 地址` : '地址'}</span>
                      <AddressAutocompleteInput
                        value={row.address}
                        onChange={(address) => updateServiceAddress(row.id, { address })}
                        placeholder="請輸入完整地址"
                        required
                        showFallbackHint={false}
                      />
                      <GoogleMapsLink
                        address={row.address}
                        className="btn btn-secondary btn-sm map-link-btn service-address-row__map-link"
                      />
                    </label>

                    <label className="field">
                      <span className="field-label">聯絡電話</span>
                      <input
                        className="field-control"
                        value={row.same_as_customer ? form.customer_phone : row.phone}
                        onChange={(e) => updateServiceAddress(row.id, { phone: e.target.value, same_as_customer: false })}
                        disabled={row.same_as_customer}
                        required={!row.same_as_customer}
                      />
                    </label>

                    <label className="field field-checkbox service-address-row__same-contact">
                      <input
                        type="checkbox"
                        checked={Boolean(row.same_as_customer)}
                        onChange={(e) => toggleServiceAddressSameAsCustomer(row.id, e.target.checked)}
                      />
                      <span>同總聯絡人</span>
                    </label>
                  </div>

                  <label className="field service-address-row__note" style={{ gridColumn: '1 / -1' }}>
                    <span className="field-label">站點備註（選填）</span>
                    <input
                      className="field-control"
                      value={row.station_note || ''}
                      onChange={(e) => updateServiceAddress(row.id, { station_note: e.target.value })}
                      placeholder="例：此站收 3150 元，需開三聯單"
                      maxLength={255}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

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

          <div className="form-options-row" style={{ gridColumn: '1 / -1' }}>
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.needs_mail)}
                onChange={(e) => toggleNeedsMail(e.target.checked)}
              />
              <span>郵寄</span>
            </label>

            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.needs_invoice)}
                disabled={Boolean(form.needs_receipt)}
                onChange={(e) => toggleNeedsInvoice(e.target.checked)}
              />
              <span>發票（二聯／三聯）</span>
            </label>

            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.needs_receipt)}
                disabled={Boolean(form.needs_invoice)}
                onChange={(e) => toggleNeedsReceipt(e.target.checked)}
              />
              <span>收據</span>
            </label>
          </div>

          {form.needs_invoice && !canManagePricing && (
            <div className="form-section" style={{ gridColumn: '1 / -1' }}>
              <div className="form-section__body form-section__body--flush">
                <InvoiceTaxIdFields
                  invoiceTitle={form.invoice_title}
                  invoiceTaxId={form.invoice_tax_id}
                  onChange={handleInvoiceFieldChange}
                />
                {!triplicateInvoice && (
                  <>
                    <p className="hint" style={{ marginTop: 12 }}>
                      不填抬頭／統編即為二聯；若要向客戶加收 5% 再勾選下方選項。
                    </p>
                    <label className="field field-checkbox" style={{ marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.invoice_charge_customer_tax)}
                        onChange={(e) => toggleInvoiceChargeCustomerTax(e.target.checked)}
                      />
                      <span>向客戶加收 5% 稅金（二聯）</span>
                    </label>
                  </>
                )}
                {triplicateInvoice && (
                  <p className="hint" style={{ marginTop: 12 }}>三聯發票已自動向客戶加收 5% 稅金。</p>
                )}
                <div className="form-grid cols-2" style={{ marginTop: 12 }}>
                  <label className="field field-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(form.invoice_pre_issue)}
                      onChange={(e) => handleChange({
                        invoice_pre_issue: e.target.checked,
                        invoice_planned_date: e.target.checked ? form.invoice_planned_date : '',
                      })}
                    />
                    <span>預開／延後發票</span>
                  </label>
                  {form.invoice_pre_issue && (
                    <label className="field">
                      <span className="field-label">預計開發票日期</span>
                      <input
                        className="field-control"
                        type="date"
                        value={form.invoice_planned_date || ''}
                        onChange={(e) => handleChange({ invoice_planned_date: e.target.value })}
                        required
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {(form.needs_invoice || invoiceAutoEnabled) && canManagePricing && (
            <div className="form-section" style={{ gridColumn: '1 / -1' }}>
              <div className="form-section__body form-section__body--flush">
                <p className="hint">各清洗項目的發票類型請在上方逐項設定（可部分開、部分不開）。</p>
                <div className="form-grid cols-2" style={{ marginTop: 12 }}>
                  <label className="field field-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(form.invoice_pre_issue)}
                      onChange={(e) => handleChange({
                        invoice_pre_issue: e.target.checked,
                        invoice_planned_date: e.target.checked ? form.invoice_planned_date : '',
                      })}
                    />
                    <span>預開／延後發票</span>
                  </label>
                  {form.invoice_pre_issue && (
                    <label className="field">
                      <span className="field-label">預計開發票日期</span>
                      <input
                        className="field-control"
                        type="date"
                        value={form.invoice_planned_date || ''}
                        onChange={(e) => handleChange({ invoice_planned_date: e.target.value })}
                        required
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {form.needs_mail && (
            <div className="form-section" style={{ gridColumn: '1 / -1' }}>
              <div className="form-section__body">
                <label className="field field-checkbox field-checkbox--sub">
                  <input
                    type="checkbox"
                    checked={Boolean(form.mail_same_as_customer)}
                    onChange={(e) => toggleMailSameAsCustomer(e.target.checked)}
                  />
                  <span>同清洗電話、地址</span>
                </label>

                <div className="form-grid cols-2">
                  <label className="field">
                    <span className="field-label">寄信聯絡人</span>
                    <input
                      className="field-control"
                      value={form.mail_recipient}
                      onChange={(e) => handleChange({ mail_recipient: e.target.value })}
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

          <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
            {(validationError || error) && (
              <div className="alert alert-error modal-alert" style={{ gridColumn: '1 / -1', width: '100%' }}>
                {validationError || error}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-pill">{editId ? '儲存變更' : '建立行程'}</button>
            <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>取消</button>
            {canDelete && editId && (
              <button
                type="button"
                className="btn btn-danger btn-pill"
                onClick={() => {
                  const confirmMessage = hasScheduleReport(originalSchedule)
                    ? '確定刪除此工單？相關回報、郵資、匯款紀錄將一併刪除。'
                    : '確定要刪除此班表行程嗎？';

                  if (window.confirm(confirmMessage)) {
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
