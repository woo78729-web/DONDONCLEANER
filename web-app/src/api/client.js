const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_SESSION_KEY = 'ac_token';
const TOKEN_PERSIST_KEY = 'ac_token_persist';
const TOKEN_LEGACY_KEY = 'ac_token';
const UNAUTHORIZED_EVENT = 'ac:unauthorized';

function readStoredToken() {
  return localStorage.getItem(TOKEN_PERSIST_KEY)
    || sessionStorage.getItem(TOKEN_SESSION_KEY)
    || localStorage.getItem(TOKEN_LEGACY_KEY)
    || '';
}

function formatApiErrorMessage(json, status, path = '') {
  if (path === '/login') {
    if (json?.errors && typeof json.errors === 'object') {
      const firstError = Object.values(json.errors).flat().find(Boolean);

      if (firstError) {
        return String(firstError);
      }
    }

    if (json?.message && json.message !== 'Server Error' && json.message !== 'Unauthenticated.') {
      return json.message;
    }

    if (status === 401) {
      return '帳號或密碼錯誤';
    }
  }

  if (status === 401 || json?.message === 'Unauthenticated.') {
    return '登入已過期，請重新登入';
  }

  if (json?.errors && typeof json.errors === 'object') {
    const firstError = Object.values(json.errors).flat().find(Boolean);

    if (firstError) {
      return String(firstError);
    }
  }

  if (status === 429 || json?.message === 'Too Many Attempts.') {
    return '登入嘗試次數過多，請稍後 1 分鐘再試';
  }

  if (json?.message && json.message !== 'Server Error') {
    return json.message;
  }

  if (status >= 500) {
    return '伺服器發生錯誤，請確認資料庫 migration 已執行（php artisan migrate）後再試';
  }

  return '請求失敗';
}

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

class AcCleaningApi {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = readStoredToken();
  }

  syncTokenFromStorage() {
    this.token = readStoredToken();
    return this.token;
  }

  getToken() {
    return this.token || readStoredToken();
  }

  setToken(token, { remember = false } = {}) {
    this.token = token || '';
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    localStorage.removeItem(TOKEN_PERSIST_KEY);
    localStorage.removeItem(TOKEN_LEGACY_KEY);

    if (!token) {
      return;
    }

    if (remember) {
      localStorage.setItem(TOKEN_PERSIST_KEY, token);
    } else {
      sessionStorage.setItem(TOKEN_SESSION_KEY, token);
    }
  }

  handleUnauthorized() {
    this.setToken('');
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }

  async request(method, path, { body, params, raw = false } = {}) {
    const url = new URL(`${this.baseUrl}${path}`, window.location.origin);
    const token = this.syncTokenFromStorage();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      });
    }

    const headers = {
      Accept: raw ? '*/*' : 'application/json',
    };

    if (!raw && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token && path !== '/login') {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        throw new ApiError('伺服器回應逾時，請稍後再試', 0, null);
      }

      throw new ApiError('無法連線伺服器，請先雙擊執行「在家一鍵啟動.bat」', 0, null);
    }

    if (raw) {
      if (!response.ok) {
        throw new ApiError('匯出失敗', response.status, null);
      }

      return response;
    }

    const json = await response.json().catch(() => ({
      status: 'error',
      message: '無法解析伺服器回應',
      data: null,
    }));

    if (!response.ok) {
      if (response.status === 401 && path !== '/login') {
        this.handleUnauthorized();
      }

      const message = formatApiErrorMessage(json, response.status, path);
      throw new ApiError(message, response.status, json);
    }

    return json;
  }

  login(account, password, remember = false) {
    this.setToken('');

    return this.request('POST', '/login', { body: { account, password } }).then((result) => {
      this.setToken(result.data.token, { remember });
      return result;
    });
  }

  logout() {
    return this.request('POST', '/logout').finally(() => this.setToken(''));
  }

  me() {
    return this.request('GET', '/me');
  }

  acceptEmployeeRules() {
    return this.request('POST', '/me/accept-rules');
  }

  getEmployeeSchedules(filters = {}) {
    return this.request('GET', '/employee/schedules', { params: filters });
  }

  getEmployeeTodaySchedules() {
    return this.getEmployeeSchedules({ view: 'today' });
  }

  getPendingReports(workDate) {
    return this.request('GET', '/employee/reports/pending', {
      params: workDate ? { work_date: workDate } : undefined,
    });
  }

  getReportHistory(filters = {}) {
    return this.request('GET', '/employee/reports/history', { params: filters });
  }

  getEmployeeSummary(yearMonth) {
    return this.request('GET', '/employee/reports/summary', {
      params: yearMonth ? { year_month: yearMonth } : undefined,
    });
  }

  submitEmployeeReport(payload) {
    return this.request('POST', '/employee/reports', { body: payload });
  }

  updateAdminReport(reportId, payload) {
    return this.request('PATCH', `/admin/reports/${reportId}`, { body: payload });
  }

  getStaff(params = {}) {
    return this.request('GET', '/admin/users', { params });
  }

  getEmployees() {
    return this.getStaff({ role: 'employee' });
  }

  createStaff(payload) {
    return this.request('POST', '/admin/users', { body: payload });
  }

  updateStaff(userId, payload) {
    return this.request('PATCH', `/admin/users/${userId}`, { body: payload });
  }

  deleteStaff(userId) {
    return this.request('DELETE', `/admin/users/${userId}`);
  }

  updatePassword(currentPassword, password, passwordConfirmation) {
    return this.request('PATCH', '/me/password', {
      body: {
        current_password: currentPassword,
        password,
        password_confirmation: passwordConfirmation,
      },
    });
  }

  uploadStaffAvatar(userId, file) {
    const formData = new FormData();
    formData.append('avatar', file);

    return this.request('POST', `/admin/users/${userId}/avatar`, { body: formData });
  }

  getAccounting(yearMonth) {
    return this.request('GET', '/admin/accounting', {
      params: yearMonth ? { year_month: yearMonth } : undefined,
    });
  }

  getSettlementLedger(yearMonth, userId) {
    return this.request('GET', '/admin/accounting/settlement-ledger', {
      params: {
        ...(yearMonth ? { year_month: yearMonth } : {}),
        ...(userId ? { user_id: userId } : {}),
      },
    });
  }

  getLegacyLedgerTrends(params = {}) {
    return this.request('GET', '/admin/legacy-ledgers/trends', { params });
  }

  getLegacyLedgerMonths() {
    return this.request('GET', '/admin/legacy-ledgers/months');
  }

  getLegacyLedgerMonth(yearMonth) {
    return this.request('GET', '/admin/legacy-ledgers/month', {
      params: { year_month: yearMonth },
    });
  }

  importLegacyLedger(payload) {
    return this.request('POST', '/admin/legacy-ledgers/import', { body: payload });
  }

  importLegacyLedgerBulk(months) {
    return this.request('POST', '/admin/legacy-ledgers/import-bulk', {
      body: { months },
    });
  }

  deleteLegacyLedgerMonth(yearMonth) {
    return this.request('DELETE', '/admin/legacy-ledgers/month', {
      params: { year_month: yearMonth },
    });
  }

  updateAccountingSettings(yearMonth, expenses) {
    return this.request('PATCH', '/admin/accounting/settings', {
      body: { year_month: yearMonth, expenses },
    });
  }

  createAccountingAdvance(payload) {
    return this.request('POST', '/admin/accounting/advances', { body: payload });
  }

  updateAccountingAdvance(entryId, payload) {
    return this.request('PATCH', `/admin/accounting/advances/${entryId}`, { body: payload });
  }

  deleteAccountingAdvance(entryId) {
    return this.request('DELETE', `/admin/accounting/advances/${entryId}`);
  }

  createManualPostage(payload) {
    return this.request('POST', '/admin/accounting/manual-postage', { body: payload });
  }

  deleteManualPostage(entryId) {
    return this.request('DELETE', `/admin/accounting/manual-postage/${entryId}`);
  }

  createSchedule(payload) {
    return this.request('POST', '/admin/schedules', { body: payload });
  }

  getSchedules(filters = {}) {
    return this.request('GET', '/admin/schedules', { params: filters });
  }

  getCalendarSchedules(filters = {}) {
    return this.request('GET', '/admin/schedules', {
      params: { ...filters, view: 'calendar' },
    });
  }

  getPlanningAvailability(filters = {}) {
    return this.request('GET', '/admin/planning/availability', { params: filters });
  }

  getPlanningLeaves(filters = {}) {
    return this.request('GET', '/admin/planning/leaves', { params: filters });
  }

  toggleAdminLeave(payload) {
    return this.request('POST', '/admin/planning/leaves/toggle', { body: payload });
  }

  batchAdminLeave(payload) {
    return this.request('POST', '/admin/planning/leaves/batch', { body: payload });
  }

  deleteAdminLeave(leaveId) {
    return this.request('DELETE', `/admin/planning/leaves/${leaveId}`);
  }

  getEmployeeLeaves() {
    return this.request('GET', '/employee/leaves');
  }

  createEmployeeLeave(payload) {
    return this.request('POST', '/employee/leaves', { body: payload });
  }

  batchEmployeeLeave(payload) {
    return this.request('POST', '/employee/leaves/batch', { body: payload });
  }

  deleteEmployeeLeave(leaveId) {
    return this.request('DELETE', `/employee/leaves/${leaveId}`);
  }

  getSchedule(scheduleId) {
    return this.request('GET', `/admin/schedules/${scheduleId}`);
  }

  getProjects(params = {}) {
    return this.request('GET', '/admin/projects', { params });
  }

  getProject(projectId) {
    return this.request('GET', `/admin/projects/${projectId}`);
  }

  createProject(payload) {
    return this.request('POST', '/admin/projects', { body: payload });
  }

  updateProjectStatus(projectId, status) {
    return this.request('PATCH', `/admin/projects/${projectId}/status`, { body: { status } });
  }

  addProjectSupplement(projectId, payload) {
    return this.request('POST', `/admin/projects/${projectId}/supplements`, { body: payload });
  }

  updateProjectUnits(projectId, payload) {
    return this.request('PATCH', `/admin/projects/${projectId}/units`, { body: payload });
  }

  updateProjectAssignments(projectId, payload) {
    return this.request('PATCH', `/admin/projects/${projectId}/assignments`, { body: payload });
  }

  consolidateProjectSettlement(projectId) {
    return this.request('POST', `/admin/projects/${projectId}/consolidate-settlement`);
  }

  updateProjectScheduleUnits(projectId, scheduleId, payload) {
    return this.request('PATCH', `/admin/projects/${projectId}/schedules/${scheduleId}/units`, { body: payload });
  }

  deleteProject(projectId) {
    return this.request('DELETE', `/admin/projects/${projectId}`);
  }

  updateSchedule(scheduleId, payload) {
    return this.request('PATCH', `/admin/schedules/${scheduleId}`, { body: payload });
  }

  deleteSchedule(scheduleId) {
    return this.request('DELETE', `/admin/schedules/${scheduleId}`);
  }

  getReports(filters = {}) {
    return this.request('GET', '/admin/reports', { params: filters });
  }

  getRemittanceTracking(yearMonth) {
    return this.request('GET', '/admin/remittance-tracking', { params: { year_month: yearMonth } });
  }

  getRemittanceAlerts() {
    return this.request('GET', '/admin/remittance-tracking/alerts');
  }

  getUnitChangeAlerts() {
    return this.request('GET', '/admin/reports/unit-change-alerts');
  }

  dismissUnitChangeAlerts(reportIds) {
    return this.request('POST', '/admin/reports/unit-change-alerts/dismiss', {
      body: { report_ids: reportIds },
    });
  }

  remindRemittance(remittanceId) {
    return this.request('PATCH', `/admin/remittance-tracking/${remittanceId}/remind`);
  }

  confirmRemittance(remittanceId) {
    return this.request('PATCH', `/admin/remittance-tracking/${remittanceId}/confirm`);
  }

  updateRemittance(remittanceId, payload) {
    return this.request('PATCH', `/admin/remittance-tracking/${remittanceId}`, { body: payload });
  }

  splitRemittance(remittanceId, payload) {
    const body = typeof payload === 'number'
      ? { split_amount: payload }
      : payload;

    return this.request('POST', `/admin/remittance-tracking/${remittanceId}/split`, {
      body,
    });
  }

  async exportReports(filters = {}) {
    const response = await this.request('GET', '/admin/reports/export', {
      params: filters,
      raw: true,
    });

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `daily-reports-${Date.now()}.csv`;
    link.click();
    window.URL.revokeObjectURL(downloadUrl);
  }

  customerLookup(phone) {
    return this.request('GET', '/admin/customer-lookup', { params: { phone } });
  }

  getMaintenanceRecords(filters = {}) {
    return this.request('GET', '/admin/maintenance-records', { params: filters });
  }

  createMaintenanceRecord(payload) {
    return this.request('POST', '/admin/maintenance-records', { body: payload });
  }

  updateMaintenanceRecord(recordId, payload) {
    return this.request('PATCH', `/admin/maintenance-records/${recordId}`, { body: payload });
  }

  getMailTracking(params = {}) {
    return this.request('GET', '/admin/mail-tracking', { params });
  }

  searchMailHistory(params = {}) {
    return this.request('GET', '/admin/mail-tracking/history', { params });
  }

  mergeMailTracking(payload) {
    return this.request('POST', '/admin/mail-tracking/merge', { body: payload });
  }

  unmergeMailTracking(payload) {
    return this.request('POST', '/admin/mail-tracking/unmerge', { body: payload });
  }

  updateScheduleMailTracking(scheduleId, payload) {
    return this.request('PATCH', `/admin/schedules/${scheduleId}/mail-tracking`, { body: payload });
  }

  updateReportMailTracking(reportId, payload) {
    return this.request('PATCH', `/admin/reports/${reportId}/mail-tracking`, { body: payload });
  }

  getEmployeeMaintenanceReports() {
    return this.request('GET', '/employee/maintenance-reports');
  }

  submitEmployeeMaintenanceReport(formData) {
    return this.request('POST', '/employee/maintenance-reports', { body: formData });
  }

  updateEmployeeMaintenanceReport(recordId, payload) {
    return this.request('PATCH', `/employee/maintenance-reports/${recordId}`, { body: payload });
  }
}

export const api = new AcCleaningApi();
export { ApiError };
