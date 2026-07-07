function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

function formatNetSettlement(row) {
  const payout = Number(row.payout_from_finance || 0);
  const payment = Number(row.payment_to_finance || 0);

  if (payout > 0) {
    return `退 ${formatMoney(payout)}`;
  }

  if (payment > 0) {
    return formatMoney(payment);
  }

  return '0';
}

function LedgerTableHead({ showEmployee }) {
  return (
    <thead>
      <tr>
        <th>日期</th>
        {showEmployee && <th>師傅</th>}
        <th>客戶 / 備註</th>
        <th className="num">1500台</th>
        <th className="num">1300台</th>
        <th className="num">1000台</th>
        <th className="num">總台</th>
        <th className="num">案件金額</th>
        <th className="num">實收</th>
        <th className="num">應收現場</th>
        <th className="num">發票5%</th>
        <th className="num">應退師傅</th>
        <th className="num">淨額</th>
        <th>類型</th>
      </tr>
    </thead>
  );
}

function LedgerTableRow({
  row,
  showEmployee,
  isDaily = false,
}) {
  const units = row.units_by_price || {};
  const detailText = isDaily
    ? `${row.report_count} 筆（現金 ${row.cash_report_count}／匯款 ${row.remittance_report_count}）`
    : [row.customer_name, row.task_details].filter(Boolean).join(' · ');

  return (
    <tr>
      <td>{row.work_date}</td>
      {showEmployee && <td>{row.employee_name}</td>}
      <td className="settlement-ledger-table__detail">{detailText || '—'}</td>
      <td className="num">{units[1500] ?? 0}</td>
      <td className="num">{units[1300] ?? 0}</td>
      <td className="num">{units[1000] ?? 0}</td>
      <td className="num">{row.completed_units}</td>
      <td className="num">{formatMoney(row.total_job_amount)}</td>
      <td className="num">{formatMoney(row.employee_cash_received)}</td>
      <td className="num">{formatMoney(row.collect_from_employee)}</td>
      <td className="num">{formatMoney(row.invoice_surcharge_due)}</td>
      <td className="num">{formatMoney(row.advance_to_employee)}</td>
      <td className="num settlement-ledger-table__net">{formatNetSettlement(row)}</td>
      <td>
        {isDaily ? (
          row.remittance_report_count > 0 && row.cash_report_count > 0 ? '混合' : row.remittance_report_count > 0 ? '匯款' : '現金'
        ) : (
          row.payment_mode_label
        )}
      </td>
    </tr>
  );
}

function LedgerTableFoot({ totals, showEmployee }) {
  const units = totals.units_by_price || {};

  return (
    <tfoot>
      <tr>
        <td colSpan={showEmployee ? 2 : 1}><strong>合計</strong></td>
        <td />
        <td className="num"><strong>{units[1500] ?? 0}</strong></td>
        <td className="num"><strong>{units[1300] ?? 0}</strong></td>
        <td className="num"><strong>{units[1000] ?? 0}</strong></td>
        <td className="num"><strong>{totals.completed_units}</strong></td>
        <td className="num"><strong>{formatMoney(totals.total_job_amount)}</strong></td>
        <td className="num"><strong>{formatMoney(totals.employee_cash_received)}</strong></td>
        <td className="num"><strong>{formatMoney(totals.collect_from_employee)}</strong></td>
        <td className="num"><strong>{formatMoney(totals.invoice_surcharge_due)}</strong></td>
        <td className="num"><strong>{formatMoney(totals.advance_to_employee)}</strong></td>
        <td className="num"><strong>{formatNetSettlement(totals)}</strong></td>
        <td />
      </tr>
    </tfoot>
  );
}

export function SettlementLedgerTable({
  ledger,
  viewMode = 'daily',
  showEmployee = true,
}) {
  if (!ledger) {
    return null;
  }

  const rows = viewMode === 'detail' ? (ledger.detail_rows || []) : (ledger.daily_rows || []);
  const showEmployeeColumn = showEmployee && !ledger.user_id;

  return (
    <div className="table-wrap settlement-ledger-table-wrap">
      <table className="data-table settlement-ledger-table">
        <LedgerTableHead showEmployee={showEmployeeColumn} />
        <tbody>
          {rows.map((row) => (
            <LedgerTableRow
              key={viewMode === 'detail' ? `${row.report_id}` : `${row.user_id}-${row.work_date}`}
              row={row}
              showEmployee={showEmployeeColumn}
              isDaily={viewMode === 'daily'}
            />
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={showEmployeeColumn ? 14 : 13} className="hint">本月尚無回報明細</td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <LedgerTableFoot totals={ledger.totals} showEmployee={showEmployeeColumn} />
        )}
      </table>
    </div>
  );
}
