const api = new AcCleaningApi('/api');
let currentUser = null;
let currentPage = 1;

const els = {
  statusBar: document.getElementById('statusBar'),
  loginSection: document.getElementById('loginSection'),
  employeeSection: document.getElementById('employeeSection'),
  adminSection: document.getElementById('adminSection'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  account: document.getElementById('account'),
  password: document.getElementById('password'),
  loadSchedulesBtn: document.getElementById('loadSchedulesBtn'),
  schedulesTable: document.getElementById('schedulesTable'),
  dateFrom: document.getElementById('dateFrom'),
  dateTo: document.getElementById('dateTo'),
  userId: document.getElementById('userId'),
  perPage: document.getElementById('perPage'),
  loadReportsBtn: document.getElementById('loadReportsBtn'),
  reportsSummary: document.getElementById('reportsSummary'),
  reportsTable: document.getElementById('reportsTable'),
  prevPageBtn: document.getElementById('prevPageBtn'),
  nextPageBtn: document.getElementById('nextPageBtn'),
  responseBox: document.getElementById('responseBox'),
};

function showResponse(data) {
  els.responseBox.textContent = JSON.stringify(data, null, 2);
}

function setStatus(message, isError = false) {
  els.statusBar.textContent = message;
  els.statusBar.classList.toggle('error', isError);
}

function renderUserState() {
  const loggedIn = Boolean(currentUser);

  els.logoutBtn.classList.toggle('hidden', !loggedIn);
  els.employeeSection.classList.toggle('hidden', !loggedIn || currentUser.role !== 'employee');
  els.adminSection.classList.toggle('hidden', !loggedIn || currentUser.role !== 'admin');

  if (loggedIn) {
    setStatus(`已登入：${currentUser.name}（${currentUser.role}）`);
  } else {
    setStatus('請先登入');
  }
}

async function handleError(error) {
  if (error.payload) {
    showResponse(error.payload);
  }

  setStatus(error.message, true);

  if (error.status === 401) {
    currentUser = null;
    api.setToken('');
    renderUserState();
  }
}

async function bootstrap() {
  if (!api.token) {
    renderUserState();
    return;
  }

  try {
    const result = await api.me();
    currentUser = result.data;
    renderUserState();
    showResponse(result);
  } catch (error) {
    await handleError(error);
    renderUserState();
  }
}

els.loginBtn.addEventListener('click', async () => {
  try {
    const result = await api.login(els.account.value.trim(), els.password.value);
    currentUser = result.data.user;
    currentPage = 1;
    renderUserState();
    showResponse(result);
  } catch (error) {
    await handleError(error);
  }
});

els.logoutBtn.addEventListener('click', async () => {
  try {
    const result = await api.logout();
    currentUser = null;
    renderUserState();
    showResponse(result);
  } catch (error) {
    await handleError(error);
  }
});

els.loadSchedulesBtn.addEventListener('click', async () => {
  try {
    const result = await api.getEmployeeSchedules();
    showResponse(result);

    const rows = result.data.schedules.map((schedule) => {
      const reported = schedule.daily_report ? '已回報' : '未回報';
      const action = schedule.daily_report
        ? '-'
        : `<button data-schedule-id="${schedule.id}" class="reportBtn">提交回報</button>`;

      return `
        <tr>
          <td>${schedule.work_date}</td>
          <td>${schedule.customer_address}</td>
          <td>${schedule.task_details}</td>
          <td>${reported}</td>
          <td>${action}</td>
        </tr>
      `;
    }).join('');

    els.schedulesTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>地址</th>
            <th>機型/金額</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5">目前沒有班表</td></tr>'}</tbody>
      </table>
    `;

    els.schedulesTable.querySelectorAll('.reportBtn').forEach((button) => {
      button.addEventListener('click', async () => {
        const scheduleId = Number(button.dataset.scheduleId);
        const completedUnits = Number(prompt('實際清洗台數', '1'));
        const collectedAmount = Number(prompt('實際收取金額', '11000'));

        if (!completedUnits && completedUnits !== 0) {
          return;
        }

        try {
          const reportResult = await api.submitReport(scheduleId, completedUnits, collectedAmount);
          showResponse(reportResult);
          els.loadSchedulesBtn.click();
        } catch (error) {
          await handleError(error);
        }
      });
    });
  } catch (error) {
    await handleError(error);
  }
});

async function loadReports(page = 1) {
  currentPage = page;

  const result = await api.getReports({
    date_from: els.dateFrom.value,
    date_to: els.dateTo.value,
    user_id: els.userId.value,
    page: currentPage,
    per_page: els.perPage.value,
  });

  showResponse(result);

  const summary = result.data.summary;
  const pagination = result.data.pagination;

  els.reportsSummary.innerHTML = `
    <span class="badge">總筆數 ${summary.total_reports}</span>
    <span class="badge">總台數 ${summary.total_completed_units}</span>
    <span class="badge">總金額 ${summary.total_collected_amount}</span>
    <span class="badge">第 ${pagination.current_page} / ${pagination.last_page} 頁</span>
  `;

  const rows = result.data.reports.map((report) => {
    const schedule = report.daily_schedule;
    const user = schedule?.user;

    return `
      <tr>
        <td>${schedule?.work_date ?? '-'}</td>
        <td>${user?.name ?? '-'} (${user?.account ?? '-'})</td>
        <td>${report.completed_units}</td>
        <td>${report.collected_amount}</td>
        <td>${schedule?.customer_address ?? '-'}</td>
      </tr>
    `;
  }).join('');

  els.reportsTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>工作日期</th>
          <th>員工</th>
          <th>台數</th>
          <th>金額</th>
          <th>地址</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5">查無資料</td></tr>'}</tbody>
    </table>
  `;

  els.prevPageBtn.disabled = pagination.current_page <= 1;
  els.nextPageBtn.disabled = pagination.current_page >= pagination.last_page;
}

els.loadReportsBtn.addEventListener('click', async () => {
  try {
    await loadReports(1);
  } catch (error) {
    await handleError(error);
  }
});

els.prevPageBtn.addEventListener('click', async () => {
  if (currentPage <= 1) {
    return;
  }

  try {
    await loadReports(currentPage - 1);
  } catch (error) {
    await handleError(error);
  }
});

els.nextPageBtn.addEventListener('click', async () => {
  try {
    await loadReports(currentPage + 1);
  } catch (error) {
    await handleError(error);
  }
});

bootstrap();
