import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { PartnerSettlementReport } from '../components/PartnerSettlementReport';
import { SettlementLedgerTable } from '../components/SettlementLedgerTable';
import { api } from '../api/client';

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

const defaultAdvanceForm = {
  partner: 'atai',
  label: '',
  amount: '',
  notes: '',
};

export default function AdminAccountingPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [data, setData] = useState(null);
  const [expenseDrafts, setExpenseDrafts] = useState([]);
  const [advanceForm, setAdvanceForm] = useState(defaultAdvanceForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingExpenses, setSavingExpenses] = useState(false);
  const [ledger, setLedger] = useState(null);
  const [ledgerEmployeeId, setLedgerEmployeeId] = useState('');
  const [ledgerViewMode, setLedgerViewMode] = useState('daily');
  const [ledgerLoading, setLedgerLoading] = useState(false);

  async function loadAccounting(nextYearMonth = yearMonth) {
    setLoading(true);
    setError('');

    try {
      const result = await api.getAccounting(nextYearMonth);
      setData(result.data);
      setExpenseDrafts((result.data.fixed_expense_drafts || result.data.fixed_expenses || []).map((item) => ({ ...item })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounting(yearMonth);
  }, [yearMonth]);

  async function loadLedger(nextYearMonth = yearMonth, nextEmployeeId = ledgerEmployeeId) {
    setLedgerLoading(true);

    try {
      const result = await api.getSettlementLedger(nextYearMonth, nextEmployeeId || undefined);
      setLedger(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLedgerLoading(false);
    }
  }

  useEffect(() => {
    loadLedger(yearMonth, ledgerEmployeeId);
  }, [yearMonth, ledgerEmployeeId]);

  const totals = data?.totals;

  const advanceGroups = useMemo(() => {
    const manual = data?.advance_entries || [];
    const auto = data?.auto_advance_entries || [];

    return {
      atai: [...auto.filter((entry) => entry.partner === 'atai'), ...manual.filter((entry) => entry.partner === 'atai')],
      hongyi: [...auto.filter((entry) => entry.partner === 'hongyi'), ...manual.filter((entry) => entry.partner === 'hongyi')],
    };
  }, [data]);

  const companyTransfers = useMemo(
    () => data?.company_transfers || [],
    [data],
  );

  const companyTransferAdvanceTotal = useMemo(
    () => companyTransfers.reduce((sum, transfer) => sum + Number(transfer.advance_to_employee || 0), 0),
    [companyTransfers],
  );

  async function saveFixedExpenses() {
    setSavingExpenses(true);
    setError('');
    setMessage('');

    try {
      const result = await api.updateAccountingSettings(yearMonth, expenseDrafts.map((item) => ({
        key: item.key,
        amount: Number(item.amount),
        label: item.label,
      })));
      setData(result.data);
      setExpenseDrafts((result.data.fixed_expense_drafts || result.data.fixed_expenses || []).map((item) => ({ ...item })));
      setMessage('固定開支已更新');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingExpenses(false);
    }
  }

  async function handleCreateAdvance(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const result = await api.createAccountingAdvance({
        year_month: yearMonth,
        partner: advanceForm.partner,
        label: advanceForm.label.trim(),
        amount: Number(advanceForm.amount),
        notes: advanceForm.notes.trim() || null,
      });
      setData(result.data.summary);
      setExpenseDrafts((result.data.summary.fixed_expense_drafts || result.data.summary.fixed_expenses || []).map((item) => ({ ...item })));
      setAdvanceForm(defaultAdvanceForm);
      setMessage('代墊款已新增');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteAdvance(entryId) {
    setError('');
    setMessage('');

    try {
      const result = await api.deleteAccountingAdvance(entryId);
      setData(result.data);
      setExpenseDrafts((result.data.fixed_expense_drafts || result.data.fixed_expenses || []).map((item) => ({ ...item })));
      setMessage('代墊款已刪除');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title="記帳表單">
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">月份查詢</h2>
          <p className="hint">依回報資料計算各員工應收、應退、合夥分潤。1500 收 600、1300 收 500、1000 收 400；客戶匯款給公司者依單價退員工差額。</p>
        </div>
        <div className="filter-toolbar">
          <label className="field field-compact">
            <span className="field-label">月份</span>
            <input
              className="field-control"
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
            />
          </label>
          <div className="toolbar-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => loadAccounting(yearMonth)} disabled={loading}>
              {loading ? '載入中...' : '重新整理'}
            </button>
          </div>
        </div>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />

      {totals && (
        <>
          <section className="summary-row accounting-summary">
            <span className="stat-badge stat-badge--highlight stat-badge--hero">
              總淨值收益毛利 {formatMoney(totals.gross_profit)}
            </span>
            {(totals.hongyi_payment || 0) >= 0 ? (
              <span className="stat-badge stat-badge--highlight stat-badge--hero">
                東東應補宏逸 {formatMoney(totals.hongyi_payment)}
              </span>
            ) : (
              <span className="stat-badge stat-badge--highlight stat-badge--hero">
                宏逸應退東東 {formatMoney(Math.abs(totals.hongyi_payment))}
              </span>
            )}
            <span className="stat-badge stat-badge--highlight">
              每人分潤 {formatMoney(totals.profit_share_half)}
            </span>
            <span className="stat-badge">師傅交回 {formatMoney(totals.net_from_employees)}</span>
            <span className="stat-badge">本月開支 {formatMoney(totals.monthly_expense_total)}</span>
            <span className="stat-badge">阿泰代墊 {formatMoney(totals.atai_advance_total)}</span>
            {(totals.travel_allowance_total || 0) > 0 && (
              <span className="stat-badge">車馬費加給 {formatMoney(totals.travel_allowance_total)}</span>
            )}
            <span className="stat-badge">發票帳匯款 {formatMoney(totals.company_inbound_expected)}</span>
          </section>

          <PartnerSettlementReport settlement={data.partner_settlement} employees={data.employees} />

          {(data.auto_charges || []).length > 0 && (
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">本月自動開支</h2>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>項目</th>
                      <th>說明</th>
                      <th>金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.auto_charges.map((charge) => (
                      <tr key={charge.key}>
                        <td>{charge.label}</td>
                        <td className="hint">
                          {charge.key === 'postage'
                            ? (charge.description
                              ? `${charge.description}，合計 ${charge.amount} 元`
                              : `${charge.mail_report_count} 筆寄信 × ${charge.unit_amount} 元`)
                            : '自動帶入'}
                        </td>
                        <td className="num">{formatMoney(charge.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">阿泰帳戶（個人代墊）</h2>
              <p className="hint">
                固定開支、車馬費與其他代墊列入阿泰代墊；發票稅金 8% 為宏逸代墊，月底與宏逸軋差。
                目前尚未區分公司帳戶或公帳，日後若有再另行分類。
                {data.fixed_expenses_saved === false && (
                  <> 此月份固定開支尚未存檔，報表結算以 0 計；下方輸入僅為草稿（{data.fixed_expenses_source === 'draft_previous_month' ? '沿用上月' : '預設值'}），儲存後才會計入分潤。</>
                )}
              </p>
            </div>

            <div className="accounting-advance-grid">
              <div className="accounting-advance-column">
                <h3 className="section-label">
                  阿泰代墊
                  <span className="hint">合計 {formatMoney(totals.atai_advance_total)} 元</span>
                </h3>

                <div className="form-grid cols-2 accounting-fixed-expense-grid">
                  {expenseDrafts.map((expense, index) => (
                    <label className="field" key={expense.key}>
                      <span className="field-label">{expense.label}（固定）</span>
                      <input
                        className="field-control"
                        type="number"
                        min="0"
                        value={expense.amount}
                        onChange={(e) => {
                          const next = [...expenseDrafts];
                          next[index] = { ...expense, amount: e.target.value };
                          setExpenseDrafts(next);
                        }}
                      />
                    </label>
                  ))}
                </div>
                <div className="toolbar-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={saveFixedExpenses} disabled={savingExpenses}>
                    {savingExpenses ? '儲存中...' : '儲存固定開支'}
                  </button>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>項目</th>
                        <th>金額</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advanceGroups.atai.map((entry) => (
                        <tr key={entry.id || `${entry.fixed_expense_key || entry.label}-${entry.amount}`}>
                          <td>
                            {entry.label}
                            {entry.fixed_expense ? '（固定）' : ''}
                            {entry.auto && !entry.fixed_expense ? '（自動）' : ''}
                            {entry.notes && !entry.fixed_expense ? `（${entry.notes}）` : ''}
                          </td>
                          <td className="num">{formatMoney(entry.amount)}</td>
                          <td>
                            {entry.auto ? (
                              <span className="hint">—</span>
                            ) : (
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDeleteAdvance(entry.id)}>
                                刪除
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!advanceGroups.atai.length && (
                        <tr>
                          <td colSpan={3} className="hint">尚無代墊紀錄</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="accounting-advance-column">
                <h3 className="section-label">
                  宏逸代墊
                  <span className="hint">合計 {formatMoney(totals.hongyi_advance_total)} 元</span>
                </h3>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>項目</th>
                        <th>金額</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advanceGroups.hongyi.map((entry) => (
                        <tr key={entry.id || `${entry.label}-${entry.amount}`}>
                          <td>
                            {entry.label}
                            {entry.notes ? `（${entry.notes}）` : ''}
                          </td>
                          <td className="num">{formatMoney(entry.amount)}</td>
                          <td>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDeleteAdvance(entry.id)}>
                              刪除
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!advanceGroups.hongyi.length && (
                        <tr>
                          <td colSpan={3} className="hint">尚無代墊紀錄</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <form className="form-grid cols-2 accounting-advance-form" onSubmit={handleCreateAdvance}>
              <h3 className="section-label" style={{ gridColumn: '1 / -1' }}>新增代墊款</h3>
              <label className="field">
                <span className="field-label">代墊人</span>
                <select className="field-control" value={advanceForm.partner} onChange={(e) => setAdvanceForm({ ...advanceForm, partner: e.target.value })}>
                  <option value="atai">阿泰代墊</option>
                  <option value="hongyi">宏逸代墊</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">項目</span>
                <input className="field-control" value={advanceForm.label} onChange={(e) => setAdvanceForm({ ...advanceForm, label: e.target.value })} required />
              </label>
              <label className="field">
                <span className="field-label">金額</span>
                <input className="field-control" type="number" value={advanceForm.amount} onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })} required />
              </label>
              <label className="field">
                <span className="field-label">備註</span>
                <input className="field-control" value={advanceForm.notes} onChange={(e) => setAdvanceForm({ ...advanceForm, notes: e.target.value })} />
              </label>
              <div className="toolbar-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="submit" className="btn btn-primary btn-sm">新增代墊款</button>
              </div>
            </form>
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">宏逸帳戶（客戶匯款）</h2>
              <p className="hint">
                客戶直接匯款至公司宏逸帳戶的案件；應匯 {formatMoney(totals.company_inbound_expected)} 元
                {totals.company_transfer_count > 0 ? `（${totals.company_transfer_count} 筆）` : ''}
                ，已確認入帳 {formatMoney(totals.company_transfer)} 元。
                待入帳請至「匯款追查」按「已入帳」確認。
              </p>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>師傅</th>
                    <th>客戶</th>
                    <th>台數</th>
                    <th>應匯入宏逸</th>
                    <th>入帳狀態</th>
                    <th>已確認入帳</th>
                  </tr>
                </thead>
                <tbody>
                  {companyTransfers.map((transfer) => (
                    <tr key={transfer.remittance_id ?? transfer.report_id}>
                      <td>{transfer.work_date}</td>
                      <td>{transfer.employee_name}</td>
                      <td>
                        {transfer.customer_name || '-'}
                        {transfer.needs_invoice ? <span className="hint">（含發票）</span> : ''}
                      </td>
                      <td className="num">{transfer.completed_units}</td>
                      <td className="num">{formatMoney(transfer.amount)}</td>
                      <td>
                        <span className={`status-pill${transfer.remittance_status === 'confirmed' ? '' : ' status-pill--warn'}`}>
                          {transfer.remittance_status_label || '待入帳'}
                        </span>
                      </td>
                      <td className="num">{formatMoney(transfer.confirmed_amount)}</td>
                      <td className="num">{formatMoney(transfer.advance_to_employee)}</td>
                    </tr>
                  ))}
                  {!companyTransfers.length && (
                    <tr>
                      <td colSpan={8} className="hint">本月尚無客戶匯入宏逸帳戶的案件</td>
                    </tr>
                  )}
                </tbody>
                {companyTransfers.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4}><strong>合計</strong></td>
                      <td className="num"><strong>{formatMoney(totals.company_inbound_expected ?? totals.company_transfer)}</strong></td>
                      <td />
                      <td className="num"><strong>{formatMoney(totals.company_transfer)}</strong></td>
                      <td className="num"><strong>{formatMoney(companyTransferAdvanceTotal)}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <section className="card table-card">
            <div className="card-header" style={{ padding: '16px 16px 0' }}>
              <h2 className="card-title">員工績效細項</h2>
              <p className="hint">
                依單價統計台數（1500／1300／1000）。師傅實拿 = 客戶總額 − 公司抽成（1500→600、1300→500、1000→400）− 發票稅8% − 賠償 + 車馬費加給。
                「應向師傅收」= 現場應繳 + 賠償入公司，方便東東對帳。
              </p>
            </div>
            <div className="table-wrap">
              <table className="data-table accounting-performance-table">
                <colgroup>
                  <col className="col-employee" />
                  <col className="col-units" />
                  <col className="col-units" />
                  <col className="col-units" />
                  <col className="col-total-units" />
                  <col className="col-money" span={7} />
                </colgroup>
                <thead>
                  <tr>
                    <th>員工</th>
                    <th className="num">1500台</th>
                    <th className="num">1300台</th>
                    <th className="num">1000台</th>
                    <th className="num">總台數</th>
                    <th className="num">客戶總額</th>
                    <th className="num">公司抽成</th>
                    <th className="num">發票稅8%</th>
                    <th className="num">賠償</th>
                    <th className="num">車馬費</th>
                    <th className="num">師傅實拿</th>
                    <th className="num">應向師傅收</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.employees || []).map((employee) => (
                    <tr key={employee.user_id}>
                      <td>{employee.name}</td>
                      <td className="num">{employee.units_by_price?.[1500] ?? 0}</td>
                      <td className="num">{employee.units_by_price?.[1300] ?? 0}</td>
                      <td className="num">{employee.units_by_price?.[1000] ?? 0}</td>
                      <td className="num">{employee.completed_units}</td>
                      <td className="num">{formatMoney(employee.total_job_amount)}</td>
                      <td className="num">{formatMoney(employee.company_commission)}</td>
                      <td className="num">{formatMoney(employee.invoice_tax_cost)}</td>
                      <td className="num">{formatMoney(employee.compensation_due_to_company ?? employee.compensation_due_to_atai)}</td>
                      <td className="num">{formatMoney(employee.travel_allowance)}</td>
                      <td className="num">{formatMoney(employee.employee_actual_pay)}</td>
                      <td className="num">{formatMoney(employee.collect_due_from_employee)}</td>
                    </tr>
                  ))}
                  {!data.employees?.length && (
                    <tr>
                      <td colSpan={12} className="hint">本月尚無回報資料</td>
                    </tr>
                  )}
                </tbody>
                {!!data.employees?.length && data.totals?.performance_totals && (
                  <tfoot>
                    <tr>
                      <td><strong>合計</strong></td>
                      <td className="num"><strong>{data.totals.performance_totals.units_by_price?.[1500] ?? 0}</strong></td>
                      <td className="num"><strong>{data.totals.performance_totals.units_by_price?.[1300] ?? 0}</strong></td>
                      <td className="num"><strong>{data.totals.performance_totals.units_by_price?.[1000] ?? 0}</strong></td>
                      <td className="num"><strong>{data.totals.performance_totals.completed_units}</strong></td>
                      <td className="num"><strong>{formatMoney(data.totals.performance_totals.total_job_amount)}</strong></td>
                      <td className="num"><strong>{formatMoney(data.totals.performance_totals.company_commission)}</strong></td>
                      <td className="num"><strong>{formatMoney(data.totals.performance_totals.invoice_tax_cost)}</strong></td>
                      <td className="num"><strong>{formatMoney(data.totals.performance_totals.compensation_due_to_company)}</strong></td>
                      <td className="num"><strong>{formatMoney(data.totals.performance_totals.travel_allowance)}</strong></td>
                      <td className="num"><strong>{formatMoney(data.totals.performance_totals.employee_actual_pay)}</strong></td>
                      <td className="num"><strong>{formatMoney(data.totals.performance_totals.collect_due_from_employee)}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <section className="card table-card">
            <div className="card-header" style={{ padding: '16px 16px 0' }}>
              <h2 className="card-title">各員工應收帳（明細）</h2>
              <p className="hint">金額為案件總額；匯款件實收 0、入公司帳為客戶匯入宏逸金額；應退為師傅所得，月底應繳 = 應收現場 − 應退師傅；有發票者應收現場另含向客戶收的 5% 加價；賠償入公司為師傅應繳公司的賠款分擔（你代收）。</p>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>員工</th>
                    <th>台數</th>
                    <th>金額</th>
                    <th>實收</th>
                    <th>應收（現場）</th>
                    <th>發票加價 5%</th>
                    <th>應退（師傅所得）</th>
                    <th>本月應繳</th>
                    <th>賠償入公司</th>
                    <th>入公司帳（宏逸）</th>
                    <th>已確認入帳</th>
                    <th>發票稅金 8%</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.employees || []).map((employee) => (
                    <tr key={employee.user_id}>
                      <td>{employee.name}</td>
                      <td className="num">{employee.completed_units}</td>
                      <td className="num">{formatMoney(employee.total_job_amount)}</td>
                      <td className="num">{formatMoney(employee.employee_cash_received)}</td>
                      <td className="num">{formatMoney(employee.collect_from_employee)}</td>
                      <td className="num">{formatMoney(employee.invoice_surcharge_due)}</td>
                      <td className="num">{formatMoney(employee.advance_to_employee)}</td>
                      <td className="num">
                        {employee.payment_to_finance > 0
                          ? formatMoney(employee.payment_to_finance)
                          : employee.payout_from_finance > 0
                            ? `退 ${formatMoney(employee.payout_from_finance)}`
                            : '0'}
                      </td>
                      <td className="num">{formatMoney(employee.compensation_due_to_company ?? employee.compensation_due_to_atai)}</td>
                      <td className="num">{formatMoney(employee.company_inbound_expected)}</td>
                      <td className="num">{formatMoney(employee.company_transfer)}</td>
                      <td className="num">{formatMoney(employee.invoice_tax_cost)}</td>
                    </tr>
                  ))}
                  {!data.employees?.length && (
                    <tr>
                      <td colSpan={12} className="hint">本月尚無回報資料</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card table-card settlement-ledger-card">
            <div className="card-header" style={{ padding: '16px 16px 0' }}>
              <h2 className="card-title">結算排查表（Excel 式明細）</h2>
              <p className="hint">
                依回報逐日列出各單價台數與應收／應退；底部合計應與上方「各員工應收帳」一致。淨額 = 應收現場 − 應退師傅（正數＝師傅應繳，退 XXX＝公司應退）。
              </p>
            </div>
            <div className="filter-toolbar" style={{ padding: '0 16px 16px' }}>
              <label className="field field-compact">
                <span className="field-label">師傅</span>
                <select
                  className="field-control"
                  value={ledgerEmployeeId}
                  onChange={(event) => setLedgerEmployeeId(event.target.value)}
                >
                  <option value="">全部師傅</option>
                  {(data.employees || []).map((employee) => (
                    <option key={employee.user_id} value={employee.user_id}>{employee.name}</option>
                  ))}
                </select>
              </label>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className={`btn btn-sm ${ledgerViewMode === 'daily' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setLedgerViewMode('daily')}
                >
                  按日加總
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${ledgerViewMode === 'detail' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setLedgerViewMode('detail')}
                >
                  逐筆明細
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => loadLedger()}
                  disabled={ledgerLoading}
                >
                  {ledgerLoading ? '載入中...' : '重新整理'}
                </button>
              </div>
            </div>
            <SettlementLedgerTable
              ledger={ledger}
              viewMode={ledgerViewMode}
              showEmployee={!ledgerEmployeeId}
            />
          </section>
        </>
      )}
    </Layout>
  );
}
