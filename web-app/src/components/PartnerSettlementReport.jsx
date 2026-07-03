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

function TakeHomeHero({ label, amount, hint, accountLabel }) {
  const numeric = Math.max(0, Number(amount || 0));

  return (
    <div className="partner-settlement-hero">
      {accountLabel && <p className="partner-settlement-hero__account">{accountLabel}</p>}
      <p className="partner-settlement-hero__label">{label}</p>
      <p className="partner-settlement-hero__value">{formatMoney(numeric)} 元</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function PartnerSettlementReport({ settlement }) {
  if (!settlement) {
    return null;
  }

  const { basis, inter_partner: interPartner, atai, hongyi } = settlement;

  return (
    <>
      {interPartner && (
        <section className="card partner-settlement-hero-card">
          <div className="card-header">
            <h2 className="card-title">合夥結算（軋差）</h2>
            <p className="hint">
              算法：每人分潤 − 發票帳客戶匯款。例：分潤 30,000、客戶匯款 20,000 → 東東補 10,000；
              分潤 30,000、客戶匯款 40,000 → 宏逸退 10,000 給東東。
            </p>
          </div>
          <div className="partner-settlement-basis">
            <SettlementLine label="總淨值收益毛利" amount={basis.gross_profit} />
            <SettlementLine label="每人分潤（對半）" amount={interPartner.profit_share_half} />
            <SettlementLine
              label="發票帳客戶匯款（宏逸代管）"
              amount={interPartner.customer_remittance_in_account}
            />
            <SettlementLine
              label={interPartner.direction_label}
              amount={interPartner.direction === 'dongdong_to_hongyi' ? interPartner.settlement_amount : -interPartner.settlement_amount}
              signed
              hint={interPartner.formula_hint}
            />
          </div>
          <TakeHomeHero
            label={interPartner.direction_label}
            amount={interPartner.settlement_amount}
            hint={
              interPartner.direction === 'dongdong_to_hongyi'
                ? `東東公司帳應補給宏逸 ${formatMoney(interPartner.settlement_amount)} 元`
                : `宏逸發票帳應退東東 ${formatMoney(interPartner.settlement_amount)} 元`
            }
          />
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">本月怎麼算（共同基礎）</h2>
          <p className="hint">
            合夥分潤對半：東東公司帳（阿泰代管，師傅現金）＋ 宏逸發票帳（宏逸代管，客戶匯款）。
            扣除公司開支後，總毛利兩人各拿一半；客戶匯款不額外加到阿泰份。
          </p>
        </div>
        <div className="partner-settlement-basis">
          <SettlementLine label="師傅交回公司（工作淨額）" amount={basis.net_from_employees_jobs} />
          {basis.compensation_due_to_company > 0 && (
            <SettlementLine
              label="加：師傅賠償應入公司"
              amount={basis.compensation_due_to_company}
              signed
              hint="賠款由公司代墊，師傅分擔款入東東公司帳（阿泰代收）"
            />
          )}
          <SettlementLine label="＝ 師傅交回合計" amount={basis.net_from_employees} />
          <SettlementLine label="減：本月開支（含賠款代墊、固定費等）" amount={-basis.monthly_expense_total} signed />
          <SettlementLine label="＝ 總毛利" amount={basis.gross_profit} />
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

      <section className="partner-settlement-grid">
        <article className="card partner-settlement-card">
          <div className="card-header">
            <h2 className="card-title">阿泰結算單</h2>
            <p className="hint">{atai.account_label}：師傅現金、賠償代收、公司代墊都在這邊。</p>
          </div>

          <div className="partner-settlement-lines">
            <SettlementLine label="對半分潤（你的分潤）" amount={atai.profit_share_half} />
          </div>

          <TakeHomeHero
            accountLabel={atai.account_label}
            label="阿泰分潤收入"
            amount={atai.income ?? atai.profit_share_half}
            hint="只算合夥對半，不含宏逸發票帳的客戶匯款"
          />

          <div className="partner-settlement-lines partner-settlement-lines--after-hero">
            <SettlementLine
              label="減：公司代墊（廣告、固定費、發票稅8%、賠款等）"
              amount={-atai.advances}
              signed
              hint={
                atai.invoice_tax_company_advance > 0
                  ? `含發票稅金 8% ${formatMoney(atai.invoice_tax_company_advance)} 元，已由公司分攤毛利`
                  : '你先行代墊的公司開支（含維修賠款全額）'
              }
            />
            {atai.compensation_from_employees > 0 && (
              <SettlementLine
                label="其中師傅賠償應入公司"
                amount={atai.compensation_from_employees}
                hint="已計入「師傅交回合計」，入東東公司帳"
              />
            )}
            {atai.inter_partner_settlement > 0 && (
              <SettlementLine
                label={atai.inter_partner_settlement_label || '宏逸發票帳應退東東'}
                amount={atai.inter_partner_settlement}
                hint="發票帳匯款多於宏逸分潤時，應退回東東公司帳"
              />
            )}
            {atai.take_home < 0 && (
              <SettlementLine
                label="代墊大於分潤（缺口）"
                amount={atai.take_home}
                signed
                hint="師傅月底應繳與代墊回收後再軋差"
              />
            )}
          </div>

          <div className="partner-settlement-footnote">
            <p className="hint">
              <strong>東東公司帳現金</strong>：師傅應繳 {formatMoney(atai.employee_payment_due)} 元
              {atai.compensation_from_employees > 0 && (
                <>；賠償應入公司 {formatMoney(atai.compensation_from_employees)} 元</>
              )}
              {atai.employee_payout_due > 0 && (
                <>；匯款案應退師傅 {formatMoney(atai.employee_payout_due)} 元</>
              )}
              。
            </p>
          </div>
        </article>

        <article className="card partner-settlement-card">
          <div className="card-header">
            <h2 className="card-title">宏逸結算單</h2>
            <p className="hint">{hongyi.account_label}：客戶匯款進這裡，發票由宏逸開立。</p>
          </div>

          <div className="partner-settlement-lines">
            <SettlementLine label="對半分潤（宏逸分潤）" amount={hongyi.profit_share} />
            {hongyi.customer_remittance_in_account > 0 && (
              <SettlementLine
                label="發票帳客戶匯款（代管）"
                amount={hongyi.customer_remittance_in_account}
                hint="在宏逸發票帳，不是額外分潤；結算時與分潤軋差"
              />
            )}
            {hongyi.inter_partner_settlement !== 0 && (
              <SettlementLine
                label={hongyi.inter_partner_settlement_label}
                amount={hongyi.inter_partner_settlement}
                signed
                hint={
                  hongyi.inter_partner_settlement >= 0
                    ? '分潤大於發票帳匯款時，東東公司帳應補給宏逸'
                    : '發票帳匯款大於分潤時，宏逸應退回東東公司帳'
                }
              />
            )}
          </div>

          <TakeHomeHero
            accountLabel={hongyi.account_label}
            label="宏逸分潤收入"
            amount={hongyi.income ?? hongyi.profit_share}
            hint="合夥對半；客戶匯款另列在發票帳，不併入分潤"
          />

          <div className="partner-settlement-footnote">
            <p className="hint">
              發票帳已收匯款 {formatMoney(hongyi.customer_remittance_in_account)} 元
              {hongyi.customer_remittance_confirmed !== hongyi.customer_remittance_in_account && (
                <>（已確認入帳 {formatMoney(hongyi.customer_remittance_confirmed)} 元）</>
              )}
              。與分潤 {formatMoney(hongyi.profit_share)} 元軋差後，
              {hongyi.inter_partner_settlement >= 0
                ? `東東應給 ${formatMoney(hongyi.inter_partner_settlement)} 元。`
                : `宏逸應退東東 ${formatMoney(Math.abs(hongyi.inter_partner_settlement))} 元。`}
            </p>
          </div>
        </article>
      </section>
    </>
  );
}
