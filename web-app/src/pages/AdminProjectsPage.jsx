import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { emptyProjectForm, ProjectFormModal, ProjectStatusBadge } from '../components/ProjectFormModal';
import { api } from '../api/client';
import {
  createPricingLine,
  formatDateOnly,
  getProjectDurationDays,
  getProjectStatusLabel,
  PROJECT_STATUS_LABELS,
} from '../utils/scheduleCalendar';

function buildProjectPayload(form) {
  return {
    title: form.title || null,
    employee_ids: form.employee_ids.map(Number),
    planned_start_date: form.planned_start_date,
    planned_end_date: form.planned_end_date,
    start_time: form.start_time,
    end_time: form.end_time,
    customer_name: form.customer_name,
    customer_phone: form.customer_phone,
    customer_address: form.customer_address,
    service_area: form.service_area || null,
    customer_source: form.customer_source,
    fb_display_name: form.fb_display_name || null,
    line_display_name: form.line_display_name || null,
    pricing_lines: form.pricing_lines.map((line) => ({
      ac_units: Number(line.ac_units),
      unit_price: Number(line.unit_price),
    })),
    needs_invoice: Boolean(form.needs_invoice),
    needs_mail: Boolean(form.needs_mail),
    mail_recipient: form.mail_recipient || null,
    mail_phone: form.mail_phone || null,
    mail_address: form.mail_address || null,
    notes: form.notes || null,
  };
}

export default function AdminProjectsPage() {
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
      await api.createProject(buildProjectPayload(form));
      setMessage('專案建立成功，行事曆已同步顯示');
      setFormOpen(false);
      setForm(emptyProjectForm());
      setSearchParams({});
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
              <p className="hint">多天期工程集中管理。行事曆仍會顯示各日派班，員工每日回報後可追蹤總台數。</p>
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
                <div><dt>客戶</dt><dd>{selectedProject.customer_name} / {selectedProject.customer_phone}</dd></div>
                <div><dt>地址</dt><dd>{selectedProject.customer_address}</dd></div>
                <div><dt>總台數</dt><dd>{selectedProject.progress?.total_units} 台（已完成 {selectedProject.progress?.completed_units} 台）</dd></div>
                <div><dt>金額</dt><dd>{selectedProject.cleaning_price} 元</dd></div>
              </dl>

              <h3 className="card-subtitle">每日派班</h3>
              <div className="admin-projects-page__list">
                {(selectedProject.schedules || []).map((schedule) => (
                  <div key={schedule.id} className="admin-project-card">
                    <strong>{formatDateOnly(schedule.work_date)} · {schedule.user?.name}</strong>
                    <span className="hint">
                      {schedule.schedule_kind === 'supplement' ? '補台數 · ' : ''}
                      排 {schedule.ac_units} 台
                      {schedule.daily_report ? ` · 已回報 ${schedule.daily_report.completed_units} 台` : ' · 待回報'}
                    </span>
                  </div>
                ))}
              </div>

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
                  <input className="field-control" type="number" min="1" value={supplementForm.ac_units} onChange={(event) => setSupplementForm({ ...supplementForm, ac_units: event.target.value })} required />
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
