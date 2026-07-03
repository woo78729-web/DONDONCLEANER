import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { api } from '../api/client';
import { formatDateOnly, getMinWorkDate } from '../utils/scheduleCalendar';

const WEEKDAY_OPTIONS = [
  { value: 0, label: '週日' },
  { value: 1, label: '週一' },
  { value: 2, label: '週二' },
  { value: 3, label: '週三' },
  { value: 4, label: '週四' },
  { value: 5, label: '週五' },
  { value: 6, label: '週六' },
];

export default function EmployeeLeavePage() {
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [leaves, setLeaves] = useState([]);
  const [leaveDate, setLeaveDate] = useState('');
  const [weekday, setWeekday] = useState('1');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('date');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await api.getEmployeeLeaves();
      setRegistrationOpen(Boolean(result.data.registration_open));
      setRegistrationMessage(result.data.registration_message || '');
      setLeaves(result.data.leaves || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaves().catch((err) => setError(err.message));
  }, [loadLeaves]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setError('');

    try {
      if (mode === 'date') {
        await api.createEmployeeLeave({
          leave_type: 'date',
          leave_date: leaveDate,
          note: note.trim() || null,
        });
      } else {
        await api.createEmployeeLeave({
          leave_type: 'weekly',
          weekday: Number(weekday),
          note: note.trim() || null,
        });
      }

      setMessage('排假登記成功');
      setLeaveDate('');
      setNote('');
      await loadLeaves();
    } catch (err) {
      setError(err.message);
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
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">師傅排假</h2>
            <p className="hint">每月 20–25 日開放登記。若當日已有派工，系統會禁止排假。</p>
          </div>
        </div>

        <div className={`alert${registrationOpen ? ' alert-success' : ' alert-warning'}`}>
          {registrationMessage || (registrationOpen ? '目前開放排假' : '目前非排假開放時間')}
        </div>

        <form className="form-grid cols-2 employee-leave-form" onSubmit={handleSubmit}>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
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
            <label className="field">
              <span className="field-label">休假日期</span>
              <input
                className="field-control"
                type="date"
                min={getMinWorkDate()}
                value={leaveDate}
                onChange={(event) => setLeaveDate(event.target.value)}
                required={registrationOpen}
              />
            </label>
          ) : (
            <div className="field employee-leave-weekday-field" style={{ gridColumn: '1 / -1' }}>
              <span className="field-label">每週固定</span>
              <div className="option-chip-group option-chip-group--weekday" role="radiogroup" aria-label="每週固定休息日">
                {WEEKDAY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={Number(weekday) === option.value}
                    className={`option-chip option-chip--weekday${Number(weekday) === option.value ? ' is-active' : ''}`}
                    onClick={() => setWeekday(String(option.value))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="field">
            <span className="field-label">備註（選填）</span>
            <input
              className="field-control"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={!registrationOpen}>
              {registrationOpen ? '登記排假' : '目前非開放時間'}
            </button>
          </div>
        </form>

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
                disabled={!registrationOpen}
                onClick={() => handleDelete(leave.id)}
              >
                取消
              </button>
            </div>
          ))}
        </div>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />
    </Layout>
  );
}
