import { store } from './store.js';
import { attachmentsService, reportsService, salesService, purchasesService, batchesService, customersService, suppliersService } from './services/data.service.js';
import * as XLSX from 'xlsx';

// Application State
let currentTab = 'dashboard';
let currentMonth = new Date().toISOString().slice(0,7);
let activePlotFilter = 'ALL';
let activePlotSection = 'ALL';
let plotSearchQuery = '';
let activeReportTab = 'pnl';
let dashboardMetrics = null;

// DOM Elements
const appContent = document.getElementById('appContent');
const pageTitle = document.getElementById('pageTitle');
const currentDateDisplay = document.getElementById('currentDateDisplay');
const roleSelector = document.getElementById('roleSelector');
const currentRoleText = document.getElementById('currentRoleText');
const roleNoticeBanner = document.getElementById('roleNoticeBanner');
const quickActionHeaderBtn = document.getElementById('quickActionHeaderBtn');
const mobileFabBtn = document.getElementById('mobileFabBtn');
const quickMenuPopover = document.getElementById('quickMenuPopover');
const mobileMoreBtn = document.getElementById('mobileMoreBtn');
const moreMenuPopover = document.getElementById('moreMenuPopover');
const commonModalOverlay = document.getElementById('commonModalOverlay');
const commonModalCard = document.getElementById('commonModalCard');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalCloseBtn = document.getElementById('modalCloseBtn');

// ─────────────────────────────────────────────────────────────────
// AUTH SCREEN
// ─────────────────────────────────────────────────────────────────
function showAuthScreen() {
  // ─── Clean Login Screen (no demo mode) ───────────────────────────
  const appContainer = document.querySelector('.app-container');
  const bottomBar = document.querySelector('.mobile-bottom-bar');
  if (appContainer) appContainer.style.display = 'none';
  if (bottomBar) bottomBar.style.display = 'none';

  let authDiv = document.getElementById('authScreen');
  if (!authDiv) {
    authDiv = document.createElement('div');
    authDiv.id = 'authScreen';
    document.body.appendChild(authDiv);
  }

  authDiv.innerHTML = `
    <div style="min-height:100vh; background:radial-gradient(ellipse 700px 500px at 20% 10%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), radial-gradient(circle 600px at 80% 80%, rgba(183, 243, 107, 0.12) 0%, transparent 60%), linear-gradient(180deg, #071D16 0%, #030F0B 100%); display:flex; align-items:center; justify-content:center; padding:20px; font-family:'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;">
      <div style="background:rgba(255, 255, 255, 0.96); backdrop-filter:blur(28px); border-radius:28px; padding:38px; width:100%; max-width:440px; box-shadow:0 30px 70px rgba(0,0,0,0.5), inset 0 1px 2px #fff; border:1px solid rgba(255, 255, 255, 0.9);">
        <div style="text-align:center; margin-bottom:28px;">
          <div style="width:54px; height:54px; background:linear-gradient(135deg, #10B981 0%, #059669 100%); border-radius:16px; margin:0 auto 12px; display:flex; align-items:center; justify-content:center; font-size:1.8rem; box-shadow:0 4px 18px rgba(16, 185, 129, 0.45); border:1px solid rgba(183, 243, 107, 0.4);">🌾</div>
          <h1 style="font-size:1.65rem; font-weight:800; color:#0B3024; margin:0; font-family:'Outfit', sans-serif;">Bale Manager</h1>
          <p style="color:#64748B; font-size:0.88rem; margin:4px 0 0; font-weight:600;">Sri Balaji Agro Operations • BMS v1.0</p>
        </div>

        <div style="background:rgba(11, 48, 36, 0.05); border-radius:12px; padding:12px 16px; margin-bottom:24px; font-size:0.83rem; color:#44594F; display:flex; align-items:flex-start; gap:8px; border:1px solid rgba(11, 48, 36, 0.08);">
          <span style="font-size:1rem;">🔐</span>
          <span>Sign in with your assigned credentials. Contact the Owner to get your account created.</span>
        </div>

        <div id="authError" style="display:none; background:#FEE2E2; color:#B91C1C; border:1px solid #FCA5A5; border-radius:10px; padding:10px 12px; margin-bottom:14px; font-size:0.85rem; font-weight:600;"></div>

        <!-- Form: Sign In -->
        <form id="loginForm">
          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:0.82rem; font-weight:700; color:#0B3024; margin-bottom:5px;">Email Address</label>
            <input type="email" id="loginEmail" required autocomplete="email"
              style="width:100%; padding:11px 14px; border:1.5px solid rgba(11, 48, 36, 0.15); border-radius:12px; font-size:0.92rem; box-sizing:border-box; outline:none; transition:all 0.2s;"
              placeholder="owner@example.com" />
          </div>
          <div style="margin-bottom:24px;">
            <label style="display:block; font-size:0.82rem; font-weight:700; color:#0B3024; margin-bottom:5px;">Password</label>
            <input type="password" id="loginPassword" required autocomplete="current-password"
              style="width:100%; padding:11px 14px; border:1.5px solid rgba(11, 48, 36, 0.15); border-radius:12px; font-size:0.92rem; box-sizing:border-box; outline:none; transition:all 0.2s;"
              placeholder="••••••••" />
          </div>
          <button type="submit" id="loginBtn"
            style="width:100%; padding:13px; background:linear-gradient(135deg, #10B981 0%, #087F5B 100%); color:#fff; border:1px solid rgba(183, 243, 107, 0.4); border-radius:9999px; font-size:0.97rem; font-weight:700; cursor:pointer; box-shadow:0 4px 18px rgba(16, 185, 129, 0.42);">
            Sign In →
          </button>
        </form>

        <div style="margin-top:20px; display:flex; align-items:center; justify-content:center; gap:6px; font-size:0.78rem; color:#94a3b8;">
          <span style="width:8px;height:8px;background:#22c55e;border-radius:50%;display:inline-block;"></span>
          Connected to Supabase
        </div>
      </div>
    </div>
  `;
  authDiv.style.display = 'block';

  // Login handler
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errDiv = document.getElementById('authError');
    btn.textContent = 'Signing in…';
    btn.disabled = true;
    errDiv.style.display = 'none';
    try {
      showLoading('Loading your data…');
      await store.signIn(
        document.getElementById('loginEmail').value.trim(),
        document.getElementById('loginPassword').value
      );
      try {
        dashboardMetrics = await store.getDashboardMetricsAsync(currentMonth);
      } catch(e) {}
      hideLoading();
      hideAuthScreen();
      ensureEventsBound();
      updateRoleUI();
      render();
    } catch(err) {
      hideLoading();
      errDiv.textContent = err.message || 'Invalid email or password. Please try again.';
      errDiv.style.display = 'block';
      btn.textContent = 'Sign In →';
      btn.disabled = false;
    }
  });
}

function hideAuthScreen() {
  const authDiv = document.getElementById('authScreen');
  if (authDiv) authDiv.style.display = 'none';
  const appContainer = document.querySelector('.app-container');
  const bottomBar = document.querySelector('.mobile-bottom-bar');
  if (appContainer) appContainer.style.display = 'flex';
  if (bottomBar) bottomBar.style.display = '';
}

// ─────────────────────────────────────────────────────────────────
// LOADING OVERLAY
// ─────────────────────────────────────────────────────────────────
function showLoading(msg = 'Loading…') {
  let el = document.getElementById('globalLoader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalLoader';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="spin" style="width:40px;height:40px;border:4px solid #e2e8f0;border-top-color:var(--primary-navy);border-radius:50%;animation:spin .8s linear infinite;"></div><div style="font-weight:600;color:var(--primary-navy);">${msg}</div>`;
  el.style.display = 'flex';
}

function hideLoading() {
  const el = document.getElementById('globalLoader');
  if (el) el.style.display = 'none';
}

let eventsBound = false;
function ensureEventsBound() {
  if (eventsBound) return;
  eventsBound = true;
  bindEvents();
}

// ─────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────
async function init() {
  showLoading('Initializing…');

  // Listen for auth changes
  store.subscribe(() => {
    if (store.isAuthenticated()) {
      hideAuthScreen();
      ensureEventsBound();
      updateRoleUI();
      render();
    } else {
      showAuthScreen();
    }
  });

  const session = await store.initAuth();

  if (!session) {
    hideLoading();
    showAuthScreen();
    return;
  }

  // Signed in — load data
  showLoading('Loading data…');
  await store.loadAll();

  // Refresh dashboard metrics from DB
  try {
    dashboardMetrics = await store.getDashboardMetricsAsync(currentMonth);
  } catch(e) { /* use cached */ }

  hideLoading();
  hideAuthScreen();
  ensureEventsBound();
  updateRoleUI();
  render();

  // Live ticker for 1-minute fermentation countdown and auto-ready transitions
  setInterval(() => {
    if (!store.isAuthenticated()) return;
    const changed = store.checkFermentationStatus();
    if (changed) {
      dashboardMetrics = null;
      showToast('🌾 Fermentation completed! Bales are now READY for sale.');
      if (currentTab === 'plots') renderPlots();
      else if (currentTab === 'dashboard') renderDashboard();
      else if (currentTab === 'production') renderProduction();
    } else {
      if (currentTab === 'plots') {
        const hasMinuteCountdown = store.data.plots.some(p => p.status === 'Fermenting' && p.fermUnit === 'minute');
        if (hasMinuteCountdown) {
          renderPlots();
        }
      } else if (currentTab === 'dashboard') {
        const countdownEls = document.querySelectorAll('.dash-batch-countdown');
        countdownEls.forEach(el => {
          const endTs = Number(el.getAttribute('data-end'));
          if (endTs) {
            const secs = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
            el.textContent = `⏳ ${secs}s left`;
          }
        });
      }
    }
  }, 1000);
}

function bindEvents() {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.getAttribute('data-tab')));
  });

  document.querySelectorAll('.mobile-bottom-bar .mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => { const t = btn.getAttribute('data-tab'); if (t) navigateTo(t); });
  });

  // Role display only (actual role comes from DB — selector is visual only)
  if (roleSelector) {
    roleSelector.value = store.getRole();
    roleSelector.addEventListener('change', (e) => {
      // Only allow owner to see this — just for display demo
      store.data.settings.activeRole = e.target.value;
      updateRoleUI();
      render();
    });
  }

  const toggleQuickMenu = (e) => {
    e.stopPropagation();
    moreMenuPopover.classList.remove('open');
    quickMenuPopover.classList.toggle('open');
  };
  quickActionHeaderBtn.addEventListener('click', toggleQuickMenu);
  if (mobileFabBtn) mobileFabBtn.addEventListener('click', toggleQuickMenu);

  if (mobileMoreBtn) {
    mobileMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      quickMenuPopover.classList.remove('open');
      moreMenuPopover.classList.toggle('open');
    });
  }

  quickMenuPopover.querySelectorAll('.quick-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      quickMenuPopover.classList.remove('open');
      handleQuickAction(item.getAttribute('data-action'));
    });
  });

  moreMenuPopover.querySelectorAll('.quick-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      moreMenuPopover.classList.remove('open');
      const t = item.getAttribute('data-tab');
      if (t) navigateTo(t);
    });
  });

  document.addEventListener('click', (e) => {
    if (!quickMenuPopover.contains(e.target) && e.target !== quickActionHeaderBtn && e.target !== mobileFabBtn)
      quickMenuPopover.classList.remove('open');
    if (mobileMoreBtn && !moreMenuPopover.contains(e.target) && e.target !== mobileMoreBtn)
      moreMenuPopover.classList.remove('open');
  });

  modalCloseBtn.addEventListener('click', closeModal);
  commonModalOverlay.addEventListener('click', (e) => { if (e.target === commonModalOverlay) closeModal(); });
}

function updateRoleUI() {
  const role = store.getRole();
  if (roleSelector) roleSelector.value = role;
  if (currentRoleText) currentRoleText.textContent = role;
  if (currentDateDisplay) currentDateDisplay.textContent = store.formatDate(store.getCurrentDate());

  const profileName = store.currentProfile?.full_name || role;

  if (role === 'Staff') {
    roleNoticeBanner.classList.remove('hidden');
    document.querySelectorAll('.finance-required').forEach(el => el.classList.add('hidden'));
    if (['purchases','sales','expenses','reports'].includes(currentTab)) currentTab = 'dashboard';
  } else {
    roleNoticeBanner.classList.add('hidden');
    document.querySelectorAll('.finance-required').forEach(el => el.classList.remove('hidden'));
  }
}

function navigateTo(tab) {
  if (!tab) return;
  currentTab = tab;
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.mobile-bottom-bar .mobile-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  render();
}

async function render() {
  switch (currentTab) {
    case 'dashboard':
      pageTitle.textContent = store.getRole() === 'Staff' ? 'Staff Yard Dashboard' : 'Owner Dashboard';
      await renderDashboard();
      break;
    case 'plots':
      pageTitle.textContent = 'Plots and Fermentation';
      renderPlots();
      break;
    case 'production':
      pageTitle.textContent = 'Production Batches';
      renderProduction();
      break;
    case 'purchases':
      pageTitle.textContent = 'Purchases and Supplier Balances';
      renderPurchases();
      break;
    case 'sales':
      pageTitle.textContent = 'Sales, Invoices & Customer Credit';
      renderSales();
      break;
    case 'expenses':
      pageTitle.textContent = 'Business Expenses';
      renderExpenses();
      break;
    case 'reports':
      pageTitle.textContent = 'Financial & Stock Reports';
      renderReports();
      break;
    case 'settings':
      pageTitle.textContent = 'System & Yard Settings';
      renderSettings();
      break;
    default: await renderDashboard();
  }
}

// ─────────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const colors = { success: '#16a34a', error: '#b91c1c', info: '#1d4ed8', warning: '#d97706' };
  toast.style.cssText = `background:${colors[type]||colors.success};color:#fff;padding:12px 18px;border-radius:8px;font-size:0.88rem;font-weight:600;max-width:300px;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:slideIn .3s ease;`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────
async function renderDashboard() {
  const isFinance = store.canViewFinancials();
  let m;
  try {
    m = await store.getDashboardMetricsAsync(currentMonth);
    dashboardMetrics = m;
  } catch(e) {
    m = store.getDashboardMetrics(currentMonth);
  }

  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ value: d.toISOString().slice(0,7), label: d.toLocaleString('default',{month:'long',year:'numeric'}) });
  }

  const stageRaw = Number(m.rawMaterialBalesEquiv) || 0;
  const stageFerm = Number(m.fermentingBales) || 0;
  const stageReady = Number(m.readyBales) || 0;
  const stageSold = Number(m.monthSoldBales) || 0;
  const stageTotal = stageRaw + stageFerm + stageReady + stageSold;

  const rawW = stageTotal > 0 ? Math.round((stageRaw / stageTotal) * 100) : 0;
  const fermW = stageTotal > 0 ? Math.round((stageFerm / stageTotal) * 100) : 0;
  const readyW = stageTotal > 0 ? Math.round((stageReady / stageTotal) * 100) : 0;
  const soldW = stageTotal > 0 ? Math.max(0, 100 - rawW - fermW - readyW) : 0;

  appContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px;">
      <div style="font-size:0.9rem;color:var(--text-sub);">
        Overview for <strong>${m.role}</strong> • All bale operations & real-time accounts
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        ${isFinance ? `
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:0.85rem;font-weight:700;color:#DDFCE8;">Month:</label>
            <select id="dashMonthSelect" class="form-select" style="padding:7px 14px;font-weight:600;background:rgba(11,48,36,0.85);color:#fff;border:1px solid rgba(255,255,255,0.18);border-radius:9999px;backdrop-filter:blur(10px);outline:none;">
              ${months.map(mo => `<option value="${mo.value}" ${currentMonth===mo.value?'selected':''}>${mo.label}</option>`).join('')}
            </select>
          </div>
        ` : ''}
        <button class="btn-secondary" style="padding:7px 16px;font-size:0.84rem;font-weight:600;background:rgba(255,255,255,0.1);color:#DDFCE8;border:1px solid rgba(255,255,255,0.2);border-radius:9999px;backdrop-filter:blur(8px);" onclick="window.refreshDashboard()">🔄 Refresh</button>
        <button class="btn-danger" style="padding:7px 16px;font-size:0.84rem;font-weight:600;background:rgba(217,83,79,0.18);color:#FCA5A5;border:1px solid rgba(217,83,79,0.38);border-radius:9999px;backdrop-filter:blur(8px);" onclick="window.signOut()">Sign Out</button>
      </div>
    </div>

    <div class="kpi-cards-grid">
      <div class="kpi-card ready" onclick="window.appNav('plots',{status:'Ready'})">
        <div class="kpi-label">Ready for Sale</div>
        <div class="kpi-value text-green">${store.formatNumber(m.readyBales)} <span style="font-size:1rem;font-weight:500;">bales</span></div>
        <div class="kpi-subtext">🌾 Fully fermented & in plots</div>
      </div>
      <div class="kpi-card fermenting" onclick="window.appNav('plots',{status:'Fermenting'})">
        <div class="kpi-label">Fermenting</div>
        <div class="kpi-value text-amber">${store.formatNumber(m.fermentingBales)} <span style="font-size:1rem;font-weight:500;">bales</span></div>
        <div class="kpi-subtext">⏳ Counting towards ${store.data.settings.fermentationDays} days</div>
      </div>
      ${isFinance ? `
        <div class="kpi-card customer-due" onclick="window.appNav('sales')">
          <div class="kpi-label">Customers Owe You</div>
          <div class="kpi-value text-red">${store.formatINR(m.customerDues)}</div>
          <div class="kpi-subtext">💼 Total receivables balance</div>
        </div>
        <div class="kpi-card supplier-due" onclick="window.appNav('purchases')">
          <div class="kpi-label">You Owe Suppliers</div>
          <div class="kpi-value text-blue">${store.formatINR(m.supplierDues)}</div>
          <div class="kpi-subtext">🛒 Total payables balance</div>
        </div>
      ` : `
        <div class="kpi-card" style="opacity:0.6;cursor:default;">
          <div class="kpi-label">Financial Balances</div>
          <div class="kpi-value">Protected</div>
          <div class="kpi-subtext">🔒 Staff role permission</div>
        </div>
        <div class="kpi-card" style="opacity:0.6;cursor:default;">
          <div class="kpi-label">Profitability</div>
          <div class="kpi-value">Protected</div>
          <div class="kpi-subtext">🔒 Staff role permission</div>
        </div>
      `}
    </div>

    ${isFinance ? `
      <div class="month-finance-row">
        <div class="finance-card">
          <div class="kpi-label">Sales This Month</div>
          <div class="kpi-value text-blue">${store.formatINR(m.monthSales)}</div>
          <div class="kpi-subtext">Invoiced sales revenue</div>
        </div>
        <div class="finance-card">
          <div class="kpi-label">Expenses This Month</div>
          <div class="kpi-value text-red">${store.formatINR(m.monthExpenses)}</div>
          <div class="kpi-subtext">Factory, labour, diesel & operations</div>
        </div>
        <div class="finance-card ${m.netProfit >= 0 ? 'profit-positive' : 'profit-loss'}">
          <div class="kpi-label">Profit This Month</div>
          <div class="kpi-value">${store.formatINR(m.netProfit)}</div>
          <div class="kpi-subtext">${m.netProfit >= 0 ? '▲ Net profit after COGS & expenses' : '▼ Net operating loss'}</div>
        </div>
      </div>
    ` : ''}

    <div class="stage-card">
      <div class="stage-header">
        <div class="stage-title">Stock by Stage (Bales & Raw Material)</div>
        <div style="font-size:0.84rem;font-weight:600;color:var(--text-sub);">Raw Stock: ${store.formatNumber(m.rawMaterialKg)} kg (~${store.formatNumber(stageRaw)} bales)</div>
      </div>
      <div class="stacked-bar-container">
        ${stageRaw > 0 ? `<div class="stacked-segment segment-raw" style="width:${Math.max(8, rawW)}%;" title="Raw Material">Raw (${store.formatNumber(stageRaw)})</div>` : ''}
        ${stageFerm > 0 ? `<div class="stacked-segment segment-fermenting" style="width:${Math.max(8, fermW)}%;" title="Fermenting">Fermenting (${store.formatNumber(stageFerm)})</div>` : ''}
        ${stageReady > 0 ? `<div class="stacked-segment segment-ready" style="width:${Math.max(8, readyW)}%;" title="Ready">Ready (${store.formatNumber(stageReady)})</div>` : ''}
        ${stageSold > 0 ? `<div class="stacked-segment segment-sold" style="width:${Math.max(8, soldW)}%;" title="Sold">Sold (${store.formatNumber(stageSold)})</div>` : ''}
        ${stageTotal === 0 ? '<div style="padding:10px;text-align:center;color:var(--text-muted);width:100%;font-size:0.85rem;">No bales or raw materials recorded yet</div>' : ''}
      </div>
      <div class="stage-legend">
        <div class="legend-item"><span class="legend-dot" style="background:#64748b;"></span> Raw material (${store.formatNumber(m.rawMaterialKg)} kg)</div>
        <div class="legend-item"><span class="legend-dot" style="background:#d97706;"></span> Fermenting (${store.formatNumber(stageFerm)} bales)</div>
        <div class="legend-item"><span class="legend-dot" style="background:#16a34a;"></span> Ready for sale (${store.formatNumber(stageReady)} bales)</div>
        <div class="legend-item"><span class="legend-dot" style="background:#2563eb;"></span> Sold in month (${store.formatNumber(stageSold)} bales)</div>
      </div>
    </div>

    <div class="dash-two-columns">
      <div class="section-box">
        <div class="section-box-header">
          <div class="box-title">⏳ Batches Becoming Ready Soon</div>
          <button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem;" onclick="window.appNav('plots')">View All Plots</button>
        </div>
        <div class="data-table-wrapper">
          <table class="app-table">
            <thead><tr><th>Batch</th><th>Plot</th><th>Bales</th><th>Ready In</th></tr></thead>
            <tbody>
              ${m.batchesReadySoon.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No active fermenting batches</td></tr>' : ''}
              ${m.batchesReadySoon.map(b => `
                <tr style="cursor:pointer;" onclick="window.openPlotDetail('${b.plot}')">
                  <td><strong style="color:var(--brand-blue);">${b.batch}</strong></td>
                  <td><span class="badge badge-fermenting">${b.plot}</span></td>
                  <td><strong>${b.bales}</strong></td>
                  <td>
                    ${b.isMinuteMode ? `
                      <div style="display:flex;align-items:center;gap:6px;">
                        <span class="badge badge-fermenting dash-batch-countdown" data-end="${b.fermEndTimestamp}">
                          ⏳ ${Math.max(0, Math.ceil((b.fermEndTimestamp - Date.now()) / 1000))}s left
                        </span>
                        <small style="color:var(--text-muted);font-size:0.75rem;">(⚡ 1-min test mode)</small>
                      </div>
                    ` : `
                      <div style="display:flex;align-items:center;gap:8px;">
                        <span class="badge badge-fermenting">${b.daysLeft} days</span>
                        <small style="color:var(--text-muted);font-size:0.75rem;">(${store.formatDate(b.readyDate)})</small>
                      </div>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="section-box">
        <div class="section-box-header">
          <div class="box-title">💳 Upcoming Payments</div>
          ${isFinance ? `<button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem;" onclick="window.appNav('reports')">View Balances</button>` : ''}
        </div>
        ${isFinance ? `
          <div class="data-table-wrapper">
            <table class="app-table">
              <thead><tr><th>Who</th><th>Type</th><th>Amount</th><th>Due Date</th></tr></thead>
              <tbody>
                ${m.upcomingPayments.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No pending dues</td></tr>' : ''}
                ${m.upcomingPayments.slice(0,6).map(p => `
                  <tr>
                    <td><strong>${p.who}</strong></td>
                    <td><span class="badge ${p.type==='Receive'?'badge-receive':'badge-pay'}">${p.type==='Receive'?'↓ Receive':'↑ Pay'}</span></td>
                    <td><strong class="${p.type==='Receive'?'text-green':'text-red'}">${store.formatINR(p.amount)}</strong></td>
                    <td>
                      <div style="display:flex;align-items:center;gap:6px;">
                        <span>${store.formatDate(p.dueDate)}</span>
                        ${p.isOverdue ? '<span class="badge badge-overdue">OVERDUE</span>' : ''}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div style="padding:28px;text-align:center;color:var(--text-muted);">Payment details restricted to Owner and Accountant.</div>'}
      </div>
    </div>
  `;

  const monthSelect = document.getElementById('dashMonthSelect');
  if (monthSelect) {
    monthSelect.addEventListener('change', async (e) => {
      currentMonth = e.target.value;
      showLoading('Refreshing…');
      try {
        dashboardMetrics = await store.getDashboardMetricsAsync(currentMonth);
      } catch(err) {}
      hideLoading();
      await renderDashboard();
    });
  }
}

window.refreshDashboard = async function() {
  showLoading('Refreshing data…');
  await store.loadAll();
  dashboardMetrics = await store.getDashboardMetricsAsync(currentMonth);
  hideLoading();
  await renderDashboard();
  showToast('Dashboard refreshed');
};

window.signOut = async function() {
  if (!confirm('Sign out?')) return;
  await store.signOut();
};

// ─────────────────────────────────────────────────────────────────
// PLOTS AND FERMENTATION
// ─────────────────────────────────────────────────────────────────
function renderPlots() {
  const plots = store.data.plots;
  const today = store.getCurrentDate();
  const maxFermDays = store.data.settings.fermentationDays || 30;

  const filteredPlots = plots.filter(plot => {
    if (activePlotSection !== 'ALL' && plot.section !== activePlotSection) return false;
    if (activePlotFilter !== 'ALL' && plot.status !== activePlotFilter) return false;
    if (plotSearchQuery) {
      const q = plotSearchQuery.toLowerCase();
      if (!(plot.plot_name||'').toLowerCase().includes(q) && !(plot.batchNumber||'').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPlots = plots.length;
  const readyPlots = plots.filter(p => p.status === 'Ready').length;
  const fermentingPlots = plots.filter(p => p.status === 'Fermenting').length;
  const emptyPlots = plots.filter(p => p.status === 'Empty').length;
  const sections = [...new Set(plots.map(p => p.section))].sort();

  appContent.innerHTML = `
    <div class="plots-controls-bar">
      <div class="filters-group">
        <span style="font-size:0.85rem;font-weight:700;color:var(--text-sub);margin-right:4px;">Section:</span>
        <button class="filter-chip ${activePlotSection==='ALL'?'active':''}" onclick="window.setPlotSection('ALL')">All</button>
        ${sections.map(s => `<button class="filter-chip ${activePlotSection===s?'active':''}" onclick="window.setPlotSection('${s}')">Section ${s}</button>`).join('')}
      </div>
      <div class="filters-group">
        <span style="font-size:0.85rem;font-weight:700;color:var(--text-sub);margin-right:4px;">Status:</span>
        <button class="filter-chip ${activePlotFilter==='ALL'?'active':''}" onclick="window.setPlotStatus('ALL')">All (${totalPlots})</button>
        <button class="filter-chip ${activePlotFilter==='Fermenting'?'active':''}" onclick="window.setPlotStatus('Fermenting')">⏳ Fermenting (${fermentingPlots})</button>
        <button class="filter-chip ${activePlotFilter==='Ready'?'active':''}" onclick="window.setPlotStatus('Ready')">🌾 Ready (${readyPlots})</button>
        <button class="filter-chip ${activePlotFilter==='Empty'?'active':''}" onclick="window.setPlotStatus('Empty')">⚪ Empty (${emptyPlots})</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="text" id="plotSearchInput" class="search-input" placeholder="Search plot (e.g. A12) or batch…" value="${plotSearchQuery}" />
        ${store.canManageUsers() ? `<button class="btn-navy" onclick="window.openAddPlotModal()">+ Add Plot</button>` : ''}
      </div>
    </div>

    ${filteredPlots.length === 0 ? `<div style="text-align:center;padding:60px;color:var(--text-muted);">No plots found matching your filters.</div>` : ''}

    <div class="plots-grid">
      ${filteredPlots.map(plot => {
        let statusClass = 'empty', statusLabel = 'Empty', progressPct = 0;
        if (plot.status === 'Ready') { statusClass = 'ready'; statusLabel = 'Ready'; }
        else if (plot.status === 'Fermenting') {
          statusClass = 'fermenting';
          if (plot.fermUnit === 'minute' && plot.fermEndTimestamp) {
            const secsLeft = Math.max(0, Math.ceil((plot.fermEndTimestamp - Date.now()) / 1000));
            statusLabel = `⏳ ${secsLeft}s left (1-min mode)`;
            const totalSecs = (plot.fermDuration || 1) * 60;
            progressPct = Math.min(100, Math.round(((totalSecs - secsLeft) / totalSecs) * 100));
          } else {
            const daysPassed = Math.max(1, store.getDaysDifference(plot.fermStart, today));
            statusLabel = `Day ${Math.min(maxFermDays, daysPassed)} of ${maxFermDays}`;
            progressPct = Math.min(100, Math.round((daysPassed / maxFermDays) * 100));
          }
        }
        return `
          <div class="plot-tile ${statusClass}" onclick="window.openPlotDetail('${plot.plot_name||plot.id}')">
            <div>
              <div class="plot-id">${plot.plot_name || plot.id}</div>
              <div class="plot-bales">${plot.bales > 0 ? `${store.formatNumber(plot.bales)} bales` : '<span style="color:#64748B;font-size:0.8rem;font-weight:500;">0 bales</span>'}</div>
            </div>
            <div>
              <span class="plot-status-label">${statusLabel}</span>
              ${plot.status === 'Fermenting' ? `
                <div class="plot-progress-mini">
                  <div class="plot-progress-mini-bar" style="width:${progressPct}%;"></div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="text-align:center;color:var(--text-muted);font-size:0.85rem;margin-top:20px;">
      💡 Tap any plot tile to inspect batch details, see fermentation countdown, update stock, or initiate a sale.
    </div>
  `;

  const searchInput = document.getElementById('plotSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      plotSearchQuery = e.target.value;
      renderPlots();
      const newEl = document.getElementById('plotSearchInput');
      if (newEl) { newEl.focus(); newEl.setSelectionRange(newEl.value.length, newEl.value.length); }
    });
  }
}

window.openPlotDetail = function(plotName) {
  const plot = store.data.plots.find(p => p.plot_name === plotName || p.id === plotName);
  if (!plot) return;

  const today = store.getCurrentDate();
  const maxFermDays = store.data.settings.fermentationDays || 30;
  const isFinance = store.canViewFinancials();
  let daysPassed = 0, progressPct = 0;

  if (plot.fermStart) {
    daysPassed = Math.max(0, store.getDaysDifference(plot.fermStart, today));
    progressPct = Math.min(100, Math.round((daysPassed / maxFermDays) * 100));
  }
  const approxValue = isFinance ? (plot.bales || 0) * (plot.costPerBale || 0) : 0;

  modalTitle.textContent = `Plot ${plot.plot_name || plot.id} Detail`;
  modalBody.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <span class="badge ${plot.status==='Ready'?'badge-ready':plot.status==='Fermenting'?'badge-fermenting':'badge-empty'}" style="font-size:0.9rem;padding:4px 12px;">${plot.status}</span>
      <div style="font-size:0.85rem;color:var(--text-muted);">Section ${plot.section} • Plot ${plot.plot_name}</div>
    </div>

    <div style="background:var(--grey-bg);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">
        <div>
          <span style="color:var(--text-muted);font-size:0.8rem;display:block;">Batch Assigned:</span>
          <strong>${plot.batchNumber || 'None (Empty Plot)'}</strong>
        </div>
        <div>
          <span style="color:var(--text-muted);font-size:0.8rem;display:block;">Bales Stored:</span>
          <strong style="font-size:1.1rem;color:var(--primary-navy);">${store.formatNumber(plot.bales)} bales</strong>
        </div>
        <div>
          <span style="color:var(--text-muted);font-size:0.8rem;display:block;">Fermentation Start:</span>
          <strong>${store.formatDate(plot.fermStart)}</strong>
        </div>
        <div>
          <span style="color:var(--text-muted);font-size:0.8rem;display:block;">Ready Date:</span>
          <strong>${store.formatDate(plot.readyDate)}</strong>
        </div>
      </div>
    </div>

    ${plot.status === 'Fermenting' ? `
      <div style="border:1px solid var(--amber-border);background:var(--amber-bg);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:var(--amber-text);">
            ${plot.fermUnit === 'minute' ? '⚡ 1-Minute Testing Countdown' : `Fermentation Progress: Day ${daysPassed} of ${maxFermDays}`}
          </strong>
          <span style="font-weight:700;color:var(--amber-text);">
            ${plot.fermUnit === 'minute' && plot.fermEndTimestamp ? `${Math.max(0, Math.ceil((plot.fermEndTimestamp - Date.now())/1000))}s remaining` : `${progressPct}%`}
          </span>
        </div>
        <div style="height:10px;background:#fff;border-radius:5px;overflow:hidden;">
          <div style="height:100%;width:${progressPct}%;background:var(--amber-accent);transition:width 0.5s linear;"></div>
        </div>
        <div style="margin-top:8px;font-size:0.84rem;color:var(--amber-text);">
          ${plot.fermUnit === 'minute' ? '⏳ 1-Minute test mode active. Auto-completes when countdown reaches 0s, or click "Fast Ferment" below to mark ready immediately.' : `Ready for sale on: <strong>${store.formatDate(plot.readyDate)}</strong> (${Math.max(0, maxFermDays - daysPassed)} days left)`}
        </div>
      </div>
    ` : ''}

    ${isFinance && plot.bales > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border:1px solid var(--green-border);padding:14px 16px;border-radius:var(--radius-md);margin-bottom:20px;">
        <div>
          <span style="font-size:0.8rem;color:var(--green-text);display:block;">Approximate Stock Value:</span>
          <small style="color:var(--text-muted);">(${plot.bales} bales × ₹${Math.round(plot.costPerBale)}/bale cost)</small>
        </div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--green-text);">${store.formatINR(approxValue)}</div>
      </div>
    ` : ''}

    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn-navy" style="flex:1;" onclick="window.openMoveStockModal('${plot.plot_name||plot.id}')">📦 Move / Update Stock</button>
      ${plot.status === 'Fermenting' ? `
        <button class="btn-primary" style="flex:1;background:var(--amber-accent);color:#fff;" onclick="window.fastFermentPlot('${plot.plot_name||plot.id}')">⚡ Fast Ferment (Mark Ready Now)</button>
      ` : ''}
      ${plot.status === 'Ready' && isFinance ? `
        <button class="btn-primary" style="flex:1;" onclick="window.startSaleFromPlot('${plot.plot_name||plot.id}')">💼 Sell From This Plot</button>
      ` : ''}
    </div>
  `;
  openModal();
};

window.openMoveStockModal = function(plotName) {
  const plot = store.data.plots.find(p => p.plot_name === plotName || p.id === plotName);
  if (!plot) return;

  modalTitle.textContent = `Update Stock - Plot ${plot.plot_name || plot.id}`;
  modalBody.innerHTML = `
    <form id="moveStockForm">
      <div class="form-group mb-12">
        <label class="form-label">Updated Bale Count</label>
        <input type="number" id="updateBalesInput" class="form-input" value="${plot.bales}" min="0" required />
      </div>
      <div class="form-group mb-16">
        <label class="form-label">Plot Status</label>
        <select id="updateStatusSelect" class="form-select">
          <option value="Ready" ${plot.status==='Ready'?'selected':''}>Ready for Sale</option>
          <option value="Fermenting" ${plot.status==='Fermenting'?'selected':''}>Fermenting</option>
          <option value="Empty" ${plot.status==='Empty'?'selected':''}>Empty</option>
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveStockBtn">Save Changes</button>
      </div>
    </form>
  `;

  document.getElementById('moveStockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveStockBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      await store.updatePlotStock(plot.id || plot.plot_name, document.getElementById('updateBalesInput').value, document.getElementById('updateStatusSelect').value);
      closeModal();
      renderPlots();
      showToast('Stock updated successfully');
    } catch(err) {
      showToast('Error: ' + err.message, 'error');
      btn.textContent = 'Save Changes'; btn.disabled = false;
    }
  });
};

window.startSaleFromPlot = function(plotName) {
  closeModal();
  navigateTo('sales');
  setTimeout(() => window.openNewInvoiceModal({ preselectedPlotName: plotName }), 100);
};

window.fastFermentPlot = async function(plotName) {
  showLoading('Marking plot ready…');
  try {
    const ok = await store.fastFermentPlot(plotName);
    hideLoading();
    if (ok) {
      dashboardMetrics = null;
      closeModal();
      showToast(`⚡ Plot ${plotName} marked READY for sale!`);
      if (currentTab === 'plots') renderPlots();
      else if (currentTab === 'dashboard') await renderDashboard();
      else if (currentTab === 'production') renderProduction();
    }
  } catch(err) {
    hideLoading();
    showToast('Error marking ready: ' + (err.message || err), 'error');
  }
};

// ─────────────────────────────────────────────────────────────────
// PURCHASES
// ─────────────────────────────────────────────────────────────────
function renderPurchases() {
  const isFinance = store.canViewFinancials();
  if (!isFinance) { appContent.innerHTML = `<div style="padding:40px;text-align:center;">Staff cannot access purchase prices and supplier financials.</div>`; return; }

  const purchases = store.data.purchases;
  const suppliers = store.data.suppliers;

  appContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
      <div style="font-size:0.9rem;color:var(--text-sub);">True landed cost calculation, bill attachments, and supplier payables ledger.</div>
      <button class="btn-primary" onclick="window.openNewPurchaseModal()">＋ New Purchase Bill</button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:24px;">
      ${suppliers.map(sup => `
        <div class="finance-card" style="cursor:pointer;" onclick="window.openSupplierDetail('${sup.id}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <div style="font-weight:700;font-size:1.05rem;color:var(--primary-navy);">${sup.name}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${sup.city||''} • ${sup.phone||''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="badge ${sup.balancePending > 0 ? 'badge-pay' : 'badge-ready'}">${sup.balancePending > 0 ? 'Pending' : 'Cleared'}</span>
              ${store.canDelete() ? `
                <button class="btn-danger" style="padding:3px 7px;font-size:0.75rem;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;" title="Delete Supplier" onclick="event.stopPropagation(); window.confirmDeleteSupplier('${sup.id}', '${(sup.name||'').replace(/'/g, "\\'")}')">
                  🗑
                </button>
              ` : ''}
            </div>
          </div>
          <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-light);display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;">
            <div>
              <span style="color:var(--text-muted);display:block;font-size:0.75rem;">Total Purchased:</span>
              <strong>${store.formatINR(sup.totalPurchased)}</strong>
            </div>
            <div>
              <span style="color:var(--text-muted);display:block;font-size:0.75rem;">Balance Pending:</span>
              <strong style="color:var(--red-accent);font-size:1rem;">${store.formatINR(sup.balancePending)}</strong>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="section-box">
      <div class="section-box-header">
        <div class="box-title">Recent Raw Material Purchases</div>
      </div>
      <div class="data-table-wrapper">
        <table class="app-table">
          <thead>
            <tr>
              <th>Date</th><th>Bill / Inv #</th><th>Supplier</th><th>Material</th>
              <th>Qty</th><th>Rate / Unit</th><th>Actual Cost</th>
              <th>Paid</th><th>Pending</th><th>Due Date</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${purchases.length === 0 ? '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:20px;">No purchases recorded yet. Click "+ New Purchase Bill" to add one.</td></tr>' : ''}
            ${purchases.map(p => {
              const supplierName = p.suppliers?.name || p.supplier_name || '';
              const invoiceNo = p.invoice_no || p.invoiceNo || '';
              const matName = p.material_name || p.material || '';
              const qty = p.quantity || 0;
              const unit = p.unit || 'kg';
              const rate = p.rate_per_unit || p.rate || 0;
              const actualCost = p.actual_cost || p.actualCost || 0;
              const paid = p.amount_paid || p.amountPaid || 0;
              const pending = p.balance_pending || p.balancePending || 0;
              const dueDate = p.payment_due_date || p.dueDate || '';
              const rateVs = p.rate_vs_last || p.rateVsLastBuy || 'neutral';
              const rateDiff = p.rate_difference || p.rateDifference || 0;
              return `
                <tr>
                  <td>${store.formatDate(p.purchase_date || p.date)}</td>
                  <td><strong>${invoiceNo}</strong></td>
                  <td>${supplierName}</td>
                  <td>${matName}</td>
                  <td>${qty} ${unit}</td>
                  <td>
                    ${store.formatINR(rate)}
                    ${rateVs==='up' ? `<span class="rate-vs-buy-tag up" style="display:inline-flex;padding:1px 5px;font-size:0.7rem;">▲ +₹${rateDiff}</span>` : ''}
                    ${rateVs==='down' ? `<span class="rate-vs-buy-tag down" style="display:inline-flex;padding:1px 5px;font-size:0.7rem;">▼ -₹${Math.abs(rateDiff)}</span>` : ''}
                  </td>
                  <td><strong style="color:var(--brand-blue);">${store.formatINR(actualCost)}</strong></td>
                  <td><span class="text-green">${store.formatINR(paid)}</span></td>
                  <td><span class="${pending > 0 ? 'text-red' : 'text-green'} text-bold">${store.formatINR(pending)}</span></td>
                  <td>${store.formatDate(dueDate)}</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:6px;">
                      <button class="btn-secondary" style="padding:4px 8px;font-size:0.78rem;" onclick="window.viewPurchaseAttachments('${p.id}')">📎 Attachments</button>
                      ${pending > 0 ? `<button class="btn-navy" style="padding:4px 8px;font-size:0.78rem;" onclick="window.openPurchasePaymentModal('${p.id}')">Pay</button>` : '<span style="color:var(--text-muted);font-size:0.8rem;">Cleared</span>'}
                      ${store.canDelete() ? `
                        <button class="btn-danger" style="padding:4px 8px;font-size:0.78rem;display:inline-flex;align-items:center;gap:3px;" title="Delete Purchase Bill" onclick="window.confirmDeletePurchase('${p.id}', '${invoiceNo}', '${supplierName}', '${store.formatINR(actualCost)}')">
                          🗑 Delete
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.confirmDeletePurchase = function(purchaseId, invoiceNo, supplierName, costFormatted) {
  modalTitle.textContent = 'Confirm Delete Purchase Bill';
  modalBody.innerHTML = `
    <div style="padding:10px 0;">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
        <span style="font-size:2.2rem;line-height:1;">⚠️</span>
        <div>
          <div style="font-size:1.05rem;font-weight:700;color:var(--primary-navy);">Delete Purchase Bill <strong>${invoiceNo}</strong>?</div>
          <div style="font-size:0.88rem;color:var(--text-sub);margin-top:6px;line-height:1.45;">
            Supplier: <strong>${supplierName}</strong> | Amount: <strong>${costFormatted}</strong>
            <br/><br/>
            This will permanently remove this purchase bill, remove any associated supplier payments, and deduct the raw material stock accordingly.
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:24px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="button" class="btn-danger" id="doDeletePurchaseBtn" style="padding:10px 20px;font-size:0.92rem;font-weight:700;">
          🗑 Yes, Delete Purchase
        </button>
      </div>
    </div>
  `;
  document.getElementById('doDeletePurchaseBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('doDeletePurchaseBtn');
    btn.textContent = 'Deleting…';
    btn.disabled = true;
    try {
      await store.deletePurchase(purchaseId);
      dashboardMetrics = null;
      closeModal();
      renderPurchases();
      showToast(`Purchase bill ${invoiceNo} deleted successfully!`, 'info');
    } catch(e) {
      alert('Error deleting purchase: ' + (e.message || e));
      btn.textContent = '🗑 Yes, Delete Purchase';
      btn.disabled = false;
    }
  });
  openModal();
};

window.openNewPurchaseModal = function() {
  const suppliers = store.data.suppliers;
  modalTitle.textContent = 'Record Raw Material Purchase';
  modalBody.innerHTML = `
    <div class="form-auto-calc-layout">
      <form id="newPurchaseForm">
        <div class="form-grid-3">
          <div class="form-group">
            <label class="form-label">Supplier</label>
            <input type="text" id="p_supplier" class="form-input" list="supplierList" placeholder="Supplier name" required />
            <datalist id="supplierList">${suppliers.map(s => `<option value="${s.name}"></option>`).join('')}</datalist>
          </div>
          <div class="form-group">
            <label class="form-label">Purchase Date</label>
            <input type="date" id="p_date" class="form-input" value="${store.getCurrentDate()}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Bill / Invoice No. <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(Auto-generated if blank)</span></label>
            <input type="text" id="p_invoiceNo" class="form-input" placeholder="Leave blank for auto-number (PUR-YYYY-NNNN)" />
            <small id="p_invoiceNoPreview" style="color:var(--text-muted);font-size:0.76rem;">Will be auto-assigned on save</small>
          </div>
        </div>
        <div class="form-grid-3">
          <div class="form-group">
            <label class="form-label">Material</label>
            <input type="text" id="p_material" class="form-input" value="Hay (loose)" required />
          </div>
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="number" id="p_quantity" class="form-input" value="30" min="0.01" step="any" required />
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <select id="p_unit" class="form-select">
              <option value="ton" selected>Ton</option>
              <option value="kg">kg</option>
              <option value="load">Load</option>
              <option value="bale">Bale</option>
            </select>
          </div>
        </div>
        <div class="form-grid-4">
          <div class="form-group">
            <label class="form-label">Rate / Unit (₹)</label>
            <input type="number" id="p_rate" class="form-input" value="4000" min="0" required />
          </div>
          <div class="form-group">
            <label class="form-label">Transport (₹)</label>
            <input type="number" id="p_transport" class="form-input" value="0" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Loading/Unloading (₹)</label>
            <input type="number" id="p_loading" class="form-input" value="0" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Commission (₹)</label>
            <input type="number" id="p_commission" class="form-input" value="0" min="0" />
          </div>
        </div>
        <div class="form-grid-4">
          <div class="form-group">
            <label class="form-label">Other Charges (₹)</label>
            <input type="number" id="p_other" class="form-input" value="0" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">GST Rate (%)</label>
            <input type="number" id="p_gstRate" class="form-input" value="0" min="0" max="28" />
          </div>
          <div class="form-group">
            <label class="form-label">Amount Paid Now (₹)</label>
            <input type="number" id="p_amountPaid" class="form-input" value="0" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Payment Mode</label>
            <select id="p_mode" class="form-select">
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Due Date for Balance</label>
            <input type="date" id="p_dueDate" class="form-input" value="${store.addDays(store.getCurrentDate(), 25)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <input type="text" id="p_notes" class="form-input" placeholder="Optional notes" />
          </div>
        </div>
        <div class="attachment-box">
          <div>
            <div style="font-weight:600;font-size:0.85rem;">Attach Bills / Receipts / Photos (Max 5 MB each)</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">Supports JPG, PNG, PDF — multiple files allowed — stored permanently for audit</div>
          </div>
          <div class="attachment-buttons">
            <label class="attach-btn" style="cursor:pointer;">
              📎 Attach Files
              <input type="file" id="p_fileInput" accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf" multiple style="display:none;" />
            </label>
            <span id="attachedFileName" class="attach-preview-tag">No files chosen</span>
          </div>
          <div id="p_uploadStatus" style="margin-top:6px;font-size:0.78rem;color:var(--text-muted);"></div>
        </div>
        <div id="purchaseError" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:10px;margin-top:10px;font-size:0.85rem;"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
          <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
          <button type="submit" id="savePurchaseBtn" class="btn-primary">Save Purchase</button>
        </div>
      </form>

      <div class="calc-sidebar-box">
        <div class="calc-box-title"><span>⚡</span> <span>Auto Total Breakdown</span></div>
        <div class="calc-line-item"><span>Material Cost:</span><strong id="calc_materialCost">₹ 0</strong></div>
        <div class="calc-line-item"><span>Transport:</span><strong id="calc_transport">₹ 0</strong></div>
        <div class="calc-line-item"><span>Loading:</span><strong id="calc_loading">₹ 0</strong></div>
        <div class="calc-line-item"><span>Commission:</span><strong id="calc_commission">₹ 0</strong></div>
        <div class="calc-line-item"><span>Other Charges:</span><strong id="calc_other">₹ 0</strong></div>
        <div class="calc-line-item"><span>GST:</span><strong id="calc_gst">₹ 0</strong></div>
        <div class="calc-line-item highlight"><span>Actual Cost:</span><span class="val" id="calc_actualCost">₹ 0</span></div>
        <div class="calc-line-item"><span>Paid Now:</span><strong class="text-green" id="calc_paid">₹ 0</strong></div>
        <div class="calc-line-item"><span>Balance Pending:</span><strong class="text-red" id="calc_pending">₹ 0</strong></div>
      </div>
    </div>
  `;

  const updateCalc = () => {
    const qty = Number(document.getElementById('p_quantity').value) || 0;
    const rate = Number(document.getElementById('p_rate').value) || 0;
    const matCost = qty * rate;
    const transport = Number(document.getElementById('p_transport').value) || 0;
    const loading = Number(document.getElementById('p_loading').value) || 0;
    const commission = Number(document.getElementById('p_commission').value) || 0;
    const other = Number(document.getElementById('p_other').value) || 0;
    const gstRate = Number(document.getElementById('p_gstRate').value) || 0;
    const sub = matCost + transport + loading + commission + other;
    const gstAmt = Math.round((sub * gstRate) / 100);
    const actual = sub + gstAmt;
    const paid = Number(document.getElementById('p_amountPaid').value) || 0;
    const pending = Math.max(0, actual - paid);

    document.getElementById('calc_materialCost').textContent = store.formatINR(matCost);
    document.getElementById('calc_transport').textContent = store.formatINR(transport);
    document.getElementById('calc_loading').textContent = store.formatINR(loading);
    document.getElementById('calc_commission').textContent = store.formatINR(commission);
    document.getElementById('calc_other').textContent = store.formatINR(other);
    document.getElementById('calc_gst').textContent = store.formatINR(gstAmt);
    document.getElementById('calc_actualCost').textContent = store.formatINR(actual);
    document.getElementById('calc_paid').textContent = store.formatINR(paid);
    document.getElementById('calc_pending').textContent = store.formatINR(pending);
  };

  ['p_quantity','p_rate','p_transport','p_loading','p_commission','p_other','p_gstRate','p_amountPaid'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateCalc);
  });

  document.getElementById('p_fileInput').addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      const names = Array.from(files).map(f => f.name).join(', ');
      document.getElementById('attachedFileName').textContent = files.length + ' file(s): ' + names;
    } else {
      document.getElementById('attachedFileName').textContent = 'No files chosen';
    }
  });

  document.getElementById('newPurchaseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('savePurchaseBtn');
    const errDiv = document.getElementById('purchaseError');
    btn.textContent = 'Saving…'; btn.disabled = true;
    errDiv.style.display = 'none';
    try {
      const purchaseResult = await store.addPurchase({
        supplierName: document.getElementById('p_supplier').value,
        date: document.getElementById('p_date').value,
        invoiceNo: document.getElementById('p_invoiceNo').value.trim(), // empty = auto-generate
        material: document.getElementById('p_material').value,
        quantity: document.getElementById('p_quantity').value,
        unit: document.getElementById('p_unit').value,
        rate: document.getElementById('p_rate').value,
        transport: document.getElementById('p_transport').value,
        loading: document.getElementById('p_loading').value,
        commission: document.getElementById('p_commission').value,
        other: document.getElementById('p_other').value,
        gstRate: document.getElementById('p_gstRate').value,
        amountPaid: document.getElementById('p_amountPaid').value,
        paymentMode: document.getElementById('p_mode').value,
        dueDate: document.getElementById('p_dueDate').value,
        notes: document.getElementById('p_notes').value
      });

      // Upload all selected attachments
      const fileInput = document.getElementById('p_fileInput');
      const purchaseId = purchaseResult?.purchase_id || purchaseResult?.id;
      if (fileInput.files.length > 0 && purchaseId) {
        const uploadErrors = [];
        for (const f of fileInput.files) {
          try {
            await attachmentsService.upload(f, 'purchase', purchaseId);
          } catch(attachErr) {
            uploadErrors.push(f.name + ': ' + attachErr.message);
          }
        }
        if (uploadErrors.length > 0) {
          showToast('Purchase saved but some attachments failed: ' + uploadErrors.join('; '), 'warning');
        }
      }

      dashboardMetrics = null; // invalidate dashboard cache
      closeModal();
      renderPurchases();
      const savedInvNo = purchaseResult?.invoice_no || purchaseResult?.invoiceNo || '';
      showToast(`Purchase saved successfully${savedInvNo ? ' (' + savedInvNo + ')' : ''}`);
    } catch(err) {
      errDiv.textContent = err.message || 'Error saving purchase.';
      errDiv.style.display = 'block';
      btn.textContent = 'Save Purchase'; btn.disabled = false;
    }
  });

  openModal(true);
};

window.openPurchasePaymentModal = function(purchaseId) {
  const purchase = store.data.purchases.find(p => p.id === purchaseId);
  if (!purchase) return;
  const pending = purchase.balance_pending || purchase.balancePending || 0;
  const supplierName = purchase.suppliers?.name || purchase.supplier_name || '';

  modalTitle.textContent = `Record Supplier Payment`;
  modalBody.innerHTML = `
    <form id="supplierPayForm">
      <div style="background:var(--grey-bg);padding:12px;border-radius:var(--radius-md);margin-bottom:16px;">
        <div>Supplier: <strong>${supplierName}</strong></div>
        <div>Bill: <strong>${purchase.invoice_no}</strong> | Outstanding: <strong class="text-red">${store.formatINR(pending)}</strong></div>
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Payment Date</label>
          <input type="date" id="spay_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Amount (₹)</label>
          <input type="number" id="spay_amount" class="form-input" max="${pending}" value="${pending}" min="1" required />
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Payment Mode</label>
          <select id="spay_mode" class="form-select">
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Note</label>
          <input type="text" id="spay_note" class="form-input" placeholder="Optional" />
        </div>
      </div>
      <div id="spayError" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:10px;margin-top:10px;font-size:0.85rem;"></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" id="spayBtn" class="btn-primary">Record Payment</button>
      </div>
    </form>
  `;

  document.getElementById('supplierPayForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('spayBtn');
    const errDiv = document.getElementById('spayError');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      await purchasesService.addPayment({
        purchase_id: purchaseId,
        amount: document.getElementById('spay_amount').value,
        payment_date: document.getElementById('spay_date').value,
        payment_mode: document.getElementById('spay_mode').value,
        note: document.getElementById('spay_note').value
      });
      await store.loadAll();
      closeModal();
      renderPurchases();
      showToast('Payment recorded successfully');
    } catch(err) {
      errDiv.textContent = err.message;
      errDiv.style.display = 'block';
      btn.textContent = 'Record Payment'; btn.disabled = false;
    }
  });
  openModal();
};

window.openSupplierDetail = function(supplierId) {
  const sup = store.data.suppliers.find(s => s.id === supplierId);
  if (!sup) return;
  const supPurchases = store.data.purchases.filter(p => p.supplier_id === supplierId || p.suppliers?.name === sup.name);
  modalTitle.textContent = `Supplier: ${sup.name}`;
  modalBody.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;background:var(--grey-bg);padding:16px;border-radius:var(--radius-md);margin-bottom:20px;">
      <div><span style="font-size:0.78rem;color:var(--text-muted);display:block;">Total Purchased</span><strong>${store.formatINR(sup.totalPurchased)}</strong></div>
      <div><span style="font-size:0.78rem;color:var(--text-muted);display:block;">Total Paid</span><strong class="text-green">${store.formatINR(sup.totalPaid)}</strong></div>
      <div><span style="font-size:0.78rem;color:var(--text-muted);display:block;">Balance Pending</span><strong class="text-red">${store.formatINR(sup.balancePending)}</strong></div>
    </div>
    <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">Purchase History</h4>
    <table class="app-table" style="font-size:0.82rem;">
      <thead><tr><th>Date</th><th>Bill</th><th>Material</th><th>Qty</th><th>Actual Cost</th><th>Pending</th><th>Attachments</th></tr></thead>
      <tbody>
        ${supPurchases.map(p => `
          <tr>
            <td>${store.formatDate(p.purchase_date||p.date)}</td>
            <td>${p.invoice_no||p.invoiceNo}</td>
            <td>${p.material_name||p.material}</td>
            <td>${p.quantity} ${p.unit}</td>
            <td>${store.formatINR(p.actual_cost||p.actualCost)}</td>
            <td class="${(p.balance_pending||p.balancePending)>0?'text-red':'text-green'}">${store.formatINR(p.balance_pending||p.balancePending)}</td>
            <td><button class="btn-secondary" style="padding:3px 7px;font-size:0.74rem;" onclick="window.viewPurchaseAttachments('${p.id}')">📎 Files</button></td>
          </tr>
        `).join('')}
        ${supPurchases.length===0?'<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No purchases yet</td></tr>':''}
      </tbody>
    </table>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:12px;border-top:1px solid var(--border-light);">
      <button type="button" class="btn-secondary" onclick="window.closeModal()">Close</button>
      ${store.canDelete() ? `
        <button type="button" class="btn-danger" style="padding:6px 14px;font-size:0.85rem;display:inline-flex;align-items:center;gap:4px;" onclick="window.closeModal(); window.confirmDeleteSupplier('${sup.id}', '${(sup.name||'').replace(/'/g, "\\'")}')">
          🗑 Delete Supplier
        </button>
      ` : ''}
    </div>
  `;
  openModal();
};

window.viewPurchaseAttachments = async function(purchaseId) {
  showLoading('Loading attachments…');
  let attachments = [];
  try {
    attachments = await attachmentsService.getForEntity('purchase', purchaseId);
  } catch(e) {
    console.warn('Could not load attachments:', e.message);
  }
  hideLoading();
  modalTitle.textContent = 'Purchase Attachments';
  modalBody.innerHTML = `
    <div style="margin-bottom:16px;">
      ${attachments.length === 0 ? '<div style="text-align:center;color:var(--text-muted);padding:20px;">No attachments yet for this purchase.</div>' : ''}
      ${attachments.map(att => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border-light);border-radius:8px;margin-bottom:8px;">
          <span style="font-size:1.4rem;">${att.mime_type==='application/pdf'?'📄':'🖼'}</span>
          <div style="flex:1;overflow:hidden;">
            <div style="font-weight:600;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${att.original_name}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${Math.round(att.file_size_bytes/1024)} KB • ${store.formatDate(att.created_at)}</div>
          </div>
          <button class="btn-navy" style="padding:5px 10px;font-size:0.8rem;" onclick="window.viewAttachment('${att.storage_path}')">View</button>
        </div>
      `).join('')}
    </div>
    <div style="border-top:1px solid var(--border-light);padding-top:14px;">
      <div style="font-weight:600;font-size:0.85rem;margin-bottom:8px;">+ Upload More Files</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="file" id="purAttachFile" accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf" multiple style="flex:1;" />
        <button class="btn-primary" style="padding:7px 14px;font-size:0.85rem;" onclick="window.doPurchaseAttachUpload('${purchaseId}')">Upload</button>
      </div>
      <div id="purAttachProgress" style="margin-top:6px;font-size:0.8rem;color:var(--text-muted);"></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:16px;">
      <button class="btn-secondary" onclick="window.closeModal()">Close</button>
    </div>
  `;
  openModal();
};

window.doPurchaseAttachUpload = async function(purchaseId) {
  const fileInput = document.getElementById('purAttachFile');
  const progressEl = document.getElementById('purAttachProgress');
  if (!fileInput || !fileInput.files.length) { showToast('Select at least one file', 'warning'); return; }
  const files = Array.from(fileInput.files);
  progressEl.textContent = 'Uploading ' + files.length + ' file(s)…';
  const errors = [];
  for (const f of files) {
    try {
      await attachmentsService.upload(f, 'purchase', purchaseId);
    } catch(err) {
      errors.push(f.name + ': ' + err.message);
    }
  }
  if (errors.length > 0) {
    progressEl.textContent = 'Some files failed: ' + errors.join('; ');
    progressEl.style.color = 'var(--red-accent)';
  } else {
    showToast('Files uploaded successfully!');
    window.viewPurchaseAttachments(purchaseId);
  }
};

window.confirmDeleteSupplier = function(supplierId, supplierName) {
  modalTitle.textContent = 'Confirm Delete Supplier';
  modalBody.innerHTML = `
    <div style="padding:10px 0;">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
        <span style="font-size:2.2rem;line-height:1;">⚠️</span>
        <div>
          <div style="font-size:1.05rem;font-weight:700;color:var(--primary-navy);">Delete Supplier <strong>${supplierName}</strong>?</div>
          <div style="font-size:0.88rem;color:var(--text-sub);margin-top:6px;line-height:1.45;">
            Are you sure you want to remove supplier <strong>${supplierName}</strong>?
            <br/><br/>
            This will remove the supplier from your active supplier list. Any existing historical purchase bills will keep their records intact.
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:24px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="button" class="btn-danger" id="doDeleteSupplierBtn" style="padding:10px 20px;font-size:0.92rem;font-weight:700;">
          🗑 Yes, Delete Supplier
        </button>
      </div>
    </div>
  `;
  document.getElementById('doDeleteSupplierBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('doDeleteSupplierBtn');
    btn.textContent = 'Deleting…';
    btn.disabled = true;
    try {
      await store.deleteSupplier(supplierId);
      dashboardMetrics = null;
      closeModal();
      renderPurchases();
      showToast(`Supplier ${supplierName} deleted successfully!`, 'info');
    } catch(e) {
      alert('Error deleting supplier: ' + (e.message || e));
      btn.textContent = '🗑 Yes, Delete Supplier';
      btn.disabled = false;
    }
  });
  openModal();
};


// ─────────────────────────────────────────────────────────────────
// PRODUCTION BATCHES
// ─────────────────────────────────────────────────────────────────
function renderProduction() {
  const batches = store.data.batches;
  const isFinance = store.canViewFinancials();

  appContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
      <div style="font-size:0.9rem;color:var(--text-sub);">Turn raw material into numbered batches and calculate exact cost per bale.</div>
      <button class="btn-primary" onclick="window.openNewBatchModal()">＋ New Production Batch</button>
    </div>
    <div class="section-box">
      <div class="section-box-header"><div class="box-title">Numbered Production Batches</div></div>
      <div class="data-table-wrapper">
        <table class="app-table">
          <thead>
            <tr>
              <th>Batch Number</th><th>Prod Date</th><th>Raw Material Used</th><th>Finished Bales</th>
              ${isFinance ? '<th>Total Prod Cost</th><th>Cost / Bale</th>' : ''}
              <th>Assigned Plot</th><th>Ferm. Start</th><th>Ready Date</th><th>Status</th>
              ${store.canDelete() ? '<th style="text-align:center;">Action</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${batches.length===0 ? `<tr><td colspan="${isFinance ? 11 : 9}" style="text-align:center;color:var(--text-muted);padding:20px;">No batches yet. Click "+ New Production Batch" to start.</td></tr>` : ''}
            ${batches.map(b => `
              <tr>
                <td><strong style="color:var(--brand-blue);">${b.batch_number||b.batchNumber}</strong></td>
                <td>${store.formatDate(b.production_date||b.productionDate)}</td>
                <td>${store.formatNumber(b.raw_material_kg||b.rawMaterialKg)} kg</td>
                <td><strong>${store.formatNumber(b.finished_bales||b.finishedBales)}</strong></td>
                ${isFinance ? `
                  <td><strong>${store.formatINR(b.total_production_cost||b.totalProductionCost)}</strong></td>
                  <td><span class="badge badge-blue">₹ ${Math.round(b.cost_per_bale||b.costPerBale||0)}</span></td>
                ` : ''}
                <td><span class="badge ${b.status==='Ready'?'badge-ready':'badge-fermenting'}">${b.plot_name||b.plotAssigned||b.plots?.plot_name||''}</span></td>
                <td>${store.formatDate(b.fermentation_start||b.fermentationStart)}</td>
                <td>${store.formatDate(b.ready_date||b.readyDate)}</td>
                <td><span class="badge ${b.status==='Ready'?'badge-ready':'badge-fermenting'}">${b.status}</span></td>
                ${store.canDelete() ? `
                  <td style="text-align:center;">
                    <button class="btn-danger" style="padding:4px 10px;font-size:0.78rem;display:inline-flex;align-items:center;gap:4px;" onclick="window.confirmDeleteBatch('${b.id||b.batch_number||b.batchNumber}','${b.batch_number||b.batchNumber}','${b.plot_name||b.plotAssigned||''}')">
                      🗑 Delete
                    </button>
                  </td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.confirmDeleteBatch = function(batchId, batchNumber, plotName) {
  modalTitle.textContent = 'Confirm Delete Production Batch';
  modalBody.innerHTML = `
    <div style="padding:10px 0;">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
        <span style="font-size:2.2rem;line-height:1;">⚠️</span>
        <div>
          <div style="font-size:1.05rem;font-weight:700;color:var(--primary-navy);">Delete Batch <strong>${batchNumber}</strong>?</div>
          <div style="font-size:0.88rem;color:var(--text-sub);margin-top:6px;line-height:1.45;">
            This will permanently remove batch <strong>${batchNumber}</strong>, restore the consumed raw material stock, and release <strong>Plot ${plotName || 'assigned'}</strong> back to empty.
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:24px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="button" class="btn-danger" id="doDeleteBatchBtn" style="padding:10px 20px;font-size:0.92rem;font-weight:700;">
          🗑 Yes, Delete Batch
        </button>
      </div>
    </div>
  `;
  document.getElementById('doDeleteBatchBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('doDeleteBatchBtn');
    btn.textContent = 'Deleting…';
    btn.disabled = true;
    try {
      await store.deleteBatch(batchId);
      dashboardMetrics = null;
      closeModal();
      renderProduction();
      showToast(`Batch ${batchNumber} deleted successfully. Plot released!`, 'info');
    } catch (e) {
      alert('Error deleting batch: ' + (e.message || e));
      btn.textContent = '🗑 Yes, Delete Batch';
      btn.disabled = false;
    }
  });
  openModal();
};

window.openNewBatchModal = function() {
  const isFinance = store.canViewFinancials();

  // Find plots that already have an active batch assigned (Fermenting or Ready)
  const occupiedPlotNames = new Set();
  store.data.batches.forEach(b => {
    if (['Fermenting', 'Ready'].includes(b.status)) {
      const name = b.plot_name || b.plotAssigned || b.plots?.plot_name;
      if (name) occupiedPlotNames.add(name.toUpperCase());
    }
  });

  const availablePlots = store.data.plots.filter(p => {
    const name = (p.plot_name || p.id || '').toUpperCase();
    const isOccupied = occupiedPlotNames.has(name) || p.status === 'Fermenting' || p.status === 'Ready' || (p.bales || 0) > 0;
    return !isOccupied;
  });
  const autoBatchNum = store.generateBatchNumber();

  modalTitle.textContent = 'New Production Batch';
  modalBody.innerHTML = `
    <div class="form-auto-calc-layout">
      <form id="newBatchForm">
        <div class="form-grid-3">
          <div class="form-group">
            <label class="form-label">Batch Number (Auto)</label>
            <input type="text" id="b_batchNumber" class="form-input" value="${autoBatchNum}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Production Date</label>
            <input type="date" id="b_prodDate" class="form-input" value="${store.getCurrentDate()}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Raw Material Used (kg)</label>
            <input type="number" id="b_rawKg" class="form-input" value="26500" min="1" required />
          </div>
        </div>
        ${isFinance ? `
          <div class="form-grid-3">
            <div class="form-group">
              <label class="form-label">Raw Material Cost (₹)</label>
              <input type="number" id="b_rawCost" class="form-input" value="0" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Labour Charges (₹)</label>
              <input type="number" id="b_labour" class="form-input" value="0" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Wrapping / Twine (₹)</label>
              <input type="number" id="b_wrapping" class="form-input" value="0" min="0" />
            </div>
          </div>
          <div class="form-grid-3">
            <div class="form-group">
              <label class="form-label">Machinery / Fuel (₹)</label>
              <input type="number" id="b_machinery" class="form-input" value="0" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Other Expenses (₹)</label>
              <input type="number" id="b_other" class="form-input" value="0" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Finished Bales Count</label>
              <input type="number" id="b_finishedBales" class="form-input" value="875" min="1" required />
            </div>
          </div>
        ` : `
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">Finished Bales Produced</label>
              <input type="number" id="b_finishedBales" class="form-input" value="875" min="1" required />
            </div>
          </div>
        `}
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Plot Assigned</label>
            <select id="b_plotAssigned" class="form-select" required ${availablePlots.length===0 ? 'disabled' : ''}>
              ${availablePlots.length===0 ? '<option value="">⚠️ All plots occupied — no empty plots</option>' : ''}
              ${availablePlots.map(p => {
                const name = p.plot_name || p.id;
                return `<option value="${name}">${name} (Section ${p.section})</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fermentation Duration Option</label>
            <select id="b_fermDurationOption" class="form-select">
              <option value="1-minute">⚡ 1 Minute (Fast Testing Mode)</option>
              <option value="30-day" selected>📅 30 Days (Standard Agro Production)</option>
              <option value="custom">⚙️ Custom Number of Days</option>
            </select>
          </div>
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Fermentation Start Date</label>
            <input type="date" id="b_fermStart" class="form-input" value="${store.getCurrentDate()}" required />
          </div>
          <div class="form-group" id="customDaysGroup" style="display:none;">
            <label class="form-label">Days for Fermenting</label>
            <input type="number" id="b_customDays" class="form-input" value="15" min="1" max="180" />
          </div>
        </div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin:8px 0 16px 0;" id="fermNoticeText">
          ${availablePlots.length===0 ? '⚠️ A plot cannot hold multiple active batches. Delete or empty a plot first.' : 'Saving this batch occupies the plot and automatically starts the fermentation countdown.'}
        </div>
        <div id="batchError" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:10px;margin-top:10px;font-size:0.85rem;"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
          <button type="submit" id="saveBatchBtn" class="btn-primary" ${availablePlots.length===0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Save Batch</button>
        </div>
      </form>

      ${isFinance ? `
        <div class="calc-sidebar-box">
          <div class="calc-box-title"><span>⚡</span> <span>Auto Calculation</span></div>
          <div class="calc-line-item highlight"><span>Total Production Cost:</span><span class="val" id="calc_totalProdCost">₹ 0</span></div>
          <div class="calc-line-item"><span>Cost per Bale:</span><strong style="color:var(--brand-blue);font-size:1.15rem;" id="calc_costPerBale">₹ 0</strong></div>
          <div class="calc-line-item"><span>Raw material / bale:</span><strong id="calc_rawPerBale">₹ 0</strong></div>
          <div class="calc-line-item"><span>Labour / bale:</span><strong id="calc_labourPerBale">₹ 0</strong></div>
          <div class="calc-line-item"><span>Other / bale:</span><strong id="calc_otherPerBale">₹ 0</strong></div>
          <div style="margin-top:16px;padding-top:12px;border-top:1.5px dashed var(--border-light);font-size:0.85rem;">
            Ready date: <strong id="calc_readyDate" class="text-green">-</strong>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  const fermOptEl = document.getElementById('b_fermDurationOption');
  const customDaysGroup = document.getElementById('customDaysGroup');
  const fermNoticeText = document.getElementById('fermNoticeText');
  fermOptEl?.addEventListener('change', () => {
    if (fermOptEl.value === 'custom') {
      customDaysGroup.style.display = 'block';
      fermNoticeText.textContent = `Custom days selected. Bales will ferment for ${document.getElementById('b_customDays').value} days.`;
    } else if (fermOptEl.value === '1-minute') {
      customDaysGroup.style.display = 'none';
      fermNoticeText.textContent = `⚡ 1-Minute testing mode active! Bales will complete fermentation in 60 seconds and become ready for sale.`;
    } else {
      customDaysGroup.style.display = 'none';
      fermNoticeText.textContent = `Saving this batch occupies the plot and starts the 30-day standard fermentation countdown.`;
    }
  });

  if (isFinance) {
    const updateBatchCalc = () => {
      const rawCost = Number(document.getElementById('b_rawCost')?.value) || 0;
      const labour = Number(document.getElementById('b_labour')?.value) || 0;
      const wrapping = Number(document.getElementById('b_wrapping')?.value) || 0;
      const machinery = Number(document.getElementById('b_machinery')?.value) || 0;
      const other = Number(document.getElementById('b_other')?.value) || 0;
      const bales = Math.max(1, Number(document.getElementById('b_finishedBales')?.value) || 1);
      const total = rawCost + labour + wrapping + machinery + other;
      document.getElementById('calc_totalProdCost').textContent = store.formatINR(total);
      document.getElementById('calc_costPerBale').textContent = `₹ ${Math.round(total/bales)}`;
      document.getElementById('calc_rawPerBale').textContent = `₹ ${Math.round(rawCost/bales)}`;
      document.getElementById('calc_labourPerBale').textContent = `₹ ${Math.round(labour/bales)}`;
      document.getElementById('calc_otherPerBale').textContent = `₹ ${Math.round((wrapping+machinery+other)/bales)}`;
      const fermStart = document.getElementById('b_fermStart')?.value || store.getCurrentDate();
      const is1Min = document.getElementById('b_fermDurationOption')?.value === '1-minute';
      document.getElementById('calc_readyDate').textContent = is1Min ? 'In 1 Minute (⚡ Test Mode)' : `${store.formatDate(store.addDays(fermStart, store.data.settings.fermentationDays||30))}`;
    };
    ['b_rawCost','b_labour','b_wrapping','b_machinery','b_other','b_finishedBales','b_fermStart'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateBatchCalc);
    });
    fermOptEl?.addEventListener('change', updateBatchCalc);
  }

  document.getElementById('newBatchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveBatchBtn');
    const errDiv = document.getElementById('batchError');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      const fermOpt = document.getElementById('b_fermDurationOption')?.value || '30-day';
      let fermUnit = 'day';
      let fermDuration = 30;
      if (fermOpt === '1-minute') {
        fermUnit = 'minute';
        fermDuration = 1;
      } else if (fermOpt === 'custom') {
        fermUnit = 'day';
        fermDuration = Number(document.getElementById('b_customDays')?.value) || 30;
      } else {
        fermUnit = 'day';
        fermDuration = Number(store.data.settings.fermentationDays) || 30;
      }

      await store.addBatch({
        batchNumber: document.getElementById('b_batchNumber').value,
        productionDate: document.getElementById('b_prodDate').value,
        rawMaterialKg: document.getElementById('b_rawKg').value,
        rawMaterialCost: isFinance ? document.getElementById('b_rawCost')?.value : 0,
        labourCost: isFinance ? document.getElementById('b_labour')?.value : 0,
        wrappingCost: isFinance ? document.getElementById('b_wrapping')?.value : 0,
        machineryCost: isFinance ? document.getElementById('b_machinery')?.value : 0,
        otherCost: isFinance ? document.getElementById('b_other')?.value : 0,
        finishedBales: document.getElementById('b_finishedBales').value,
        plotAssigned: document.getElementById('b_plotAssigned').value,
        fermentationStart: document.getElementById('b_fermStart').value,
        fermUnit: fermUnit,
        fermDuration: fermDuration
      });
      dashboardMetrics = null;
      closeModal();
      renderProduction();
      showToast(fermUnit === 'minute' ? 'Batch created! ⚡ 1-Minute countdown started on plot.' : 'Production batch saved!');
    } catch(err) {
      errDiv.textContent = err.message || 'Error saving batch.';
      errDiv.style.display = 'block';
      btn.textContent = 'Save Batch'; btn.disabled = false;
    }
  });
  openModal(true);
};

// ─────────────────────────────────────────────────────────────────
// SALES & INVOICES
// ─────────────────────────────────────────────────────────────────
function renderSales() {
  const isFinance = store.canViewFinancials();
  if (!isFinance) { appContent.innerHTML = `<div style="padding:40px;text-align:center;">Staff cannot access sales invoices and customer credit records.</div>`; return; }

  const sales = store.data.sales;
  const customers = store.data.customers;
  const today = store.getCurrentDate();

  appContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
      <div style="font-size:0.9rem;color:var(--text-sub);">Sell from ready stock, issue invoices, track credit limits, maintain append-only payment histories.</div>
      <div style="display:flex;gap:10px;">
        <button class="btn-secondary" onclick="window.openAddCustomerModal(() => renderSales())">＋ Add Customer</button>
        <button class="btn-primary" onclick="window.openNewInvoiceModal()">＋ New Bale Invoice</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px;">
      ${customers.map(cust => {
        const bal = cust.balancePending || cust.balance_pending || 0;
        const limit = cust.creditLimit || cust.credit_limit || 300000;
        const overLimit = bal > limit;
        return `
          <div class="finance-card" style="cursor:pointer;" onclick="window.openCustomerDetail('${cust.id}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-weight:700;font-size:1.05rem;color:var(--primary-navy);">${cust.name}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${cust.phone||''}</div>
              </div>
              <span class="badge ${overLimit?'badge-overdue':'badge-receive'}">Limit: ${store.formatINR(limit, true)}</span>
            </div>
            <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-light);display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;">
              <div>
                <span style="color:var(--text-muted);font-size:0.75rem;display:block;">Total Purchases:</span>
                <strong>${store.formatINR(cust.totalPurchased || cust.total_purchased || 0)}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted);font-size:0.75rem;display:block;">Pending Receivable:</span>
                <strong style="color:var(--red-accent);font-size:1rem;">${store.formatINR(bal)}</strong>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="section-box">
      <div class="section-box-header"><div class="box-title">Bale Invoices & Customer Receivables</div></div>
      <div class="data-table-wrapper">
        <table class="app-table">
          <thead>
            <tr>
              <th>Invoice #</th><th>Date</th><th>Customer</th><th>Bales Sold</th>
              <th>Rate / Bale</th><th>Invoice Total</th><th>Paid</th><th>Pending</th>
              <th>Due Date</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${sales.length===0 ? '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:20px;">No invoices yet. Click "+ New Bale Invoice" to create one.</td></tr>' : ''}
            ${sales.map(s => {
              const invNum = s.invoice_number || s.invoiceNumber || '';
              const custName = s.customers?.name || s.customerName || '';
              const bales = s.bales_count || s.balesCount || 0;
              const rate = s.rate_per_bale || s.ratePerBale || 0;
              const total = s.invoice_total || s.invoiceTotal || 0;
              const paid = s.amount_paid || s.amountPaid || 0;
              const pending = s.balance_pending || s.balancePending || 0;
              const dueDate = s.due_date || s.dueDate || '';
              const isOverdue = pending > 0 && dueDate && new Date(dueDate) < new Date(today);
              // Compute status client-side — never show undefined
              let displayStatus = s.status;
              if (!displayStatus || displayStatus === 'undefined') {
                if (pending <= 0) displayStatus = 'Paid';
                else if (isOverdue) displayStatus = 'Overdue';
                else if (paid > 0) displayStatus = 'Partially Paid';
                else displayStatus = 'Pending';
              } else if (displayStatus === 'Pending' && isOverdue) {
                displayStatus = 'Overdue';
              }
              const statusBadgeClass = displayStatus === 'Paid' ? 'badge-ready' : displayStatus === 'Overdue' ? 'badge-overdue' : displayStatus === 'Partially Paid' ? 'badge-blue' : 'badge-fermenting';
              return `
                <tr>
                  <td><strong style="color:var(--brand-blue);">${invNum}</strong></td>
                  <td>${store.formatDate(s.invoice_date||s.date)}</td>
                  <td><strong>${custName}</strong></td>
                  <td>${store.formatNumber(bales)} bales</td>
                  <td>₹ ${rate}</td>
                  <td><strong>${store.formatINR(total)}</strong></td>
                  <td><span class="text-green">${store.formatINR(paid)}</span></td>
                  <td>
                    <span class="${pending>0?'text-red':'text-green'} text-bold">${store.formatINR(pending)}</span>
                    ${isOverdue ? '<span class="badge badge-overdue" style="margin-left:4px;">OVERDUE</span>' : ''}
                  </td>
                  <td>${store.formatDate(dueDate)}</td>
                  <td><span class="badge ${statusBadgeClass}">${displayStatus}</span></td>
                  <td>
                    <button class="btn-navy" style="padding:5px 10px;font-size:0.8rem;" onclick="window.viewInvoiceDetail('${s.id}')">View / Pay</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.viewInvoiceDetail = async function(invoiceId) {
  showLoading('Loading invoice…');
  let sale;
  try {
    sale = await salesService.getById(invoiceId);
  } catch(e) {
    sale = store.data.sales.find(s => s.id === invoiceId);
  }
  hideLoading();
  if (!sale) return;

  const today = store.getCurrentDate();
  const dueDate = sale.due_date || sale.dueDate || '';
  const pending = sale.balance_pending || sale.balancePending || 0;
  const isOverdue = pending > 0 && dueDate && new Date(dueDate) < new Date(today);
  const lineItems = sale.sale_line_items || sale.stockAllocations || [];
  const payments = sale.sale_payments || sale.paymentHistory || [];

  let displayStatus = sale.status;
  if (!displayStatus || displayStatus === 'undefined') {
    if (pending <= 0) displayStatus = 'Paid';
    else if (isOverdue) displayStatus = 'Overdue';
    else if ((sale.amount_paid || sale.amountPaid || 0) > 0) displayStatus = 'Partially Paid';
    else displayStatus = 'Pending';
  } else if (displayStatus === 'Pending' && isOverdue) {
    displayStatus = 'Overdue';
  }
  const statusBadgeClass = displayStatus === 'Paid' ? 'badge-ready' : displayStatus === 'Overdue' ? 'badge-overdue' : displayStatus === 'Partially Paid' ? 'badge-blue' : 'badge-fermenting';

  modalTitle.innerHTML = `Invoice ${sale.invoice_number||sale.invoiceNumber} • ${sale.customers?.name||sale.customerName} <span class="badge ${statusBadgeClass}" style="margin-left:8px;font-size:0.8rem;">${displayStatus}</span>`;
  modalBody.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;background:var(--grey-bg);padding:18px;border-radius:var(--radius-md);margin-bottom:20px;">
      <div>
        <div style="font-size:0.82rem;color:var(--text-muted);">Invoice Total</div>
        <div style="font-size:1.35rem;font-weight:700;color:var(--primary-navy);">${store.formatINR(sale.invoice_total||sale.invoiceTotal)}</div>
        <div style="font-size:0.85rem;color:var(--text-sub);margin-top:4px;">
          ${store.formatNumber(sale.bales_count||sale.balesCount)} bales @ ₹ ${sale.rate_per_bale||sale.ratePerBale}
        </div>
      </div>
      <div>
        <div style="font-size:0.82rem;color:var(--text-muted);">Credit Pending</div>
        <div style="font-size:1.35rem;font-weight:700;color:${pending>0?'var(--red-accent)':'var(--green-accent)'};">${store.formatINR(pending)}</div>
        <div style="font-size:0.85rem;margin-top:4px;">Due: <strong>${store.formatDate(dueDate)}</strong> ${isOverdue?'<span class="badge badge-overdue">OVERDUE</span>':''}</div>
      </div>
    </div>

    <div style="margin-bottom:20px;">
      <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;color:var(--primary-navy);">Stock Taken From:</h4>
      <table class="app-table" style="font-size:0.82rem;">
        <thead><tr><th>Plot</th><th>Batch</th><th>Bales Dispatched</th><th>Rate/Bale</th></tr></thead>
        <tbody>
          ${lineItems.map(li => `
            <tr>
              <td><span class="badge badge-ready">Plot ${li.plot_name||li.plotId||''}</span></td>
              <td><strong>${li.batch_number||li.batchNumber||''}</strong></td>
              <td><strong>${store.formatNumber(li.bales_sold||li.bales)} bales</strong></td>
              <td>₹ ${li.rate_per_bale||li.ratePerBale||''}</td>
            </tr>
          `).join('')}
          ${lineItems.length===0?'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No line items</td></tr>':''}
        </tbody>
      </table>
    </div>

    <div style="margin-bottom:20px;">
      <h4 style="font-size:0.9rem;font-weight:700;color:var(--primary-navy);margin-bottom:8px;">
        Payment History <span style="font-weight:400;font-size:0.75rem;color:var(--text-muted);">(Append-only, permanent audit log)</span>
      </h4>
      <table class="app-table" style="font-size:0.82rem;">
        <thead><tr><th>Date</th><th>Mode</th><th>Amount Paid</th><th>Balance After</th><th>Note</th></tr></thead>
        <tbody>
          ${payments.length>0 ? payments.map(pay => `
            <tr>
              <td>${pay.payment_date||pay.date||''}</td>
              <td><span class="badge badge-blue">${pay.payment_mode||pay.mode||''}</span></td>
              <td><strong class="text-green">${store.formatINR(pay.amount||pay.amountPaid)}</strong></td>
              <td><strong>${store.formatINR(pay.balance_after||pay.balanceAfter)}</strong></td>
              <td>${pay.note||'--'}</td>
            </tr>
          `).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No payments recorded yet</td></tr>'}
        </tbody>
      </table>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      ${pending>0 ? `<button class="btn-primary" onclick="window.openAddPaymentModal('${sale.id}')">＋ Add Payment</button>` : ''}
      <button class="btn-secondary" onclick="window.attachSaleReceipt('${sale.id}')">📎 Attach Receipt</button>
    </div>
  `;
  openModal();
};

window.openAddPaymentModal = function(saleId) {
  const sale = store.data.sales.find(s => s.id === saleId);
  if (!sale) return;
  const pending = sale.balance_pending || sale.balancePending || 0;
  const custName = sale.customers?.name || sale.customerName || '';

  modalTitle.textContent = `Record Payment • ${sale.invoice_number||sale.invoiceNumber}`;
  modalBody.innerHTML = `
    <form id="recordPaymentForm">
      <div style="background:var(--grey-bg);padding:12px;border-radius:var(--radius-md);margin-bottom:16px;">
        <div>Customer: <strong>${custName}</strong></div>
        <div>Current Pending: <strong class="text-red">${store.formatINR(pending)}</strong></div>
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Payment Date</label>
          <input type="date" id="pay_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Amount Paid (₹)</label>
          <input type="number" id="pay_amount" class="form-input" max="${pending}" value="${Math.min(40000, pending)}" min="1" required />
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Payment Mode</label>
          <select id="pay_mode" class="form-select">
            <option value="UPI">UPI</option>
            <option value="Cash" selected>Cash</option>
            <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Payment Note</label>
          <input type="text" id="pay_note" class="form-input" value="Part payment" />
        </div>
      </div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin:12px 0;">⚠️ Payment entries are append-only and cannot be altered once saved.</div>
      <div id="payError" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:10px;font-size:0.85rem;"></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:12px;">
        <button type="button" class="btn-secondary" onclick="window.viewInvoiceDetail('${saleId}')">Back</button>
        <button type="submit" id="payBtn" class="btn-primary">Record Payment</button>
      </div>
    </form>
  `;

  document.getElementById('recordPaymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('payBtn');
    const errDiv = document.getElementById('payError');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      await store.addSalePayment(saleId, {
        date: document.getElementById('pay_date').value,
        amountPaid: document.getElementById('pay_amount').value,
        mode: document.getElementById('pay_mode').value,
        note: document.getElementById('pay_note').value
      });
      dashboardMetrics = null; // invalidate dashboard so it refreshes
      await window.viewInvoiceDetail(saleId);
      showToast('Payment recorded successfully');
    } catch(err) {
      errDiv.textContent = err.message;
      errDiv.style.display = 'block';
      btn.textContent = 'Record Payment'; btn.disabled = false;
    }
  });
};

window.openNewInvoiceModal = function(opts = {}) {
  const readyPlots = store.data.plots.filter(p => p.status === 'Ready' && p.bales > 0);
  const customers = store.data.customers;

  modalTitle.textContent = 'New Bale Invoice';
  modalBody.innerHTML = `
    <form id="newSaleInvoiceForm">
      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Customer <span style="color:var(--red-accent);">*</span></label>
          <div style="display:flex;gap:6px;">
            <select id="s_customer" class="form-select" style="flex:1;" required>
              <option value="">-- Select Customer --</option>
              <option value="_add_new" style="font-weight:600;color:var(--brand-blue);">＋ Add New Customer...</option>
              ${customers.map(c => {
                const bal = c.balancePending || c.balance_pending || 0;
                return `<option value="${c.id}">${c.name} (Bal: ${store.formatINR(bal)})</option>`;
              }).join('')}
            </select>
            <button type="button" class="btn-secondary" id="addNewCustBtn" style="padding:7px 10px;font-size:0.8rem;white-space:nowrap;" title="Add New Customer">＋ New</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Invoice Date</label>
          <input type="date" id="s_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Due Date</label>
          <input type="date" id="s_dueDate" class="form-input" value="${store.addDays(store.getCurrentDate(), 30)}" required />
        </div>
      </div>

      <!-- Inline Quick Add Customer (Preserves all entered invoice items!) -->
      <div id="inlineQuickCustPanel" style="display:none;background:#f8fafc;border:1px solid #cbd5e1;border-radius:var(--radius-md);padding:14px;margin-bottom:16px;">
        <div style="font-weight:700;font-size:0.88rem;color:var(--primary-navy);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
          <span>👤 Add New Customer (Quick Inline)</span>
          <button type="button" id="closeQuickCustBtn" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--text-muted);">&times;</button>
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Customer Name <span style="color:var(--red-accent);">*</span></label>
            <input type="text" id="qc_name" class="form-input" placeholder="e.g. Ramesh Reddy" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="tel" id="qc_phone" class="form-input" placeholder="+91 98765 43210" />
          </div>
        </div>
        <div class="form-grid-2" style="margin-top:8px;">
          <div class="form-group">
            <label class="form-label">Address</label>
            <input type="text" id="qc_address" class="form-input" placeholder="Town / District" />
          </div>
          <div class="form-group">
            <label class="form-label">Credit Limit (₹)</label>
            <input type="number" id="qc_creditLimit" class="form-input" value="300000" min="0" />
          </div>
        </div>
        <div id="qcError" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:6px;padding:8px;font-size:0.82rem;margin-top:8px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
          <button type="button" id="cancelQuickCustBtn" class="btn-secondary" style="padding:5px 12px;font-size:0.82rem;">Cancel</button>
          <button type="button" id="saveQuickCustBtn" class="btn-primary" style="padding:5px 14px;font-size:0.82rem;">Save & Select Customer</button>
        </div>
      </div>

      <div style="background:#f0fdf4;border:1px solid var(--green-border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;">
        <div style="font-weight:700;color:var(--green-text);font-size:0.9rem;margin-bottom:8px;">🌾 Select Ready Plots for Stock Dispatch</div>
        ${readyPlots.length===0 ? '<div style="color:var(--text-muted);font-size:0.85rem;">No ready-for-sale plots available! Complete fermentation first.</div>' : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
          ${readyPlots.map(p => {
            const isChecked = opts.preselectedPlotName === p.plot_name;
            return `
              <label style="display:flex;align-items:center;gap:8px;background:#fff;padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border-light);cursor:pointer;">
                <input type="checkbox" name="selectedReadyPlots" value="${p.plot_name}" data-max="${p.bales}" ${isChecked?'checked':''} />
                <div>
                  <strong>Plot ${p.plot_name}</strong> (${p.batchNumber||''})
                  <div style="font-size:0.75rem;color:var(--text-muted);">${p.bales} bales available</div>
                </div>
              </label>
            `;
          }).join('')}
        </div>
      </div>

      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Total Bales Sold</label>
          <input type="number" id="s_balesCount" class="form-input" value="" min="1" required />
        </div>
        <div class="form-group">
          <label class="form-label">Rate / Bale (₹)</label>
          <input type="number" id="s_ratePerBale" class="form-input" value="285" min="1" required />
        </div>
        <div class="form-group">
          <label class="form-label">GST Rate (%)</label>
          <input type="number" id="s_gstRate" class="form-input" value="0" min="0" max="28" />
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Amount Paid Now (₹)</label>
          <input type="number" id="s_amountPaid" class="form-input" value="0" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Payment Mode</label>
          <select id="s_mode" class="form-select">
            <option value="UPI" selected>UPI</option>
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
      </div>

      <div style="background:var(--grey-bg);border-radius:var(--radius-md);padding:14px;margin:16px 0;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-size:0.8rem;color:var(--text-muted);">Invoice Total:</span>
          <div style="font-size:1.3rem;font-weight:700;color:var(--brand-blue);" id="s_calcInvoiceTotal">₹ 0</div>
        </div>
        <div>
          <span style="font-size:0.8rem;color:var(--text-muted);">Balance Pending:</span>
          <div style="font-size:1.3rem;font-weight:700;color:var(--red-accent);" id="s_calcPending">₹ 0</div>
        </div>
      </div>

      <div id="saleError" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:10px;font-size:0.85rem;"></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" id="saveSaleBtn" class="btn-primary">Generate Invoice</button>
      </div>
    </form>
  `;

  const updateSaleCalc = () => {
    const bales = Number(document.getElementById('s_balesCount').value) || 0;
    const rate = Number(document.getElementById('s_ratePerBale').value) || 0;
    const gstRate = Number(document.getElementById('s_gstRate').value) || 0;
    const paid = Number(document.getElementById('s_amountPaid').value) || 0;
    const sub = bales * rate;
    const gst = Math.round((sub * gstRate) / 100);
    const total = sub + gst;
    document.getElementById('s_calcInvoiceTotal').textContent = store.formatINR(total);
    document.getElementById('s_calcPending').textContent = store.formatINR(Math.max(0, total - paid));
  };

  ['s_balesCount','s_ratePerBale','s_gstRate','s_amountPaid'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateSaleCalc);
  });

  // Handle Inline Quick Add Customer
  const quickPanel = document.getElementById('inlineQuickCustPanel');
  const custSelect = document.getElementById('s_customer');

  const openQuickPanel = () => {
    if (quickPanel) {
      quickPanel.style.display = 'block';
      document.getElementById('qc_name')?.focus();
    }
  };

  const closeQuickPanel = () => {
    if (quickPanel) {
      quickPanel.style.display = 'none';
      if (custSelect.value === '_add_new') custSelect.value = '';
    }
  };

  document.getElementById('addNewCustBtn')?.addEventListener('click', openQuickPanel);
  custSelect?.addEventListener('change', (e) => {
    if (e.target.value === '_add_new') openQuickPanel();
    else closeQuickPanel();
  });
  document.getElementById('closeQuickCustBtn')?.addEventListener('click', closeQuickPanel);
  document.getElementById('cancelQuickCustBtn')?.addEventListener('click', closeQuickPanel);

  document.getElementById('saveQuickCustBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveQuickCustBtn');
    const errDiv = document.getElementById('qcError');
    const name = document.getElementById('qc_name').value.trim();
    if (!name) {
      errDiv.textContent = 'Customer name is required.';
      errDiv.style.display = 'block';
      return;
    }
    btn.textContent = 'Saving…'; btn.disabled = true;
    errDiv.style.display = 'none';
    try {
      const newCust = await customersService.create({
        name,
        phone: document.getElementById('qc_phone').value.trim() || '',
        address: document.getElementById('qc_address').value.trim() || '',
        credit_limit: Number(document.getElementById('qc_creditLimit').value) || 300000,
        is_active: true
      });
      // Add to store in-memory list
      if (!store.data.customers) store.data.customers = [];
      const formattedCust = { ...newCust, balancePending: 0, totalPurchased: 0, totalPaid: 0 };
      store.data.customers.push(formattedCust);
      store.notify();

      // Add to dropdown and select it without resetting any other invoice inputs
      const opt = document.createElement('option');
      opt.value = newCust.id;
      opt.textContent = `${newCust.name} (Bal: ₹ 0)`;
      custSelect.appendChild(opt);
      custSelect.value = newCust.id;

      closeQuickPanel();
      showToast(`Customer "${name}" added and selected!`);
    } catch(err) {
      const msg = err.message || 'Error saving customer.';
      errDiv.textContent = msg.includes('duplicate') ? `A customer named "${name}" already exists.` : msg;
      errDiv.style.display = 'block';
    } finally {
      btn.textContent = 'Save & Select Customer';
      btn.disabled = false;
    }
  });

  document.getElementById('newSaleInvoiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveSaleBtn');
    const errDiv = document.getElementById('saleError');
    btn.textContent = 'Saving…'; btn.disabled = true;
    errDiv.style.display = 'none';
    try {
      const custId = document.getElementById('s_customer').value;
      if (!custId) throw new Error('Please select a customer before saving.');

      const checked = Array.from(document.querySelectorAll('input[name="selectedReadyPlots"]:checked'));
      const totalBales = Number(document.getElementById('s_balesCount').value) || 0;
      let remaining = totalBales;
      const allocations = [];

      checked.forEach(cb => {
        if (remaining <= 0) return;
        const plot = store.data.plots.find(p => p.plot_name === cb.value);
        if (plot) {
          const take = Math.min(plot.bales, remaining);
          allocations.push({ plotId: cb.value, bales: take });
          remaining -= take;
        }
      });

      if (remaining > 0 && allocations.length === 0) {
        throw new Error('Please select at least one ready plot to allocate stock from.');
      }

      const customer = store.data.customers.find(c => c.id === custId);
      await store.addSale({
        customerId: custId,
        customerName: customer?.name || '',
        date: document.getElementById('s_date').value,
        dueDate: document.getElementById('s_dueDate').value,
        balesCount: totalBales,
        ratePerBale: document.getElementById('s_ratePerBale').value,
        gstRate: document.getElementById('s_gstRate').value,
        amountPaid: document.getElementById('s_amountPaid').value,
        paymentMode: document.getElementById('s_mode').value,
        allocations
      });
      dashboardMetrics = null; // force dashboard refresh
      closeModal();
      renderSales();
      showToast('Invoice created successfully!');
    } catch(err) {
      errDiv.textContent = err.message || 'Error creating invoice.';
      errDiv.style.display = 'block';
      btn.textContent = 'Generate Invoice'; btn.disabled = false;
    }
  });
  openModal();
};

// ─────────────────────────────────────────────────────────────────
// ADD NEW CUSTOMER MODAL
// ─────────────────────────────────────────────────────────────────
window.openAddCustomerModal = function(onSuccess) {
  modalTitle.textContent = 'Add New Customer';
  modalBody.innerHTML = `
    <form id="addCustomerForm">
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Customer Name <span style="color:var(--red-accent);">*</span></label>
          <input type="text" id="nc_name" class="form-input" placeholder="e.g. Ravi Shankar" required />
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input type="tel" id="nc_phone" class="form-input" placeholder="+91 98765 43210" />
        </div>
      </div>
      <div class="form-group mb-12">
        <label class="form-label">Address</label>
        <input type="text" id="nc_address" class="form-input" placeholder="Village / Town, District" />
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">GST Number</label>
          <input type="text" id="nc_gst" class="form-input" placeholder="36AAAAA0000A1Z5" style="text-transform:uppercase;" />
        </div>
        <div class="form-group">
          <label class="form-label">Credit Limit (₹)</label>
          <input type="number" id="nc_creditLimit" class="form-input" value="300000" min="0" />
        </div>
      </div>
      <div id="ncError" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:10px;margin-top:10px;font-size:0.85rem;"></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" id="saveCustomerBtn" class="btn-primary">Save Customer</button>
      </div>
    </form>
  `;

  document.getElementById('addCustomerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveCustomerBtn');
    const errDiv = document.getElementById('ncError');
    const name = document.getElementById('nc_name').value.trim();
    if (!name) { errDiv.textContent = 'Customer name is required.'; errDiv.style.display = 'block'; return; }
    btn.textContent = 'Saving…'; btn.disabled = true;
    errDiv.style.display = 'none';
    try {
      const newCust = await customersService.create({
        name,
        phone: document.getElementById('nc_phone').value.trim() || '',
        address: document.getElementById('nc_address').value.trim() || '',
        gst_number: document.getElementById('nc_gst').value.trim().toUpperCase() || '',
        credit_limit: Number(document.getElementById('nc_creditLimit').value) || 300000,
        is_active: true
      });
      // Add to in-memory store so it's immediately available
      if (!store.data.customers) store.data.customers = [];
      store.data.customers.push({ ...newCust, balancePending: 0, totalPurchased: 0, totalPaid: 0 });
      store.notify();
      closeModal();
      showToast(`Customer "${name}" added successfully!`);
      if (typeof onSuccess === 'function') onSuccess(newCust);
    } catch(err) {
      const msg = err.message || 'Error saving customer.';
      // Surface duplicate key errors helpfully
      const displayMsg = msg.includes('duplicate') ? `A customer named "${name}" already exists.` : msg;
      errDiv.textContent = displayMsg;
      errDiv.style.display = 'block';
      btn.textContent = 'Save Customer'; btn.disabled = false;
    }
  });
  openModal();
};

window.openCustomerDetail = function(customerId) {
  const cust = store.data.customers.find(c => c.id === customerId);
  if (!cust) return;
  const custSales = store.data.sales.filter(s => s.customer_id === customerId || s.customers?.name === cust.name);
  const bal = cust.balancePending || cust.balance_pending || 0;
  const limit = cust.creditLimit || cust.credit_limit || 300000;

  modalTitle.textContent = `Customer: ${cust.name}`;
  modalBody.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:var(--grey-bg);padding:16px;border-radius:var(--radius-md);margin-bottom:20px;">
      <div><span style="font-size:0.78rem;color:var(--text-muted);display:block;">Total Purchases</span><strong>${store.formatINR(cust.totalPurchased||cust.total_purchased||0)}</strong></div>
      <div><span style="font-size:0.78rem;color:var(--text-muted);display:block;">Pending Receivable</span><strong class="text-red">${store.formatINR(bal)}</strong></div>
      <div><span style="font-size:0.78rem;color:var(--text-muted);display:block;">Credit Limit</span><strong>${store.formatINR(limit)}</strong></div>
    </div>
    ${bal > limit ? '<div style="background:#fee2e2;color:#b91c1c;padding:10px;border-radius:8px;margin-bottom:12px;font-size:0.85rem;">⚠️ Customer has exceeded credit limit!</div>' : ''}
    <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">Invoice History</h4>
    <table class="app-table" style="font-size:0.82rem;">
      <thead><tr><th>Invoice</th><th>Date</th><th>Bales</th><th>Total</th><th>Pending</th><th>Status</th></tr></thead>
      <tbody>
        ${custSales.map(s => {
          const sp = s.balance_pending || s.balancePending || 0;
          const sd = s.due_date || s.dueDate || '';
          const isOv = sp > 0 && sd && new Date(sd) < new Date(today);
          let ds = s.status;
          if (!ds || ds === 'undefined') ds = sp <= 0 ? 'Paid' : (isOv ? 'Overdue' : ((s.amount_paid||s.amountPaid||0) > 0 ? 'Partially Paid' : 'Pending'));
          else if (ds === 'Pending' && isOv) ds = 'Overdue';
          const sc = ds === 'Paid' ? 'badge-ready' : ds === 'Overdue' ? 'badge-overdue' : ds === 'Partially Paid' ? 'badge-blue' : 'badge-fermenting';
          return `
          <tr style="cursor:pointer;" onclick="window.viewInvoiceDetail('${s.id}')">
            <td><strong style="color:var(--brand-blue);">${s.invoice_number||s.invoiceNumber}</strong></td>
            <td>${store.formatDate(s.invoice_date||s.date)}</td>
            <td>${s.bales_count||s.balesCount}</td>
            <td>${store.formatINR(s.invoice_total||s.invoiceTotal)}</td>
            <td class="${sp>0?'text-red':'text-green'}">${store.formatINR(sp)}</td>
            <td><span class="badge ${sc}">${ds}</span></td>
          </tr>
        `;
        }).join('')}
        ${custSales.length===0?'<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No invoices yet</td></tr>':''}
      </tbody>
    </table>
  `;
  openModal();
};

// ─────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────
function renderExpenses() {
  const isFinance = store.canViewFinancials();
  if (!isFinance) { appContent.innerHTML = `<div style="padding:40px;text-align:center;">Staff cannot access operating expenses.</div>`; return; }

  const expenses = store.data.expenses;
  const totalAmt = expenses.reduce((s,e) => s + (Number(e.amount)||0), 0);

  appContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
      <div style="font-size:0.9rem;color:var(--text-sub);">Record every business expense so profit is always based on real numbers. Total: <strong>${store.formatINR(totalAmt)}</strong></div>
      <button class="btn-primary" onclick="window.openNewExpenseModal()">＋ Add Expense</button>
    </div>
    <div class="section-box">
      <div class="section-box-header"><div class="box-title">Operating & Factory Expense Log</div></div>
      <div class="data-table-wrapper">
        <table class="app-table">
          <thead>
            <tr>
              <th>Date</th><th>Paid To</th><th>Reason / Particulars</th><th>Category</th>
              <th>Amount</th><th>Mode</th><th>Related Batch</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${expenses.length===0 ? '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">No expenses recorded. Click "+ Add Expense" to start.</td></tr>' : ''}
            ${expenses.map(exp => {
              const batchNum = exp.related_batch_number || exp.relatedBatch || '';
              return `
                <tr>
                  <td>${store.formatDate(exp.expense_date||exp.date)}</td>
                  <td><strong>${exp.paid_to||exp.paidTo}</strong></td>
                  <td>${exp.reason}</td>
                  <td><span class="badge badge-blue">${exp.category}</span></td>
                  <td><strong class="text-red">${store.formatINR(exp.amount)}</strong></td>
                  <td>${exp.payment_mode||exp.mode}</td>
                  <td>${batchNum ? `<strong style="color:var(--brand-blue);">${batchNum}</strong>` : '--'}</td>
                  <td>
                    ${store.canDelete() ? `<button class="btn-danger" onclick="window.deleteExpense('${exp.id}')">Delete</button>` : '--'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.openNewExpenseModal = function() {
  const batches = store.data.batches;
  modalTitle.textContent = 'Add Business Expense';
  modalBody.innerHTML = `
    <form id="newExpenseForm">
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Paid To</label>
          <input type="text" id="exp_paidTo" class="form-input" placeholder="e.g. Diesel Pump, Factory Labour Gang" required />
        </div>
        <div class="form-group">
          <label class="form-label">Amount (₹)</label>
          <input type="number" id="exp_amount" class="form-input" min="1" placeholder="e.g. 3500" required />
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" id="exp_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Payment Mode</label>
          <select id="exp_mode" class="form-select">
            <option value="Cash" selected>Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="exp_category" class="form-select">
            <option value="Production" selected>Production</option>
            <option value="Employees">Employees</option>
            <option value="Transport">Transport</option>
            <option value="Factory">Factory</option>
            <option value="Sales">Sales</option>
            <option value="Office and admin">Office and admin</option>
            <option value="Miscellaneous">Miscellaneous</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Related Batch (Optional)</label>
          <select id="exp_batch" class="form-select">
            <option value="">None (General Expense)</option>
            ${batches.map(b => `<option value="${b.batch_number||b.batchNumber}">${b.batch_number||b.batchNumber}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group mb-16">
        <label class="form-label">Reason / Particulars</label>
        <input type="text" id="exp_reason" class="form-input" placeholder="e.g. Baler machinery diesel & tractor fuel" required />
      </div>
      <div class="attachment-box">
        <div>
          <div style="font-weight:600;font-size:0.85rem;">Attach Bill Photo / Voucher (Optional, Max 5MB)</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">Proof for audits and taxation</div>
        </div>
        <div class="attachment-buttons">
          <label class="attach-btn" style="cursor:pointer;">
            📷 Photo / File
            <input type="file" id="exp_fileInput" accept="image/*,application/pdf" style="display:none;" />
          </label>
          <span id="expAttachTag" class="attach-preview-tag">No file chosen</span>
        </div>
      </div>
      <div id="expError" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:10px;margin-top:10px;font-size:0.85rem;"></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" id="saveExpenseBtn" class="btn-primary">Save Expense</button>
      </div>
    </form>
  `;

  document.getElementById('exp_fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) document.getElementById('expAttachTag').textContent = e.target.files[0].name;
  });

  document.getElementById('newExpenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveExpenseBtn');
    const errDiv = document.getElementById('expError');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      const expResult = await store.addExpense({
        paidTo: document.getElementById('exp_paidTo').value,
        amount: document.getElementById('exp_amount').value,
        date: document.getElementById('exp_date').value,
        mode: document.getElementById('exp_mode').value,
        category: document.getElementById('exp_category').value,
        relatedBatch: document.getElementById('exp_batch').value,
        reason: document.getElementById('exp_reason').value
      });

      const fileInput = document.getElementById('exp_fileInput');
      if (fileInput.files.length > 0 && expResult?.id) {
        try { await attachmentsService.upload(fileInput.files[0], 'expense', expResult.id); } catch(e2) {}
      }

      closeModal();
      renderExpenses();
      showToast('Expense saved successfully');
    } catch(err) {
      errDiv.textContent = err.message;
      errDiv.style.display = 'block';
      btn.textContent = 'Save Expense'; btn.disabled = false;
    }
  });
  openModal();
};

window.deleteExpense = async function(id) {
  if (!confirm('Are you sure you want to delete this expense record?')) return;
  try {
    await store.deleteRecord('expense', id);
    renderExpenses();
    showToast('Expense deleted');
  } catch(err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ─────────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────────
function renderReports() {
  const isFinance = store.canViewFinancials();
  if (!isFinance) { appContent.innerHTML = `<div style="padding:40px;text-align:center;">Staff cannot access financial reports.</div>`; return; }

  appContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
      <div class="filters-group">
        <button class="filter-chip ${activeReportTab==='pnl'?'active':''}" onclick="window.switchReport('pnl')">📊 Profit & Loss</button>
        <button class="filter-chip ${activeReportTab==='customers'?'active':''}" onclick="window.switchReport('customers')">💼 Customer Balances</button>
        <button class="filter-chip ${activeReportTab==='suppliers'?'active':''}" onclick="window.switchReport('suppliers')">🛒 Supplier Balances</button>
        <button class="filter-chip ${activeReportTab==='batches'?'active':''}" onclick="window.switchReport('batches')">🏭 Cost & Profit / Batch</button>
      </div>
      <button class="btn-navy" onclick="window.exportCurrentReport()">📥 Download Excel</button>
    </div>
    <div id="reportContainer">${renderActiveReportContent()}</div>
  `;
}

function renderActiveReportContent() {
  if (activeReportTab === 'pnl') {
    const sales = store.data.sales;
    const expenses = store.data.expenses;
    const totalSales = sales.reduce((s, r) => s + (Number(r.invoice_total||r.invoiceTotal)||0), 0);
    const totalCOGS = sales.reduce((s, r) => s + (Number(r.cogs_total||r.cogsTotal)||0), 0);
    const grossProfit = totalSales - totalCOGS;
    const byCategory = {};
    expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category]||0) + Number(e.amount); });
    const totalExpenses = Object.values(byCategory).reduce((a,b) => a+b, 0);
    const netProfit = grossProfit - totalExpenses;

    return `
      <div class="section-box" style="max-width:850px;margin:0 auto;">
        <div class="section-box-header">
          <div class="box-title">Profit & Loss Statement</div>
          <span style="font-size:0.85rem;color:var(--text-muted);">Calculated from all saved records</span>
        </div>
        <table class="app-table" id="exportTable">
          <tbody>
            <tr style="background:#f8fafc;font-weight:700;">
              <td>Revenue from Bale Sales</td>
              <td style="text-align:right;font-size:1.1rem;color:var(--brand-blue);">${store.formatINR(totalSales)}</td>
            </tr>
            <tr>
              <td style="padding-left:24px;color:var(--text-sub);">Less: Cost of Goods Sold (from batches)</td>
              <td style="text-align:right;color:var(--red-accent);">(${store.formatINR(totalCOGS)})</td>
            </tr>
            <tr style="background:#f0fdf4;font-weight:700;border-top:2px solid var(--border-light);border-bottom:2px solid var(--border-light);">
              <td>Gross Profit</td>
              <td style="text-align:right;font-size:1.15rem;color:var(--green-text);">${store.formatINR(grossProfit)}</td>
            </tr>
            <tr style="background:#f8fafc;font-weight:700;">
              <td colspan="2">Operating Expenses by Category</td>
            </tr>
            ${Object.entries(byCategory).map(([cat, amt]) => `
              <tr>
                <td style="padding-left:24px;color:var(--text-sub);">${cat} Expenses</td>
                <td style="text-align:right;">(${store.formatINR(amt)})</td>
              </tr>
            `).join('')}
            <tr style="font-weight:600;color:var(--red-text);">
              <td style="padding-left:24px;">Total Operating Expenses</td>
              <td style="text-align:right;">(${store.formatINR(totalExpenses)})</td>
            </tr>
            <tr style="background:${netProfit>=0?'#dcfce7':'#fee2e2'};font-weight:700;font-size:1.25rem;">
              <td>Net Profit (Before Tax)</td>
              <td style="text-align:right;color:${netProfit>=0?'var(--green-text)':'var(--red-text)'};">${store.formatINR(netProfit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  if (activeReportTab === 'customers') {
    return `
      <div class="section-box">
        <div class="section-box-header"><div class="box-title">Customer Balances & Receivables</div></div>
        <table class="app-table" id="exportTable">
          <thead><tr><th>Customer</th><th>Phone</th><th>Total Purchases</th><th>Total Paid</th><th>Balance Pending</th><th>Credit Limit</th><th>Status</th></tr></thead>
          <tbody>
            ${store.data.customers.map(c => {
              const bal = c.balancePending || c.balance_pending || 0;
              return `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.phone||''}</td>
                  <td>${store.formatINR(c.totalPurchased||c.total_purchased||0)}</td>
                  <td>${store.formatINR(c.totalPaid||c.total_paid||0)}</td>
                  <td><strong class="text-red">${store.formatINR(bal)}</strong></td>
                  <td>${store.formatINR(c.creditLimit||c.credit_limit||0)}</td>
                  <td><span class="badge ${bal>0?'badge-overdue':'badge-ready'}">${bal>0?'Pending Dues':'Zero Balance'}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  if (activeReportTab === 'suppliers') {
    return `
      <div class="section-box">
        <div class="section-box-header"><div class="box-title">Supplier Balances & Payables</div></div>
        <table class="app-table" id="exportTable">
          <thead><tr><th>Supplier</th><th>Phone</th><th>City</th><th>Total Purchased</th><th>Total Paid</th><th>Balance Pending</th></tr></thead>
          <tbody>
            ${store.data.suppliers.map(s => `
              <tr>
                <td><strong>${s.name}</strong></td>
                <td>${s.phone||''}</td>
                <td>${s.city||''}</td>
                <td>${store.formatINR(s.totalPurchased||0)}</td>
                <td>${store.formatINR(s.totalPaid||0)}</td>
                <td><strong class="text-red">${store.formatINR(s.balancePending||0)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  if (activeReportTab === 'batches') {
    const sellingRate = 285; // default — can be made configurable
    return `
      <div class="section-box">
        <div class="section-box-header"><div class="box-title">Cost and Profit per Batch</div></div>
        <table class="app-table" id="exportTable">
          <thead>
            <tr><th>Batch</th><th>Prod Date</th><th>Finished Bales</th><th>Total Prod Cost</th><th>Cost / Bale</th><th>Plot</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${store.data.batches.map(b => `
              <tr>
                <td><strong style="color:var(--brand-blue);">${b.batch_number||b.batchNumber}</strong></td>
                <td>${store.formatDate(b.production_date||b.productionDate)}</td>
                <td>${store.formatNumber(b.finished_bales||b.finishedBales)}</td>
                <td>${store.formatINR(b.total_production_cost||b.totalProductionCost||0)}</td>
                <td><span class="badge badge-blue">₹ ${Math.round(b.cost_per_bale||b.costPerBale||0)}</span></td>
                <td>${b.plot_name||b.plots?.plot_name||b.plotAssigned||''}</td>
                <td><span class="badge ${b.status==='Ready'?'badge-ready':'badge-fermenting'}">${b.status}</span></td>
              </tr>
            `).join('')}
            ${store.data.batches.length===0?'<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No batches yet</td></tr>':''}
          </tbody>
        </table>
      </div>
    `;
  }
  return '';
}

window.switchReport = function(tab) { activeReportTab = tab; renderReports(); };

window.exportCurrentReport = function() {
  const table = document.getElementById('exportTable');
  if (!table) { alert('No table to export'); return; }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.table_to_sheet(table);
  XLSX.utils.book_append_sheet(wb, ws, activeReportTab);

  const filename = `BMS_${activeReportTab}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast('Excel file downloaded!');
};

// ─────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────
function renderSettings() {
  const isOwner = store.canManageUsers();
  const settings = store.data.settings;

  appContent.innerHTML = `
    <div style="max-width:800px;margin:0 auto;">
      <div class="section-box mb-20">
        <div class="section-box-header"><div class="box-title">⚙️ Factory & Fermentation Parameters</div></div>
        <form id="settingsForm">
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">Fermentation Duration (Days)</label>
              <input type="number" id="setting_fermDays" class="form-input" value="${settings.fermentationDays||30}" min="1" max="180" required />
              <small style="color:var(--text-muted);font-size:0.75rem;">Default 30 days. Day ${settings.fermentationDays} automatically flags batch as Ready.</small>
            </div>
            <div class="form-group">
              <label class="form-label">Company Name</label>
              <input type="text" id="setting_companyName" class="form-input" value="${settings.companyName||'Sri Balaji Agro Bales'}" />
            </div>
          </div>
          <div id="settingsMsg" style="display:none;background:#dcfce7;color:#15803d;padding:10px;border-radius:8px;margin-top:10px;font-size:0.85rem;"></div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px;">
            <button type="submit" id="saveSettingsBtn" class="btn-primary">Save Settings</button>
          </div>
        </form>
      </div>

      <div class="section-box mb-20">
        <div class="section-box-header"><div class="box-title">🌱 Add New Yard Plot</div></div>
        <form id="addPlotForm">
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">Plot Identifier</label>
              <input type="text" id="new_plotId" class="form-input" placeholder="e.g. C3, D2, E1" required />
            </div>
            <div class="form-group">
              <label class="form-label">Section</label>
              <select id="new_plotSection" class="form-select">
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C" selected>Section C</option>
                <option value="D">Section D</option>
                <option value="E">Section E</option>
              </select>
            </div>
          </div>
          <div id="plotMsg" style="display:none;background:#dcfce7;color:#15803d;padding:10px;border-radius:8px;margin-top:10px;font-size:0.85rem;"></div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px;">
            <button type="submit" class="btn-navy" id="createPlotBtn">+ Create Plot</button>
          </div>
        </form>
      </div>

      <div class="section-box mb-20" style="border-color:#fed7aa;background:#fffaf0;">
        <div class="section-box-header" style="border-color:#fed7aa;">
          <div class="box-title" style="color:#c2410c;">⚡ Rapid Fermentation Testing Mode</div>
        </div>
        <p style="font-size:0.85rem;color:#7c2d12;margin-bottom:12px;">
          Current mode: <strong>${settings.fermentationUnit === 'minute' ? '⚡ 1-Minute Testing Mode' : `📅 Standard (${settings.fermentationDays||30} Days)`}</strong>.
          In 1-minute mode, newly created batches ferment for only 60 seconds with live countdown, then auto-turn Ready.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" class="btn-primary" style="background:#ea580c;color:#fff;" onclick="window.enable1MinTestingMode()">
            ⚡ Set Default: 1-Minute Fermentation
          </button>
          <button type="button" class="btn-secondary" onclick="window.enable30DayMode()">
            📅 Restore Default: 30 Days Fermentation
          </button>
        </div>
      </div>

      <div class="section-box mb-20" style="border:1.5px solid #ef4444;background:#fef2f2;">
        <div class="section-box-header" style="border-bottom:1px solid #fee2e2;">
          <div class="box-title" style="color:#991b1b;display:flex;align-items:center;gap:8px;">
            <span>⚠️</span> <span>Reset Everything (Delete All Data)</span>
          </div>
        </div>
        <p style="font-size:0.85rem;color:#7f1d1d;margin-bottom:14px;line-height:1.45;">
          Permanently delete all data in the system — all purchases, suppliers, customer invoices, sales, payments, expenses, production batches, and attachments. All yard plots will be emptied. <strong>This action wipes all data from the database and cannot be undone.</strong>
        </p>
        <button type="button" class="btn-danger" style="padding:10px 20px;font-weight:700;font-size:0.92rem;background:#dc2626;color:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(220,38,38,0.25);" onclick="window.confirmResetEverything()">
          💣 Reset Everything
        </button>
      </div>

      <div class="section-box mb-20" style="border-color:#fca5a5;background:#fff5f5;">
        <div class="section-box-header" style="border-color:#fecaca;">
          <div class="box-title" style="color:#b91c1c;">👤 Sign Out</div>
        </div>
        <p style="font-size:0.85rem;color:#7f1d1d;margin-bottom:14px;">
          Signed in as: <strong>${store.currentProfile?.full_name || store.currentUser?.email || 'User'}</strong>
          (${store.getRole()})
        </p>
        <button class="btn-danger" onclick="window.signOut()">Sign Out of BMS</button>
      </div>
    </div>
  `;

  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      await store.saveSettings({
        fermentation_days: Number(document.getElementById('setting_fermDays').value),
        company_name: document.getElementById('setting_companyName').value
      });
      store.data.settings.fermentationDays = Number(document.getElementById('setting_fermDays').value);
      const msg = document.getElementById('settingsMsg');
      msg.textContent = 'Settings saved successfully!';
      msg.style.display = 'block';
      showToast('Settings saved');
    } catch(err) {
      showToast('Error: ' + err.message, 'error');
    }
    btn.textContent = 'Save Settings'; btn.disabled = false;
  });

  document.getElementById('addPlotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('createPlotBtn');
    btn.textContent = 'Creating…'; btn.disabled = true;
    const plotId = document.getElementById('new_plotId').value.trim().toUpperCase();
    const section = document.getElementById('new_plotSection').value;
    try {
      await store.addPlot(plotId, section);
      const msg = document.getElementById('plotMsg');
      msg.textContent = `Plot ${plotId} created in Section ${section}!`;
      msg.style.display = 'block';
      document.getElementById('new_plotId').value = '';
      showToast(`Plot ${plotId} added`);
    } catch(err) {
      showToast('Error: ' + err.message, 'error');
    }
    btn.textContent = '+ Create Plot'; btn.disabled = false;
  });
}

// ─────────────────────────────────────────────────────────────────
// MISC
// ─────────────────────────────────────────────────────────────────
window.viewAttachment = async function(storagePath) {
  try {
    const url = await attachmentsService.getSignedUrl(storagePath);
    window.open(url, '_blank');
  } catch(e) {
    showToast('Error loading attachment: ' + e.message, 'error');
  }
};

window.attachSaleReceipt = function(saleId) {
  modalTitle.textContent = `Attach Payment Receipt`;
  modalBody.innerHTML = `
    <div style="padding:10px;">
      <div class="attachment-box">
        <div>
          <div style="font-weight:600;font-size:0.85rem;">Upload Bank Counterfoil or Payment Screenshot</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">Stored permanently against this invoice (Max 5MB)</div>
        </div>
        <div class="attachment-buttons">
          <input type="file" id="receiptFile" class="form-input" accept="image/*,application/pdf" />
        </div>
      </div>
      <div id="uploadProgress" style="display:none;margin-top:10px;font-size:0.85rem;color:var(--text-muted);">Uploading…</div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button class="btn-primary" id="uploadReceiptBtn" onclick="window.doUploadReceipt('${saleId}')">Save Receipt</button>
      </div>
    </div>
  `;
  openModal();
};

window.doUploadReceipt = async function(saleId) {
  const file = document.getElementById('receiptFile')?.files[0];
  if (!file) { showToast('Please select a file', 'warning'); return; }
  const btn = document.getElementById('uploadReceiptBtn');
  btn.textContent = 'Uploading…'; btn.disabled = true;
  try {
    await attachmentsService.upload(file, 'sale', saleId);
    closeModal();
    showToast('Receipt uploaded successfully!');
  } catch(err) {
    showToast('Upload error: ' + err.message, 'error');
    btn.textContent = 'Save Receipt'; btn.disabled = false;
  }
};

function handleQuickAction(action) {
  switch (action) {
    case 'new-expense': window.openNewExpenseModal(); break;
    case 'new-production': window.openNewBatchModal(); break;
    case 'new-purchase': window.openNewPurchaseModal(); break;
    case 'new-sale': window.openNewInvoiceModal(); break;
    case 'update-stock': navigateTo('plots'); break;
  }
}

function openModal(isWide = false) {
  if (isWide && commonModalCard) commonModalCard.classList.add('modal-lg');
  else if (commonModalCard) commonModalCard.classList.remove('modal-lg');
  commonModalOverlay.classList.add('open');
}
function closeModal() {
  commonModalOverlay.classList.remove('open');
  if (commonModalCard) commonModalCard.classList.remove('modal-lg');
}

// Global helpers for inline HTML onclick handlers
window.appNav = navigateTo;
window.closeModal = closeModal;
window.setPlotSection = (sec) => { activePlotSection = sec; renderPlots(); };
window.setPlotStatus = (st) => { activePlotFilter = st; renderPlots(); };
window.openAddPlotModal = () => navigateTo('settings');
window.enable1MinTestingMode = () => {
  store.setFermentationMode('minute', 1);
  showToast('⚡ Default set to 1-Minute Fermentation mode!');
  renderSettings();
};
window.enable30DayMode = () => {
  store.setFermentationMode('day', 30);
  showToast('📅 Default set to 30 Days Fermentation mode.');
  renderSettings();
};
window.confirmResetEverything = function() {
  if (!store.canDelete()) {
    showToast('Access denied. Only the Owner can reset all data.', 'error');
    return;
  }

  modalTitle.textContent = '⚠️ Confirm: Reset Everything';
  modalBody.innerHTML = `
    <div style="padding:6px 0;">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
        <span style="font-size:2.5rem;line-height:1;">💣</span>
        <div>
          <div style="font-size:1.1rem;font-weight:700;color:#991b1b;">Permanently Delete All System Data?</div>
          <div style="font-size:0.88rem;color:var(--text-sub);margin-top:6px;line-height:1.45;">
            This will permanently delete:
            <ul style="margin:8px 0 8px 18px;font-size:0.84rem;color:#7f1d1d;line-height:1.4;">
              <li>All purchase bills, supplier accounts & payment ledgers</li>
              <li>All bale sales, customer invoices & receivables history</li>
              <li>All production batches, costs & fermentation records</li>
              <li>All raw material stock & plot bales (all plots will be set to Empty)</li>
              <li>All uploaded invoice and receipt attachments</li>
              <li>All expense entries & audit movements</li>
            </ul>
            <strong>Are you absolutely sure you want to start completely fresh?</strong>
          </div>
        </div>
      </div>
      <div id="resetError" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:8px;padding:10px;font-size:0.85rem;margin-bottom:12px;"></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="button" id="doResetEverythingBtn" class="btn-danger" style="background:#dc2626;padding:10px 22px;font-weight:700;">
          💣 Yes, Reset Everything Now
        </button>
      </div>
    </div>
  `;

  document.getElementById('doResetEverythingBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('doResetEverythingBtn');
    const errDiv = document.getElementById('resetError');
    btn.textContent = 'Wiping everything…';
    btn.disabled = true;
    errDiv.style.display = 'none';
    try {
      showLoading('Wiping all system and database records…');
      await store.resetAllData();
      dashboardMetrics = null;
      hideLoading();
      closeModal();
      renderDashboard();
      showToast('All data has been completely wiped clean! System reset.', 'info');
    } catch (err) {
      hideLoading();
      errDiv.textContent = err.message || 'Error resetting system.';
      errDiv.style.display = 'block';
      btn.textContent = '💣 Yes, Reset Everything Now';
      btn.disabled = false;
    }
  });

  openModal();
};

window.confirmResetData = window.confirmResetEverything;

// CSS for spinner
const style = document.createElement('style');
style.textContent = `@keyframes spin{to{transform:rotate(360deg)}} @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`;
document.head.appendChild(style);

// Boot
init();
