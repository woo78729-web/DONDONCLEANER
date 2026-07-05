import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { Layout } from '../components/Layout';
import { ScheduleEmployeeAvailabilityPanel } from '../components/ScheduleEmployeeAvailabilityPanel';
import { PageAlert } from '../components/PageAlert';
import { ScheduleFormModal } from '../components/ScheduleFormModal';
import { ScheduleSuccessModal } from '../components/ScheduleSuccessModal';
import { EmployeeAvatar } from '../components/EmployeeAvatar';
import { useIsMobile } from '../hooks/useIsMobile';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { canAccess } from '../utils/permissions';
import { loadAvailabilityDays } from '../utils/taitungAreas';
import {
  applyPriceCalculation,
  buildSchedulePayload,
  buildSchedulePayloads,
  buildScheduleSuccessSummary,
  scheduleHasMailTrackingItem,
  canEditSchedule,
  canDeleteSchedule,
  emptyScheduleForm,
  formatDateOnly,
  getAvailabilityLoadRange,
  getCalendarLoadRange,
  isSlotInPast,
  scheduleToForm,
  slotToForm,
} from '../utils/scheduleCalendar';

export default function AdminRegionalSchedulingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userRole = user?.role || 'admin';
  const isMobile = useIsMobile();
  const [employees, setEmployees] = useState([]);
  const [allSchedules, setAllSchedules] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [lookaheadDays, setLookaheadDays] = useState(() => loadAvailabilityDays(14));
  const [form, setForm] = useState(emptyScheduleForm);
  const [editId, setEditId] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [successSummary, setSuccessSummary] = useState(null);
  const [pendingMailRedirect, setPendingMailRedirect] = useState(false);

  const loadEmployees = useCallback(async () => {
    const result = await api.getEmployees();
    setEmployees(result.data.filter((item) => item.role === 'employee' && item.is_active));
  }, []);

  const loadSchedules = useCallback(async () => {
    setError('');

    try {
      const anchor = new Date();
      const availabilityRange = getAvailabilityLoadRange(lookaheadDays, anchor);
      const calendarRange = getCalendarLoadRange(anchor);

      const [result, leaveResult] = await Promise.all([
        api.getCalendarSchedules({
          date_from: availabilityRange.date_from,
          date_to: availabilityRange.date_to,
          user_id: selectedEmployeeId || undefined,
        }),
        api.getPlanningLeaves(calendarRange),
      ]);

      setAllSchedules(result.data.schedules);
      setLeaves(leaveResult.data.leaves || []);
    } catch (err) {
      setError(err.message);
    }
  }, [lookaheadDays, selectedEmployeeId]);

  useEffect(() => {
    loadEmployees().catch((err) => setError(err.message));
  }, [loadEmployees]);

  useEffect(() => {
    loadSchedules().catch((err) => setError(err.message));
  }, [loadSchedules]);

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setEditingSchedule(null);
    setForm(emptyScheduleForm);
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

  function handleAvailabilityPickOpenSlot({ date, employeeId, slot, areas }) {
    const start = new Date(`${date}T${slot.from || '09:00'}:00`);
    let end = new Date(`${date}T${slot.to || '12:00'}:00`);

    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    }

    if (isSlotInPast({ start, end }, { userRole })) {
      setError('不可預約過去的日期或時間，請選擇現在之後的時段');
      return;
    }

    if (areas?.length) {
      setSelectedAreas(areas);
    }

    setEditId(null);
    setEditingSchedule(null);
    setForm({
      ...applyPriceCalculation({
        ...slotToForm({ start, end }, { userRole }),
        user_id: String(employeeId),
        service_area: areas?.[0] || '',
      }),
    });
    setModalOpen(true);
    setMessage('');
    setError('');
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

  function handleSuccessConfirm() {
    const shouldRedirectToMail = pendingMailRedirect;
    setSuccessSummary(null);
    setPendingMailRedirect(false);

    if (shouldRedirectToMail) {
      navigate('/admin/mail-tracking');
    }
  }

  return (
    <PageErrorBoundary title="區域排班載入失敗">
      <Layout title="區域排班">
        <section className={`card regional-scheduling-page${isMobile ? ' regional-scheduling-page--mobile' : ''}`}>
          {!isMobile && (
            <div className="card-header">
              <div>
                <h2 className="card-title">區域排班</h2>
                <p className="hint">
                  勾選區域後依日期查看師傅空檔。同區域前班結束後預設間隔 1 小時才可排；空班顯示全天可排。點空檔可開啟表單並調整時間。
                </p>
              </div>
              <div className="schedule-page-header-actions">
                <Link to="/admin/schedules" className="btn btn-secondary btn-sm">
                  派班行事曆
                </Link>
                {canAccess(user, 'phone.lookup') && (
                  <Link to="/admin/phone-lookup" className="btn btn-secondary btn-sm">
                    電話查詢
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="employee-strip employee-strip--compact regional-scheduling-page__employees">
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
              </button>
            ))}
          </div>

          <ScheduleEmployeeAvailabilityPanel
            panelTitle="區域排班"
            selectedAreas={selectedAreas}
            onSelectedAreasChange={setSelectedAreas}
            lookaheadDays={lookaheadDays}
            onLookaheadDaysChange={setLookaheadDays}
            selectedEmployeeId={selectedEmployeeId}
            onPickOpenSlot={handleAvailabilityPickOpenSlot}
            employees={employees}
            allSchedules={allSchedules}
            leaves={leaves}
          />
        </section>

        <PageAlert type="success" message={message} />
        <PageAlert type="error" message={error} />

        <ScheduleSuccessModal
          open={Boolean(successSummary)}
          summary={successSummary}
          onConfirm={handleSuccessConfirm}
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
          allSchedules={allSchedules}
          leaves={leaves}
          error={error}
          onChange={setForm}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      </Layout>
    </PageErrorBoundary>
  );
}
