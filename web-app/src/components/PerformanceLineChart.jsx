function buildPoints(series, width, height, padding) {
  const values = series.map((item) => item.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = Math.max(maxValue - minValue, 1);

  return series.map((item, index) => {
    const x = padding + ((width - padding * 2) * index) / Math.max(series.length - 1, 1);
    const y = height - padding - ((item.value - minValue) / range) * (height - padding * 2);

    return { ...item, x, y };
  });
}

function linePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function PerformanceLineChart({ title, seriesList, width = 720, height = 260 }) {
  const padding = 36;
  const colors = ['#ff8c00', '#42a5f5', '#66bb6a', '#ef5350'];

  if (!seriesList?.length) {
    return (
      <div className="performance-chart">
        <h3 className="section-label">{title}</h3>
        <p className="hint">尚無資料</p>
      </div>
    );
  }

  const labels = seriesList[0].points.map((point) => point.label);
  const allPoints = seriesList.map((series, seriesIndex) => ({
    ...series,
    color: series.color || colors[seriesIndex % colors.length],
    plotted: buildPoints(series.points, width, height, padding),
  }));

  return (
    <div className="performance-chart">
      <h3 className="section-label">{title}</h3>
      <div className="performance-chart__legend">
        {allPoints.map((series) => (
          <span key={series.key} className="performance-chart__legend-item">
            <span className="performance-chart__dot" style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
      <div className="performance-chart__canvas-wrap">
        <svg
          className="performance-chart__canvas"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding + (height - padding * 2) * ratio;

            return (
              <line
                key={ratio}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                className="performance-chart__grid-line"
              />
            );
          })}
          {allPoints.map((series) => (
            <g key={series.key}>
              <path d={linePath(series.plotted)} fill="none" stroke={series.color} strokeWidth="3" />
              {series.plotted.map((point) => (
                <g key={`${series.key}-${point.label}`}>
                  <circle cx={point.x} cy={point.y} r="4.5" fill={series.color} />
                  <title>{`${series.label} ${point.label}: ${point.value}`}</title>
                </g>
              ))}
            </g>
          ))}
        </svg>
        <div className="performance-chart__x-labels">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
