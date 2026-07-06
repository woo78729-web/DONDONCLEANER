function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

function signedMoney(value) {
  const amount = Number(value || 0);

  if (amount === 0) {
    return '0';
  }

  return amount > 0 ? `+${formatMoney(amount)}` : `−${formatMoney(Math.abs(amount))}`;
}

function SettlementLine({ label, amount, signed = false, hint }) {
  return (
    <div className="partner-settlement-line">
      <div>
        <span className="partner-settlement-line__label">{label}</span>
        {hint && <p className="hint">{hint}</p>}
      </div>
      <span className="partner-settlement-line__amount num">
        {signed ? signedMoney(amount) : `${formatMoney(amount)} 元`}
      </span>
    </div>
  );
}

function TakeHomeHero({
  label,
  amount,
  hint,
  accountLabel,
  negative = false,
}) {
  const numeric = Math.abs(Number(amount || 0));

  return (
    <div className={`partner-settlement-hero${negative ? ' partner-settlement-hero--negative' : ''}`}>
      {accountLabel && <p className="partner-settlement-hero__account">{accountLabel}</p>}
      <p className="partner-settlement-hero__label">{label}</p>
      <p className="partner-settlement-hero__value">{formatMoney(numeric)} 元</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function EmployeePaymentDueSection({ employees = [] }) {
  const rows = employees.filter((employee) => (
    Number(employee.collect_due_from_employee || 0) > 0
    || Number(employee.payment_to_finance || 0) > 0
    || Number(employee.payout_from_finance || 0) > 0
    || Number(employee.compensation_due_to_company || employee.compensation_due_to_atai || 0) > 0
  ));

  const totals = rows.reduce((summary, employee) => ({
    payment: summary.payment + Number(employee.payment_to_finance || 0),
    compensation: summary.compensation + Number(employee.compensation_due_to_company ?? employee.compensation_due_to_atai ?? 0),
    collect: summary.collect + Number(employee.collect_due_from_employee || 0),
    payout: summary.payout + Number(employee.payout_from_finance || 0),
  }), {
    payment: 0,
    compensation: 0,
    collect: 0,
    payout: 0,
  });

  return (
    <section className="card table-card">
      <div className="card-header" style={{ padding: '16px 16px 0' }}>
        <h2 className="card-title">師傅本月應繳（轉給阿泰）</h2>
        <p className="hint">
          合計應收 = 現場應繳 + 賠償入公司。匯款案若公司應退師傅，會另列「公司應退」。
        </p>
      </div>
      <div className="table-wrap">
        <table className="data-table accounting-employee-due-table">
          <colgroup>
            <col className="col-employee" />
            <col className="col-money" />
            <col className="col-money" />
            <col className="col-money" />
            <col className="col-note" />
          </colgroup>
          <thead>
            <tr>
              <th>師傅</th>
              <th className="num">現場應繳</th>
              <th className="num">賠償入公司</th>
              <th className="num">合計應收</th>
              <th>備註</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((employee) => {
              const compensation = Number(employee.compensation_due_to_company ?? employee.compensation_due_to_atai ?? 0);
              const payout = Number(employee.payout_from_finance || 0);
              const note = payout > 0 ? `公司應退 ${formatMoney(payout)} 元` : '—';

              return (
                <tr key={employee.user_id}>
                  <td>{employee.name}</td>
                  <td className="num">{formatMoney(employee.payment_to_finance)}</td>
                  <td className="num">{formatMoney(compensation)}</td>
                  <td className="num">{formatMoney(employee.collect_due_from_employee)}</td>
                  <td>{note}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="hint">本月尚無師傅應繳資料</td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td><strong>合計</strong></td>
                <td className="num"><strong>{formatMoney(totals.payment)}</strong></td>
                <td className="num"><strong>{formatMoney(totals.compensation)}</strong></td>
                <td className="num"><strong>{formatMoney(totals.collect)}</strong></td>
                <td>
                  {totals.payout > 0 && (
                    <span className="hint">其中公司應退師傅 {formatMoney(totals.payout)} 元</span>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

export function PartnerSettlementReport({ settlement, employees = [] }) {
  if (!settlement) {
    return null;
  }

  const { basis, inter_partner: interPartner, atai, hongyi } = settlement;
  const ataiCollectTotal = Number(atai.employee_payment_due || 0) + Number(atai.compensation_from_employees || 0);
  const dongdongToHongyi = interPartner?.direction === 'dongdong_to_hongyi';

  return (
    <>
      {interPartner && (
        <section className="card partner-settlement-hero-card">
          <div className="card-header">
            <h2 className="card-title">合夥軋差（東東 ↔ 宏逸）</h2>
            <p className="hint">
              每人分潤 {formatMoney(interPartner.profit_share_half)} 元，發票帳客戶匯款 {formatMoney(interPartner.customer_remittance_in_account)} 元
              {interPartner.invoice_tax_hongyi_advance > 0 && (
                <>
                  ，宏逸代墊發票稅8% {formatMoney(interPartner.invoice_tax_hongyi_advance)} 元
                </>
              )}
              。{interPartner.formula_hint}
            </p>
          </div>
          <TakeHomeHero
            label={interPartner.direction_label}
            amount={interPartner.settlement_amount}
            hint={
              dongdongToHongyi
                ? `東東公司帳應轉給宏逸 ${formatMoney(interPartner.settlement_amount)} 元`
                : `宏逸發票帳應轉給東東 ${formatMoney(interPartner.settlement_amount)} 元`
            }
          />
        </section>
      )}

      <section className="partner-settlement-grid">
        <article className="card partner-settlement-card">
          <div className="card-header">
            <h2 className="card-title">阿泰結算單</h2>
            <p className="hint">{atai.account_label}：師傅現金、賠償代收、公司代墊。</p>
          </div>

          <TakeHomeHero
            accountLabel={atai.account_label}
            label="師傅應繳合計（轉給阿泰）"
            amount={ataiCollectTotal}
            hint={`現場應繳 ${formatMoney(atai.employee_payment_due)} 元${atai.compensation_from_employees > 0 ? `；賠償入公司 ${formatMoney(atai.compensation_from_employees)} 元` : ''}`}
          />

          <div className="partner-settlement-lines partner-settlement-lines--after-hero">
            <SettlementLine
              label="減：公司代墊（廣告、固定費、車馬費、賠款等）"
              amount={-atai.advances}
              signed
              hint="你先行代墊的公司開支（含維修賠款全額；發票稅8%另列宏逸代墊）"
            />
            {atai.take_home < 0 && (
              <SettlementLine
                label="代墊大於分潤（缺口）"
                amount={atai.take_home}
                signed
                hint="師傅月底應繳與代墊回收後再軋差"
              />
            )}
            {atai.employee_payout_due > 0 && (
              <SettlementLine
                label="匯款案應退師傅"
                amount={atai.employee_payout_due}
                hint="客戶直接匯入宏逸帳戶，公司應退師傅差額"
              />
            )}
          </div>
        </article>

        <article className="card partner-settlement-card">
          <div className="card-header">
            <h2 className="card-title">宏逸結算單</h2>
            <p className="hint">{hongyi.account_label}：客戶匯款進這裡，發票由宏逸開立。</p>
          </div>

          <TakeHomeHero
            accountLabel={hongyi.account_label}
            label={dongdongToHongyi ? '東東應轉給宏逸' : '宏逸應轉給東東'}
            amount={interPartner?.settlement_amount ?? Math.abs(hongyi.inter_partner_settlement || 0)}
            hint={
              dongdongToHongyi
                ? '分潤大於發票帳匯款，東東公司帳應補差額給宏逸'
                : '發票帳匯款大於分潤，宏逸應退回東東公司帳'
            }
          />

          <div className="partner-settlement-lines partner-settlement-lines--after-hero">
            <SettlementLine
              label="每人分潤（對半）"
              amount={hongyi.profit_share}
              hint="上方摘要已列，這裡供對帳參考"
            />
            <SettlementLine
              label="發票帳客戶匯款"
              amount={hongyi.customer_remittance_in_account}
              hint={
                hongyi.customer_remittance_confirmed !== hongyi.customer_remittance_in_account
                  ? `已確認入帳 ${formatMoney(hongyi.customer_remittance_confirmed)} 元`
                  : '在宏逸發票帳代管，結算時與分潤軋差'
              }
            />
            {interPartner?.invoice_tax_hongyi_advance > 0 && (
              <SettlementLine
                label="加：宏逸代墊發票稅8%"
                amount={interPartner.invoice_tax_hongyi_advance}
                hint="發票稅由宏逸代墊，月底結算時由東東公司帳補給宏逸發票帳"
              />
            )}
          </div>
        </article>
      </section>

      <EmployeePaymentDueSection employees={employees} />

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">本月怎麼算（共同基礎）</h2>
          <p className="hint">
            合夥分潤對半：東東公司帳（阿泰代管）＋ 宏逸發票帳（宏逸代管）。扣除公司開支後，總毛利兩人各拿一半。
          </p>
        </div>
        <div className="partner-settlement-basis">
          <SettlementLine
            label="師傅公司份（1500→600／1300→500／1000→400）"
            amount={basis.company_share_total ?? 0}
            hint="等同 Excel 周結／應結加總"
          />
          {(basis.customer_invoice_surcharge_total ?? 0) > 0 && (
            <SettlementLine
              label="加：向客戶收取 5% 稅金"
              amount={basis.customer_invoice_surcharge_total}
              signed
              hint="含匯款案與現金案，匯款部分的 5% 已含在宏逸帳匯款內"
            />
          )}
          {basis.compensation_due_to_company > 0 && (
            <SettlementLine
              label="加：師傅賠償應入公司"
              amount={basis.compensation_due_to_company}
              signed
            />
          )}
          <SettlementLine
            label="＝ 營業收入合計"
            amount={basis.operating_income ?? basis.gross_profit}
          />
          <SettlementLine label="減：本月開支（含代墊、郵資、宏逸代墊8% 等）" amount={-basis.monthly_expense_total} signed />
          <SettlementLine label="＝ 營利（總毛利）" amount={basis.gross_profit} />
          {(basis.remittance_company_share_total ?? 0) > 0 && (
            <SettlementLine
              label="其中匯款案公司份（已在宏逸帳，供對帳）"
              amount={basis.remittance_company_share_total}
              hint="此數已含在公司份內；軋差時以發票帳匯款總額扣除"
            />
          )}
          {basis.travel_allowance_total > 0 && (
            <SettlementLine
              label="其中車馬費加給（計入阿泰代墊）"
              amount={basis.travel_allowance_total}
              hint="距離較遠、台數不足時補給師傅，由阿泰代墊"
            />
          )}
          <SettlementLine label="對半分（每人分潤）" amount={basis.profit_share_half} />
        </div>
      </section>
    </>
  );
}
