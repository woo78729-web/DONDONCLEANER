import { Link } from 'react-router-dom';

function TodoList({ title, items, emptyText, linkTo, linkLabel }) {
  return (
    <div className="daily-announcement__todo-block">
      <div className="daily-announcement__todo-head">
        <h3>{title}</h3>
        <span className="daily-announcement__count">{items.length}</span>
        {linkTo && (
          <Link to={linkTo} className="daily-announcement__link">{linkLabel || '前往處理'}</Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="hint">{emptyText}</p>
      ) : (
        <ul className="daily-announcement__list">
          {items.map((item) => (
            <li key={item.id}>
              <p className="daily-announcement__item-title">{item.label}</p>
              {item.detail && <p className="hint">{item.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DailyAnnouncementModal({
  open,
  loading,
  error,
  data,
  onClose,
  onRefresh,
}) {
  if (!open) {
    return null;
  }

  const todos = data?.todos || {
    pending_mail: [],
    pending_maintenance: [],
  };
  const activity = data?.activity || [];

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel daily-announcement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-announcement-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="daily-announcement-title" className="modal-title">公告</h2>
            <p className="hint">
              {data?.date ? `${data.date} 當日待辦與歷程` : '當日待辦與歷程'}
            </p>
          </div>
          <div className="toolbar" style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={loading}>
              重新整理
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              關閉
            </button>
          </div>
        </div>

        {error && <p className="hint" style={{ color: '#c62828', padding: '0 16px' }}>{error}</p>}
        {loading && !data ? (
          <p className="hint" style={{ padding: 16 }}>載入中…</p>
        ) : (
          <div className="daily-announcement__body">
            <section className="daily-announcement__section">
              <h3 className="daily-announcement__section-title">當日待辦事項</h3>
              <div className="daily-announcement__todo-grid">
                <TodoList
                  title="待郵寄"
                  items={todos.pending_mail || []}
                  emptyText="目前沒有待郵寄項目"
                  linkTo="/admin/mail-tracking"
                  linkLabel="寄件追蹤"
                />
                <TodoList
                  title="待維修"
                  items={todos.pending_maintenance || []}
                  emptyText="目前沒有待維修項目"
                  linkTo="/admin/emergency-maintenance"
                  linkLabel="緊急維修"
                />
              </div>
            </section>

            <section className="daily-announcement__section daily-announcement__section--activity">
              <h3 className="daily-announcement__section-title">當日歷程記錄</h3>
              {activity.length === 0 ? (
                <p className="hint">今天尚無排單或回報紀錄</p>
              ) : (
                <ul className="daily-announcement__timeline">
                  {activity.map((item) => (
                    <li key={item.id} className={`daily-announcement__timeline-item is-${item.type}`}>
                      <div>
                        <p className="daily-announcement__item-title">
                          {item.detail_line || item.title}
                        </p>
                        {item.summary && <p className="hint">{item.summary}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
