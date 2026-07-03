import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { EmployeeAvatar } from '../components/EmployeeAvatar';
import { LeaveMonthCalendar } from '../components/LeaveMonthCalendar';
import { api } from '../api/client';
import { formatDateOnly } from '../utils/scheduleCalendar';
import '../components/schedule-calendar.css';

const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

function extractDateLeaveKeys(leaves, employeeId) {
  return new Set(
    leaves
      .filter(
        (leave) => leave.leave_type === 'date'
          && String(leave.user_id) === String(employeeId)
          && leave.leave_date,
      )
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

export default function AdminLeaveCalendarPage() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [leaves, setLeaves] = useState([]);
  const [baselineDateLeaves, setBaselineDateLeaves] = useState(() => new Set());
  const [draftDateLeaves, setDraftDateLeaves] = useState(() => new Set());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saveErrors, setSaveErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRange = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const monthEnd = endOfMonth(visibleMonth);

    return {
      date_from: formatDateOnly(startOfWeek(monthStart, { weekStartsOn: 1 })),
      date_to: formatDateOnly(endOfWeek(monthEnd, { weekStartsOn: 1 })),
    };
  }, [visibleMonth]);

  const hasPendingChanges = useMemo(
    () => !leaveSetsEqual(baselineDateLeaves, draftDateLeaves),
    [baselineDateLeaves, draftDateLeaves],
  );

  const loadEmployees = useCallback(async () => {
    const result = await api.getEmployees();
    const list = (Array.isArray(result.data) ? result.data : []).filter(
      (item) => item.role === 'employee' && item.is_active,
    );
    setEmployees(list);
    setSelectedEmployeeId((current) => current || (list[0] ? String(list[0].id) : ''));
  }, []);

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    setError('');
    setSaveErrors([]);

    try {
      const params = {
        ...loadRange,
      };

      if (selectedEmployeeId) {
        params.user_id = selectedEmployeeId;
      }

      const result = await api.getPlanningLeaves(params);
      const nextLeaves = result.data.leaves || [];
      const baseline = extractDateLeaveKeys(nextLeaves, selectedEmployeeId);

      setLeaves(nextLeaves);
      setBaselineDateLeaves(baseline);
      setDraftDateLeaves(new Set(baseline));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadRange, selectedEmployeeId]);

  useEffect(() => {
    loadEmployees().catch((err) => setError(err.message));
  }, [loadEmployees]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      return;
    }

    loadLeaves().catch((err) => setError(err.message));
  }, [loadLeaves, selectedEmployeeId]);

  const weeklyLeaves = useMemo(
    () => leaves.filter(
      (leave) => leave.leave_type === 'weekly'
        && String(leave.user_id) === String(selectedEmployeeId),
    ),
    [leaves, selectedEmployeeId],
  );

  const selectedEmployee = useMemo(
    () => employees.find((employee) => String(employee.id) === String(selectedEmployeeId)),
    [employees, selectedEmployeeId],
  );

  function confirmDiscardPendingChanges() {
    if (!hasPendingChanges) {
      return true;
    }

    return window.confirm('有未儲存的排假變更，確定要捨棄嗎？');
  }

  function handleEmployeeSelect(employeeId) {
    if (String(employeeId) === String(selectedEmployeeId)) {
      return;
    }

    if (!confirmDiscardPendingChanges()) {
      return;
    }

    setMessage('');
    setError('');
    setSelectedEmployeeId(String(employeeId));
  }

  function handleMonthChange(nextMonth) {
    if (!confirmDiscardPendingChanges()) {
      return;
    }

    setMessage('');
    setError('');
    setVisibleMonth(nextMonth);
  }

  function handleDayClick(dateKey) {
    if (!selectedEmployeeId || busy) {
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

  function handleDiscardChanges() {
    setDraftDateLeaves(new Set(baselineDateLeaves));
    setSaveErrors([]);
    setMessage('');
    setError('');
  }

  async function handleSave(forceDates = new Set()) {
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
        ...toAdd.map((leave_date) => ({
          leave_date,
          action: 'add',
          force: forceDates.has(leave_date),
        })),
        ...toRemove.map((leave_date) => ({
          leave_date,
          action: 'remove',
        })),
      ];

      const result = await api.batchAdminLeave({
        user_id: Number(selectedEmployeeId),
        changes,
      });

      const results = result.data.results || [];
      const needsConfirm = results.filter((item) => !item.success && item.needs_confirm);
      const hardFailures = results.filter((item) => !item.success && !item.needs_confirm);

      if (needsConfirm.length > 0 && forceDates.size === 0) {
        const labels = needsConfirm.map((item) => formatLeaveDateLabel(item.leave_date)).join('、');

        if (window.confirm(`以下日期當日已有單：${labels}\n仍要排假？`)) {
          await handleSave(new Set(needsConfirm.map((item) => item.leave_date)));
          return;
        }

        hardFailures.push(...needsConfirm);
      }

      await loadLeaves();

      if (hardFailures.length > 0) {
        setSaveErrors(hardFailures.map((item) => ({
          date: item.leave_date,
          message: item.message || '儲存失敗',
        })));
      }

      const successCount = result.data.success_count || 0;

      if (successCount > 0) {
        setMessage(`已儲存 ${successCount} 筆排假變更`);
      } else if (hardFailures.length === 0) {
        setMessage('沒有變更');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWeeklyLeave(leaveId) {
    if (!window.confirm('確定刪除此每週固定休？')) {
      return;
    }

    setMessage('');
    setError('');
    setSaveErrors([]);
    setBusy(true);

    try {
      const result = await api.deleteAdminLeave(leaveId);
      setMessage(result.message || '排假已刪除');
      await loadLeaves();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="排假行事曆">
      <section className="card admin-leave-page">
        <div className="card-header">
          <div>
            <h2 className="card-title">師傅排假</h2>
            <p className="hint">選擇師傅後，在月曆複選指定日期休假，再按「儲存本次修改」。月曆只顯示指定日期假；每週固定休見下方列表，派班行事曆會合併顯示。</p>
          </div>
        </div>

        <PageAlert type="success" message={message} />
        <PageAlert type="error" message={error} />

        {saveErrors.length > 0 && (
          <div className="alert alert-error admin-leave-page__save-errors">
            <p className="admin-leave-page__save-errors-title">以下日期未能儲存：</p>
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

        <div className="admin-leave-page__toolbar">
          <span className="field-label">選擇師傅</span>
          <div className="employee-strip employee-strip--compact">
            {employees.map((employee) => (
              <button
                key={employee.id}
                type="button"
                className={`employee-chip${String(selectedEmployeeId) === String(employee.id) ? ' is-active' : ''}`}
                onClick={() => handleEmployeeSelect(employee.id)}
                disabled={busy}
              >
                <EmployeeAvatar user={employee} size="sm" />
                <span>{employee.name || employee.account}</span>
              </button>
            ))}
          </div>
        </div>

        {selectedEmployee && (
          <p className="admin-leave-page__selected">
            目前編輯：
            {selectedEmployee.name || selectedEmployee.account}
            {hasPendingChanges ? '（有未儲存變更）' : ''}
          </p>
        )}

        <LeaveMonthCalendar
          visibleMonth={visibleMonth}
          onMonthChange={handleMonthChange}
          leaves={leaves}
          employeeId={selectedEmployeeId}
          baselineDateLeaves={baselineDateLeaves}
          draftDateLeaves={draftDateLeaves}
          onDayClick={handleDayClick}
          busy={busy || loading}
        />

        <div className="admin-leave-page__actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleDiscardChanges}
            disabled={!hasPendingChanges || busy}
          >
            取消修改
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleSave()}
            disabled={!hasPendingChanges || busy}
          >
            儲存本次修改
          </button>
        </div>

        {weeklyLeaves.length > 0 && (
          <div className="admin-leave-page__weekly">
            <h3 className="admin-leave-page__weekly-title">每週固定休</h3>
            <ul className="admin-leave-page__weekly-list">
              {weeklyLeaves.map((leave) => (
                <li key={leave.id} className="admin-leave-page__weekly-item">
                  <span>
                    每
                    {leave.weekday_label || WEEKDAY_LABELS[leave.weekday] || `週${leave.weekday}`}
                    {leave.note ? ` · ${leave.note}` : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDeleteWeeklyLeave(leave.id)}
                    disabled={busy}
                  >
                    刪除
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && <p className="hint">載入中…</p>}
      </section>
    </Layout>
  );
}
