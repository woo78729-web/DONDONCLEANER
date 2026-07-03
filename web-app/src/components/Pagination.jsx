export function Pagination({ pagination, onPageChange }) {
  if (!pagination) {
    return null;
  }

  return (
    <div className="pagination-bar">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={pagination.current_page <= 1}
        onClick={() => onPageChange(pagination.current_page - 1)}
      >
        上一頁
      </button>
      <span className="pagination-info">
        第 <strong>{pagination.current_page}</strong> / {pagination.last_page} 頁
        <span className="pagination-total">（共 {pagination.total} 筆）</span>
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={pagination.current_page >= pagination.last_page}
        onClick={() => onPageChange(pagination.current_page + 1)}
      >
        下一頁
      </button>
    </div>
  );
}
