import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { PageAlert } from '../components/PageAlert';
import { PerformanceLineChart } from '../components/PerformanceLineChart';
import { MonthlyLedgerGrid } from '../components/MonthlyLedgerGrid';
import { api } from '../api/client';
import { readLegacyLedgerExcelFile } from '../utils/legacyLedgerImport';

const METRICS = [
  { key: 'units', label: '清洗台數' },
  { key: 'revenue', label: '營業額' },
  { key: 'profit', label: '營利' },
];

function currentYearMonth() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

function formatUnits(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

export default function AdminPerformancePage() {
  const [tab, setTab] = useState('compare');
  const [metric, setMetric] = useState('units');
  const [compareMonth, setCompareMonth] = useState(() => new Date().getMonth() + 1);
  const [trends, setTrends] = useState(null);
  const [monthDetail, setMonthDetail] = useState(null);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth());
  const [importPreview, setImportPreview] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadTrends() {
    setLoading(true);
    setError('');

    try {
      const thisYear = new Date().getFullYear();
      const result = await api.getLegacyLedgerTrends({
        from_year: thisYear - 1,
        to_year: thisYear,
      });
      setTrends(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMonths() {
    try {
      const monthsResult = await api.getLegacyLedgerMonths();
      const months = monthsResult.data.months || [];
      setAvailableMonths(months);

      if (months.length && !months.includes(selectedMonth)) {
        setSelectedMonth(months[0]);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadMonthDetail(yearMonth = selectedMonth) {
    setLoading(true);
    setError('');

    try {
      const result = await api.getLegacyLedgerMonth(yearMonth);
      setMonthDetail(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrends();
    loadMonths();
  }, []);

  useEffect(() => {
    if (tab === 'ledger' && selectedMonth) {
      loadMonthDetail(selectedMonth);
    }
  }, [tab, selectedMonth]);

  const compareChart = useMemo(() => {
    const yoy = trends?.year_over_year;

    if (!yoy) {
      return [];
    }

    const metricData = yoy[metric] || yoy.units;

    return [
      {
        key: 'last',
        label: `${yoy.last_year}年`,
        color: '#90a4ae',
        points: (yoy.month_labels || []).map((label, index) => ({
          label,
          value: metricData.last_year?.[index] || 0,
        })),
      },
      {
        key: 'this',
        label: `${yoy.this_year}年`,
        color: '#ff8c00',
        points: (yoy.month_labels || []).map((label, index) => ({
          label,
          value: metricData.this_year?.[index] || 0,
        })),
      },
    ];
  }, [trends, metric]);

  const unitSummary = useMemo(() => {
    const yoy = trends?.year_over_year;

    if (!yoy?.units) {
      return null;
    }

    const monthRows = (yoy.month_labels || []).map((label, index) => {
      const lastUnits = Number(yoy.units.last_year?.[index] || 0);
      const thisUnits = Number(yoy.units.this_year?.[index] || 0);

      return {
        month: index + 1,
        label,
        lastUnits,
        thisUnits,
        delta: thisUnits - lastUnits,
      };
    });

    const selected = monthRows.find((row) => row.month === compareMonth) || monthRows[new Date().getMonth()] || monthRows[0];

    return {
      lastYear: yoy.last_year,
      thisYear: yoy.this_year,
      monthRows,
      selected,
    };
  }, [trends, compareMonth]);

  async function handleImportFile(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError('');
    setMessage('');

    try {
      const parsed = await readLegacyLedgerExcelFile(file);
      setImportPreview(parsed);
      setMessage(
        parsed.is_year_workbook
          ? `已解析 ${parsed.months.length} 個月份分頁，可一次匯入整年度`
          : `已解析 1 個月份，請確認後匯入`,
      );
    } catch (err) {
      setError(err.message || 'Excel 解析失敗');
      setImportPreview(null);
    } finally {
      event.target.value = '';
    }
  }

  async function submitImport() {
    if (!importPreview?.months?.length) {
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    const months = importPreview.months.map(({ sheet_name, summary, ...payload }) => payload);

    try {
      if (months.length > 1) {
        const result = await api.importLegacyLedgerBulk(months);
        setMessage(`整年度已匯入 ${result.data.imported_count} 個月：${result.data.months.join('、')}`);
      } else {
        await api.importLegacyLedger(months[0]);
        setMessage(`${months[0].year_month} 舊帳（含代墊款）已匯入`);
      }

      setImportPreview(null);
      await loadMonths();
      await loadTrends();

      if (tab === 'ledger' && months.length === 1) {
        setSelectedMonth(months[0].year_month);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteSelectedMonth() {
    if (!selectedMonth || !window.confirm(`確定刪除 ${selectedMonth} 的舊帳資料？`)) {
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await api.deleteLegacyLedgerMonth(selectedMonth);
      setMessage(`${selectedMonth} 舊帳已刪除`);
      setMonthDetail(null);
      await loadMonths();
      await loadTrends();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="歷年績效">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">歷年績效與舊帳表</h2>
            <p className="hint">每月對比去年與今年；可匯入 Excel 舊帳（鈞／阡／代墊款）。</p>
          </div>
        </div>
        <div className="performance-tabs">
          <button type="button" className={`btn btn-sm ${tab === 'compare' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('compare')}>每月對比</button>
          <button type="button" className={`btn btn-sm ${tab === 'ledger' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('ledger')}>月份帳表</button>
          <button type="button" className={`btn btn-sm ${tab === 'import' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('import')}>匯入資料</button>
        </div>
      </section>

      <PageAlert type="success" message={message} />
      <PageAlert type="error" message={error} />

      {tab === 'compare' && trends && (
        <section className="card performance-compare-card">
          <div className="performance-tabs">
            {METRICS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`btn btn-sm ${metric === item.key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMetric(item.key)}
              >
                {item.label}
              </button>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadTrends} disabled={loading}>
              {loading ? '載入中...' : '重新整理'}
            </button>
          </div>

          <div className="performance-compare-layout">
            <div className="performance-compare-layout__chart">
              <PerformanceLineChart
                title={`${trends.year_over_year?.last_year} vs ${trends.year_over_year?.this_year} 每月${METRICS.find((item) => item.key === metric)?.label || ''}`}
                seriesList={compareChart}
                width={560}
                height={220}
              />
            </div>

            {unitSummary && (
              <aside className="performance-unit-summary">
                <div className="performance-unit-summary__header">
                  <h3 className="section-label">每月台數比較</h3>
                  <label className="field field-compact performance-unit-summary__picker">
                    <span className="field-label">查看月份</span>
                    <select
                      className="field-control"
                      value={compareMonth}
                      onChange={(event) => setCompareMonth(Number(event.target.value))}
                    >
                      {unitSummary.monthRows.map((row) => (
                        <option key={row.month} value={row.month}>{row.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="hint performance-unit-summary__hint">所有師傅合計；同月份去年 vs 今年。</p>

                <div className="performance-unit-summary__cards">
                  <article className="performance-unit-summary__card performance-unit-summary__card--last">
                    <p className="performance-unit-summary__label">
                      {unitSummary.lastYear} 年 {unitSummary.selected.month} 月
                    </p>
                    <p className="performance-unit-summary__value">{formatUnits(unitSummary.selected.lastUnits)}</p>
                    <p className="performance-unit-summary__meta">台</p>
                  </article>

                  <article className="performance-unit-summary__card performance-unit-summary__card--this">
                    <p className="performance-unit-summary__label">
                      {unitSummary.thisYear} 年 {unitSummary.selected.month} 月
                    </p>
                    <p className="performance-unit-summary__value">{formatUnits(unitSummary.selected.thisUnits)}</p>
                    <p className="performance-unit-summary__meta">台</p>
                  </article>
                </div>

                <p className="hint performance-unit-summary__delta">
                  本月差異
                  {' '}
                  {unitSummary.selected.delta >= 0 ? '+' : ''}
                  {formatUnits(unitSummary.selected.delta)}
                  {' '}
                  台
                </p>

                <div className="performance-unit-summary__table-wrap">
                  <table className="performance-unit-summary__table">
                    <thead>
                      <tr>
                        <th>月份</th>
                        <th className="num">{unitSummary.lastYear}年</th>
                        <th className="num">{unitSummary.thisYear}年</th>
                        <th className="num">差異</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unitSummary.monthRows.map((row) => (
                        <tr
                          key={row.month}
                          className={row.month === compareMonth ? 'is-selected' : undefined}
                          onClick={() => setCompareMonth(row.month)}
                        >
                          <td>{row.label}</td>
                          <td className="num">{formatUnits(row.lastUnits)}</td>
                          <td className="num">{formatUnits(row.thisUnits)}</td>
                          <td className={`num${row.delta > 0 ? ' is-up' : row.delta < 0 ? ' is-down' : ''}`}>
                            {row.delta >= 0 ? '+' : ''}
                            {formatUnits(row.delta)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </aside>
            )}
          </div>

          <p className="hint">今年數字 = 舊帳 Excel ＋ 系統回報台數（營業額／營利僅來自舊帳）。</p>
        </section>
      )}

      {tab === 'ledger' && (
        <>
          <section className="card">
            <div className="filter-toolbar">
              <label className="field field-compact">
                <span className="field-label">月份</span>
                <input className="field-control" type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
              </label>
              <div className="toolbar-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => loadMonthDetail(selectedMonth)} disabled={loading}>
                  {loading ? '載入中...' : '載入帳表'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={deleteSelectedMonth} disabled={loading || !availableMonths.includes(selectedMonth)}>
                  刪除此月舊帳
                </button>
              </div>
            </div>
            {availableMonths.length > 0 && (
              <p className="hint">已匯入月份：{availableMonths.join('、')}</p>
            )}
          </section>

          {monthDetail && (
            <>
              {(monthDetail.groups || []).map((group) => (
                <MonthlyLedgerGrid
                  key={group.group_key}
                  groupLabel={group.group_label}
                  ledger={group.ledger}
                  remittanceRates={monthDetail.remittance_rates}
                />
              ))}

              <section className="card table-card">
                <div className="card-header" style={{ padding: '16px 16px 0' }}>
                  <h2 className="card-title">代墊款（阿泰／宏逸）</h2>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>代墊人</th>
                        <th>項目</th>
                        <th className="num">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(monthDetail.advances || []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="hint">此月份尚無代墊紀錄</td>
                        </tr>
                      ) : (
                        monthDetail.advances.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.partner_label}</td>
                            <td>{entry.label}</td>
                            <td className="num">{formatMoney(entry.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {tab === 'import' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">匯入 Excel 舊帳</h2>
              <p className="hint">支援整年度活頁簿：每個分頁一個月（分頁名稱如 1月、二月、2024-01），會一次匯入全部月份與代墊款。</p>
            </div>
          </div>
          <label className="field">
            <span className="field-label">選擇 Excel 檔案</span>
            <input className="field-control" type="file" accept=".xlsx,.xls" onChange={handleImportFile} />
          </label>

          {importPreview && (
            <div className="import-preview">
              <h3 className="section-label">解析預覽</h3>
              <p className="hint">
                偵測到 {importPreview.months.length} 個月份
                {importPreview.skipped_sheets?.length
                  ? `（略過 ${importPreview.skipped_sheets.length} 個無資料分頁）`
                  : ''}
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>分頁</th>
                      <th>月份</th>
                      <th className="num">台數</th>
                      <th className="num">營業額</th>
                      <th className="num">代墊筆數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.months.map((month) => (
                      <tr key={`${month.sheet_name}-${month.year_month}`}>
                        <td>{month.sheet_name}</td>
                        <td>{month.year_month}</td>
                        <td className="num">{month.summary?.units || 0}</td>
                        <td className="num">{formatMoney(month.summary?.revenue || 0)}</td>
                        <td className="num">{(month.advances || []).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" className="btn btn-primary" onClick={submitImport} disabled={loading}>
                {loading
                  ? '匯入中...'
                  : importPreview.months.length > 1
                    ? `確認匯入整年度 ${importPreview.months.length} 個月`
                    : `確認匯入 ${importPreview.months[0].year_month}`}
              </button>
            </div>
          )}
        </section>
      )}
    </Layout>
  );
}
