import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { LeaveMonthCalendar } from '../components/LeaveMonthCalendar';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateOnly } from '../utils/scheduleCalendar';
import '../components/schedule-calendar.css';

const WEEKDAY_OPTIONS = [
  { value: 0, label: '週日' },
  { value: 1, label: '週一' },
  { value: 2, label: '週二' },
  { value: 3, label: '週三' },
  { value: 4, label: '週四' },
  { value: 5, label: '週五' },
  { value: 6, label: '週六' },
];

function parseMonthKey(monthKey) {
  return startOfMonth(new Date(`${monthKey}-01T12:00:00`));
}

function extractDateLeaveKeys(leaves) {
  return new Set(
    leaves
      .filter((leave) => leave.leave_type === 'date' && leave.leave_date)
      .map((leave) => formatDateOnly(leave.leave_date)),
  );
}

function leaveSetsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function formatLeaveDateLabel(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return format(date, 'M/d (EEEEE)', { locale: zhTW });
}

export default function EmployeeLeavePage() {
  const { user } = useAuth();
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [allowedMonths, setAllowedMonths] = useState([]);
  const [isNewEmployeeWindow, setIsNewEmployeeWindow] = useState(false);
  const [leaves, setLeaves] = useState([]);
  const [baselineDateLeaves, setBaselineDateLeaves] = useState(() => new Set());
  const [draftDateLeaves, setDraftDateLeaves] = useState(() => new Set());
  const [selectedWeekdays, setSelectedWeekdays] = useState(() => new Set());
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('date');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saveErrors, setSaveErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const employeeId = user?.id ? String(user.id) : '';

  const hasPendingDateChanges = useMemo(
    () => !leaveSetsEqual(baselineDateLeaves, draftDateLeaves),
    [baselineDateLeaves, draftDateLeaves],
  );

  const existingWeeklyWeekdays = useMemo(
    () => new Set(
      leaves
        .filter((leave) => leave.leave_type === 'weekly')
        .map((leave) => Number(leave.weekday)),
    ),
    [leaves],
  );

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    setError('');
    setSaveErrors([]);

    try {
      const result = await api.getEmployeeLeaves();
      const nextLeaves = result.data.leaves || [];
      const baseline = extractDateLeaveKeys(nextLeaves);
      const nextAllowedMonths = result.data.allowed_months || [];
      const defaultMonth = result.data.default_month || nextAllowedMonths[0];

      setRegistrationOpen(Boolean(result.data.registration_open));
      setRegistrationMessage(result.data.registration_message || '');
      setAllowedMonths(nextAllowedMonths);
      setIsNewEmployeeWindow(Boolean(result.data.is_new_employee_window));
      setLeaves(nextLeaves);
      setBaselineDateLeaves(baseline);
      setDraftDateLeaves(new Set(baseline));

      if (defaultMonth) {
        setVisibleMonth(parseMonthKey(defaultMonth));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaves().catch((err) => setError(err.message));
  }, [loadLeaves]);

  function confirmDiscardPendingDateChanges() {
    if (!hasPendingDateChanges) {
      return true;
    }

    return window.confirm('有未確認的排假變更，確定要捨棄嗎？');
  }

  function handleMonthChange(nextMonth) {
    const monthKey = format(nextMonth, 'yyyy-MM');

    if (allowedMonths.length > 0 && !allowedMonths.includes(monthKey)) {
      return;
    }

    if (!confirmDiscardPendingDateChanges()) {
      return;
    }

    setVisibleMonth(startOfMonth(nextMonth));
    setSaveErrors([]);
  }

  function handleDayClick(dateKey) {
    if (!registrationOpen || busy) {
      return;
    }

    setMessage('');
    setError('');
    setSaveErrors([]);
    setDraftDateLeaves((current) => {
      const next = new Set(current);

      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }

      return next;
    });
  }

  function handleDiscardDateChanges() {
    setDraftDateLeaves(new Set(baselineDateLeaves));
    setSaveErrors([]);
    setMessage('');
    setError('');
  }

  async function handleSaveDates() {
    const toAdd = [...draftDateLeaves].filter((dateKey) => !baselineDateLeaves.has(dateKey));
    const toRemove = [...baselineDateLeaves].filter((dateKey) => !draftDateLeaves.has(dateKey));

    if (!toAdd.length && !toRemove.length) {
      setMessage('沒有變更');
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');
    setSaveErrors([]);

    try {
      const changes = [
        ...toAdd.map((leave_date) => ({ leave_date, action: 'add' })),
        ...toRemove.map((leave_date) => ({ leave_date, action: 'remove' })),
      ];

      const result = await api.batchEmployeeLeave({
        changes,
        note: note.trim() || null,
      });

      const results = result.data.results || [];
      const failures = results.filter((item) => !item.success);

      await loadLeaves();

      if (failures.length > 0) {
        setSaveErrors(failures.map((item) => ({
          date: item.leave_date,
          message: item.message || '登記失敗',
        })));
      }

      const successCount = result.data.success_count || 0;

      if (successCount > 0) {
        setMessage(`已確認 ${successCount} 筆排假`);
        setNote('');
      } else if (failures.length === 0) {
        setMessage('沒有變更');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleWeekday(value) {
    if (existingWeeklyWeekdays.has(value)) {
      return;
    }

    setSelectedWeekdays((current) => {
      const next = new Set(current);

      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }

      return next;
    });
  }

  async function handleSaveWeekly() {
    setMessage('');
    setError('');

    const weekdaysToCreate = [...selectedWeekdays].filter(
      (weekday) => !existingWeeklyWeekdays.has(weekday),
    );

    if (weekdaysToCreate.length === 0) {
      setError('請至少選擇一個尚未登記的固定休息日');
      return;
    }

    setBusy(true);

    try {
      const trimmedNote = note.trim() || null;
      const failures = [];

      for (const weekday of weekdaysToCreate) {
        try {
          await api.createEmployeeLeave({
            leave_type: 'weekly',
            weekday,
            note: trimmedNote,
          });
        } catch (err) {
          const label = WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.label || `週${weekday}`;
          failures.push(`${label}：${err.message}`);
        }
      }

      setSelectedWeekdays(new Set());
      setNote('');
      await loadLeaves();

      if (failures.length > 0) {
        setError(`以下日期未能登記：\n${failures.join('\n')}`);
        if (weekdaysToCreate.length > failures.length) {
          setMessage('部分固定休登記成功');
        }
        return;
      }

      setMessage(`已登記 ${weekdaysToCreate.length} 個固定休息日`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(leaveId) {
    if (!window.confirm('確定取消此排假？')) {
      return;
    }

    setMessage('');
    setError('');

    try {
      await api.deleteEmployeeLeave(leaveId);
      setMessage('排假已取消');
      await loadLeaves();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title="排假登記">
      <section className="card admin-leave-page">
        <div className="card-header">
          <div>
            <h2 className="card-title">師傅排假</h2>
            <p className="hint">
              指定日期：在月曆複選後按確認。一般員工每月 20–25 日登記下個月；新人加入後 3 天可登記當月
              {isNewEmployeeWindow && allowedMonths.length > 1 ? '及下個月' : ''}。
            </p>
          </div>
        </div>

        <div className={`alert${registrationOpen ? ' alert-success' : ' alert-warning'}`}>
          {registrationMessage || (registrationOpen ? '目前開放排假' : '目前非排假開放時間')}
        </div>

        <PageAlert type="success" message={message} />
        <PageAlert type="error" message={error} />

        {saveErrors.length > 0 && (
          <div className="alert alert-error admin-leave-page__save-errors">
            <p className="admin-leave-page__save-errors-title">以下日期未能登記：</p>
            <ul className="admin-leave-page__save-errors-list">
              {saveErrors.map((item) => (
                <li key={item.date}>
                  {formatLeaveDateLabel(item.date)}
                  ：
                  {item.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="field" style={{ marginTop: 16 }}>
          <span className="field-label">排假方式</span>
          <div className="option-chip-group">
            <button
              type="button"
              className={`option-chip${mode === 'date' ? ' is-active' : ''}`}
              onClick={() => setMode('date')}
            >
              指定日期
            </button>
            <button
              type="button"
              className={`option-chip${mode === 'weekly' ? ' is-active' : ''}`}
              onClick={() => setMode('weekly')}
            >
              每週固定休息
            </button>
          </div>
        </div>

        {mode === 'date' ? (
          <>
            <p className="hint">請在月曆複選指定日期休假，每週固定休請改用下方「每週固定休息」。</p>
            <LeaveMonthCalendar
              visibleMonth={visibleMonth}
              onMonthChange={handleMonthChange}
              leaves={leaves}
              employeeId={employeeId}
              baselineDateLeaves={baselineDateLeaves}
              draftDateLeaves={draftDateLeaves}
              allowedMonths={allowedMonths}
              onDayClick={handleDayClick}
              busy={busy || loading || !registrationOpen}
            />

            <label className="field" style={{ marginTop: 12 }}>
              <span className="field-label">備註（選填）</span>
              <input
                className="field-control"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={!registrationOpen || busy}
              />
            </label>

            <div className="admin-leave-page__actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleDiscardDateChanges}
                disabled={!hasPendingDateChanges || busy || !registrationOpen}
              >
                取消修改
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveDates}
                disabled={!hasPendingDateChanges || busy || !registrationOpen}
              >
                確認登記
              </button>
            </div>
          </>
        ) : (
          <div className="employee-leave-form">
            <div className="field employee-leave-weekday-field" style={{ marginTop: 12 }}>
              <span className="field-label">每週固定（可複選）</span>
              <div className="option-chip-group option-chip-group--weekday" role="group" aria-label="每週固定休息日">
                {WEEKDAY_OPTIONS.map((option) => {
                  const alreadyRegistered = existingWeeklyWeekdays.has(option.value);
                  const isSelected = selectedWeekdays.has(option.value) || alreadyRegistered;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={alreadyRegistered || !registrationOpen || busy}
                      className={[
                        'option-chip option-chip--weekday',
                        isSelected ? ' is-active' : '',
                        alreadyRegistered ? ' is-registered' : '',
                      ].join('')}
                      onClick={() => toggleWeekday(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="hint">已登記的固定休無法重複選取，請至下方列表取消後再改。</p>
            </div>

            <label className="field">
              <span className="field-label">備註（選填）</span>
              <input
                className="field-control"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={!registrationOpen || busy}
              />
            </label>

            <div className="admin-leave-page__actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveWeekly}
                disabled={
                  !registrationOpen
                  || busy
                  || selectedWeekdays.size === 0
                }
              >
                {registrationOpen ? '確認登記' : '目前非開放時間'}
              </button>
            </div>
          </div>
        )}

        <div className="employee-leave-list">
          <h3 className="card-subtitle">已登記排假</h3>
          {loading && <p className="hint">載入中…</p>}
          {!loading && leaves.length === 0 && <p className="hint">尚無排假紀錄</p>}
          {leaves.map((leave) => (
            <div key={leave.id} className="employee-leave-item">
              <div>
                <strong>
                  {leave.leave_type === 'weekly'
                    ? `每週${leave.weekday_label || ''}固定休`
                    : formatDateOnly(leave.leave_date)}
                </strong>
                {leave.note && <span className="hint"> · {leave.note}</span>}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!registrationOpen || busy}
                onClick={() => handleDelete(leave.id)}
              >
                取消
              </button>
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}
