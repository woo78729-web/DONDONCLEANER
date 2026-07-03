import { useEffect, useState } from 'react';

import { Layout } from '../components/Layout';

import { PageAlert } from '../components/PageAlert';

import { MaintenanceRecordDetailModal, compensationLabel, formatAmount } from '../components/MaintenanceRecordDetailModal';

import { api } from '../api/client';

import { useAuth } from '../context/AuthContext';

import { canEditMaintenanceCompensation, canViewMaintenanceCompensation } from '../utils/permissions';



const STATUS_OPTIONS = [

  { value: '', label: '全部' },

  { value: 'open', label: '待處理' },

  { value: 'in_progress', label: '處理中' },

  { value: 'resolved', label: '已結案' },

];



export default function MaintenanceRecordsPage() {

  const { user } = useAuth();

  const canViewCompensation = canViewMaintenanceCompensation(user);

  const canEditCompensation = canEditMaintenanceCompensation(user);

  const [records, setRecords] = useState([]);

  const [selected, setSelected] = useState(null);

  const [status, setStatus] = useState('');

  const [error, setError] = useState('');

  const [message, setMessage] = useState('');

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);



  async function loadRecords(nextStatus = status) {

    setLoading(true);

    setError('');



    try {

      const result = await api.getMaintenanceRecords({

        status: nextStatus || undefined,

        per_page: 50,

      });

      setRecords(result.data.records || []);

    } catch (err) {

      setError(err.message);

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => {

    loadRecords();

  }, []);



  async function handleSave(payload) {

    if (!selected || !canEditCompensation) {

      return;

    }



    setSaving(true);

    setError('');

    setMessage('');



    try {

      await api.updateMaintenanceRecord(selected.id, payload);

      setMessage('維修紀錄已更新');

      setSelected(null);

      await loadRecords();

    } catch (err) {

      setError(err.message);

    } finally {

      setSaving(false);

    }

  }



  return (

    <Layout title="維修紀錄">

      <section className="card">

        <div className="card-header">

          <div>

            <h2 className="card-title">維修紀錄</h2>

            <p className="hint">師傅填寫是否賠款與處理方式；追蹤完成改為「已結案」時填寫賠款總額，確認後自動列入阿泰代墊。</p>

          </div>

          <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadRecords()} disabled={loading}>

            重新整理

          </button>

        </div>



        <div className="filter-toolbar">

          <label className="field field-compact">

            <span className="field-label">狀態</span>

            <select className="field-control" value={status} onChange={(e) => setStatus(e.target.value)}>

              {STATUS_OPTIONS.map((option) => (

                <option key={option.value || 'all'} value={option.value}>{option.label}</option>

              ))}

            </select>

          </label>

          <button type="button" className="btn btn-primary btn-sm" onClick={() => loadRecords(status)}>查詢</button>

        </div>

      </section>



      <PageAlert type="success" message={message} />

      <PageAlert type="error" message={error} />



      <section className="card table-card">

        <div className="table-wrap">

          <table className="data-table">

            <thead>

              <tr>

                <th>時間</th>

                <th>客戶</th>

                <th>電話</th>

                <th>問題</th>

                <th>後續處理方式</th>

                <th>是否賠款</th>

                {canViewCompensation && <th>賠款總額</th>}

                <th>狀態</th>

                <th>師傅</th>

                <th>操作</th>

              </tr>

            </thead>

            <tbody>

              {records.map((record) => (

                <tr key={record.id}>

                  <td>{record.created_at?.slice?.(0, 16)}</td>

                  <td>{record.customer_name || '-'}</td>

                  <td>{record.customer_phone}</td>

                  <td>{record.issue_description?.slice?.(0, 40)}</td>

                  <td>{record.follow_up_method?.slice?.(0, 24) || '-'}</td>

                  <td>{compensationLabel(record.requires_compensation)}</td>

                  {canViewCompensation && <td>{formatAmount(record.service_amount)}</td>}

                  <td>{record.status_label}</td>

                  <td>{record.assignee?.name || record.reporter?.name || '-'}</td>

                  <td>

                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(record)}>

                      詳情

                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

        {!records.length && !loading && <p className="hint" style={{ padding: 16 }}>目前沒有維修紀錄。</p>}

      </section>



      <MaintenanceRecordDetailModal

        record={selected}

        open={Boolean(selected)}

        onClose={() => setSelected(null)}

        onSave={handleSave}

        saving={saving}

        editable={canEditCompensation}

        canViewCompensation={canViewCompensation}

        canEditCompensation={canEditCompensation}

      />

    </Layout>

  );

}


