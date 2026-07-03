import { useEffect, useState } from 'react';

import { Layout } from '../components/Layout';

import { PageAlert } from '../components/PageAlert';

import { MaintenanceRecordDetailModal, compensationLabel } from '../components/MaintenanceRecordDetailModal';

import { api } from '../api/client';

import { useAuth } from '../context/AuthContext';

import { formatDateOnly, formatTimeValue } from '../utils/scheduleCalendar';



function recordSourceLabel(record, currentUserId) {

  if (record.assigned_user_id === currentUserId && record.reported_by !== currentUserId) {

    return '客服報修';

  }



  return '自行回報';

}



export default function EmployeeMaintenanceReportPage() {

  const { user } = useAuth();

  const [pendingSchedules, setPendingSchedules] = useState([]);

  const [records, setRecords] = useState([]);

  const [scheduleId, setScheduleId] = useState('');

  const [customerPhone, setCustomerPhone] = useState('');

  const [issueDescription, setIssueDescription] = useState('');

  const [photos, setPhotos] = useState([]);

  const [message, setMessage] = useState('');

  const [error, setError] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const [selected, setSelected] = useState(null);

  const [saving, setSaving] = useState(false);



  async function loadData() {

    setError('');



    try {

      const [pendingResult, recordsResult] = await Promise.all([

        api.getPendingReports(),

        api.getEmployeeMaintenanceReports(),

      ]);

      setPendingSchedules(pendingResult.data.schedules || []);

      setRecords(recordsResult.data.records || []);

    } catch (err) {

      setError(err.message);

    }

  }



  useEffect(() => {

    loadData();

  }, []);



  function handlePhotoChange(event) {

    setPhotos(Array.from(event.target.files || []).slice(0, 6));

  }



  async function handleSubmit(event) {

    event.preventDefault();

    setSubmitting(true);

    setError('');

    setMessage('');



    try {

      const formData = new FormData();

      if (scheduleId) {

        formData.append('schedule_id', scheduleId);

      }

      if (customerPhone.trim()) {

        formData.append('customer_phone', customerPhone.trim());

      }

      formData.append('issue_description', issueDescription.trim());

      photos.forEach((file) => formData.append('photos[]', file));



      await api.submitEmployeeMaintenanceReport(formData);

      setMessage('維修回報已送出，管理員可查看照片追查');

      setScheduleId('');

      setCustomerPhone('');

      setIssueDescription('');

      setPhotos([]);

      await loadData();

    } catch (err) {

      setError(err.message);

    } finally {

      setSubmitting(false);

    }

  }



  async function handleSaveFollowUp(payload) {

    if (!selected) {

      return;

    }



    setSaving(true);

    setError('');



    try {

      await api.updateEmployeeMaintenanceReport(selected.id, payload);

      setMessage('後續處理方式已更新');

      setSelected(null);

      await loadData();

    } catch (err) {

      setError(err.message);

    } finally {

      setSaving(false);

    }

  }



  return (

    <Layout title="維修回報">

      <section className="card">

        <div className="card-header">

          <div>

            <h2 className="card-title">維修回報</h2>

            <p className="hint">現場出問題請拍照並描述；請勾選是否賠款並填寫處理方式，賠款金額由客服或管理員後續填寫。</p>

          </div>

        </div>



        <form className="form-grid" style={{ padding: 16 }} onSubmit={handleSubmit}>

          <label className="field">

            <span className="field-label">關聯班表（選填）</span>

            <select className="field-control" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>

              <option value="">不指定班表</option>

              {pendingSchedules.map((schedule) => (

                <option key={schedule.id} value={schedule.id}>

                  {formatDateOnly(schedule.work_date)} {formatTimeValue(schedule.start_time)} {schedule.customer_name}

                </option>

              ))}

            </select>

          </label>



          <label className="field">

            <span className="field-label">客戶電話</span>

            <input

              className="field-control"

              value={customerPhone}

              onChange={(e) => setCustomerPhone(e.target.value)}

              placeholder="若已選班表可留空"

            />

          </label>



          <label className="field">

            <span className="field-label">問題描述</span>

            <textarea

              className="field-control"

              rows={4}

              value={issueDescription}

              onChange={(e) => setIssueDescription(e.target.value)}

              required

            />

          </label>



          <label className="field">

            <span className="field-label">問題照片（最多 6 張）</span>

            <input className="field-control" type="file" accept="image/*" multiple onChange={handlePhotoChange} />

          </label>



          <div className="toolbar-actions">

            <button type="submit" className="btn btn-primary" disabled={submitting}>

              {submitting ? '送出中...' : '送出維修回報'}

            </button>

          </div>

        </form>

      </section>



      <PageAlert type="success" message={message} />

      <PageAlert type="error" message={error} />



      <section className="card table-card">

        <h3 className="section-label" style={{ padding: '16px 16px 0' }}>我的維修回報</h3>

        <div className="table-wrap">

          <table className="data-table">

            <thead>

              <tr>

                <th>時間</th>

                <th>來源</th>

                <th>客戶</th>

                <th>問題</th>

                <th>後續處理方式</th>

                <th>是否賠款</th>

                <th>狀態</th>

                <th>操作</th>

              </tr>

            </thead>

            <tbody>

              {records.map((record) => (

                <tr key={record.id}>

                  <td>{record.created_at?.slice?.(0, 16)}</td>

                  <td>{recordSourceLabel(record, user?.id)}</td>

                  <td>{record.customer_name || record.customer_phone}</td>

                  <td>{record.issue_description?.slice?.(0, 40)}</td>

                  <td>{record.follow_up_method?.slice?.(0, 24) || '-'}</td>

                  <td>{compensationLabel(record.requires_compensation)}</td>

                  <td>{record.status_label}</td>

                  <td>

                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(record)}>

                      填寫回報

                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

        {!records.length && <p className="hint" style={{ padding: 16 }}>尚無維修回報。</p>}

      </section>



      <MaintenanceRecordDetailModal

        record={selected}

        open={Boolean(selected)}

        onClose={() => setSelected(null)}

        onSave={handleSaveFollowUp}

        saving={saving}

        employeeMode

      />

    </Layout>

  );

}


