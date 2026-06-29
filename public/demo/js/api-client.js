/**
 * 冷氣清洗派班 API 客戶端
 * 供前端 Web App 串接使用
 */
class AcCleaningApi {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = localStorage.getItem('ac_token') || '';
  }

  setToken(token) {
    this.token = token || '';
    if (token) {
      localStorage.setItem('ac_token', token);
    } else {
      localStorage.removeItem('ac_token');
    }
  }

  async request(method, path, body = null, params = null) {
    const url = new URL(`${this.baseUrl}${path}`, window.location.origin);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      });
    }

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await response.json().catch(() => ({
      status: 'error',
      message: '無法解析伺服器回應',
      data: null,
    }));

    if (!response.ok) {
      const error = new Error(json.message || '請求失敗');
      error.status = response.status;
      error.payload = json;
      throw error;
    }

    return json;
  }

  login(account, password) {
    return this.request('POST', '/login', { account, password }).then((result) => {
      this.setToken(result.data.token);
      return result;
    });
  }

  logout() {
    return this.request('POST', '/logout').finally(() => this.setToken(''));
  }

  me() {
    return this.request('GET', '/me');
  }

  getEmployeeSchedules() {
    return this.request('GET', '/employee/schedules');
  }

  submitReport(scheduleId, completedUnits, collectedAmount) {
    return this.request('POST', '/employee/reports', {
      schedule_id: scheduleId,
      completed_units: completedUnits,
      collected_amount: collectedAmount,
    });
  }

  createEmployee(account, password, name) {
    return this.request('POST', '/admin/users', { account, password, name });
  }

  createSchedule(payload) {
    return this.request('POST', '/admin/schedules', payload);
  }

  getSchedules(filters = {}) {
    return this.request('GET', '/admin/schedules', null, filters);
  }

  getSchedule(scheduleId) {
    return this.request('GET', `/admin/schedules/${scheduleId}`);
  }

  getReports(filters = {}) {
    return this.request('GET', '/admin/reports', null, filters);
  }

  async exportReports(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params.set(key, value);
      }
    });

    const response = await fetch(`${this.baseUrl}/admin/reports/export?${params}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('匯出失敗');
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `daily-reports-${Date.now()}.csv`;
    link.click();
    window.URL.revokeObjectURL(downloadUrl);
  }

  updateEmployee(userId, payload) {
    return this.request('PATCH', `/admin/users/${userId}`, payload);
  }

  updateSchedule(scheduleId, payload) {
    return this.request('PATCH', `/admin/schedules/${scheduleId}`, payload);
  }

  getEmployees() {
    return this.request('GET', '/admin/users');
  }
}

window.AcCleaningApi = AcCleaningApi;
