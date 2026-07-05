import { Link } from 'react-router-dom';

export function UnitChangeAlertModal({
  open,
  items = [],
  onClose,
  dismissing = false,
}) {
  if (!open || !items.length) {
    return null;
  }

  return (
    <div className="modal-overlay schedule-form-overlay" role="presentation" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">台數異動通知</h2>
            <p className="hint">以下回報的完成台數與排班預計不同，請確認金額與原因。</p>
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
                <th>預計</th>
                <th>完成</th>
                <th>異動原因</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.work_date}</td>
                  <td>{item.employee_name || '-'}</td>
                  <td>{item.customer_name || item.customer_address || '-'}</td>
                  <td className="num">{item.planned_units}</td>
                  <td className="num">{item.completed_units}</td>
                  <td>{item.skip_reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <Link to="/admin/reports" className="btn btn-primary btn-pill" onClick={onClose}>
            前往回報查詢
          </Link>
          <button type="button" className="btn btn-secondary btn-pill" onClick={onClose} disabled={dismissing}>
            {dismissing ? '處理中...' : '我知道了'}
          </button>
        </div>
      </div>
    </div>
  );
}
