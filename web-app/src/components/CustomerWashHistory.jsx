import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { canManageSchedulePricing } from '../utils/permissions';
import { formatDateOnly, formatTimeValue } from '../utils/scheduleCalendar';

function normalizePhone(value) {
  return String(value || '').replace(/\s+/g, '');
}

export function CustomerWashHistory({ phone, onApply }) {
  const { user } = useAuth();
  const showPricing = canManageSchedulePricing(user);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);

  useEffect(() => {
    if (normalizedPhone.length < 8) {
      setHistory(null);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);

      try {
        const result = await api.customerLookup(normalizedPhone);

        if (!cancelled) {
          setHistory(result.data);
        }
      } catch {
        if (!cancelled) {
          setHistory(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedPhone]);

  const schedules = history?.schedules || [];

  if (normalizedPhone.length < 8) {
    return null;
  }

  if (loading) {
    return <p className="hint customer-history">正在查詢清洗紀錄...</p>;
  }

  if (!schedules.length) {
    return null;
  }

  return (
    <section className="customer-history">
      <div className="customer-history__header">
        <strong>此客戶曾清洗 {schedules.length} 次</strong>
        <span className="hint">以下為歷史紀錄，方便確認是否回訪客戶</span>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>時間</th>
              <th>師傅</th>
              <th>地址</th>
              {showPricing && <th>金額</th>}
              {onApply && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {schedules.slice(0, 8).map((schedule) => (
              <tr key={schedule.id}>
                <td>{formatDateOnly(schedule.work_date)}</td>
                <td>{formatTimeValue(schedule.start_time)}</td>
                <td>{schedule.user?.name || '-'}</td>
                <td>{schedule.customer_address}</td>
                {showPricing && <td className="num">{schedule.cleaning_price || '-'} 元</td>}
                {onApply && (
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onApply(schedule)}>
                      帶入
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
