const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

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

  async request(method, path, { body, params, raw = false } = {}) {
    const url = new URL(`${this.baseUrl}${path}`, window.location.origin);

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

    if (!raw) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

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
      throw new ApiError(json.message || '請求失敗', response.status, json);
    }

    return json;
  }

  login(account, password) {
    return this.request('POST', '/login', { body: { account, password } }).then((result) => {
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
      body: {
        schedule_id: scheduleId,
        completed_units: completedUnits,
        collected_amount: collectedAmount,
      },
    });
  }

  getEmployees() {
    return this.request('GET', '/admin/users');
  }

  createEmployee(account, password, name) {
    return this.request('POST', '/admin/users', { body: { account, password, name } });
  }

  updateEmployee(userId, payload) {
    return this.request('PATCH', `/admin/users/${userId}`, { body: payload });
  }

  createSchedule(payload) {
    return this.request('POST', '/admin/schedules', { body: payload });
  }

  getSchedules(filters = {}) {
    return this.request('GET', '/admin/schedules', { params: filters });
  }

  getSchedule(scheduleId) {
    return this.request('GET', `/admin/schedules/${scheduleId}`);
  }

  updateSchedule(scheduleId, payload) {
    return this.request('PATCH', `/admin/schedules/${scheduleId}`, { body: payload });
  }

  getReports(filters = {}) {
    return this.request('GET', '/admin/reports', { params: filters });
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
}

export const api = new AcCleaningApi();
export { ApiError };
