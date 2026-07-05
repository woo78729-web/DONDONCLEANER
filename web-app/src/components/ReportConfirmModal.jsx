export function ReportConfirmModal({
  open,
  summary,
  onConfirm,
  onCancel,
  submitting = false,
}) {
  if (!open || !summary) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">確認送出回報</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="關閉">×</button>
        </div>

        <p className="hint">送出後不能更改，如需調整請聯絡管理員。</p>

        <dl className="schedule-detail">
          <div>
            <dt>預計台數</dt>
            <dd>{summary.plannedUnits}</dd>
          </div>
          <div>
            <dt>完成台數</dt>
            <dd>{summary.completedUnits}</dd>
          </div>
          {summary.unitMismatch && (
            <>
              {summary.skippedUnits > 0 && (
                <div>
                  <dt>未洗台數</dt>
                  <dd>{summary.skippedUnits}</dd>
                </div>
              )}
              <div>
                <dt>台數異動原因</dt>
                <dd>{summary.skipReason || '-'}</dd>
              </div>
            </>
          )}
          <div>
            <dt>{summary.paidToCompany ? '匯款金額' : '實收金額'}</dt>
            <dd>{summary.paidToCompany ? summary.totalAmount : summary.collectedAmount} 元</dd>
          </div>
          {summary.paidToCompany && (
            <div>
              <dt>員工實收</dt>
              <dd>0 元（客戶直接匯入宏逸帳戶）</dd>
            </div>
          )}
          {summary.paidToCompany && (
            <p className="hint">送出後會列入「匯款追查」待確認入帳，確認後才計入宏逸帳戶。</p>
          )}
          {summary.temporaryPostage > 0 && (
            <div>
              <dt>臨時郵資</dt>
              <dd>{summary.temporaryPostage} 元</dd>
            </div>
          )}
          {summary.reportInvoiceTaxCost > 0 && (
            <div>
              <dt>稅金 8%</dt>
              <dd>{summary.reportInvoiceTaxCost} 元</dd>
            </div>
          )}
        </dl>

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={onConfirm}>
            {submitting ? '送出中...' : '確認送出'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>返回修改</button>
        </div>
      </div>
    </div>
  );
}
