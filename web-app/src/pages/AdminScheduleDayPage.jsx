import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { ScheduleFormModal } from '../components/ScheduleFormModal';
import { ScheduleSnapshotModal } from '../components/ScheduleSnapshotModal';
import { ScheduleSuccessModal } from '../components/ScheduleSuccessModal';
import { EmployeeAvatar } from '../components/EmployeeAvatar';
import { ScheduleTechnicianBadge } from '../components/ScheduleTechnicianBadge';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { canManageSchedulePricing } from '../utils/permissions';
import {
  buildSchedulePayload,
  buildSchedulePayloads,
  buildScheduleCardLine,
  buildScheduleSuccessSummary,
  scheduleHasMailTrackingItem,
  canModifyScheduleByMonth,
  canEditSchedule,
  canDeleteSchedule,
  canMutateScheduleWorkDate,
  emptyScheduleForm,
  expandLeavesToEvents,
  formatChineseTimeRange,
  formatDateOnly,
  formatTimeValue,
  getCalendarLoadRange,
  getLeaveEventStyle,
  getScheduleEventStyle,
  hasScheduleReport,
  isSlotInPast,
  LEAVE_BAND_END_HOUR,
  LEAVE_BAND_START_HOUR,
  scheduleToForm,
  slotToForm,
} from '../utils/scheduleCalendar';

function isValidDateParam(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISO(value).getTime());
}

function shiftDateParam(dateStr, days) {
  const next = parseISO(dateStr);
  next.setDate(next.getDate() + days);
  return formatDateOnly(next);
}

function formatDayTitle(dateStr) {
  return format(parseISO(dateStr), 'yyyy年M月d日 EEEE', { locale: zhTW });
}

export default function AdminScheduleDayPage() {
  const { date: dateParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.role || 'admin';
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [form, setForm] = useState(emptyScheduleForm);
  const [editId, setEditId] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [snapshotSchedule, setSnapshotSchedule] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successSummary, setSuccessSummary] = useState(null);
  const [pendingMailRedirect, setPendingMailRedirect] = useState(false);

  const sortedSchedules = useMemo(
    () => [...schedules].sort((left, right) => (
      formatTimeValue(left.start_time).localeCompare(formatTimeValue(right.start_time))
    )),
    [schedules],
  );

  const dayLeaveEvents = useMemo(() => {
    let events = expandLeavesToEvents(leaves, dateParam, dateParam);

    if (selectedEmployeeId) {
      events = events.filter((event) => String(event.resource?.user_id) === String(selectedEmployeeId));
    }

    return events.sort((left, right) => left.start - right.start);
  }, [dateParam, leaves, selectedEmployeeId]);

  const dayTimelineEntries = useMemo(() => {
    const leaveEntries = dayLeaveEvents.map((event) => ({
      kind: 'leave',
      key: event.id,
      leave: event.resource,
      sortKey: `${String(LEAVE_BAND_START_HOUR).padStart(2, '0')}:00`,
    }));

    const scheduleEntries = sortedSchedules.map((schedule) => ({
      kind: 'schedule',
      key: `schedule-${schedule.id}`,
      schedule,
      sortKey: formatTimeValue(schedule.start_time),
    }));

    return [...leaveEntries, ...scheduleEntries].sort((left, right) => (
      left.sortKey.localeCompare(right.sortKey)
    ));
  }, [dayLeaveEvents, sortedSchedules]);

  const leaveTimeLabel = `${String(LEAVE_BAND_START_HOUR).padStart(2, '0')}:00 - ${String(LEAVE_BAND_END_HOUR).padStart(2, '0')}:00`;

  const loadEmployees = useCallback(async () => {
    const result = await api.getEmployees();
    setEmployees(result.data.filter((item) => item.role === 'employee' && item.is_active));
  }, []);

  const loadSchedules = useCallback(async () => {
    if (!isValidDateParam(dateParam)) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const leaveRange = getCalendarLoadRange(parseISO(dateParam));
      const [result, leaveResult] = await Promise.all([
        api.getCalendarSchedules({
          date_from: dateParam,
          date_to: dateParam,
          user_id: selectedEmployeeId || undefined,
        }),
        api.getPlanningLeaves(leaveRange),
      ]);

      setSchedules(result.data.schedules);
      setLeaves(leaveResult.data.leaves || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateParam, selectedEmployeeId]);

  useEffect(() => {
    if (!isValidDateParam(dateParam)) {
      navigate('/admin/schedules', { replace: true });
      return;
    }

    loadEmployees().catch((err) => setError(err.message));
  }, [dateParam, navigate, loadEmployees]);

  useEffect(() => {
    loadSchedules().catch((err) => setError(err.message));
  }, [loadSchedules]);

  function openCreate() {
    const start = new Date(`${dateParam}T09:00:00`);
    const slot = { start, useDefaultShift: true };

    if (isSlotInPast({ start, end: new Date(`${dateParam}T10:00:00`) }, { userRole })) {
      setError('不可預約過去的日期或時間，請選擇現在之後的時段');
      return;
    }

    setEditId(null);
    setEditingSchedule(null);
    setForm({
      ...slotToForm(slot, { schedules, userId: selectedEmployeeId, userRole }),
      user_id: selectedEmployeeId || '',
    });
    setModalOpen(true);
    setMessage('');
    setError('');
  }

  function openSnapshot(schedule) {
    setSnapshotSchedule(schedule);
    setMessage('');
    setError('');
  }

  function closeSnapshot() {
    setSnapshotSchedule(null);
  }

  function openEdit(schedule) {
    if (!canEditSchedule(schedule, userRole)) {
      setError(hasScheduleReport(schedule) ? '此班表已有回報紀錄，無法編輯' : '無法編輯此班表');
      return;
    }

    const monthError = canMutateScheduleWorkDate(formatDateOnly(schedule.work_date), { userRole });

    if (monthError) {
      setError(monthError);
      return;
    }

    closeSnapshot();
    setEditId(schedule.id);
    setEditingSchedule(schedule);
    setForm(scheduleToForm(schedule));
    setModalOpen(true);
    setMessage('');
    setError('');
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setEditingSchedule(null);
    setForm(emptyScheduleForm);
  }

  function handleSuccessConfirm() {
    const shouldRedirectToMail = pendingMailRedirect;
    setSuccessSummary(null);
    setPendingMailRedirect(false);

    if (shouldRedirectToMail) {
      navigate('/admin/mail-tracking');
    }
  }

  function getFormEmployees() {
    if (!editingSchedule?.user) {
      return employees;
    }

    const assignedId = String(editingSchedule.user.id);

    if (employees.some((employee) => String(employee.id) === assignedId)) {
      return employees;
    }

    return [editingSchedule.user, ...employees];
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    let payloads;

    try {
      payloads = editId
        ? [buildSchedulePayload(form, {
          original: editingSchedule,
          userRole,
        })]
        : buildSchedulePayloads(form, { userRole });
    } catch (err) {
      setError(err.message);
      window.alert(err.message);
      return;
    }

    try {
      const summaryPayload = buildScheduleSuccessSummary(form, getFormEmployees(), {
        mode: editId ? 'update' : 'create',
      });

      if (editId) {
        await api.updateSchedule(editId, payloads[0]);
        closeModal();
        setPendingMailRedirect(false);
      } else {
        for (const item of payloads) {
          await api.createSchedule(item);
        }
        closeModal();
        setPendingMailRedirect(payloads.some((item) => scheduleHasMailTrackingItem(item)));
      }

      setSuccessSummary(summaryPayload);
      loadSchedules().catch((err) => setError(err.message));
    } catch (err) {
      setError(err.message);
      window.alert(err.message);
    }
  }

  async function handleDelete() {
    setError('');
    setMessage('');

    try {
      await api.deleteSchedule(editId);
      setMessage('行程刪除成功');
      closeModal();
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteFromSnapshot(schedule) {
    if (!canDeleteSchedule(schedule, userRole)) {
      setError('此班表已有回報紀錄，無法刪除');
      return;
    }

    const confirmMessage = hasScheduleReport(schedule)
      ? '確定刪除此工單？相關回報、郵資、匯款紀錄將一併刪除。'
      : '確定刪除此行程？';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setError('');
    setMessage('');

    try {
      await api.deleteSchedule(schedule.id);
      setMessage('行程刪除成功');
      closeSnapshot();
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!isValidDateParam(dateParam)) {
    return null;
  }

  return (
    <Layout title="當日班表">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{formatDayTitle(dateParam)}</h2>
            <p className="hint">
              共 {sortedSchedules.length} 筆派工
              {dayLeaveEvents.length ? `、${dayLeaveEvents.length} 筆排休` : ''}
              。格式：客戶名稱)地址 電話 [台數離金額]，點選派工可展開詳細視窗。
            </p>
          </div>
          <div className="button-row">
            <Link to="/admin/schedules" className="btn btn-secondary btn-sm">
              返回行事曆
            </Link>
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
              新增行程
            </button>
          </div>
        </div>

        <div className="schedule-day-toolbar">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/admin/schedules/day/${shiftDateParam(dateParam, -1)}`)}
          >
            前一天
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/admin/schedules/day/${formatDateOnly(new Date())}`)}
          >
            今天
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/admin/schedules/day/${shiftDateParam(dateParam, 1)}`)}
          >
            後一天
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadSchedules} disabled={loading}>
            {loading ? '載入中...' : '重新整理'}
          </button>
        </div>

        <div className="employee-strip">
          <button
            type="button"
            className={`employee-chip${selectedEmployeeId === '' ? ' is-active' : ''}`}
            onClick={() => setSelectedEmployeeId('')}
          >
            全部師傅
          </button>
          {employees.map((employee) => (
            <button
              key={employee.id}
              type="button"
              className={`employee-chip${String(selectedEmployeeId) === String(employee.id) ? ' is-active' : ''}`}
              onClick={() => setSelectedEmployeeId(String(employee.id))}
            >
              <EmployeeAvatar user={employee} size="sm" />
              {employee.name}
              <span className="hint">({employee.account})</span>
            </button>
          ))}
        </div>

        <div className="schedule-workspace schedule-workspace--day-list">
          {!dayTimelineEntries.length && !loading && (
            <p className="hint schedule-day-empty">這天目前沒有派工或排休。</p>
          )}

          <div className="schedule-day-timeline">
            {dayTimelineEntries.map((entry) => {
              if (entry.kind === 'leave') {
                const leave = entry.leave;
                const name = leave.user?.name || leave.user?.account || '師傅';

                return (
                  <article className="schedule-day-block schedule-day-block--leave" key={entry.key}>
                    <div
                      className="schedule-day-block__button schedule-day-block__button--leave"
                      style={getLeaveEventStyle()}
                    >
                      <ScheduleTechnicianBadge
                        user={leave.user}
                        size="sm"
                        className="schedule-day-block__technician"
                      />
                      <p className="schedule-day-block__line">{name} 休假</p>
                      <p className="schedule-day-block__time">{leaveTimeLabel}</p>
                    </div>
                  </article>
                );
              }

              const schedule = entry.schedule;

              return (
                <article className="schedule-day-block" key={entry.key}>
                  <button
                    type="button"
                    className="schedule-day-block__button"
                    style={getScheduleEventStyle(schedule)}
                    onClick={() => openSnapshot(schedule)}
                  >
                    <ScheduleTechnicianBadge
                      user={schedule.user}
                      size="sm"
                      className="schedule-day-block__technician"
                    />
                    <p className="schedule-day-block__line">{buildScheduleCardLine(schedule, { hidePrice: !canManageSchedulePricing(userRole), relatedSchedules: schedules })}</p>
                    <p className="schedule-day-block__time">{formatChineseTimeRange(schedule)}</p>
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />

      <ScheduleSuccessModal
        open={Boolean(successSummary)}
        summary={successSummary}
        onConfirm={handleSuccessConfirm}
      />

      <ScheduleSnapshotModal
        open={Boolean(snapshotSchedule)}
        schedule={snapshotSchedule}
        onClose={closeSnapshot}
        onEdit={openEdit}
        onDelete={handleDeleteFromSnapshot}
        userRole={userRole}
      />

      <ScheduleFormModal
        open={modalOpen}
        title={editId ? `編輯行程 #${editId}` : '新增派班行程'}
        form={form}
        employees={getFormEmployees()}
        editId={editId}
        canDelete={Boolean(editId) && canDeleteSchedule(editingSchedule, userRole)}
        userRole={userRole}
        originalSchedule={editId ? editingSchedule : null}
        allSchedules={schedules}
        leaves={leaves}
        error={error}
        onChange={setForm}
        onClose={closeModal}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </Layout>
  );
}
