import { Link } from 'react-router-dom';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

export function RemittanceAlertModal({
  open,
  items = [],
  onClose,
}) {
  if (!open || !items.length) {
    return null;
  }

  return (
    <div className="modal-overlay schedule-form-overlay" role="presentation" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">匯款催繳提醒</h2>
            <p className="hint">以下案件已超過兩週未確認入帳，請聯絡客戶催繳。</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">×</button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>師傅</th>
                <th>客戶</th>
                <th>匯款金額</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.work_date}</td>
                  <td>{item.employee_name || '-'}</td>
                  <td>{item.customer_name || item.customer_address || '-'}</td>
                  <td className="num">{formatMoney(item.amount)}</td>
                  <td>{item.status_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <Link to="/admin/remittance-tracking" className="btn btn-primary btn-pill" onClick={onClose}>
            前往匯款追查
          </Link>
          <button type="button" className="btn btn-secondary btn-pill" onClick={onClose}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
