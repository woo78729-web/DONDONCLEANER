function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

function dayUnits(ledger, day) {
  const key = String(day);
  const source = ledger?.daily_units?.[key] || {};

  return {
    1500: source['1500'] || 0,
    1300: source['1300'] || 0,
    1000: source['1000'] || 0,
  };
}

function weekTotal(ledger, week) {
  const start = (week - 1) * 7 + 1;
  const end = Math.min(week * 7, 31);
  let units = 0;
  let revenue = 0;

  for (let day = start; day <= end; day += 1) {
    const unitsForDay = dayUnits(ledger, day);
    units += unitsForDay['1500'] + unitsForDay['1300'] + unitsForDay['1000'];
    revenue += (unitsForDay['1500'] * 1500) + (unitsForDay['1300'] * 1300) + (unitsForDay['1000'] * 1000);
  }

  return { units, revenue };
}

export function MonthlyLedgerGrid({ groupLabel, ledger, remittanceRates }) {
  if (!ledger) {
    return (
      <section className="ledger-grid card">
        <h3 className="card-title">{groupLabel}</h3>
        <p className="hint">此月份尚無 {groupLabel} 的舊帳資料。</p>
      </section>
    );
  }

  return (
    <section className="ledger-grid card table-card">
      <div className="card-header" style={{ padding: '16px 16px 0' }}>
        <h3 className="card-title">{groupLabel}</h3>
        <p className="hint">
          匯款參考：1500→{remittanceRates?.[1500]}｜1300→{remittanceRates?.[1300]}｜1000→{remittanceRates?.[1000]}
        </p>
      </div>
      <div className="table-wrap">
        <table className="data-table ledger-grid__table">
          <thead>
            <tr>
              <th>日期</th>
              <th className="num">1500台數</th>
              <th className="num">1300台數</th>
              <th className="num">1000台數</th>
              <th className="num">周結</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 31 }, (_, index) => {
              const day = index + 1;
              const units = dayUnits(ledger, day);
              const weekEnd = day % 7 === 0 || day === 31;
              const week = weekEnd ? weekTotal(ledger, Math.ceil(day / 7)) : null;

              return (
                <tr key={day}>
                  <td>{day}</td>
                  <td className="num">{units['1500'] || ''}</td>
                  <td className="num">{units['1300'] || ''}</td>
                  <td className="num">{units['1000'] || ''}</td>
                  <td className="num ledger-grid__week-total">
                    {weekEnd ? (
                      <>
                        <span>{week.units || ''}</span>
                        {week.revenue ? <small>{formatMoney(week.revenue)}</small> : null}
                      </>
                    ) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>總台數</th>
              <td className="num">{ledger.units_1500}</td>
              <td className="num">{ledger.units_1300}</td>
              <td className="num">{ledger.units_1000}</td>
              <td className="num">{ledger.total_units}</td>
            </tr>
            <tr>
              <th>總營業額</th>
              <td colSpan={4} className="num">{formatMoney(ledger.total_revenue)}</td>
            </tr>
            <tr>
              <th>毛利</th>
              <td colSpan={4} className="num">{formatMoney(ledger.gross_profit)}</td>
            </tr>
            <tr>
              <th>營利</th>
              <td colSpan={4} className="num">{formatMoney(ledger.net_profit)}</td>
            </tr>
            <tr>
              <th>弘毅分</th>
              <td colSpan={4} className="num">{formatMoney(ledger.hongyi_share)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
