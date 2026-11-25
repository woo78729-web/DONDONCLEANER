import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const ACTIVITY_FILTERS = [
  { type: 'dispatch', label: '派單' },
  { type: 'report', label: '回報' },
  { type: 'cancel', label: '取消' },
  { type: 'date_change', label: '調日' },
];

const FILTER_STORAGE_KEY = 'todoBoardActivityFilters';

function defaultFilterState() {
  return Object.fromEntries(ACTIVITY_FILTERS.map((item) => [item.type, true]));
}

function loadFilterState() {
  const defaults = defaultFilterState();

  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...Object.fromEntries(
        ACTIVITY_FILTERS.map((item) => [item.type, parsed?.[item.type] !== false]),
      ),
    };
  } catch {
    return defaults;
  }
}

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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

function ActivityList({ items, emptyText }) {
  if (!items.length) {
    return <p className="hint">{emptyText}</p>;
  }

  return (
    <ul className="daily-announcement__timeline">
      {items.map((item) => (
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
  );
}

function filterActivityItems(items, filters) {
  const enabled = new Set(
    ACTIVITY_FILTERS.filter((item) => filters[item.type]).map((item) => item.type),
  );

  return items.filter((item) => enabled.has(item.type));
}

export function DailyAnnouncementModal({
  open,
  loading,
  error,
  data,
  yearMonth,
  onYearMonthChange,
  onClose,
  onRefresh,
}) {
  const [localMonth, setLocalMonth] = useState(yearMonth || currentYearMonth());
  const [activityFilters, setActivityFilters] = useState(() => loadFilterState());

  useEffect(() => {
    if (yearMonth) {
      setLocalMonth(yearMonth);
    }
  }, [yearMonth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(activityFilters));
    } catch {
      // ignore storage failures
    }
  }, [activityFilters]);

  const todos = data?.todos || {
    pending_mail: [],
    pending_maintenance: [],
  };
  const activity = data?.activity || [];
  const monthlyActivity = data?.monthly?.activity || [];

  const filteredActivity = useMemo(
    () => filterActivityItems(activity, activityFilters),
    [activity, activityFilters],
  );
  const filteredMonthlyActivity = useMemo(
    () => filterActivityItems(monthlyActivity, activityFilters),
    [monthlyActivity, activityFilters],
  );

  if (!open) {
    return null;
  }

  function handleMonthChange(event) {
    const next = event.target.value;
    setLocalMonth(next);
    onYearMonthChange?.(next);
  }

  function toggleFilter(type) {
    setActivityFilters((current) => ({
      ...current,
      [type]: !current[type],
    }));
  }

  const hasAnyFilter = ACTIVITY_FILTERS.some((item) => activityFilters[item.type]);

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
            <h2 id="daily-announcement-title" className="modal-title">代辦事項</h2>
            <p className="hint">
              {data?.date ? `${data.date} 待辦與歷程` : '待辦與歷程'}
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
              <div className="daily-announcement__filter-bar" role="group" aria-label="歷程類型篩選">
                <span className="daily-announcement__filter-label">顯示紀錄</span>
                {ACTIVITY_FILTERS.map((item) => (
                  <label key={item.type} className="field field-checkbox daily-announcement__filter-option">
                    <input
                      type="checkbox"
                      checked={Boolean(activityFilters[item.type])}
                      onChange={() => toggleFilter(item.type)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <div className="daily-announcement__activity-stack">
                <div className="daily-announcement__activity-pane">
                  <h3 className="daily-announcement__section-title">當日歷程記錄</h3>
                  <ActivityList
                    items={hasAnyFilter ? filteredActivity : []}
                    emptyText={hasAnyFilter ? '今天尚無符合條件的紀錄' : '請至少勾選一種紀錄類型'}
                  />
                </div>
                <div className="daily-announcement__activity-pane">
                  <div className="daily-announcement__month-head">
                    <h3 className="daily-announcement__section-title">當月歷程記錄</h3>
                    <label className="field daily-announcement__month-field">
                      <span className="field-label">月份</span>
                      <input
                        type="month"
                        value={localMonth}
                        onChange={handleMonthChange}
                      />
                    </label>
                  </div>
                  {loading ? (
                    <p className="hint">載入中…</p>
                  ) : (
                    <ActivityList
                      items={hasAnyFilter ? filteredMonthlyActivity : []}
                      emptyText={hasAnyFilter ? '這個月尚無符合條件的紀錄' : '請至少勾選一種紀錄類型'}
                    />
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
