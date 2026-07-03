import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { api } from '../api/client';

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

export default function EmployeeMonthlySummaryPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadSummary(nextYearMonth = yearMonth) {
    setLoading(true);
    setError('');

    try {
      const result = await api.getEmployeeSummary(nextYearMonth);
      setData(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary(yearMonth);
  }, [yearMonth]);

  return (
    <Layout title="本月帳務">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">本月帳務摘要</h2>
            <p className="hint">匯款案件計入案件總額與公司應退師傅所得；月底應繳 = 現場應收 − 匯款件應退；有發票者現場應收含向客戶收的 5% 加價；維修賠款由公司代墊，師傅分擔款應入公司（交給阿泰代收）。</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadSummary()} disabled={loading}>
            {loading ? '載入中...' : '重新整理'}
          </button>
        </div>

        <div className="filter-toolbar">
          <label className="field field-compact">
            <span className="field-label">月份</span>
            <input
              className="field-control"
              type="month"
              value={yearMonth}
              onChange={(event) => setYearMonth(event.target.value)}
            />
          </label>
        </div>
      </section>

      <PageAlert type="error" message={error} />

      {data && (
        <>
          <section className="summary-row">
            <span className="stat-badge">回報筆數 {data.report_count}</span>
            <span className="stat-badge">完成台數 {data.completed_units}</span>
            <span className="stat-badge">案件總額 {formatMoney(data.total_job_amount)}</span>
          </section>

          <section className="card employee-summary-grid">
            <article className="employee-summary-card">
              <p className="employee-summary-card__label">案件總額</p>
              <p className="employee-summary-card__value">{formatMoney(data.total_job_amount)} 元</p>
              <p className="hint">含匯款案件（如 70 台顯示 73,500）</p>
            </article>

            <article className="employee-summary-card">
              <p className="employee-summary-card__label">實收（現場）</p>
              <p className="employee-summary-card__value">{formatMoney(data.employee_cash_received)} 元</p>
              <p className="hint">匯款案件為 0</p>
            </article>

            <article className="employee-summary-card">
              <p className="employee-summary-card__label">應交公司（現場件）</p>
              <p className="employee-summary-card__value">{formatMoney(data.remittance_due)} 元</p>
              <p className="hint">依 1500→600、1300→500、1000→400；有發票另加案件 5% 加價</p>
            </article>

            <article className="employee-summary-card">
              <p className="employee-summary-card__label">公司應退（匯款件）</p>
              <p className="employee-summary-card__value">{formatMoney(data.advance_from_company_jobs)} 元</p>
              <p className="hint">師傅所得：1500→900、1300→800、1000→600</p>
            </article>

            <article className="employee-summary-card employee-summary-card--highlight">
              <p className="employee-summary-card__label">本月應繳財務</p>
              <p className="employee-summary-card__value">{formatMoney(data.payment_to_finance)} 元</p>
              <p className="hint">應交公司 − 公司應退</p>
            </article>

            {(data.compensation_due_to_company || data.compensation_due_to_atai || 0) > 0 && (
              <article className="employee-summary-card employee-summary-card--highlight">
                <p className="employee-summary-card__label">賠償應入公司</p>
                <p className="employee-summary-card__value">
                  {formatMoney(data.compensation_due_to_company ?? data.compensation_due_to_atai)} 元
                </p>
                <p className="hint">賠款由公司代墊，請將分擔款交給阿泰代收入公司帳</p>
              </article>
            )}

            <article className="employee-summary-card">
              <p className="employee-summary-card__label">扣除後自己的錢</p>
              <p className="employee-summary-card__value">{formatMoney(data.own_amount)} 元</p>
              <p className="hint">實收 − 應交 + 公司應退</p>
            </article>
          </section>

          {(data.company_inbound_expected > 0 || data.payout_from_finance > 0) && (
            <section className="card">
              <dl className="schedule-detail accounting-settlement">
                {data.company_inbound_expected > 0 && (
                  <div>
                    <dt>客戶匯入宏逸（待確認/已確認）</dt>
                    <dd>{formatMoney(data.company_inbound_expected)} 元</dd>
                  </div>
                )}
                {data.payout_from_finance > 0 && (
                  <div>
                    <dt>公司應退您（大於應繳時）</dt>
                    <dd>{formatMoney(data.payout_from_finance)} 元</dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </>
      )}
    </Layout>
  );
}
