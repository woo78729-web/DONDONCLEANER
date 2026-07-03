import { useState } from 'react';

const VIEW_OPTIONS = [
  { value: 'month', label: '月' },
  { value: 'week', label: '週' },
  { value: 'day', label: '日' },
  { value: 'agenda', label: '列表' },
];

const SLOT_OPTIONS = [
  { value: 15, label: '15 分鐘' },
  { value: 30, label: '30 分鐘' },
  { value: 60, label: '60 分鐘' },
];

function buildHourOptions(min, max) {
  const options = [];

  for (let hour = min; hour <= max; hour += 1) {
    options.push({
      value: hour,
      label: hour === 24 ? '24:00' : `${String(hour).padStart(2, '0')}:00`,
    });
  }

  return options;
}

const HOUR_OPTIONS = buildHourOptions(5, 24);

export function CalendarSettingsPanel({
  settings,
  onChange,
  showColorMode = false,
}) {
  const [open, setOpen] = useState(false);

  function update(partial) {
    onChange({ ...settings, ...partial });
  }

  return (
    <div className="calendar-settings">
      <button
        type="button"
        className="btn btn-secondary btn-sm calendar-settings__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? '收合設定' : '行事曆設定'}
      </button>

      {open && (
        <div className="calendar-settings__panel">
          <div className="calendar-settings__grid">
            <label className="field">
              <span className="field-label">預設顯示天數</span>
              <select
                className="field-control"
                value={settings.displayDays ?? 7}
                onChange={(event) => update({ displayDays: Number(event.target.value) })}
              >
                {Array.from({ length: 7 }, (_, index) => index + 1).map((days) => (
                  <option key={days} value={days}>
                    {days} 天
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">預設檢視</span>
              <select
                className="field-control"
                value={settings.defaultView}
                onChange={(event) => update({ defaultView: event.target.value })}
              >
                {VIEW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">週起始日</span>
              <select
                className="field-control"
                value={settings.weekStartsOn}
                onChange={(event) => update({ weekStartsOn: Number(event.target.value) })}
              >
                <option value={0}>週日</option>
                <option value={1}>週一</option>
              </select>
            </label>

            <label className="field">
              <span className="field-label">顯示開始時間</span>
              <select
                className="field-control"
                value={settings.startHour}
                onChange={(event) => update({ startHour: Number(event.target.value) })}
              >
                {HOUR_OPTIONS.filter((option) => option.value < settings.endHour).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">顯示結束時間</span>
              <select
                className="field-control"
                value={settings.endHour}
                onChange={(event) => update({ endHour: Number(event.target.value) })}
              >
                {HOUR_OPTIONS.filter((option) => option.value > settings.startHour).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">時間間隔</span>
              <select
                className="field-control"
                value={settings.slotMinutes}
                onChange={(event) => update({ slotMinutes: Number(event.target.value) })}
              >
                {SLOT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {showColorMode && (
              <label className="field">
                <span className="field-label">行程著色</span>
                <select
                  className="field-control"
                  value={settings.colorMode}
                  onChange={(event) => update({ colorMode: event.target.value })}
                >
                  <option value="source">依客戶來源</option>
                  <option value="employee">依師傅（頭像）</option>
                </select>
              </label>
            )}
          </div>

          <p className="hint calendar-settings__hint">預設顯示 5:00–24:00；設定會保存在此瀏覽器。</p>
        </div>
      )}
    </div>
  );
}
