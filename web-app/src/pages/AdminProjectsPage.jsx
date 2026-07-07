import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CustomerSourceBadge } from '../components/CustomerSourceBadge';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { emptyProjectForm, ProjectFormModal, ProjectStatusBadge } from '../components/ProjectFormModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  buildProjectPayload,
  createPricingLine,
  formatDateOnly,
  getProjectDurationDays,
  getProjectStatusLabel,
  PROJECT_STATUS_LABELS,
} from '../utils/scheduleCalendar';

function buildAssignmentDraft(project) {
  return Object.fromEntries(
    (project?.employee_assignments || project?.employees || []).map((assignment) => [
      assignment.user_id || assignment.id,
      {
        assigned_units: String(assignment.assigned_units ?? assignment.assignedUnits ?? ''),
      },
    ]),
  );
}

function buildSupplementDraft(project) {
  return Object.fromEntries(
    (project?.schedules || [])
      .filter((schedule) => schedule.schedule_kind === 'supplement')
      .map((schedule) => [
        schedule.id,
        {
          ac_units: String(schedule.ac_units || ''),
          unit_price: String(schedule.unit_price || schedule.pricing_lines?.[0]?.unit_price || '1500'),
        },
      ]),
  );
}

export default function AdminProjectsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageProject = user?.role === 'admin' || user?.role === 'customer_service';
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1');
  const [form, setForm] = useState(emptyProjectForm());
  const [supplementForm, setSupplementForm] = useState({
    user_id: '',
    work_date: '',
    ac_units: '1',
    unit_price: '1500',
    notes: '補台數',
  });
  const [unitsForm, setUnitsForm] = useState({ total_ac_units: '', unit_price: '1500' });
  const [assignmentDraft, setAssignmentDraft] = useState({});
  const [supplementDraft, setSupplementDraft] = useState({});
  const [savingAssignmentUserId, setSavingAssignmentUserId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const statusOptions = useMemo(
    () => Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    [],
  );

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await api.getProjects(statusFilter ? { status: statusFilter } : {});
      setProjects(result.data.projects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadProjects().catch((err) => setError(err.message));
  }, [loadProjects]);

  useEffect(() => {
    api.getEmployees()
      .then((result) => setEmployees(result.data || []))
      .catch((err) => setError(err.message));
  }, []);

  async function openProjectDetail(projectId) {
    setError('');
    try {
      const result = await api.getProject(projectId);
      setSelectedProject(result.data);
      setUnitsForm({
        total_ac_units: String(result.data.progress?.total_units || result.data.total_ac_units || ''),
        unit_price: String(result.data.pricing_lines?.[0]?.unit_price || result.data.unit_price || '1500'),
      });
      setAssignmentDraft(buildAssignmentDraft(result.data));
      setSupplementDraft(buildSupplementDraft(result.data));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateProject(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!form.employee_ids.length) {
      setError('請至少選擇一位清洗師傅');
      return;
    }

    try {
      const redirectToRemittance = Boolean(form.expects_company_remittance);
      const result = await api.createProject(buildProjectPayload(form));
      setFormOpen(false);
      setForm(emptyProjectForm());
      setSearchParams({});

      if (redirectToRemittance || result.data?.expects_company_remittance) {
        const remittanceMonth = String(form.planned_start_date || result.data?.planned_start_date || '').slice(0, 7);
        navigate(
          remittanceMonth
            ? `/admin/remittance-tracking?year_month=${remittanceMonth}`
            : '/admin/remittance-tracking',
          { replace: true },
        );
        return;
      }

      setMessage('專案建立成功，行事曆已同步顯示');
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStatusChange(status) {
    if (!selectedProject) {
      return;
    }

    setError('');
    try {
      const result = await api.updateProjectStatus(selectedProject.id, status);
      setSelectedProject(result.data);
      setMessage(`專案狀態已更新為「${getProjectStatusLabel(status)}」`);
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateUnits(event) {
    event.preventDefault();

    if (!selectedProject || !canManageProject) {
      return;
    }

    setError('');
    try {
      const result = await api.updateProjectUnits(selectedProject.id, {
        total_ac_units: Number(unitsForm.total_ac_units),
        pricing_lines: [{
          ac_units: Number(unitsForm.total_ac_units),
          unit_price: Number(unitsForm.unit_price),
        }],
      });
      setSelectedProject(result.data);
      setAssignmentDraft(buildAssignmentDraft(result.data));
      setSupplementDraft(buildSupplementDraft(result.data));
      setMessage('專案總台數與金額已更新，師傅分台與回報已同步');
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteProject() {
    if (!selectedProject || !canManageProject) {
      return;
    }

    if (!window.confirm('確定刪除此專案？所有相關班表、回報、匯款與郵資紀錄將一併刪除。')) {
      return;
    }

    setError('');
    try {
      await api.deleteProject(selectedProject.id);
      setSelectedProject(null);
      setMessage('專案已刪除');
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateAssignment(userId) {
    if (!selectedProject || !canManageProject) {
      return;
    }

    const draft = assignmentDraft[userId];

    if (!draft) {
      return;
    }

    setError('');
    setSavingAssignmentUserId(userId);

    try {
      const assignments = (selectedProject.employee_assignments || selectedProject.employees || []).map((assignment) => ({
        user_id: assignment.user_id || assignment.id,
        assigned_units: Number(assignment.user_id === userId || assignment.id === userId
          ? draft.assigned_units
          : (assignmentDraft[assignment.user_id || assignment.id]?.assigned_units ?? assignment.assigned_units)),
      }));

      const result = await api.updateProjectAssignments(selectedProject.id, { assignments });
      setSelectedProject(result.data);
      setAssignmentDraft(buildAssignmentDraft(result.data));
      setSupplementDraft(buildSupplementDraft(result.data));
      setUnitsForm({
        total_ac_units: String(result.data.progress?.total_units || result.data.total_ac_units || ''),
        unit_price: String(result.data.pricing_lines?.[0]?.unit_price || result.data.unit_price || '1500'),
      });
      setMessage('師傅分台已更新，個人結算與專案匯款已同步');
      await loadProjects();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAssignmentUserId(null);
    }
  }

  async function handleUpdateSupplementUnits(scheduleId) {
    if (!selectedProject || !canManageProject) {
      return;
    }

    const draft = supplementDraft[scheduleId];

    if (!draft) {
      return;
    }

    setError('');
    setSavingAssignmentUserId(scheduleId);

    try {
      const result = await api.updateProjectScheduleUnits(selectedProject.id, scheduleId, {
        ac_units: Number(draft.ac_units),
        unit_price: Number(draft.unit_price),
      });
      setSelectedProject(result.data);
      setAssignmentDraft(buildAssignmentDraft(result.data));
      setSupplementDraft(buildSupplementDraft(result.data));
      setUnitsForm({
        total_ac_units: String(result.data.progress?.total_units || result.data.total_ac_units || ''),
        unit_price: String(result.data.pricing_lines?.[0]?.unit_price || result.data.unit_price || '1500'),
      });
      setMessage('師傅清洗台數已更新');
      await loadProjects();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAssignmentUserId(null);
    }
  }

  async function handleConsolidateSettlement() {
    if (!selectedProject || !canManageProject) {
      return;
    }

    if (!window.confirm('將此專案整理為「整張工單 + 師傅分台」？\n逐日結算班表會合併，匯款仍以專案總額計算。')) {
      return;
    }

    setError('');
    try {
      const result = await api.consolidateProjectSettlement(selectedProject.id);
      setSelectedProject(result.data);
      setAssignmentDraft(buildAssignmentDraft(result.data));
      setSupplementDraft(buildSupplementDraft(result.data));
      setUnitsForm({
        total_ac_units: String(result.data.progress?.total_units || result.data.total_ac_units || ''),
        unit_price: String(result.data.pricing_lines?.[0]?.unit_price || result.data.unit_price || '1500'),
      });
      setMessage('專案已整理為整張工單分台，師傅個人結算與專案匯款已同步');
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSupplement(event) {
    event.preventDefault();

    if (!selectedProject) {
      return;
    }

    setError('');
    try {
      const result = await api.addProjectSupplement(selectedProject.id, {
        user_id: Number(supplementForm.user_id),
        work_date: supplementForm.work_date,
        pricing_lines: [{
          ac_units: Number(supplementForm.ac_units),
          unit_price: Number(supplementForm.unit_price),
        }],
        notes: supplementForm.notes,
      });
      setSelectedProject(result.data.project);
      setAssignmentDraft(buildAssignmentDraft(result.data.project));
      setSupplementDraft(buildSupplementDraft(result.data.project));
      setMessage('補台數派班成功，已併入同一專案帳');
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <PageErrorBoundary>
      <Layout title="專案區">
        <section className="card admin-projects-page">
          <div className="card-header">
            <div>
              <h2 className="card-title">大案件 / 專案管理</h2>
              <p className="hint">多天期工程集中管理。匯款、郵寄、稅金以整筆專案計；師傅分台各自計入個人結算。</p>
            </div>
            <div className="button-row">
              <Link to="/admin/schedules" className="btn btn-secondary btn-sm">返回行事曆</Link>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}>
                新增專案
              </button>
            </div>
          </div>

          <div className="admin-projects-page__filters">
            <button
              type="button"
              className={`btn btn-secondary btn-sm${statusFilter === '' ? ' is-active' : ''}`}
              onClick={() => setStatusFilter('')}
            >
              全部
            </button>
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`btn btn-secondary btn-sm${statusFilter === option.value ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {loading && <p className="hint">載入中…</p>}
          {!loading && projects.length === 0 && <p className="hint">目前沒有專案案件</p>}

          <div className="admin-projects-page__list">
            {projects.map((project) => (
              <article key={project.id} className="admin-project-card">
                <div className="admin-project-card__header">
                  <div className="admin-project-card__meta">
                    <strong>{project.title || project.customer_address}</strong>
                    <span className="hint">{project.project_code} · {project.customer_name}</span>
                    <CustomerSourceBadge source={project.customer_source} className="admin-project-card__source" />
                    <span className="hint">
                      工期 {formatDateOnly(project.planned_start_date)} – {formatDateOnly(project.planned_end_date)}
                      （{getProjectDurationDays(project) || '-'} 天）
                    </span>
                  </div>
                  <ProjectStatusBadge status={project.status} />
                </div>
                <div className="admin-project-card__progress">
                  總台數 {project.progress?.total_units || project.total_ac_units} 台
                  · 已完成 {project.progress?.completed_units || 0} 台
                  · 師傅 {project.employees?.map((item) => item.name).join('、') || '-'}
                </div>
                <div className="button-row" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => openProjectDetail(project.id)}>
                    查看詳情
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {selectedProject && (
          <div className="modal-overlay" role="presentation" onClick={() => setSelectedProject(null)}>
            <div className="modal-panel modal-panel--wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 className="modal-title">{selectedProject.title || selectedProject.customer_address}</h2>
                  <p className="hint">{selectedProject.project_code}</p>
                  <CustomerSourceBadge source={selectedProject.customer_source} />
                </div>
                <button type="button" className="modal-close" onClick={() => setSelectedProject(null)}>×</button>
              </div>

              <div className="button-row" style={{ marginBottom: 12 }}>
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`btn btn-secondary btn-sm${selectedProject.status === option.value ? ' is-active' : ''}`}
                    onClick={() => handleStatusChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <dl className="schedule-detail">
                <div><dt>客戶來源</dt><dd><CustomerSourceBadge source={selectedProject.customer_source} /></dd></div>
                <div><dt>客戶</dt><dd>{selectedProject.customer_name} / {selectedProject.customer_phone}</dd></div>
                <div><dt>地址</dt><dd>{selectedProject.customer_address}</dd></div>
                <div><dt>總台數</dt><dd>{selectedProject.progress?.total_units} 台（已完成 {selectedProject.progress?.completed_units} 台）</dd></div>
                <div><dt>金額</dt><dd>{selectedProject.cleaning_price} 元</dd></div>
                {selectedProject.expects_company_remittance && (
                  <div>
                    <dt>匯款</dt>
                    <dd>
                      客戶報帳匯款
                      {' · '}
                      <Link to="/admin/remittance-tracking">前往匯款追查</Link>
                    </dd>
                  </div>
                )}
              </dl>

              {canManageProject && (
                <form className="form-grid cols-2 admin-projects-page__units-form" onSubmit={handleUpdateUnits}>
                  <h3 className="card-subtitle" style={{ gridColumn: '1 / -1' }}>調整總台數</h3>
                  <p className="hint" style={{ gridColumn: '1 / -1' }}>
                    修正整筆專案台數與金額，會依師傅人數重新分台（例如 107 台兩人 → 54 / 53），並同步回報、匯款。
                  </p>
                  <label className="field">
                    <span className="field-label">總台數</span>
                    <input
                      className="field-control"
                      type="number"
                      min="1"
                      max="9999"
                      value={unitsForm.total_ac_units}
                      onChange={(event) => setUnitsForm({ ...unitsForm, total_ac_units: event.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">單價</span>
                    <select
                      className="field-control"
                      value={unitsForm.unit_price}
                      onChange={(event) => setUnitsForm({ ...unitsForm, unit_price: event.target.value })}
                    >
                      <option value="1500">1500</option>
                      <option value="1300">1300</option>
                      <option value="1000">1000</option>
                    </select>
                  </label>
                  <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                    <button type="submit" className="btn btn-primary btn-sm">更新台數與金額</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={handleDeleteProject}>
                      刪除整筆專案
                    </button>
                  </div>
                </form>
              )}

              <h3 className="card-subtitle">師傅分台（整張工單）</h3>
              <p className="hint">
                依整筆專案分派給各師傅，每人一筆結算回報；個人應收/應退會計入該師傅月結。
                {selectedProject.expects_company_remittance && ' 客戶匯款、郵資、發票稅金仍以專案總額處理。'}
              </p>
              {canManageProject && (
                <div className="button-row" style={{ marginBottom: 12 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleConsolidateSettlement}>
                    整理為整張工單分台
                  </button>
                  <span className="hint">舊案若仍是逐日多筆回報，按此合併成每位師傅一筆。</span>
                </div>
              )}
              <div className="admin-projects-page__list">
                {(selectedProject.employee_assignments || []).map((assignment) => {
                  const userId = assignment.user_id;
                  const draft = assignmentDraft[userId] || {
                    assigned_units: String(assignment.assigned_units || ''),
                  };

                  return (
                    <div key={userId} className="admin-project-card admin-project-card--schedule">
                      <div className="admin-project-card__schedule-header">
                        <div>
                          <strong>{assignment.name}</strong>
                          <span className="hint">
                            分派 {assignment.assigned_units} 台
                            {assignment.supplement_units > 0 ? ` · 另含補台 ${assignment.supplement_units} 台` : ''}
                            {assignment.completed_units > 0 ? ` · 已回報 ${assignment.completed_units} 台` : ' · 待回報'}
                          </span>
                        </div>
                      </div>
                      {canManageProject && (
                        <div className="form-grid cols-2 admin-projects-page__schedule-units">
                          <label className="field">
                            <span className="field-label">此師傅台數</span>
                            <input
                              className="field-control"
                              type="number"
                              min="0"
                              max="9999"
                              value={draft.assigned_units}
                              onChange={(event) => setAssignmentDraft({
                                ...assignmentDraft,
                                [userId]: { ...draft, assigned_units: event.target.value },
                              })}
                            />
                          </label>
                          <div className="form-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={savingAssignmentUserId === userId}
                              onClick={() => handleUpdateAssignment(userId)}
                            >
                              {savingAssignmentUserId === userId ? '儲存中…' : '儲存分台'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(selectedProject.schedules || []).filter((schedule) => schedule.schedule_kind === 'supplement').length > 0 && (
                <>
                  <h3 className="card-subtitle">補台明細</h3>
                  <p className="hint">補台仍另列，會併入同一專案帳與該師傅個人結算。</p>
                  <div className="admin-projects-page__list">
                    {(selectedProject.schedules || [])
                      .filter((schedule) => schedule.schedule_kind === 'supplement')
                      .map((schedule) => {
                        const draft = supplementDraft[schedule.id] || {
                          ac_units: String(schedule.ac_units || ''),
                          unit_price: String(schedule.unit_price || '1500'),
                        };

                        return (
                          <div key={schedule.id} className="admin-project-card admin-project-card--schedule">
                            <div className="admin-project-card__schedule-header">
                              <div>
                                <strong>{formatDateOnly(schedule.work_date)} · {schedule.user?.name}</strong>
                                <span className="hint">
                                  補台數 · {schedule.daily_report ? `已回報 ${schedule.daily_report.completed_units} 台` : '待回報'}
                                </span>
                              </div>
                            </div>
                            {canManageProject && (
                              <div className="form-grid cols-3 admin-projects-page__schedule-units">
                                <label className="field">
                                  <span className="field-label">補洗台數</span>
                                  <input
                                    className="field-control"
                                    type="number"
                                    min="1"
                                    max="9999"
                                    value={draft.ac_units}
                                    onChange={(event) => setSupplementDraft({
                                      ...supplementDraft,
                                      [schedule.id]: { ...draft, ac_units: event.target.value },
                                    })}
                                  />
                                </label>
                                <label className="field">
                                  <span className="field-label">單價</span>
                                  <select
                                    className="field-control"
                                    value={draft.unit_price}
                                    onChange={(event) => setSupplementDraft({
                                      ...supplementDraft,
                                      [schedule.id]: { ...draft, unit_price: event.target.value },
                                    })}
                                  >
                                    <option value="1500">1500</option>
                                    <option value="1300">1300</option>
                                    <option value="1000">1000</option>
                                  </select>
                                </label>
                                <div className="form-actions">
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={savingAssignmentUserId === schedule.id}
                                    onClick={() => handleUpdateSupplementUnits(schedule.id)}
                                  >
                                    {savingAssignmentUserId === schedule.id ? '儲存中…' : '儲存補台'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </>
              )}

              <p className="hint" style={{ marginTop: 12 }}>
                工期 {formatDateOnly(selectedProject.planned_start_date)} – {formatDateOnly(selectedProject.planned_end_date)} 仍會在行事曆占位，但記帳以本頁師傅分台為準。
              </p>

              <form className="form-grid cols-2" style={{ marginTop: 16 }} onSubmit={handleSupplement}>
                <h3 className="card-subtitle" style={{ gridColumn: '1 / -1' }}>補台數（另排一般單，併入本專案帳）</h3>
                <label className="field">
                  <span className="field-label">師傅</span>
                  <select className="field-control" value={supplementForm.user_id} onChange={(event) => setSupplementForm({ ...supplementForm, user_id: event.target.value })} required>
                    <option value="">請選擇</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>{employee.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">補洗日期</span>
                  <input className="field-control" type="date" value={supplementForm.work_date} onChange={(event) => setSupplementForm({ ...supplementForm, work_date: event.target.value })} required />
                </label>
                <label className="field">
                  <span className="field-label">台數</span>
                  <input className="field-control" type="number" min="1" max="9999" value={supplementForm.ac_units} onChange={(event) => setSupplementForm({ ...supplementForm, ac_units: event.target.value })} required />
                </label>
                <label className="field">
                  <span className="field-label">單價</span>
                  <select className="field-control" value={supplementForm.unit_price} onChange={(event) => setSupplementForm({ ...supplementForm, unit_price: event.target.value })}>
                    <option value="1500">1500</option>
                    <option value="1300">1300</option>
                    <option value="1000">1000</option>
                  </select>
                </label>
                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                  <button type="submit" className="btn btn-primary btn-sm">新增補台派班</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ProjectFormModal
          open={formOpen}
          employees={employees}
          form={form}
          error={error}
          onChange={setForm}
          onClose={() => {
            setFormOpen(false);
            setSearchParams({});
          }}
          onSubmit={handleCreateProject}
        />

        <PageAlert type="success" message={message} />
        <PageAlert type="error" message={error} />
      </Layout>
    </PageErrorBoundary>
  );
}
