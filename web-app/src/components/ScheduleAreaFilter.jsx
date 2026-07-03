import { sortAreasByRoute } from '../utils/taitungAreas';

export function ScheduleAreaFilter({ selectedAreas, onChange }) {
  const sortedAreas = sortAreasByRoute();

  function toggleArea(value) {
    if (selectedAreas.includes(value)) {
      onChange(selectedAreas.filter((area) => area !== value));
      return;
    }

    onChange([...selectedAreas, value]);
  }

  return (
    <div className="area-filter">
      <div className="area-filter__header">
        <span className="field-label">區域篩選（台東）</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm area-filter__clear"
          onClick={() => onChange([])}
          disabled={selectedAreas.length === 0}
        >
          清除
        </button>
      </div>
      <div className="availability-area-grid area-filter__grid" role="group" aria-label="區域篩選">
        {sortedAreas.map((area) => (
          <button
            key={area.value}
            type="button"
            className={`availability-area-tile${selectedAreas.includes(area.value) ? ' is-active' : ''}`}
            aria-pressed={selectedAreas.includes(area.value)}
            onClick={() => toggleArea(area.value)}
          >
            {area.label}
          </button>
        ))}
      </div>
    </div>
  );
}
