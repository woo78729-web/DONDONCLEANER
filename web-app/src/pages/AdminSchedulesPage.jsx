import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { Layout } from '../components/Layout';
import { CalendarMiniMonth } from '../components/CalendarMiniMonth';
import { CalendarSettingsPanel } from '../components/CalendarSettingsPanel';
import { ScheduleEmployeeAvailabilityPanel } from '../components/ScheduleEmployeeAvailabilityPanel';
import { ScheduleAreaFilter } from '../components/ScheduleAreaFilter';
import { PageAlert } from '../components/PageAlert';
import { ScheduleCalendar } from '../components/ScheduleCalendar';
import { ScheduleFormModal } from '../components/ScheduleFormModal';
import { ScheduleSnapshotModal } from '../components/ScheduleSnapshotModal';
import { ScheduleSuccessModal } from '../components/ScheduleSuccessModal';
import { EmployeeAvatar } from '../components/EmployeeAvatar';
import { useIsMobile } from '../hooks/useIsMobile';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { canAccess } from '../utils/permissions';
import { loadCalendarSettings, saveCalendarSettings } from '../utils/calendarSettings';
import { loadAvailabilityDays } from '../utils/taitungAreas';
import { resolveScheduleEventAnchor } from '../utils/schedulePopover';
import {
  buildSchedulePayload,
  buildScheduleSuccessSummary,
  buildScheduleTimePatch,
  calendarInteractionToScheduleUpdate,
  canDragScheduleEvent,
  canModifyScheduleByMonth,
  canMutateScheduleWorkDate,
  CUSTOMER_SOURCE_OPTIONS,
  emptyScheduleForm,
  formatDateOnly,
  formatTimeValue,
  getAdminCalendarFetchRange,
  getAvailabilityLoadRange,
  getCalendarLoadRange,
  isSlotInPast,
  scheduleToForm,
  slotToForm,
  applyPriceCalculation,
} from '../utils/scheduleCalendar';

export default function AdminSchedulesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.role || 'admin';
  const isMobile = useIsMobile();
  const isDesktop = !useIsMobile(980);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [allSchedules, setAllSchedules] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [form, setForm] = useState(emptyScheduleForm);
  const [editId, setEditId] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [calendarSettings, setCalendarSettings] = useState(() => loadCalendarSettings());
  const [displayDays, setDisplayDays] = useState(() => {
    const settings = loadCalendarSettings();
    return Math.min(7, Math.max(1, settings.displayDays || 7));
  });
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [lookaheadDays, setLookaheadDays] = useState(() => loadAvailabilityDays(14));
  const [leaves, setLeaves] = useState([]);
  const [snapshotSchedule, setSnapshotSchedule] = useState(null);
  const [snapshotAnchor, setSnapshotAnchor] = useState(null);
  const [successSummary, setSuccessSummary] = useState(null);

  const schedules = useMemo(() => {
    if (!selectedAreas.length) {
      return allSchedules;
    }
    return allSchedules.filter((schedule) => selectedAreas.includes(schedule.service_area));
  }, [allSchedules, selectedAreas]);

  const loadEmployees = useCallback(async () => {
    const result = await api.getEmployees();
    setEmployees(result.data.filter((item) => item.role === 'employee' && item.is_active));
  }, []);

  const loadSchedules = useCallback(async (
    anchor = currentDate,
    employeeId = selectedEmployeeId,
    days = lookaheadDays,
    visibleDayCount = displayDays,
  ) => {
    setError('');
    try {
      const fetchRange = getAdminCalendarFetchRange(anchor, visibleDayCount);
      const availabilityRange = getAvailabilityLoadRange(days, anchor);
      const calendarRange = getCalendarLoadRange(anchor);
      const date_from = fetchRange.date_from < availabilityRange.date_from
        ? fetchRange.date_from
        : availabilityRange.date_from;
      const date_to = fetchRange.date_to > availabilityRange.date_to
        ? fetchRange.date_to
        : availabilityRange.date_to;

      const [result, leaveResult] = await Promise.all([
        api.getCalendarSchedules({
          date_from,
          date_to,
          user_id: employeeId || undefined,
        }),
        api.getPlanningLeaves(calendarRange),
      ]);

      setAllSchedules(result.data.schedules);
      setLeaves(leaveResult.data.leaves || []);
    } catch (err) {
      setError(err.message);
    }
  }, [currentDate, selectedEmployeeId, lookaheadDays, displayDays]);

  useEffect(() => {
    loadEmployees().catch((err) => setError(err.message));
  }, [loadEmployees]);

  useEffect(() => {
    loadSchedules(currentDate, selectedEmployeeId, lookaheadDays, displayDays).catch((err) => setError(err.message));
  }, [currentDate, selectedEmployeeId, lookaheadDays, displayDays, loadSchedules]);

  function openCreate(slot) {
    if (isSlotInPast(slot, { userRole })) {
      setError('不可預約過去的日期或時間，請選擇現在之後的時段');
      return;
    }
    try {
      setEditId(null);
      setEditingSchedule(null);
      setForm({
        ...slotToForm(slot, { schedules: allSchedules, userId: selectedEmployeeId, userRole }),
        user_id: selectedEmployeeId || '',
      });
      setModalOpen(true);
      setMessage('');
      setError('');
    } catch (err) {
      setError(err?.message || '無法開啟派班表單');
    }
  }

  function openSnapshot(schedule, clickEvent) {
    if (schedule?.type === 'leave') {
      return;
    }
    setSnapshotAnchor(resolveScheduleEventAnchor(schedule, clickEvent));
    setSnapshotSchedule(schedule);
    setMessage('');
    setError('');
  }

  function closeSnapshot() {
    setSnapshotSchedule(null);
    setSnapshotAnchor(null);
  }

  function openEditFromSnapshot(schedule) {
    closeSnapshot();
    openEdit(schedule);
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

  function patchScheduleTimes(scheduleId, fields) {
    setAllSchedules((previous) => previous.map((item) => (
      item.id === scheduleId ? { ...item, ...fields } : item
    )));
  }

  function persistScheduleTimeChange(schedule, start, end, calendarEvent = null) {
    const previous = {
      work_date: formatDateOnly(schedule.work_date),
      start_time: formatTimeValue(schedule.start_time),
      end_time: formatTimeValue(schedule.end_time),
    };
    let payload;
    try {
      const fields = calendarInteractionToScheduleUpdate(schedule, start, end, {
        eventStart: calendarEvent?.start,
        eventEnd: calendarEvent?.end,
      });
      payload = buildScheduleTimePatch(
        { ...scheduleToForm(schedule), ...fields },
        { original: schedule, userRole },
      );
    } catch (err) {
      setError(err.message);
      return false;
    }
    flushSync(() => {
      patchScheduleTimes(schedule.id, payload);
    });
    setMessage('');
    api.updateSchedule(schedule.id, payload)
      .then((response) => {
        const data = response.data;
        patchScheduleTimes(schedule.id, {
          work_date: formatDateOnly(data.work_date),
          start_time: formatTimeValue(data.start_time),
          end_time: formatTimeValue(data.end_time),
        });
        setMessage('行程時間已更新');
      })
      .catch((err) => {
        patchScheduleTimes(schedule.id, previous);
        setError(err.message);
      });
    return true;
  }

  function handleEventDrop({ event, start, end }) {
    return persistScheduleTimeChange(event.resource, start, end, event);
  }

  function handleEventResize({ event, start, end }) {
    return persistScheduleTimeChange(event.resource, start, end, event);
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
      loadSchedules(currentDate, selectedEmployeeId).catch((err) => setError(err.message));
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
      await loadSchedules(currentDate, selectedEmployeeId);
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
      await loadSchedules(currentDate, selectedEmployeeId);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleNavigate(date) {
    setCurrentDate(date);
  }

  function handleMiniRangeChange({ rangeStart, displayDays: nextDays }) {
    setCurrentDate(rangeStart);
    if (nextDays) {
      const safeDays = Math.min(7, Math.max(1, nextDays));
      setDisplayDays(safeDays);
      const nextSettings = { ...calendarSettings, displayDays: safeDays };
      setCalendarSettings(nextSettings);
      saveCalendarSettings(nextSettings);
    }
  }

  function handleCalendarSettingsChange(nextSettings) {
    setCalendarSettings(nextSettings);
    saveCalendarSettings(nextSettings);
    if (nextSettings.displayDays) {
      setDisplayDays(Math.min(7, Math.max(1, nextSettings.displayDays)));
    }
  }

  function handleCalendarViewChange(view) {
    if (view === calendarSettings.defaultView) {
      return;
    }
    handleCalendarSettingsChange({
      ...calendarSettings,
      defaultView: view,
    });
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  function openSelectedDayList() {
    navigate(`/admin/schedules/day/${formatDateOnly(currentDate)}`);
  }

  function handleSuccessConfirm() {
    const summary = successSummary;
    setSuccessSummary(null);

    if (summary?.work_date) {
      const workDate = new Date(`${formatDateOnly(summary.work_date)}T12:00:00`);
      if (!Number.isNaN(workDate.getTime())) {
        setCurrentDate(workDate);
      }
    }
  }

  function handleAvailabilityPickOpenSlot({ date, employeeId, slot, areas }) {
    const nextDate = new Date(`${date}T12:00:00`);
    setCurrentDate(nextDate);
    if (areas?.length) {
      setSelectedAreas(areas);
    }
    const start = new Date(`${date}T${slot.from || '09:00'}:00`);
    let end = new Date(`${date}T${slot.to || '12:00'}:00`);
    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    }
    if (isSlotInPast({ start, end }, { userRole })) {
      return;
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

  const leaveRange = useMemo(() => getCalendarLoadRange(currentDate), [currentDate]);

  const calendarLeaves = useMemo(() => {
    if (!selectedEmployeeId) {
      return leaves;
    }

    return leaves.filter((leave) => String(leave.user_id) === String(selectedEmployeeId));
  }, [leaves, selectedEmployeeId]);

  return (
    <PageErrorBoundary title="派班行事曆載入失敗">
      <Layout title="派班行事曆">
        <section className="card schedule-page-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">派班行事曆</h2>
              <p className="hint">上方勾選區域可查師傅空檔。左側月曆跳日期，點行程看詳情，空白時段可新增派工。</p>
            </div>
            <div className="schedule-page-header-actions">
              {canAccess(user, 'schedules.manage') && (
                <Link to="/admin/projects" className="btn btn-secondary btn-sm">
                  專案區
                </Link>
              )}
              {canAccess(user, 'phone.lookup') && (
                <Link to="/admin/phone-lookup" className="btn btn-secondary btn-sm">
                  電話查詢
                </Link>
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openCreate({ start: new Date(), useDefaultShift: true })}>
                新增行程
              </button>
            </div>
          </div>

          <ScheduleEmployeeAvailabilityPanel
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

          <div className={`schedule-layout${isDesktop ? ' schedule-layout--calendar-large' : ''}`}>
            <button
              type="button"
              className="btn btn-secondary schedule-sidebar-toggle"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? '收合篩選與月曆' : '展開篩選與月曆'}
            </button>

            <aside className={`schedule-sidebar schedule-sidebar--collapsible${sidebarOpen ? ' is-open' : ''}`}>
              <CalendarMiniMonth
                rangeStart={currentDate}
                displayDays={displayDays}
                onRangeChange={handleMiniRangeChange}
                schedules={schedules}
                weekStartsOn={calendarSettings.weekStartsOn}
              />

              <div className="schedule-sidebar__actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={goToday}>
                  今天
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={openSelectedDayList}>
                  當日列表
                </button>
              </div>

              <div className="schedule-sidebar__legend">
                {CUSTOMER_SOURCE_OPTIONS.map((option) => (
                  <span key={option.value} className="schedule-sidebar__legend-item">
                    <span className="source-badge__dot" style={{ backgroundColor: option.color }} />
                    {option.label}
                  </span>
                ))}
                <span className="schedule-sidebar__legend-item">
                  <span className="source-badge__dot" style={{ backgroundColor: '#FBC02D' }} />
                  休假
                </span>
              </div>

              <ScheduleAreaFilter selectedAreas={selectedAreas} onChange={setSelectedAreas} />

              <CalendarSettingsPanel
                settings={calendarSettings}
                onChange={handleCalendarSettingsChange}
                showColorMode
              />
            </aside>

            <div className="schedule-main">
              {isMobile && (
                <p className="schedule-mobile-hint">點行程看詳情 · 長按拖曳調時間 · ✎ 編輯</p>
              )}
              <div className="employee-strip employee-strip--compact">
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

              <div className="schedule-calendar-host">
                <ScheduleCalendar
                schedules={schedules}
                leaves={calendarLeaves}
                leaveRange={leaveRange}
                currentDate={currentDate}
                displayDays={displayDays}
                onNavigate={handleNavigate}
                onSelectEvent={(event, clickEvent) => openSnapshot(event.resource, clickEvent)}
                onSelectSlot={openCreate}
                onDrillDown={(date) => navigate(`/admin/schedules/day/${formatDateOnly(date)}`)}
                onEventDrop={handleEventDrop}
                onEventResize={handleEventResize}
                canDragEvent={(schedule) => canDragScheduleEvent(schedule, userRole)}
                selectable
                colorMode={calendarSettings.colorMode}
                settings={calendarSettings}
                onViewChange={handleCalendarViewChange}
              />
              </div>
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
          anchor={snapshotAnchor}
          onClose={closeSnapshot}
          onEdit={openEditFromSnapshot}
          onDelete={handleDeleteFromSnapshot}
          userRole={userRole}
        />

        <ScheduleFormModal
          open={modalOpen}
          title={editId ? `編輯行程 #${editId}（可調整師傅）` : '新增派班行程'}
          form={form}
          employees={getFormEmployees()}
          editId={editId}
          canDelete={Boolean(editId) && canModifyScheduleByMonth(editingSchedule, userRole)}
          userRole={userRole}
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
