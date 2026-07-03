/** 以台東市為中心，路線由近到遠（排單參考） */
export const TAITUNG_SERVICE_AREAS = [
  { value: 'taitung_city', label: '台東市', routeOrder: 0 },
  { value: 'beinan', label: '卑南', routeOrder: 1 },
  { value: 'luye', label: '鹿野', routeOrder: 2 },
  { value: 'guanshan', label: '關山', routeOrder: 3 },
  { value: 'chishang', label: '池上', routeOrder: 4 },
  { value: 'haiduan', label: '海端', routeOrder: 5 },
  { value: 'yanping', label: '延平', routeOrder: 6 },
  { value: 'donghe', label: '東河', routeOrder: 7 },
  { value: 'chenggong', label: '成功', routeOrder: 8 },
  { value: 'changbin', label: '長濱', routeOrder: 9 },
  { value: 'taimali', label: '太麻里', routeOrder: 10 },
  { value: 'dawu', label: '大武', routeOrder: 11 },
  { value: 'daren', label: '達仁', routeOrder: 12 },
  { value: 'jinfeng', label: '金峰', routeOrder: 13 },
  { value: 'ludao', label: '綠島', routeOrder: 14 },
  { value: 'lanyu', label: '蘭嶼', routeOrder: 15 },
];

export function sortAreasByRoute(areas = TAITUNG_SERVICE_AREAS) {
  return [...areas].sort((left, right) => (left.routeOrder ?? 99) - (right.routeOrder ?? 99));
}

export function getServiceAreaLabel(value) {
  return TAITUNG_SERVICE_AREAS.find((area) => area.value === value)?.label ?? '未設定';
}

export function buildAreaFilterParam(selectedAreas) {
  if (!selectedAreas?.length) {
    return undefined;
  }

  return selectedAreas.join(',');
}

export const AVAILABILITY_DAY_PRESETS = [7, 14, 21, 28];

const AVAILABILITY_DAYS_STORAGE_KEY = 'schedule-availability-days';

export function loadAvailabilityDays(defaultDays = 14) {
  try {
    const raw = localStorage.getItem(AVAILABILITY_DAYS_STORAGE_KEY);
    const parsed = Number(raw);

    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 60) {
      return parsed;
    }
  } catch {
    // ignore
  }

  return defaultDays;
}

export function saveAvailabilityDays(days) {
  localStorage.setItem(AVAILABILITY_DAYS_STORAGE_KEY, String(days));
}
