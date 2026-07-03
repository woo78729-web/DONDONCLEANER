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
import {
  buildSchedulePayload,
  buildScheduleCardLine,
  buildScheduleSuccessSummary,
  canModifyScheduleByMonth,
  canMutateScheduleWorkDate,
  emptyScheduleForm,
  formatChineseTimeRange,
  formatDateOnly,
  formatTimeValue,
  getScheduleEventStyle,
  isSlotInPast,
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

  const sortedSchedules = useMemo(
    () => [...schedules].sort((left, right) => (
      formatTimeValue(left.start_time).localeCompare(formatTimeValue(right.start_time))
    )),
    [schedules],
  );

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
      const result = await api.getCalendarSchedules({
        date_from: dateParam,
        date_to: dateParam,
        user_id: selectedEmployeeId || undefined,
      });

      setSchedules(result.data.schedules);
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
    if (schedule.daily_report) {
      setError('此班表已有回報紀錄，無法編輯');
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
    closeModal();
    setSuccessSummary(null);
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

    let payload;

    try {
      payload = buildSchedulePayload(form, {
        original: editId ? editingSchedule : null,
        userRole,
      });
    } catch (err) {
      setError(err.message);
      return;
    }

    try {
      const summaryPayload = buildScheduleSuccessSummary(form, getFormEmployees(), {
        mode: editId ? 'update' : 'create',
      });

      if (editId) {
        await api.updateSchedule(editId, payload);
        closeModal();
      } else {
        await api.createSchedule(payload);
        closeModal();
      }

      setSuccessSummary(summaryPayload);
      loadSchedules().catch((err) => setError(err.message));
    } catch (err) {
      setError(err.message);
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
    if (!window.confirm('確定刪除此行程？')) {
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
            <p className="hint">共 {sortedSchedules.length} 筆派工。格式：地址＋電話＋[台數離金額]，點選可展開詳細視窗。</p>
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
          {!sortedSchedules.length && !loading && (
            <p className="hint schedule-day-empty">這天目前沒有派工。</p>
          )}

          <div className="schedule-day-timeline">
            {sortedSchedules.map((schedule) => (
                <article className="schedule-day-block" key={schedule.id}>
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
                    <p className="schedule-day-block__line">{buildScheduleCardLine(schedule)}</p>
                    <p className="schedule-day-block__time">{formatChineseTimeRange(schedule)}</p>
                  </button>
                </article>
              ))}
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
        canDelete={Boolean(editId) && canModifyScheduleByMonth(editingSchedule, userRole)}
        userRole={userRole}
        allSchedules={schedules}
        leaves={[]}
        error={error}
        onChange={setForm}
        onClose={closeModal}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </Layout>
  );
}
