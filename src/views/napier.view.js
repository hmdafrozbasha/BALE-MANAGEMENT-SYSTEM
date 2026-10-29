// src/views/napier.view.js
// Complete, isolated UI views and modal workflows for Napier Management.
// Matches the BMS Emerald Liquid Glass design system.

import { store } from '../store.js';
import * as XLSX from 'xlsx';

let currentNapierSubTab = 'dashboard';
let plotSearchQuery = '';
let plotStatusFilter = 'all';
let harvestSearchQuery = '';
let harvestPlotFilter = 'all';
let salesSearchQuery = '';
let salesStatusFilter = 'all';
let expenseCategoryFilter = 'all';
let reportPeriod = 'this-month';
let reportViewType = 'pnl';

export function setNapierSubTab(tab) {
  currentNapierSubTab = tab;
  renderNapierManagement();
}

window.switchNapierTab = function(tab) {
  currentNapierSubTab = tab;
  renderNapierManagement();
};

export function renderNapierManagement(subTab) {
  if (subTab) currentNapierSubTab = subTab;
  const appContent = document.getElementById('appContent');
  if (!appContent) return;

  const isFinance = store.canViewFinancials();

  // If subnav already exists in DOM, preserve scroll position & only update active state + view content
  const existingSubnav = appContent.querySelector('.napier-subnav-container');
  const existingContent = document.getElementById('napierViewContent');

  if (existingSubnav && existingContent) {
    existingSubnav.querySelectorAll('.napier-subnav-btn').forEach(btn => {
      const match = btn.getAttribute('data-subtab') === currentNapierSubTab;
      btn.classList.toggle('active', match);
      if (match) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });
    renderActiveNapierSubView();
    return;
  }

  appContent.innerHTML = `
    <!-- Napier Module Sub-Navigation Bar -->
    <div class="napier-subnav-container">
      <button class="napier-subnav-btn ${currentNapierSubTab === 'dashboard' ? 'active' : ''}" data-subtab="dashboard" onclick="window.switchNapierTab('dashboard')">
        <span>📊</span> <span>Napier Dashboard</span>
      </button>
      <button class="napier-subnav-btn ${currentNapierSubTab === 'plots' ? 'active' : ''}" data-subtab="plots" onclick="window.switchNapierTab('plots')">
        <span>🌱</span> <span>Plots & Cultivation</span>
      </button>
      <button class="napier-subnav-btn ${currentNapierSubTab === 'harvesting' ? 'active' : ''}" data-subtab="harvesting" onclick="window.switchNapierTab('harvesting')">
        <span>🌾</span> <span>Production & Harvesting</span>
      </button>
      <button class="napier-subnav-btn ${currentNapierSubTab === 'stock' ? 'active' : ''}" data-subtab="stock" onclick="window.switchNapierTab('stock')">
        <span>📦</span> <span>Stock Management</span>
      </button>
      ${isFinance ? `
        <button class="napier-subnav-btn ${currentNapierSubTab === 'sales' ? 'active' : ''}" data-subtab="sales" onclick="window.switchNapierTab('sales')">
          <span>💼</span> <span>Sales & Invoices</span>
        </button>
        <button class="napier-subnav-btn ${currentNapierSubTab === 'expenses' ? 'active' : ''}" data-subtab="expenses" onclick="window.switchNapierTab('expenses')">
          <span>💸</span> <span>Expenses</span>
        </button>
        <button class="napier-subnav-btn ${currentNapierSubTab === 'payments' ? 'active' : ''}" data-subtab="payments" onclick="window.switchNapierTab('payments')">
          <span>👥</span> <span>Payments & Receivables</span>
        </button>
        <button class="napier-subnav-btn ${currentNapierSubTab === 'reports' ? 'active' : ''}" data-subtab="reports" onclick="window.switchNapierTab('reports')">
          <span>📈</span> <span>Reports</span>
        </button>
      ` : ''}
    </div>

    <!-- Active Sub-View Content Container -->
    <div id="napierViewContent"></div>
  `;

  renderActiveNapierSubView();
}

function renderActiveNapierSubView() {
  const container = document.getElementById('napierViewContent');
  if (!container) return;

  switch (currentNapierSubTab) {
    case 'dashboard':
      renderNapierDashboard(container);
      break;
    case 'plots':
      renderNapierPlots(container);
      break;
    case 'harvesting':
      renderNapierHarvesting(container);
      break;
    case 'stock':
      renderNapierStock(container);
      break;
    case 'sales':
      renderNapierSales(container);
      break;
    case 'expenses':
      renderNapierExpenses(container);
      break;
    case 'payments':
      renderNapierPayments(container);
      break;
    case 'reports':
      renderNapierReports(container);
      break;
    default:
      renderNapierDashboard(container);
  }
}

// ─────────────────────────────────────────────────────────────────
// FORMATTING HELPERS
// ─────────────────────────────────────────────────────────────────
function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return '₹0';
  return '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatWeight(kg) {
  const num = Number(kg) || 0;
  const tonnes = (num / 1000).toFixed(2);
  return `${num.toLocaleString('en-IN')} kg (${tonnes} t)`;
}

function formatNumber(val) {
  return Number(val || 0).toLocaleString('en-IN');
}

// ─────────────────────────────────────────────────────────────────
// 1. NAPIER DASHBOARD VIEW
// ─────────────────────────────────────────────────────────────────
function renderNapierDashboard(container) {
  const isFinance = store.canViewFinancials();
  const summary = store.getNapierFinancialSummary('this-month');
  const stock = summary.stockSummary;

  const plots = store.data.napierPlots || [];
  const totalPlots = plots.length;
  const activePlots = plots.filter(p => p.status === 'Growing' || p.status === 'Ready for Harvest').length;
  const readyPlots = plots.filter(p => p.status === 'Ready for Harvest').length;

  const harvests = store.data.napierHarvests || [];
  const sales = store.data.napierSales || [];
  const expenses = store.data.napierExpenses || [];

  container.innerHTML = `
    <!-- Top Stock & Crop Banner -->
    <div class="napier-stock-banner">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="font-size:0.85rem;color:#A7F3D0;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;">
            🌱 Napier Forage Production & Biomass
          </div>
          <div style="font-size:2rem;font-weight:800;letter-spacing:-0.5px;">
            ${formatWeight(stock.availableStockKg)}
          </div>
          <div style="font-size:0.85rem;color:#D1FAE5;margin-top:4px;">
            Available Biomass Stock • Valued at <strong>${isFinance ? formatCurrency(stock.inventoryValuation) : '••••'}</strong> (₹${stock.weightedAvgCostPerKg}/kg avg cost basis)
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button class="btn-primary" style="background:#10B981;border-color:#34D399;font-weight:700;" onclick="window.openNewNapierHarvestModal()">
            <span>🌿</span> <span>Record Harvest</span>
          </button>
          ${isFinance ? `
            <button class="btn-secondary" style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.3);font-weight:700;" onclick="window.openNewNapierSaleModal()">
              <span>💼</span> <span>New Sale / Invoice</span>
            </button>
          ` : ''}
          ${store.canDelete() ? `
            <button class="btn-danger" style="background:#dc2626;color:#fff;border-radius:8px;padding:8px 14px;font-size:0.84rem;font-weight:700;border:none;box-shadow:0 2px 4px rgba(220,38,38,0.25);cursor:pointer;" onclick="window.confirmResetNapierData()" title="Reset Napier records">
              <span>💣</span> <span>Reset Napier Data</span>
            </button>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- KPI Summary Cards Grid -->
    <div class="napier-kpi-grid">
      <!-- Plot Cultivation Card -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Cultivated Plots</span>
          <span style="font-size:1.3rem;">🌱</span>
        </div>
        <div class="kpi-value">${totalPlots}</div>
        <div class="kpi-subtext" style="color:#059669;font-weight:600;">
          ${activePlots} Active (${readyPlots} Ready for Cut)
        </div>
      </div>

      <!-- Harvested This Month -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Harvested (This Month)</span>
          <span style="font-size:1.3rem;">🌾</span>
        </div>
        <div class="kpi-value">${(summary.totalHarvestedPeriodKg / 1000).toFixed(2)} <span style="font-size:0.95rem;font-weight:500;">tonnes</span></div>
        <div class="kpi-subtext">
          ${formatNumber(summary.totalHarvestedPeriodKg)} kg total biomass
        </div>
      </div>

      <!-- Sold This Month -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Sold (This Month)</span>
          <span style="font-size:1.3rem;">🚚</span>
        </div>
        <div class="kpi-value">${(summary.totalSoldPeriodKg / 1000).toFixed(2)} <span style="font-size:0.95rem;font-weight:500;">tonnes</span></div>
        <div class="kpi-subtext">
          ${formatNumber(summary.totalSoldPeriodKg)} kg delivered
        </div>
      </div>

      <!-- Sales Revenue -->
      <div class="kpi-card ${isFinance ? 'revenue-kpi' : ''}">
        <div class="kpi-header">
          <span class="kpi-label">Sales Revenue (Month)</span>
          <span style="font-size:1.3rem;">💰</span>
        </div>
        <div class="kpi-value">${isFinance ? formatCurrency(summary.salesRevenue) : '••••'}</div>
        <div class="kpi-subtext">
          ${isFinance ? `Cash: ${formatCurrency(summary.cashReceived)}` : 'Financial view restricted'}
        </div>
      </div>

      <!-- Production & Operating Costs -->
      <div class="kpi-card ${isFinance ? 'expenses-kpi' : ''}">
        <div class="kpi-header">
          <span class="kpi-label">Operating Expenses</span>
          <span style="font-size:1.3rem;">💸</span>
        </div>
        <div class="kpi-value">${isFinance ? formatCurrency(summary.operatingExpenses) : '••••'}</div>
        <div class="kpi-subtext">
          ${isFinance ? `Harvest Costs: ${formatCurrency(summary.productionCostPeriod)}` : 'Restricted'}
        </div>
      </div>

      <!-- Realized Net Profit -->
      <div class="kpi-card ${isFinance ? (summary.netProfit >= 0 ? 'profit-kpi' : 'loss-kpi') : ''}">
        <div class="kpi-header">
          <span class="kpi-label">Realized Net Profit (Month)</span>
          <span style="font-size:1.3rem;">📈</span>
        </div>
        <div class="kpi-value">${isFinance ? formatCurrency(summary.netProfit) : '••••'}</div>
        <div class="kpi-subtext">
          ${isFinance ? `Gross Profit: ${formatCurrency(summary.grossProfit)}` : 'Restricted'}
        </div>
      </div>

      <!-- Outstanding Receivables -->
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Pending Receivables</span>
          <span style="font-size:1.3rem;">⏳</span>
        </div>
        <div class="kpi-value" style="color:#B45309;">${isFinance ? formatCurrency(summary.totalReceivables) : '••••'}</div>
        <div class="kpi-subtext">
          From Napier customer invoices
        </div>
      </div>
    </div>

    <!-- Quick Action / Operational Panels -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:20px;margin-top:10px;">
      <!-- Recent Harvests -->
      <div class="section-box" style="margin:0;">
        <div class="section-box-header" style="display:flex;justify-content:space-between;align-items:center;">
          <div class="box-title"><span>🌾</span> Recent Harvests</div>
          <button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem;" onclick="window.switchNapierTab('harvesting')">View All</button>
        </div>
        <div class="table-container" style="max-height:280px;overflow-y:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Plot</th>
                <th>Yield</th>
                ${isFinance ? '<th>Total Cost</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${harvests.length === 0 ? `
                <tr><td colspan="${isFinance ? 4 : 3}" style="text-align:center;padding:24px;color:var(--text-muted);">No harvests recorded yet.</td></tr>
              ` : harvests.slice(0, 5).map(h => `
                <tr>
                  <td><strong>${h.harvest_date}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">${h.harvest_ref}</span></td>
                  <td>${h.plot_name || h.plot_code || 'Plot'}</td>
                  <td><strong>${formatWeight(h.quantity_kg)}</strong></td>
                  ${isFinance ? `<td>${formatCurrency(h.total_production_cost)}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Sales / Invoices -->
      <div class="section-box" style="margin:0;">
        <div class="section-box-header" style="display:flex;justify-content:space-between;align-items:center;">
          <div class="box-title"><span>💼</span> Recent Sales</div>
          ${isFinance ? `<button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem;" onclick="window.switchNapierTab('sales')">View All</button>` : ''}
        </div>
        <div class="table-container" style="max-height:280px;overflow-y:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Qty</th>
                ${isFinance ? '<th>Amount</th>' : ''}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${sales.length === 0 ? `
                <tr><td colspan="${isFinance ? 5 : 4}" style="text-align:center;padding:24px;color:var(--text-muted);">No sales recorded yet.</td></tr>
              ` : sales.slice(0, 5).map(s => `
                <tr>
                  <td><strong>${s.invoice_no}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">${s.sale_date}</span></td>
                  <td>${s.customer_name || 'Customer'}</td>
                  <td>${formatWeight(s.quantity_deducted_kg)}</td>
                  ${isFinance ? `<td><strong>${formatCurrency(s.total_amount)}</strong></td>` : ''}
                  <td>
                    <span class="status-badge ${s.payment_status === 'Paid' ? 'status-ready' : s.payment_status === 'Partial' ? 'status-fermenting' : 'status-empty'}">
                      ${s.payment_status}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────
// 2. PLOTS & CULTIVATION MANAGEMENT
// ─────────────────────────────────────────────────────────────────
function renderNapierPlots(container) {
  const isFinance = store.canViewFinancials();
  const plots = store.data.napierPlots || [];
  const harvests = store.data.napierHarvests || [];

  const filteredPlots = plots.filter(p => {
    const q = plotSearchQuery.toLowerCase();
    const matchSearch = !q || (p.plot_name || '').toLowerCase().includes(q) ||
                        (p.plot_code || '').toLowerCase().includes(q) ||
                        (p.location || '').toLowerCase().includes(q) ||
                        (p.napier_variety || '').toLowerCase().includes(q);
    const matchStatus = plotStatusFilter === 'all' || p.status === plotStatusFilter;
    return matchSearch && matchStatus;
  });

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:700;margin:0;color:#FFFFFF;text-shadow:0 2px 8px rgba(0,0,0,0.35);">🌱 Cultivation Plots</h2>
        <p style="font-size:0.83rem;color:#D1FAE5;margin:3px 0 0 0;">
          Track perpetual Napier grass plots, varieties, growth cycles, and repeated harvest history.
        </p>
      </div>

      <button class="btn-primary" onclick="window.openNewNapierPlotModal()">
        <span>＋</span> <span>Add New Plot</span>
      </button>
    </div>

    <!-- Filters Bar -->
    <div class="filter-bar" style="margin-bottom:18px;">
      <input type="text" class="form-input" style="max-width:280px;" placeholder="🔍 Search plots or varieties…" value="${plotSearchQuery}" oninput="window.setNapierPlotSearch(this.value)">

      <select class="form-input" style="max-width:200px;" onchange="window.setNapierPlotStatusFilter(this.value)">
        <option value="all" ${plotStatusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
        <option value="Ready for Harvest" ${plotStatusFilter === 'Ready for Harvest' ? 'selected' : ''}>Ready for Harvest</option>
        <option value="Growing" ${plotStatusFilter === 'Growing' ? 'selected' : ''}>Growing</option>
        <option value="Preparing" ${plotStatusFilter === 'Preparing' ? 'selected' : ''}>Preparing</option>
        <option value="Inactive" ${plotStatusFilter === 'Inactive' ? 'selected' : ''}>Inactive</option>
      </select>
    </div>

    <!-- Plots Grid -->
    <div class="napier-plot-grid">
      ${filteredPlots.length === 0 ? `
        <div style="grid-column:1/-1;text-align:center;padding:48px;background:rgba(255,255,255,0.7);border-radius:12px;color:var(--text-muted);">
          <div style="font-size:2.5rem;margin-bottom:8px;">🌱</div>
          <div style="font-size:1rem;font-weight:600;">No cultivation plots match your criteria</div>
          <p style="font-size:0.85rem;margin-top:4px;">Add your first plot to begin recording repeated Napier harvests.</p>
          <button class="btn-primary" style="margin-top:12px;" onclick="window.openNewNapierPlotModal()">＋ Add First Plot</button>
        </div>
      ` : filteredPlots.map(p => {
        const plotHarvests = harvests.filter(h => h.plot_id === p.id || h.plot_code === p.plot_code);
        const totalYieldKg = plotHarvests.reduce((sum, h) => sum + (Number(h.quantity_kg) || 0), 0);
        const harvestCount = plotHarvests.length;

        let badgeClass = 'napier-badge-growing';
        if (p.status === 'Ready for Harvest') badgeClass = 'napier-badge-ready';
        else if (p.status === 'Preparing') badgeClass = 'napier-badge-preparing';
        else if (p.status === 'Inactive') badgeClass = 'napier-badge-inactive';

        return `
          <div class="napier-plot-card">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                <div>
                  <span style="font-size:0.75rem;font-weight:700;color:var(--primary-emerald);letter-spacing:0.5px;">${p.plot_code}</span>
                  <h3 style="font-size:1.15rem;font-weight:700;margin:2px 0 0 0;">${p.plot_name}</h3>
                  <div style="font-size:0.8rem;color:var(--text-muted);">${p.location || 'Main Farm Plot'}</div>
                </div>
                <span class="${badgeClass}">${p.status}</span>
              </div>

              <!-- Plot Details -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;background:rgba(16,185,129,0.04);padding:10px;border-radius:8px;margin:12px 0;font-size:0.83rem;">
                <div>
                  <span style="color:var(--text-muted);font-size:0.75rem;">Area:</span><br>
                  <strong>${p.area} ${p.area_unit || 'Acres'}</strong>
                </div>
                <div>
                  <span style="color:var(--text-muted);font-size:0.75rem;">Variety:</span><br>
                  <strong>${p.napier_variety || 'Super Napier'}</strong>
                </div>
                <div>
                  <span style="color:var(--text-muted);font-size:0.75rem;">Irrigation:</span><br>
                  <span>${p.irrigation_type || 'Drip'}</span>
                </div>
                <div>
                  <span style="color:var(--text-muted);font-size:0.75rem;">Planted:</span><br>
                  <span>${p.planting_date || 'N/A'}</span>
                </div>
              </div>

              <!-- Cumulative Harvest Stats -->
              <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:14px;padding:0 4px;">
                <div>🌾 Total Harvests: <strong>${harvestCount} cuts recorded</strong></div>
                <div>⚖️ Lifetime Yield: <strong>${formatWeight(totalYieldKg)}</strong></div>
                ${isFinance && Number(p.establishment_cost) > 0 ? `
                  <div>💰 Establishment Cost: <strong>${formatCurrency(p.establishment_cost)}</strong></div>
                ` : ''}
              </div>
            </div>

            <!-- Actions Footer -->
            <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(0,0,0,0.06);padding-top:12px;margin-top:8px;">
              <button class="btn-primary" style="padding:6px 12px;font-size:0.82rem;" onclick="window.openNewNapierHarvestModal('${p.id}')">
                <span>🌿</span> <span>Harvest Cut</span>
              </button>
              <div style="display:flex;gap:6px;">
                <button class="btn-secondary" style="padding:6px 10px;font-size:0.82rem;" onclick="window.openEditNapierPlotModal('${p.id}')" title="Edit Plot">
                  ✏️
                </button>
                <button class="btn-danger" style="padding:6px 10px;font-size:0.82rem;" onclick="window.deleteNapierPlotConfirm('${p.id}')" title="Delete Plot">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

window.setNapierPlotSearch = function(val) {
  plotSearchQuery = val;
  const container = document.getElementById('napierViewContent');
  if (container) renderNapierPlots(container);
};

window.setNapierPlotStatusFilter = function(val) {
  plotStatusFilter = val;
  const container = document.getElementById('napierViewContent');
  if (container) renderNapierPlots(container);
};

// ─────────────────────────────────────────────────────────────────
// 3. PRODUCTION & HARVESTING
// ─────────────────────────────────────────────────────────────────
function renderNapierHarvesting(container) {
  const isFinance = store.canViewFinancials();
  const harvests = store.data.napierHarvests || [];
  const plots = store.data.napierPlots || [];

  const filteredHarvests = harvests.filter(h => {
    const q = harvestSearchQuery.toLowerCase();
    const matchSearch = !q || (h.harvest_ref || '').toLowerCase().includes(q) ||
                        (h.plot_name || '').toLowerCase().includes(q) ||
                        (h.notes || '').toLowerCase().includes(q);
    const matchPlot = harvestPlotFilter === 'all' || h.plot_id === harvestPlotFilter;
    return matchSearch && matchPlot;
  });

  const totalHarvestsKg = filteredHarvests.reduce((sum, h) => sum + (Number(h.quantity_kg) || 0), 0);
  const totalCost = filteredHarvests.reduce((sum, h) => sum + (Number(h.total_production_cost) || 0), 0);
  const avgCostKg = totalHarvestsKg > 0 ? (totalCost / totalHarvestsKg) : 0;

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:700;margin:0;color:#FFFFFF;text-shadow:0 2px 8px rgba(0,0,0,0.35);">🌾 Production & Repeated Harvesting</h2>
        <p style="font-size:0.83rem;color:#D1FAE5;margin:3px 0 0 0;">
          Log cuts from cultivation plots. Automatically converts kg and tonnes, updates stock ledger, and capitalizes labour/cutting costs.
        </p>
      </div>

      <button class="btn-primary" onclick="window.openNewNapierHarvestModal()">
        <span>＋</span> <span>Record New Harvest</span>
      </button>
    </div>

    <!-- Stat Bar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:14px;background:rgba(255,255,255,0.92);padding:16px 20px;border-radius:12px;margin-bottom:18px;border:1px solid rgba(0,0,0,0.06);width:100%;">
      <div style="background:rgba(248,250,252,0.9);padding:12px 16px;border-radius:10px;border:1px solid #E2E8F0;">
        <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total Cuts Logged</div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--text-primary);margin-top:2px;">${filteredHarvests.length}</div>
      </div>
      <div style="background:rgba(248,250,252,0.9);padding:12px 16px;border-radius:10px;border:1px solid #E2E8F0;">
        <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total Harvested Biomass</div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--primary-emerald);margin-top:2px;">${formatWeight(totalHarvestsKg)}</div>
      </div>
      ${isFinance ? `
        <div style="background:rgba(248,250,252,0.9);padding:12px 16px;border-radius:10px;border:1px solid #E2E8F0;">
          <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total Production Cost</div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--text-primary);margin-top:2px;">${formatCurrency(totalCost)}</div>
        </div>
        <div style="background:rgba(248,250,252,0.9);padding:12px 16px;border-radius:10px;border:1px solid #E2E8F0;">
          <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Avg Cost Basis</div>
          <div style="font-size:1.3rem;font-weight:800;color:#059669;margin-top:2px;">₹${avgCostKg.toFixed(2)} / kg</div>
        </div>
      ` : ''}
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar" style="margin-bottom:18px;">
      <input type="text" class="form-input" style="max-width:280px;" placeholder="🔍 Search harvest ref, plot…" value="${harvestSearchQuery}" oninput="window.setNapierHarvestSearch(this.value)">

      <select class="form-input" style="max-width:220px;" onchange="window.setNapierHarvestPlotFilter(this.value)">
        <option value="all" ${harvestPlotFilter === 'all' ? 'selected' : ''}>All Plots</option>
        ${plots.map(p => `<option value="${p.id}" ${harvestPlotFilter === p.id ? 'selected' : ''}>${p.plot_name} (${p.plot_code})</option>`).join('')}
      </select>
    </div>

    <!-- Harvests Table Card -->
    <div class="section-box" style="margin:0;">
      <div class="section-box-header">
        <div class="box-title"><span>🌾</span> Harvest Production Log</div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ref & Date</th>
              <th>Plot</th>
              <th>Yield Quantity</th>
              ${isFinance ? `
                <th>Labour & Cutting</th>
                <th>Transport & Other</th>
                <th>Total Cost</th>
                <th>Cost/kg</th>
              ` : ''}
              <th>Notes</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredHarvests.length === 0 ? `
              <tr>
                <td colspan="${isFinance ? 9 : 5}" style="text-align:center;padding:36px;color:var(--text-muted);">
                  No harvest cuts recorded yet. Click "Record New Harvest" to add a production run.
                </td>
              </tr>
            ` : filteredHarvests.map(h => `
              <tr>
                <td>
                  <strong>${h.harvest_ref}</strong><br>
                  <span style="font-size:0.75rem;color:var(--text-muted);">📅 ${h.harvest_date}</span>
                </td>
                <td>
                  <strong>${h.plot_name || 'Plot'}</strong><br>
                  <span style="font-size:0.75rem;color:var(--text-muted);">${h.plot_code || ''}</span>
                </td>
                <td>
                  <span style="font-size:0.95rem;font-weight:700;color:var(--primary-emerald);">${Number(h.quantity_kg).toLocaleString('en-IN')} kg</span><br>
                  <span style="font-size:0.75rem;color:var(--text-muted);">${(Number(h.quantity_kg) / 1000).toFixed(2)} tonnes</span>
                </td>
                ${isFinance ? `
                  <td>${formatCurrency(Number(h.labour_cost || 0) + Number(h.harvesting_cost || 0))}</td>
                  <td>${formatCurrency(Number(h.transport_cost || 0) + Number(h.other_cost || 0))}</td>
                  <td><strong>${formatCurrency(h.total_production_cost)}</strong></td>
                  <td><span style="font-weight:600;color:#059669;">₹${Number(h.cost_per_kg || 0).toFixed(2)}</span></td>
                ` : ''}
                <td style="max-width:180px;font-size:0.8rem;color:var(--text-secondary);">${h.notes || '—'}</td>
                <td style="text-align:right;">
                  <button class="btn-danger" style="padding:4px 8px;font-size:0.78rem;" onclick="window.deleteNapierHarvestConfirm('${h.id}')" title="Delete Harvest">
                    🗑️
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.setNapierHarvestSearch = function(val) {
  harvestSearchQuery = val;
  const container = document.getElementById('napierViewContent');
  if (container) renderNapierHarvesting(container);
};

window.setNapierHarvestPlotFilter = function(val) {
  harvestPlotFilter = val;
  const container = document.getElementById('napierViewContent');
  if (container) renderNapierHarvesting(container);
};

// ─────────────────────────────────────────────────────────────────
// 4. INDEPENDENT STOCK MANAGEMENT
// ─────────────────────────────────────────────────────────────────
function renderNapierStock(container) {
  const isFinance = store.canViewFinancials();
  const stock = store.getNapierStockSummary();
  const movements = store.data.napierStockMovements || [];

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:700;margin:0;color:#FFFFFF;text-shadow:0 2px 8px rgba(0,0,0,0.35);">📦 Independent Stock Ledger</h2>
        <p style="font-size:0.83rem;color:#D1FAE5;margin:3px 0 0 0;">
          Source of truth inventory ledger. Strictly isolated from bale silage and goat feeds.
        </p>
      </div>

      <div style="display:flex;gap:10px;">
        <button class="btn-secondary" onclick="window.openNewNapierStockAdjModal('WASTAGE')">
          <span>🍂</span> <span>Record Wastage / Spoilage</span>
        </button>
        <button class="btn-primary" onclick="window.openNewNapierStockAdjModal('ADDITION')">
          <span>⚖️</span> <span>Adjust Stock</span>
        </button>
      </div>
    </div>

    <!-- Stock KPI Grid -->
    <div class="napier-kpi-grid">
      <div class="kpi-card profit-kpi">
        <div class="kpi-header">
          <span class="kpi-label">Available Napier Stock</span>
          <span>🌿</span>
        </div>
        <div class="kpi-value">${stock.availableStockTonnes} <span style="font-size:0.95rem;font-weight:500;">tonnes</span></div>
        <div class="kpi-subtext" style="color:#B7F36B;">
          ${stock.availableStockKg.toLocaleString('en-IN')} kg ready for sale
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Lifetime Harvest Additions</span>
          <span>🌾</span>
        </div>
        <div class="kpi-value" style="color:#059669;">+${stock.totalHarvestedTonnes} <span style="font-size:0.95rem;">t</span></div>
        <div class="kpi-subtext">
          +${stock.totalHarvestedKg.toLocaleString('en-IN')} kg harvested
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Lifetime Sales Outflow</span>
          <span>🚚</span>
        </div>
        <div class="kpi-value" style="color:#E11D48;">-${stock.totalSoldTonnes} <span style="font-size:0.95rem;">t</span></div>
        <div class="kpi-subtext">
          -${stock.totalSoldKg.toLocaleString('en-IN')} kg delivered to buyers
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Wastage / Spoilage / Loss</span>
          <span>🍂</span>
        </div>
        <div class="kpi-value" style="color:#D97706;">-${(stock.totalWastageKg / 1000).toFixed(2)} <span style="font-size:0.95rem;">t</span></div>
        <div class="kpi-subtext">
          -${stock.totalWastageKg.toLocaleString('en-IN')} kg drying/handling loss
        </div>
      </div>

      ${isFinance ? `
        <div class="kpi-card revenue-kpi">
          <div class="kpi-header">
            <span class="kpi-label">Inventory Valuation</span>
            <span>💰</span>
          </div>
          <div class="kpi-value">${formatCurrency(stock.inventoryValuation)}</div>
          <div class="kpi-subtext" style="color:#B7F36B;">
            ₹${stock.weightedAvgCostPerKg} / kg weighted average cost basis
          </div>
        </div>
      ` : ''}
    </div>

    <!-- Movement Ledger Table -->
    <div class="section-box" style="margin:0;">
      <div class="section-box-header">
        <div class="box-title"><span>📜</span> Stock Movement Audit Trail</div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Movement Type</th>
              <th>Reference</th>
              <th>Quantity (kg / t)</th>
              ${isFinance ? '<th>Unit Cost Basis</th><th>Total Cost Impact</th>' : ''}
              <th>Notes / Reason</th>
            </tr>
          </thead>
          <tbody>
            ${movements.length === 0 ? `
              <tr>
                <td colspan="${isFinance ? 7 : 5}" style="text-align:center;padding:36px;color:var(--text-muted);">
                  No stock movements recorded yet. Harvests and sales will appear here automatically.
                </td>
              </tr>
            ` : movements.map(m => {
              const qty = Number(m.quantity_kg) || 0;
              const isPositive = qty > 0;
              let badgeColor = '#059669';
              let badgeBg = '#D1FAE5';
              let typeLabel = m.movement_type;

              if (m.movement_type === 'HARVEST_IN') {
                typeLabel = '🌾 Harvest Inflow';
                badgeColor = '#065F46'; badgeBg = '#DDFCE8';
              } else if (m.movement_type === 'SALE_OUT') {
                typeLabel = '🚚 Sale Outflow';
                badgeColor = '#9F1239'; badgeBg = '#FFE4E6';
              } else if (m.movement_type === 'WASTAGE') {
                typeLabel = '🍂 Wastage / Loss';
                badgeColor = '#92400E'; badgeBg = '#FEF3C7';
              } else if (m.movement_type === 'ADJUSTMENT_ADD') {
                typeLabel = '⚖️ Stock Surplus Adj';
                badgeColor = '#0E7490'; badgeBg = '#CFFAFE';
              } else if (m.movement_type === 'ADJUSTMENT_SUB') {
                typeLabel = '⚖️ Stock Reduction Adj';
                badgeColor = '#C2410C'; badgeBg = '#FFEDD5';
              }

              return `
                <tr>
                  <td><strong>${m.movement_date}</strong></td>
                  <td>
                    <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;color:${badgeColor};background:${badgeBg};">
                      ${typeLabel}
                    </span>
                  </td>
                  <td><strong>${m.reference_no}</strong></td>
                  <td>
                    <strong style="color:${isPositive ? '#059669' : '#DC2626'};font-size:0.95rem;">
                      ${isPositive ? '+' : ''}${qty.toLocaleString('en-IN')} kg
                    </strong>
                    <span style="font-size:0.75rem;color:var(--text-muted);display:block;">
                      ${(qty / 1000).toFixed(3)} t
                    </span>
                  </td>
                  ${isFinance ? `
                    <td>₹${Number(m.unit_cost || 0).toFixed(2)}/kg</td>
                    <td>${formatCurrency(m.total_cost)}</td>
                  ` : ''}
                  <td style="font-size:0.8rem;color:var(--text-secondary);">${m.notes || '—'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────
// 5. SALES & INVOICES
// ─────────────────────────────────────────────────────────────────
function renderNapierSales(container) {
  const isFinance = store.canViewFinancials();
  const sales = store.data.napierSales || [];
  const customers = store.data.napierCustomers || [];

  const filteredSales = sales.filter(s => {
    const q = salesSearchQuery.toLowerCase();
    const matchSearch = !q || (s.invoice_no || '').toLowerCase().includes(q) ||
                        (s.customer_name || '').toLowerCase().includes(q) ||
                        (s.notes || '').toLowerCase().includes(q);
    const matchStatus = salesStatusFilter === 'all' || s.payment_status === salesStatusFilter;
    return matchSearch && matchStatus;
  });

  const totalInvoiced = filteredSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
  const totalPaid = filteredSales.reduce((sum, s) => sum + (Number(s.amount_paid) || 0), 0);
  const totalPending = filteredSales.reduce((sum, s) => sum + (Number(s.balance_pending) || 0), 0);
  const totalSoldKg = filteredSales.reduce((sum, s) => sum + (Number(s.quantity_deducted_kg) || 0), 0);

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:700;margin:0;color:#FFFFFF;text-shadow:0 2px 8px rgba(0,0,0,0.35);">💼 Sales & Invoices</h2>
        <p style="font-size:0.83rem;color:#D1FAE5;margin:3px 0 0 0;">
          Create weight-based or bundle-based Napier invoices. Automatically validates available stock, deducts inventory, and tracks customer balances.
        </p>
      </div>

      <button class="btn-primary" onclick="window.openNewNapierSaleModal()">
        <span>＋</span> <span>New Napier Sale</span>
      </button>
    </div>

    <!-- Sales Stat Cards -->
    <div class="napier-kpi-grid">
      <div class="kpi-card revenue-kpi">
        <div class="kpi-header"><span class="kpi-label">Total Invoiced</span><span>💰</span></div>
        <div class="kpi-value">${formatCurrency(totalInvoiced)}</div>
        <div class="kpi-subtext" style="color:#B7F36B;">Across ${filteredSales.length} invoices</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header"><span class="kpi-label">Cash Collected</span><span>💵</span></div>
        <div class="kpi-value" style="color:#059669;">${formatCurrency(totalPaid)}</div>
        <div class="kpi-subtext">Received into cash/bank</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header"><span class="kpi-label">Pending Receivables</span><span>⏳</span></div>
        <div class="kpi-value" style="color:#DC2626;">${formatCurrency(totalPending)}</div>
        <div class="kpi-subtext">Outstanding customer balance</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header"><span class="kpi-label">Biomass Delivered</span><span>🚚</span></div>
        <div class="kpi-value">${(totalSoldKg / 1000).toFixed(2)} <span style="font-size:0.95rem;">t</span></div>
        <div class="kpi-subtext">${totalSoldKg.toLocaleString('en-IN')} kg deducted</div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar" style="margin-bottom:18px;">
      <input type="text" class="form-input" style="max-width:280px;" placeholder="🔍 Search invoice no, customer…" value="${salesSearchQuery}" oninput="window.setNapierSalesSearch(this.value)">

      <select class="form-input" style="max-width:200px;" onchange="window.setNapierSalesStatusFilter(this.value)">
        <option value="all" ${salesStatusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
        <option value="Paid" ${salesStatusFilter === 'Paid' ? 'selected' : ''}>Paid</option>
        <option value="Partial" ${salesStatusFilter === 'Partial' ? 'selected' : ''}>Partial</option>
        <option value="Unpaid" ${salesStatusFilter === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
      </select>
    </div>

    <!-- Sales Table Card -->
    <div class="section-box" style="margin:0;">
      <div class="section-box-header">
        <div class="box-title"><span>💼</span> Sales & Invoices Ledger</div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Invoice & Date</th>
              <th>Customer</th>
              <th>Pricing Method & Qty</th>
              <th>Total Amount</th>
              <th>Paid</th>
              <th>Pending</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredSales.length === 0 ? `
              <tr>
                <td colspan="8" style="text-align:center;padding:36px;color:var(--text-muted);">
                  No sales invoices found. Click "New Napier Sale" to issue an invoice.
                </td>
              </tr>
            ` : filteredSales.map(s => `
              <tr>
                <td>
                  <strong>${s.invoice_no}</strong><br>
                  <span style="font-size:0.75rem;color:var(--text-muted);">📅 ${s.sale_date}</span>
                </td>
                <td>
                  <strong>${s.customer_name || 'Customer'}</strong>
                </td>
                <td>
                  <span style="font-size:0.85rem;font-weight:600;">
                    ${s.pricing_method === 'fixed_bundle' ? 'Bundle/Load Pricing' : 'Weight-Based Pricing'}
                  </span><br>
                  <span style="font-size:0.75rem;color:var(--text-muted);">
                    ${s.quantity_sold} ${s.sale_unit || 'kg'} @ ₹${s.rate_per_unit}/${s.sale_unit || 'kg'}
                    (${formatWeight(s.quantity_deducted_kg)})
                  </span>
                </td>
                <td><strong>${formatCurrency(s.total_amount)}</strong></td>
                <td style="color:#059669;">${formatCurrency(s.amount_paid)}</td>
                <td style="color:${Number(s.balance_pending) > 0 ? '#DC2626' : 'var(--text-muted)'};font-weight:${Number(s.balance_pending) > 0 ? '700' : 'normal'};">
                  ${formatCurrency(s.balance_pending)}
                </td>
                <td>
                  <span class="status-badge ${s.payment_status === 'Paid' ? 'status-ready' : s.payment_status === 'Partial' ? 'status-fermenting' : 'status-empty'}">
                    ${s.payment_status}
                  </span>
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <button class="btn-secondary" style="padding:4px 8px;font-size:0.78rem;" onclick="window.openNapierInvoiceDetailModal('${s.id}')" title="View / Print Invoice">
                    📄 Print
                  </button>
                  ${Number(s.balance_pending) > 0 ? `
                    <button class="btn-primary" style="padding:4px 8px;font-size:0.78rem;background:#10B981;" onclick="window.openNewNapierPaymentModal('${s.id}')" title="Collect Payment">
                      💵 Collect
                    </button>
                  ` : ''}
                  <button class="btn-danger" style="padding:4px 8px;font-size:0.78rem;" onclick="window.deleteNapierSaleConfirm('${s.id}')" title="Delete Sale">
                    🗑️
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.setNapierSalesSearch = function(val) {
  salesSearchQuery = val;
  const container = document.getElementById('napierViewContent');
  if (container) renderNapierSales(container);
};

window.setNapierSalesStatusFilter = function(val) {
  salesStatusFilter = val;
  const container = document.getElementById('napierViewContent');
  if (container) renderNapierSales(container);
};

// ─────────────────────────────────────────────────────────────────
// 6. NAPIER EXPENSES
// ─────────────────────────────────────────────────────────────────
function renderNapierExpenses(container) {
  const isFinance = store.canViewFinancials();
  const expenses = store.data.napierExpenses || [];
  const plots = store.data.napierPlots || [];

  const filteredExpenses = expenses.filter(e => {
    const matchCategory = expenseCategoryFilter === 'all' || e.category === expenseCategoryFilter;
    return matchCategory;
  });

  const totalExpenseAmount = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:700;margin:0;color:#FFFFFF;text-shadow:0 2px 8px rgba(0,0,0,0.35);">💸 Napier Operational Expenses</h2>
        <p style="font-size:0.83rem;color:#D1FAE5;margin:3px 0 0 0;">
          Completely independent Napier cultivation, irrigation, fertilizer, and farm maintenance expenses.
        </p>
      </div>

      <button class="btn-primary" onclick="window.openNewNapierExpenseModal()">
        <span>＋</span> <span>Log Napier Expense</span>
      </button>
    </div>

    <!-- Expenses Stat Bar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:14px;background:rgba(255,255,255,0.92);padding:16px 20px;border-radius:12px;margin-bottom:18px;border:1px solid rgba(0,0,0,0.06);width:100%;">
      <div style="background:rgba(248,250,252,0.9);padding:12px 16px;border-radius:10px;border:1px solid #E2E8F0;">
        <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total Operational Expenses</div>
        <div style="font-size:1.4rem;font-weight:800;color:#DC2626;margin-top:2px;">${formatCurrency(totalExpenseAmount)}</div>
      </div>
      <div style="background:rgba(248,250,252,0.9);padding:12px 16px;border-radius:10px;border:1px solid #E2E8F0;">
        <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Logged Records</div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--text-primary);margin-top:2px;">${filteredExpenses.length} entries</div>
      </div>
    </div>

    <!-- Category Filter Bar -->
    <div class="filter-bar" style="margin-bottom:18px;">
      <select class="form-input" style="max-width:240px;" onchange="window.setNapierExpenseCatFilter(this.value)">
        <option value="all" ${expenseCategoryFilter === 'all' ? 'selected' : ''}>All Categories</option>
        <option value="Planting Material" ${expenseCategoryFilter === 'Planting Material' ? 'selected' : ''}>Planting Material</option>
        <option value="Land Preparation" ${expenseCategoryFilter === 'Land Preparation' ? 'selected' : ''}>Land Preparation</option>
        <option value="Fertilizer & Soil Inputs" ${expenseCategoryFilter === 'Fertilizer & Soil Inputs' ? 'selected' : ''}>Fertilizer & Soil Inputs</option>
        <option value="Irrigation & Water" ${expenseCategoryFilter === 'Irrigation & Water' ? 'selected' : ''}>Irrigation & Water</option>
        <option value="Labour" ${expenseCategoryFilter === 'Labour' ? 'selected' : ''}>Labour</option>
        <option value="Cultivation Maintenance" ${expenseCategoryFilter === 'Cultivation Maintenance' ? 'selected' : ''}>Cultivation Maintenance</option>
        <option value="Harvesting" ${expenseCategoryFilter === 'Harvesting' ? 'selected' : ''}>Harvesting</option>
        <option value="Transport" ${expenseCategoryFilter === 'Transport' ? 'selected' : ''}>Transport</option>
        <option value="Equipment & Maintenance" ${expenseCategoryFilter === 'Equipment & Maintenance' ? 'selected' : ''}>Equipment & Maintenance</option>
        <option value="Other Expenses" ${expenseCategoryFilter === 'Other Expenses' ? 'selected' : ''}>Other Expenses</option>
      </select>
    </div>

    <!-- Expenses Table Card -->
    <div class="section-box" style="margin:0;">
      <div class="section-box-header">
        <div class="box-title"><span>💸</span> Operational Expenses Ledger</div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ref & Date</th>
              <th>Category</th>
              <th>Description & Plot</th>
              <th>Payee & Method</th>
              <th>Amount</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredExpenses.length === 0 ? `
              <tr>
                <td colspan="6" style="text-align:center;padding:36px;color:var(--text-muted);">
                  No expenses logged for this filter.
                </td>
              </tr>
            ` : filteredExpenses.map(e => {
              const plot = plots.find(p => p.id === e.plot_id);
              return `
                <tr>
                  <td>
                    <strong>${e.expense_ref}</strong><br>
                    <span style="font-size:0.75rem;color:var(--text-muted);">📅 ${e.expense_date}</span>
                  </td>
                  <td>
                    <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;background:rgba(16,185,129,0.1);color:#065F46;">
                      ${e.category}
                    </span>
                  </td>
                  <td>
                    <strong>${e.description || e.category}</strong>
                    ${plot ? `<br><span style="font-size:0.75rem;color:var(--text-muted);">Plot: ${plot.plot_name}</span>` : ''}
                  </td>
                  <td>
                    <span>${e.payee || '—'}</span><br>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${e.payment_method}</span>
                  </td>
                  <td><strong style="color:#DC2626;font-size:0.95rem;">${formatCurrency(e.amount)}</strong></td>
                  <td style="text-align:right;">
                    <button class="btn-danger" style="padding:4px 8px;font-size:0.78rem;" onclick="window.deleteNapierExpenseConfirm('${e.id}')" title="Delete Expense">
                      🗑️
                    </button>
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

window.setNapierExpenseCatFilter = function(val) {
  expenseCategoryFilter = val;
  const container = document.getElementById('napierViewContent');
  if (container) renderNapierExpenses(container);
};

// ─────────────────────────────────────────────────────────────────
// 7. PAYMENTS & RECEIVABLES
// ─────────────────────────────────────────────────────────────────
function renderNapierPayments(container) {
  const isFinance = store.canViewFinancials();
  const customers = store.data.napierCustomers || [];
  const sales = store.data.napierSales || [];
  const payments = store.data.napierPayments || [];

  const totalInvoiced = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
  const totalReceived = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalReceivables = sales.reduce((sum, s) => sum + (Number(s.balance_pending) || 0), 0);

  const pendingSales = sales.filter(s => Number(s.balance_pending) > 0);

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:700;margin:0;color:#FFFFFF;text-shadow:0 2px 8px rgba(0,0,0,0.35);">👥 Customers, Payments & Receivables</h2>
        <p style="font-size:0.83rem;color:#D1FAE5;margin:3px 0 0 0;">
          Strictly isolated customer directory, overdue invoices, and payment receipts for Napier grass.
        </p>
      </div>

      <div style="display:flex;gap:10px;">
        <button class="btn-secondary" onclick="window.openNewNapierCustomerModal()">
          <span>＋</span> <span>New Customer</span>
        </button>
        <button class="btn-primary" onclick="window.openNewNapierPaymentModal()">
          <span>💵</span> <span>Record Payment</span>
        </button>
      </div>
    </div>

    <!-- Receivables Stat Grid -->
    <div class="napier-kpi-grid">
      <div class="kpi-card revenue-kpi">
        <div class="kpi-header"><span class="kpi-label">Total Invoiced Sales</span><span>💼</span></div>
        <div class="kpi-value">${formatCurrency(totalInvoiced)}</div>
        <div class="kpi-subtext" style="color:#B7F36B;">Lifetime Napier sales</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header"><span class="kpi-label">Cash Collected</span><span>💵</span></div>
        <div class="kpi-value" style="color:#059669;">${formatCurrency(totalReceived)}</div>
        <div class="kpi-subtext">${payments.length} payment receipts logged</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header"><span class="kpi-label">Outstanding Receivables</span><span>⏳</span></div>
        <div class="kpi-value" style="color:#DC2626;">${formatCurrency(totalReceivables)}</div>
        <div class="kpi-subtext">${pendingSales.length} unpaid / partial invoices</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header"><span class="kpi-label">Active Napier Buyers</span><span>👥</span></div>
        <div class="kpi-value">${customers.length}</div>
        <div class="kpi-subtext">Dairy farms & cattle feed buyers</div>
      </div>
    </div>

    <!-- Outstanding Invoices Priority Panel -->
    <div class="section-box" style="margin-bottom:24px;">
      <div class="section-box-header">
        <div class="box-title" style="color:#B45309;"><span>⏳</span> Pending Invoices Awaiting Payment</div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Invoice No</th>
              <th>Date / Due</th>
              <th>Customer</th>
              <th>Invoice Total</th>
              <th>Paid So Far</th>
              <th>Balance Outstanding</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${pendingSales.length === 0 ? `
              <tr><td colspan="7" style="text-align:center;padding:24px;color:#059669;font-weight:600;">🎉 All Napier sales invoices are fully paid! No outstanding receivables.</td></tr>
            ` : pendingSales.map(s => `
              <tr>
                <td><strong>${s.invoice_no}</strong></td>
                <td>
                  <span>${s.sale_date}</span>
                  ${s.due_date ? `<br><span style="font-size:0.75rem;color:#B45309;">Due: ${s.due_date}</span>` : ''}
                </td>
                <td><strong>${s.customer_name}</strong></td>
                <td>${formatCurrency(s.total_amount)}</td>
                <td style="color:#059669;">${formatCurrency(s.amount_paid)}</td>
                <td><strong style="color:#DC2626;font-size:0.95rem;">${formatCurrency(s.balance_pending)}</strong></td>
                <td>
                  <button class="btn-primary" style="padding:4px 10px;font-size:0.78rem;background:#10B981;" onclick="window.openNewNapierPaymentModal('${s.id}')">
                    💵 Collect Payment
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Customer Ledgers Directory -->
    <div class="section-box">
      <div class="section-box-header">
        <div class="box-title"><span>👥</span> Customer Accounts Directory</div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Customer Name</th>
              <th>Phone & Address</th>
              <th>Total Purchased</th>
              <th>Total Paid</th>
              <th>Current Balance Pending</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${customers.length === 0 ? `
              <tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No customers added yet.</td></tr>
            ` : customers.map(c => `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td>
                  <span>${c.phone || '—'}</span><br>
                  <span style="font-size:0.75rem;color:var(--text-muted);">${c.address || ''}</span>
                </td>
                <td>${formatCurrency(c.totalPurchased || 0)}</td>
                <td style="color:#059669;">${formatCurrency(c.totalPaid || 0)}</td>
                <td>
                  <strong style="color:${Number(c.balancePending) > 0 ? '#DC2626' : '#059669'};">
                    ${formatCurrency(c.balancePending || 0)}
                  </strong>
                </td>
                <td style="text-align:right;">
                  <button class="btn-secondary" style="padding:4px 8px;font-size:0.78rem;" onclick="window.openEditNapierCustomerModal('${c.id}')" title="Edit Customer">
                    ✏️
                  </button>
                  <button class="btn-danger" style="padding:4px 8px;font-size:0.78rem;" onclick="window.deleteNapierCustomerConfirm('${c.id}')" title="Delete Customer">
                    🗑️
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────
// 8. NAPIER REPORTS & ACCURATE PROFIT & LOSS ACCOUNTING
// ─────────────────────────────────────────────────────────────────
function renderNapierReports(container) {
  const isFinance = store.canViewFinancials();
  const summary = store.getNapierFinancialSummary(reportPeriod);
  const stock = summary.stockSummary;
  const plots = store.data.napierPlots || [];
  const harvests = store.data.napierHarvests || [];
  const sales = store.data.napierSales || [];
  const expenses = store.data.napierExpenses || [];

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:700;margin:0;color:#FFFFFF;text-shadow:0 2px 8px rgba(0,0,0,0.35);">📈 Napier Financial & Yield Reports</h2>
        <p style="font-size:0.83rem;color:#D1FAE5;margin:3px 0 0 0;">
          Strictly independent accounting. Production cost capitalization, weighted-average COGS, and realized profit/loss.
        </p>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="btn-secondary" onclick="window.exportNapierReportExcel()">
          <span>📊</span> <span>Export to Excel</span>
        </button>
        <button class="btn-secondary" onclick="window.print()">
          <span>🖨️</span> <span>Print Statement</span>
        </button>
        ${store.canDelete() ? `
          <button class="btn-danger" style="background:#dc2626;color:#fff;border-radius:8px;padding:8px 14px;font-size:0.84rem;font-weight:700;border:none;cursor:pointer;" onclick="window.confirmResetNapierData()" title="Reset Napier records">
            <span>💣</span> <span>Reset Napier Data</span>
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Controls: Period Filter & Report View Toggle -->
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;background:rgba(255,255,255,0.85);padding:12px 16px;border-radius:12px;border:1px solid rgba(0,0,0,0.06);">
      <!-- Period Selector -->
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);">Period:</span>
        <select class="form-input" style="padding:6px 12px;font-size:0.84rem;" onchange="window.setNapierReportPeriod(this.value)">
          <option value="this-month" ${reportPeriod === 'this-month' ? 'selected' : ''}>This Month</option>
          <option value="last-month" ${reportPeriod === 'last-month' ? 'selected' : ''}>Last Month</option>
          <option value="this-year" ${reportPeriod === 'this-year' ? 'selected' : ''}>This Year (2026)</option>
          <option value="all-time" ${reportPeriod === 'all-time' ? 'selected' : ''}>All Time</option>
        </select>
      </div>

      <!-- Report View Selector -->
      <div class="goat-view-toggle">
        <button class="goat-toggle-btn ${reportViewType === 'pnl' ? 'active' : ''}" onclick="window.setNapierReportView('pnl')">
          Profit & Loss Statement
        </button>
        <button class="goat-toggle-btn ${reportViewType === 'yield' ? 'active' : ''}" onclick="window.setNapierReportView('yield')">
          Plot Yield & Production
        </button>
        <button class="goat-toggle-btn ${reportViewType === 'valuation' ? 'active' : ''}" onclick="window.setNapierReportView('valuation')">
          Inventory Valuation & COGS
        </button>
      </div>
    </div>

    <!-- Render Active Report View -->
    ${reportViewType === 'pnl' ? renderPnLReport(summary) : ''}
    ${reportViewType === 'yield' ? renderYieldReport(plots, harvests) : ''}
    ${reportViewType === 'valuation' ? renderValuationReport(stock, sales) : ''}
  `;
}

function renderPnLReport(summary) {
  const isFinance = store.canViewFinancials();
  const grossMargin = summary.salesRevenue > 0 ? ((summary.grossProfit / summary.salesRevenue) * 100).toFixed(1) : 0;
  const netMargin = summary.salesRevenue > 0 ? ((summary.netProfit / summary.salesRevenue) * 100).toFixed(1) : 0;

  return `
    <div class="section-box" style="margin:0;width:100%;">
      <div class="section-box-header" style="text-align:center;border-bottom:2px solid #E2E8F0;padding-bottom:14px;">
        <div style="font-size:0.8rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:1px;font-weight:700;">NAPIER ENTERPRISE</div>
        <h3 style="font-size:1.4rem;font-weight:800;margin:4px 0;">Statement of Profit and Loss</h3>
        <div style="font-size:0.82rem;color:var(--text-secondary);">Accounting Basis: Accrual Revenue & Weighted-Average COGS</div>
      </div>

      <div style="padding:16px 8px;">
        <!-- REVENUE SECTION -->
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:1.05rem;font-weight:700;border-bottom:1px solid #E2E8F0;">
          <span>1. Gross Napier Sales Revenue</span>
          <span style="color:#059669;">${formatCurrency(summary.salesRevenue)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0 6px 18px;font-size:0.85rem;color:var(--text-muted);">
          <span>Biomass Volume Sold</span>
          <span>${formatWeight(summary.totalSoldPeriodKg)}</span>
        </div>

        <!-- COGS SECTION -->
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:1.05rem;font-weight:700;border-bottom:1px solid #E2E8F0;margin-top:12px;">
          <span>2. Less: Cost of Goods Sold (COGS)</span>
          <span style="color:#DC2626;">-${formatCurrency(summary.cogsAmount)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0 6px 18px;font-size:0.85rem;color:var(--text-muted);">
          <span>Weighted average production cost applied to biomass sold</span>
          <span>@ ₹${summary.stockSummary.weightedAvgCostPerKg}/kg</span>
        </div>

        <!-- GROSS PROFIT -->
        <div style="display:flex;justify-content:space-between;padding:12px 14px;background:#F8FAFC;border-radius:8px;font-size:1.15rem;font-weight:800;margin:16px 0;border:1px solid #E2E8F0;">
          <span>Gross Profit</span>
          <span style="color:${summary.grossProfit >= 0 ? '#059669' : '#DC2626'};">
            ${formatCurrency(summary.grossProfit)} (${grossMargin}%)
          </span>
        </div>

        <!-- OPERATING EXPENSES -->
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:1.05rem;font-weight:700;border-bottom:1px solid #E2E8F0;margin-top:12px;">
          <span>3. Less: Operating Expenses</span>
          <span style="color:#DC2626;">-${formatCurrency(summary.operatingExpenses)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0 6px 18px;font-size:0.85rem;color:var(--text-muted);">
          <span>Land preparation, fertilizer, irrigation & farm maintenance</span>
          <span>(Excludes capitalized harvesting costs)</span>
        </div>

        <!-- NET PROFIT -->
        <div style="display:flex;justify-content:space-between;padding:16px;background:${summary.netProfit >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};border:2px solid ${summary.netProfit >= 0 ? '#10B981' : '#EF4444'};border-radius:10px;font-size:1.3rem;font-weight:800;margin-top:20px;">
          <span>Realized Net Profit / (Loss)</span>
          <span style="color:${summary.netProfit >= 0 ? '#065F46' : '#991B1B'};">
            ${formatCurrency(summary.netProfit)} (${netMargin}%)
          </span>
        </div>

        <!-- CASH FLOW SUMMARY RECONCILIATION -->
        <div style="margin-top:28px;padding-top:16px;border-top:1px dashed #CBD5E1;font-size:0.85rem;color:var(--text-secondary);">
          <div style="font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Cash Flow Reconciliation</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Actual Cash Received from Buyers:</span>
            <strong>${formatCurrency(summary.cashReceived)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span>Accounts Receivable (Uncollected Revenue):</span>
            <strong style="color:#DC2626;">${formatCurrency(summary.periodReceivables)}</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderYieldReport(plots, harvests) {
  return `
    <div class="section-box" style="margin:0;">
      <div class="section-box-header">
        <div class="box-title"><span>🌾</span> Plot-Wise Cultivation & Yield Analysis</div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Plot Name & Code</th>
              <th>Variety</th>
              <th>Area</th>
              <th>Total Cuts</th>
              <th>Total Yield</th>
              <th>Yield / Unit Area</th>
              <th>Total Production Cost</th>
              <th>Avg Cost/kg</th>
            </tr>
          </thead>
          <tbody>
            ${plots.length === 0 ? `
              <tr><td colspan="8" style="text-align:center;padding:24px;">No plots registered.</td></tr>
            ` : plots.map(p => {
              const pHarvests = harvests.filter(h => h.plot_id === p.id || h.plot_code === p.plot_code);
              const totalKg = pHarvests.reduce((sum, h) => sum + (Number(h.quantity_kg) || 0), 0);
              const totalCost = pHarvests.reduce((sum, h) => sum + (Number(h.total_production_cost) || 0), 0);
              const yieldPerArea = Number(p.area) > 0 ? (totalKg / Number(p.area)).toFixed(1) : 0;
              const costPerKg = totalKg > 0 ? (totalCost / totalKg).toFixed(2) : '0.00';

              return `
                <tr>
                  <td><strong>${p.plot_name}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">${p.plot_code}</span></td>
                  <td>${p.napier_variety}</td>
                  <td>${p.area} ${p.area_unit}</td>
                  <td>${pHarvests.length} cuts</td>
                  <td><strong>${formatWeight(totalKg)}</strong></td>
                  <td>${yieldPerArea} kg / ${p.area_unit}</td>
                  <td>${formatCurrency(totalCost)}</td>
                  <td><strong>₹${costPerKg}</strong></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderValuationReport(stock, sales) {
  return `
    <div class="section-box" style="margin:0;">
      <div class="section-box-header">
        <div class="box-title"><span>📦</span> Inventory Valuation & Cost of Goods Sold</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:16px;margin:16px 0;">
        <div style="background:#F8FAFC;padding:16px;border-radius:10px;border:1px solid #E2E8F0;">
          <div style="font-size:0.8rem;color:var(--text-muted);">Available Closing Biomass Stock</div>
          <div style="font-size:1.4rem;font-weight:800;color:var(--primary-emerald);margin:4px 0;">${formatWeight(stock.availableStockKg)}</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);">${stock.availableStockTonnes} tonnes on field / yard</div>
        </div>

        <div style="background:#F8FAFC;padding:16px;border-radius:10px;border:1px solid #E2E8F0;">
          <div style="font-size:0.8rem;color:var(--text-muted);">Weighted-Average Production Cost Basis</div>
          <div style="font-size:1.4rem;font-weight:800;color:#059669;margin:4px 0;">₹${stock.weightedAvgCostPerKg} / kg</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);">Direct labour + cutting + transport costs</div>
        </div>

        <div style="background:#F8FAFC;padding:16px;border-radius:10px;border:1px solid #E2E8F0;">
          <div style="font-size:0.8rem;color:var(--text-muted);">Current Inventory Valuation</div>
          <div style="font-size:1.4rem;font-weight:800;color:var(--primary-navy);margin:4px 0;">${formatCurrency(stock.inventoryValuation)}</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);">Asset value on farm balance sheet</div>
        </div>
      </div>
    </div>
  `;
}

window.setNapierReportPeriod = function(val) {
  reportPeriod = val;
  const container = document.getElementById('napierViewContent');
  if (container) renderNapierReports(container);
};

window.setNapierReportView = function(val) {
  reportViewType = val;
  const container = document.getElementById('napierViewContent');
  if (container) renderNapierReports(container);
};

window.exportNapierReportExcel = function() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: P&L Summary
  const summary = store.getNapierFinancialSummary(reportPeriod);
  const pnlData = [
    ['NAPIER MANAGEMENT MODULE — STATEMENT OF PROFIT & LOSS'],
    ['Period', reportPeriod],
    ['Generated On', new Date().toISOString().split('T')[0]],
    [],
    ['Particulars', 'Amount (INR)'],
    ['Gross Sales Revenue', summary.salesRevenue],
    ['Less: Cost of Goods Sold (COGS)', summary.cogsAmount],
    ['Gross Profit', summary.grossProfit],
    ['Less: Operating Expenses', summary.operatingExpenses],
    ['Net Profit / (Loss)', summary.netProfit],
    [],
    ['Cash Received from Buyers', summary.cashReceived],
    ['Outstanding Accounts Receivable', summary.totalReceivables]
  ];
  const wsPnl = XLSX.utils.aoa_to_sheet(pnlData);
  XLSX.utils.book_append_sheet(wb, wsPnl, 'Profit & Loss');

  // Sheet 2: Harvests
  const harvests = (store.data.napierHarvests || []).map(h => ({
    'Harvest Ref': h.harvest_ref,
    'Date': h.harvest_date,
    'Plot': h.plot_name,
    'Quantity (kg)': h.quantity_kg,
    'Quantity (t)': (Number(h.quantity_kg) / 1000).toFixed(2),
    'Labour Cost': h.labour_cost,
    'Harvesting Cost': h.harvesting_cost,
    'Transport Cost': h.transport_cost,
    'Total Cost': h.total_production_cost,
    'Cost/kg': h.cost_per_kg,
    'Notes': h.notes
  }));
  const wsHarvests = XLSX.utils.json_to_sheet(harvests);
  XLSX.utils.book_append_sheet(wb, wsHarvests, 'Harvests');

  // Sheet 3: Sales
  const sales = (store.data.napierSales || []).map(s => ({
    'Invoice No': s.invoice_no,
    'Date': s.sale_date,
    'Customer': s.customer_name,
    'Pricing Method': s.pricing_method,
    'Quantity Sold': s.quantity_sold,
    'Unit': s.sale_unit,
    'Rate/Unit': s.rate_per_unit,
    'Deducted (kg)': s.quantity_deducted_kg,
    'Total Amount': s.total_amount,
    'Amount Paid': s.amount_paid,
    'Balance Pending': s.balance_pending,
    'Payment Status': s.payment_status
  }));
  const wsSales = XLSX.utils.json_to_sheet(sales);
  XLSX.utils.book_append_sheet(wb, wsSales, 'Sales & Invoices');

  XLSX.writeFile(wb, `Napier_Report_${reportPeriod}_${new Date().toISOString().split('T')[0]}.xlsx`);
  window.showToast?.('Napier report exported to Excel successfully!');
};

// ─────────────────────────────────────────────────────────────────
// MODALS FOR USER WORKFLOWS
// ─────────────────────────────────────────────────────────────────

// 1. Plot Modal (Add / Edit)
window.openNewNapierPlotModal = function() {
  window.openEditNapierPlotModal(null);
};

window.openEditNapierPlotModal = function(plotId) {
  const plot = plotId ? (store.data.napierPlots || []).find(p => p.id === plotId) : null;
  const isEdit = !!plot;

  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = isEdit ? '✏️ Edit Cultivation Plot' : '🌱 Add Cultivation Plot';
  modalBody.innerHTML = `
    <form id="napierPlotForm" style="display:flex;flex-direction:column;gap:14px;padding:10px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Plot Name *</label>
          <input type="text" id="np_name" class="form-input" required value="${plot?.plot_name || ''}" placeholder="e.g. North Canal Plot">
        </div>
        <div>
          <label class="form-label">Plot Code</label>
          <input type="text" id="np_code" class="form-input" value="${plot?.plot_code || ''}" placeholder="Auto-generated if empty">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Cultivated Area *</label>
          <input type="number" step="0.01" min="0.01" id="np_area" class="form-input" required value="${plot?.area || 1.0}">
        </div>
        <div>
          <label class="form-label">Area Unit</label>
          <select id="np_unit" class="form-input">
            <option value="Acres" ${plot?.area_unit === 'Acres' ? 'selected' : ''}>Acres</option>
            <option value="Hectares" ${plot?.area_unit === 'Hectares' ? 'selected' : ''}>Hectares</option>
            <option value="Guntas" ${plot?.area_unit === 'Guntas' ? 'selected' : ''}>Guntas</option>
            <option value="Cents" ${plot?.area_unit === 'Cents' ? 'selected' : ''}>Cents</option>
            <option value="Sq.Meters" ${plot?.area_unit === 'Sq.Meters' ? 'selected' : ''}>Sq.Meters</option>
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Napier Variety</label>
          <input type="text" id="np_variety" class="form-input" value="${plot?.napier_variety || 'Super Napier'}" placeholder="Super Napier, Pakchong 1, etc.">
        </div>
        <div>
          <label class="form-label">Irrigation Type</label>
          <select id="np_irrigation" class="form-input">
            <option value="Drip" ${plot?.irrigation_type === 'Drip' ? 'selected' : ''}>Drip Irrigation</option>
            <option value="Sprinkler" ${plot?.irrigation_type === 'Sprinkler' ? 'selected' : ''}>Sprinkler</option>
            <option value="Flood" ${plot?.irrigation_type === 'Flood' ? 'selected' : ''}>Flood</option>
            <option value="Rainfed" ${plot?.irrigation_type === 'Rainfed' ? 'selected' : ''}>Rainfed</option>
            <option value="Other" ${plot?.irrigation_type === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Planting Date</label>
          <input type="date" id="np_planting_date" class="form-input" value="${plot?.planting_date || store.getCurrentDate()}">
        </div>
        <div>
          <label class="form-label">Status</label>
          <select id="np_status" class="form-input">
            <option value="Growing" ${plot?.status === 'Growing' ? 'selected' : ''}>Growing</option>
            <option value="Ready for Harvest" ${plot?.status === 'Ready for Harvest' ? 'selected' : ''}>Ready for Harvest</option>
            <option value="Preparing" ${plot?.status === 'Preparing' ? 'selected' : ''}>Preparing</option>
            <option value="Inactive" ${plot?.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Location / Sector</label>
          <input type="text" id="np_location" class="form-input" value="${plot?.location || ''}" placeholder="Sector 4, East Farm">
        </div>
        <div>
          <label class="form-label">Initial Planting Cost (₹)</label>
          <input type="number" step="0.01" min="0" id="np_cost" class="form-input" value="${plot?.establishment_cost || 0}">
        </div>
      </div>

      <div>
        <label class="form-label">Notes</label>
        <textarea id="np_notes" class="form-input" rows="2" placeholder="Soil condition, planting stems, fertiliser applied...">${plot?.notes || ''}</textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveNapierPlotBtn">
          ${isEdit ? 'Update Plot' : 'Save Plot'}
        </button>
      </div>
    </form>
  `;

  document.getElementById('napierPlotForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveNapierPlotBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;

    try {
      const payload = {
        plot_name: document.getElementById('np_name').value.trim(),
        plot_code: document.getElementById('np_code').value.trim() || undefined,
        area: Number(document.getElementById('np_area').value),
        area_unit: document.getElementById('np_unit').value,
        napier_variety: document.getElementById('np_variety').value.trim() || 'Super Napier',
        irrigation_type: document.getElementById('np_irrigation').value,
        planting_date: document.getElementById('np_planting_date').value,
        status: document.getElementById('np_status').value,
        location: document.getElementById('np_location').value.trim(),
        establishment_cost: Number(document.getElementById('np_cost').value) || 0,
        notes: document.getElementById('np_notes').value.trim()
      };

      if (isEdit) {
        await store.updateNapierPlot(plot.id, payload);
        window.showToast?.('Plot updated successfully!');
      } else {
        await store.addNapierPlot(payload);
        window.showToast?.('Plot created successfully!');
      }

      window.closeModal();
      renderNapierManagement();
    } catch (err) {
      alert('Error saving plot: ' + err.message);
      btn.textContent = isEdit ? 'Update Plot' : 'Save Plot'; btn.disabled = false;
    }
  };

  window.openModal?.();
};

window.deleteNapierPlotConfirm = async function(plotId) {
  if (!confirm('Are you sure you want to delete this plot? Associated historical harvests will remain preserved.')) return;
  try {
    await store.deleteNapierPlot(plotId);
    window.showToast?.('Plot deleted.');
    renderNapierManagement();
  } catch (err) {
    alert('Error deleting plot: ' + err.message);
  }
};

// 2. Harvest Modal
window.openNewNapierHarvestModal = function(preselectedPlotId) {
  const plots = store.data.napierPlots || [];
  if (plots.length === 0) {
    alert('Please create at least one cultivation plot first before recording a harvest.');
    window.openNewNapierPlotModal();
    return;
  }

  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = '🌿 Record Napier Harvest Cut';
  modalBody.innerHTML = `
    <form id="napierHarvestForm" style="display:flex;flex-direction:column;gap:14px;padding:10px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Cultivation Plot *</label>
          <select id="nh_plot" class="form-input" required>
            ${plots.map(p => `
              <option value="${p.id}" ${p.id === preselectedPlotId ? 'selected' : ''}>
                ${p.plot_name} (${p.plot_code}) - ${p.status}
              </option>
            `).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Harvest Date *</label>
          <input type="date" id="nh_date" class="form-input" required value="${store.getCurrentDate()}">
        </div>
      </div>

      <!-- Quantity & Unit -->
      <div style="background:rgba(16,185,129,0.06);padding:14px;border-radius:10px;border:1px solid rgba(16,185,129,0.2);">
        <label class="form-label" style="font-weight:700;color:#065F46;">Harvested Biomass Quantity *</label>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:6px;">
          <input type="number" step="0.01" min="0.01" id="nh_qty" class="form-input" required placeholder="Quantity" oninput="window.updateHarvestCalc()">
          <select id="nh_unit" class="form-input" onchange="window.updateHarvestCalc()">
            <option value="kg" selected>Kilograms (kg)</option>
            <option value="tonnes">Tonnes (t)</option>
          </select>
        </div>
        <div id="nh_qty_preview" style="font-size:0.83rem;color:#065F46;font-weight:600;margin-top:6px;">
          = 0 kg (0.00 tonnes)
        </div>
      </div>

      <!-- Production Costs -->
      <div>
        <label class="form-label" style="font-weight:700;">Harvesting & Production Costs (₹)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
          <div>
            <label style="font-size:0.75rem;color:var(--text-muted);">Labour Cost (₹)</label>
            <input type="number" step="0.01" min="0" id="nh_labour" class="form-input" value="0" placeholder="0" oninput="window.updateHarvestCalc()">
          </div>
          <div>
            <label style="font-size:0.75rem;color:var(--text-muted);">Cutting Machine Cost (₹)</label>
            <input type="number" step="0.01" min="0" id="nh_cutting" class="form-input" value="0" placeholder="0" oninput="window.updateHarvestCalc()">
          </div>
          <div>
            <label style="font-size:0.75rem;color:var(--text-muted);">Transport / Loading (₹)</label>
            <input type="number" step="0.01" min="0" id="nh_transport" class="form-input" value="0" placeholder="0" oninput="window.updateHarvestCalc()">
          </div>
          <div>
            <label style="font-size:0.75rem;color:var(--text-muted);">Other In-field Costs (₹)</label>
            <input type="number" step="0.01" min="0" id="nh_other" class="form-input" value="0" placeholder="0" oninput="window.updateHarvestCalc()">
          </div>
        </div>

        <div id="nh_cost_preview" style="background:#F8FAFC;padding:10px 14px;border-radius:8px;margin-top:10px;display:flex;justify-content:space-between;font-size:0.88rem;font-weight:700;">
          <span>Total Capitalized Harvest Cost:</span>
          <span style="color:#059669;" id="nh_total_cost_label">₹0 (₹0.00 / kg)</span>
        </div>
      </div>

      <div>
        <label class="form-label">Notes</label>
        <textarea id="nh_notes" class="form-input" rows="2" placeholder="Moisture content, regrowth height, weather..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveNapierHarvestBtn">
          Save Harvest & Update Stock
        </button>
      </div>
    </form>
  `;

  window.updateHarvestCalc = function() {
    const qty = Number(document.getElementById('nh_qty')?.value || 0);
    const unit = document.getElementById('nh_unit')?.value || 'kg';
    const qtyKg = unit === 'tonnes' ? qty * 1000 : qty;
    const qtyTonnes = unit === 'tonnes' ? qty : qty / 1000;

    const preview = document.getElementById('nh_qty_preview');
    if (preview) {
      preview.textContent = `= ${qtyKg.toLocaleString('en-IN')} kg (${qtyTonnes.toFixed(3)} tonnes)`;
    }

    const labour = Number(document.getElementById('nh_labour')?.value || 0);
    const cutting = Number(document.getElementById('nh_cutting')?.value || 0);
    const transport = Number(document.getElementById('nh_transport')?.value || 0);
    const other = Number(document.getElementById('nh_other')?.value || 0);
    const total = labour + cutting + transport + other;
    const costPerKg = qtyKg > 0 ? (total / qtyKg).toFixed(2) : '0.00';

    const costLabel = document.getElementById('nh_total_cost_label');
    if (costLabel) {
      costLabel.textContent = `₹${total.toLocaleString('en-IN')} (₹${costPerKg} / kg)`;
    }
  };

  document.getElementById('napierHarvestForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveNapierHarvestBtn');
    btn.textContent = 'Recording…'; btn.disabled = true;

    try {
      const payload = {
        plot_id: document.getElementById('nh_plot').value,
        harvest_date: document.getElementById('nh_date').value,
        input_quantity: Number(document.getElementById('nh_qty').value),
        input_unit: document.getElementById('nh_unit').value,
        labour_cost: Number(document.getElementById('nh_labour').value) || 0,
        harvesting_cost: Number(document.getElementById('nh_cutting').value) || 0,
        transport_cost: Number(document.getElementById('nh_transport').value) || 0,
        other_cost: Number(document.getElementById('nh_other').value) || 0,
        notes: document.getElementById('nh_notes').value.trim()
      };

      await store.recordNapierHarvest(payload);
      window.showToast?.('Harvest cut recorded and stock ledger updated!');
      window.closeModal();
      renderNapierManagement();
    } catch (err) {
      alert('Error recording harvest: ' + err.message);
      btn.textContent = 'Save Harvest & Update Stock'; btn.disabled = false;
    }
  };

  window.openModal?.();
};

window.deleteNapierHarvestConfirm = async function(harvestId) {
  if (!confirm('Are you sure you want to delete this harvest record? Associated stock ledger addition will also be reversed.')) return;
  try {
    await store.deleteNapierHarvest(harvestId);
    window.showToast?.('Harvest record removed.');
    renderNapierManagement();
  } catch (err) {
    alert('Error deleting harvest: ' + err.message);
  }
};

// 3. Stock Adjustment / Wastage Modal
window.openNewNapierStockAdjModal = function(defaultType = 'ADDITION') {
  const stock = store.getNapierStockSummary();
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = defaultType === 'WASTAGE' ? '🍂 Record Wastage / Drying Shrinkage' : '⚖️ Stock Inventory Adjustment';
  modalBody.innerHTML = `
    <form id="napierStockAdjForm" style="display:flex;flex-direction:column;gap:14px;padding:10px;">
      <div style="background:#F8FAFC;padding:12px;border-radius:8px;font-size:0.85rem;">
        Available Napier Stock: <strong>${formatWeight(stock.availableStockKg)}</strong>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Adjustment Type *</label>
          <select id="nsa_type" class="form-input" required>
            <option value="ADDITION" ${defaultType === 'ADDITION' ? 'selected' : ''}>Positive Adjustment (+ Stock Surplus)</option>
            <option value="REDUCTION" ${defaultType === 'REDUCTION' ? 'selected' : ''}>Negative Adjustment (- Stock Deficit)</option>
            <option value="WASTAGE" ${defaultType === 'WASTAGE' ? 'selected' : ''}>Wastage / Spoilage / Drying Loss (-)</option>
          </select>
        </div>
        <div>
          <label class="form-label">Date *</label>
          <input type="date" id="nsa_date" class="form-input" required value="${store.getCurrentDate()}">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Quantity *</label>
          <input type="number" step="0.01" min="0.01" id="nsa_qty" class="form-input" required placeholder="Quantity">
        </div>
        <div>
          <label class="form-label">Unit</label>
          <select id="nsa_unit" class="form-input">
            <option value="kg" selected>kg</option>
            <option value="tonnes">tonnes</option>
          </select>
        </div>
      </div>

      <div>
        <label class="form-label">Reason / Cause *</label>
        <input type="text" id="nsa_reason" class="form-input" required placeholder="e.g. In-field drying loss, scale recalibration, rain damage">
      </div>

      <div>
        <label class="form-label">Notes</label>
        <textarea id="nsa_notes" class="form-input" rows="2" placeholder="Details..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveNapierAdjBtn">Apply Adjustment</button>
      </div>
    </form>
  `;

  document.getElementById('napierStockAdjForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveNapierAdjBtn');
    btn.textContent = 'Applying…'; btn.disabled = true;

    try {
      const unit = document.getElementById('nsa_unit').value;
      const rawQty = Number(document.getElementById('nsa_qty').value);
      const qtyKg = unit === 'tonnes' ? rawQty * 1000 : rawQty;

      await store.recordNapierStockAdjustment({
        adj_date: document.getElementById('nsa_date').value,
        adj_type: document.getElementById('nsa_type').value,
        quantity_kg: qtyKg,
        reason: document.getElementById('nsa_reason').value.trim(),
        notes: document.getElementById('nsa_notes').value.trim()
      });

      window.showToast?.('Stock adjustment applied to ledger.');
      window.closeModal();
      renderNapierManagement();
    } catch (err) {
      alert('Adjustment error: ' + err.message);
      btn.textContent = 'Apply Adjustment'; btn.disabled = false;
    }
  };

  window.openModal?.();
};

// 4. Sales / Invoice Modal
window.openNewNapierSaleModal = function() {
  const stock = store.getNapierStockSummary();
  const customers = store.data.napierCustomers || [];

  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = '💼 New Napier Grass Sale & Invoice';
  modalBody.innerHTML = `
    <form id="napierSaleForm" style="display:flex;flex-direction:column;gap:14px;padding:10px;">
      <!-- Stock Availability Banner -->
      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);padding:10px 14px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Available Napier Stock:</span>
          <div style="font-size:1.15rem;font-weight:800;color:#065F46;">${formatWeight(stock.availableStockKg)}</div>
        </div>
        <div style="font-size:0.75rem;color:#059669;font-weight:600;">
          Cost Basis: ₹${stock.weightedAvgCostPerKg}/kg
        </div>
      </div>

      <!-- Customer & Date -->
      ${customers.length === 0 ? `
        <div style="background:#F8FAFC;padding:12px;border-radius:10px;border:1px solid #E2E8F0;">
          <div style="font-weight:700;font-size:0.85rem;color:#0F172A;margin-bottom:8px;">Customer Information *</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="form-label">Customer / Dairy Farm Name *</label>
              <input type="text" id="ns_new_cust_name" class="form-input" required placeholder="e.g. Sri Balaji Dairy Farm">
              <input type="hidden" id="ns_cust" value="__NEW__">
            </div>
            <div>
              <label class="form-label">Sale Date *</label>
              <input type="date" id="ns_date" class="form-input" required value="${store.getCurrentDate()}">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
            <div>
              <label class="form-label">Phone Number (Optional)</label>
              <input type="text" id="ns_new_cust_phone" class="form-input" placeholder="+91 98...">
            </div>
            <div>
              <label class="form-label">Location / Village (Optional)</label>
              <input type="text" id="ns_new_cust_address" class="form-input" placeholder="e.g. Warangal">
            </div>
          </div>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <label class="form-label" style="margin:0;">Customer *</label>
              <button type="button" class="btn-secondary" style="padding:2px 8px;font-size:0.75rem;" onclick="window.toggleNapierSaleNewCust()">＋ New</button>
            </div>
            <select id="ns_cust" class="form-input" onchange="window.handleNapierSaleCustChange(this.value)">
              ${customers.map(c => `<option value="${c.id}">${c.name} (${c.phone || 'No phone'})</option>`).join('')}
              <option value="__NEW__">＋ Add New Customer…</option>
            </select>
          </div>
          <div>
            <label class="form-label">Sale Date *</label>
            <input type="date" id="ns_date" class="form-input" required value="${store.getCurrentDate()}">
          </div>
        </div>

        <div id="ns_new_cust_box" style="display:none;background:#F8FAFC;padding:12px;border-radius:10px;border:1px solid #CBD5E1;">
          <div style="font-weight:700;font-size:0.83rem;color:#0F172A;margin-bottom:8px;">New Customer Details:</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Customer Name *</label>
              <input type="text" id="ns_new_cust_name" class="form-input" placeholder="e.g. Lakshmi Dairy Farm">
            </div>
            <div>
              <label class="form-label">Phone (Optional)</label>
              <input type="text" id="ns_new_cust_phone" class="form-input" placeholder="+91 98...">
            </div>
          </div>
        </div>
      `}

      <!-- Pricing Method Toggle -->
      <div style="background:#F8FAFC;padding:14px;border-radius:10px;border:1px solid #E2E8F0;">
        <label class="form-label" style="font-weight:700;">Pricing Method *</label>
        <div style="display:flex;gap:18px;margin:8px 0 12px 0;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="radio" name="ns_pricing_method" value="weight_based" checked onchange="window.toggleNapierPricingMethod()">
            <strong>Method A: Weight-Based (kg / tonnes)</strong>
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="radio" name="ns_pricing_method" value="fixed_bundle" onchange="window.toggleNapierPricingMethod()">
            <strong>Method B: Fixed-Price Loads / Bundles</strong>
          </label>
        </div>

        <!-- Section A: Weight-based inputs -->
        <div id="ns_weight_section">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Unit</label>
              <select id="ns_weight_unit" class="form-input" onchange="window.updateSaleCalculations()">
                <option value="kg">Kilograms (kg)</option>
                <option value="tonnes" selected>Tonnes (t)</option>
              </select>
            </div>
            <div>
              <label class="form-label">Quantity *</label>
              <input type="number" step="0.01" min="0.01" id="ns_weight_qty" class="form-input" placeholder="0" oninput="window.updateSaleCalculations()">
            </div>
            <div>
              <label class="form-label">Rate / Unit (₹) *</label>
              <input type="number" step="0.01" min="0" id="ns_weight_rate" class="form-input" placeholder="0" oninput="window.updateSaleCalculations()">
            </div>
          </div>
        </div>

        <!-- Section B: Fixed bundle inputs -->
        <div id="ns_bundle_section" style="display:none;">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Bundle / Load Count *</label>
              <input type="number" min="1" id="ns_bundle_count" class="form-input" placeholder="0" oninput="window.updateSaleCalculations()">
            </div>
            <div>
              <label class="form-label">Rate / Bundle (₹) *</label>
              <input type="number" step="0.01" min="0" id="ns_bundle_rate" class="form-input" placeholder="0" oninput="window.updateSaleCalculations()">
            </div>
            <div>
              <label class="form-label">Stock Weight Deducted (kg) *</label>
              <input type="number" step="0.01" min="0.01" id="ns_bundle_deduct_kg" class="form-input" placeholder="0" oninput="window.updateSaleCalculations()">
            </div>
          </div>
        </div>
      </div>

      <!-- Live Stock & Stock Validation Warning -->
      <div id="ns_stock_alert" style="display:none;background:#FEE2E2;color:#B91C1C;padding:10px 14px;border-radius:8px;font-size:0.85rem;font-weight:700;">
        ⚠️ Insufficient stock! Sale quantity exceeds available biomass.
      </div>

      <!-- Financial Charges & Totals -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Transport Charges (₹)</label>
          <input type="number" step="0.01" min="0" id="ns_transport" class="form-input" value="0" placeholder="0" oninput="window.updateSaleCalculations()">
        </div>
        <div>
          <label class="form-label">Other Loading/Delivery (₹)</label>
          <input type="number" step="0.01" min="0" id="ns_other" class="form-input" value="0" placeholder="0" oninput="window.updateSaleCalculations()">
        </div>
      </div>

      <!-- Payment Collection -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Amount Paid Now (₹)</label>
          <input type="number" step="0.01" min="0" id="ns_paid" class="form-input" value="0" placeholder="0" oninput="window.updateSaleCalculations()">
        </div>
        <div>
          <label class="form-label">Payment Method</label>
          <select id="ns_method" class="form-input">
            <option value="Cash">Cash</option>
            <option value="UPI">UPI / GPay / PhonePe</option>
            <option value="Bank Transfer">Bank Transfer (IMPS/NEFT)</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div>
          <label class="form-label">Payment Due Date</label>
          <input type="date" id="ns_due_date" class="form-input">
        </div>
      </div>

      <!-- Live Total Invoice Preview Box -->
      <div style="background:#F8FAFC;padding:14px;border-radius:10px;border:1px solid #CBD5E1;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Invoice Total:</span>
          <div style="font-size:1.3rem;font-weight:800;color:#065F46;" id="ns_total_preview">₹0</div>
        </div>
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Stock Deducted:</span>
          <div style="font-size:1.1rem;font-weight:700;" id="ns_deduct_preview">0 kg</div>
        </div>
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Balance Pending:</span>
          <div style="font-size:1.2rem;font-weight:800;color:#DC2626;" id="ns_balance_preview">₹0</div>
        </div>
      </div>

      <div>
        <label class="form-label">Notes</label>
        <textarea id="ns_notes" class="form-input" rows="2" placeholder="Vehicle no, delivery notes, agreed rate..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveNapierSaleBtn">Generate Invoice & Deduct Stock</button>
      </div>
    </form>
  `;

  window.handleNapierSaleCustChange = function(val) {
    const box = document.getElementById('ns_new_cust_box');
    if (box) box.style.display = (val === '__NEW__') ? 'block' : 'none';
  };

  window.toggleNapierSaleNewCust = function() {
    const sel = document.getElementById('ns_cust');
    if (sel) {
      sel.value = '__NEW__';
      window.handleNapierSaleCustChange('__NEW__');
    }
  };

  window.toggleNapierPricingMethod = function() {
    const method = document.querySelector('input[name="ns_pricing_method"]:checked')?.value;
    const isWeight = method === 'weight_based';
    document.getElementById('ns_weight_section').style.display = isWeight ? 'block' : 'none';
    document.getElementById('ns_bundle_section').style.display = isWeight ? 'none' : 'block';
    window.updateSaleCalculations();
  };

  window.updateSaleCalculations = function() {
    const method = document.querySelector('input[name="ns_pricing_method"]:checked')?.value || 'weight_based';
    let qtySold = 0;
    let rate = 0;
    let deductKg = 0;
    let subtotal = 0;

    if (method === 'weight_based') {
      const unit = document.getElementById('ns_weight_unit')?.value || 'tonnes';
      const rawQty = Number(document.getElementById('ns_weight_qty')?.value || 0);
      rate = Number(document.getElementById('ns_weight_rate')?.value || 0);
      qtySold = rawQty;
      subtotal = rawQty * rate;
      deductKg = unit === 'tonnes' ? rawQty * 1000 : rawQty;
    } else {
      const bundleCount = Number(document.getElementById('ns_bundle_count')?.value || 0);
      rate = Number(document.getElementById('ns_bundle_rate')?.value || 0);
      qtySold = bundleCount;
      subtotal = bundleCount * rate;
      deductKg = Number(document.getElementById('ns_bundle_deduct_kg')?.value || 0);
    }

    const transport = Number(document.getElementById('ns_transport')?.value || 0);
    const other = Number(document.getElementById('ns_other')?.value || 0);
    const totalAmount = subtotal + transport + other;

    const amountPaid = Number(document.getElementById('ns_paid')?.value || 0);
    const balance = Math.max(0, totalAmount - amountPaid);

    // Stock validation
    const alertDiv = document.getElementById('ns_stock_alert');
    const submitBtn = document.getElementById('saveNapierSaleBtn');
    if (deductKg > stock.availableStockKg) {
      if (alertDiv) {
        alertDiv.style.display = 'block';
        alertDiv.textContent = `⚠️ Insufficient stock! Available: ${stock.availableStockKg.toLocaleString('en-IN')} kg, requested sale: ${deductKg.toLocaleString('en-IN')} kg.`;
      }
      if (submitBtn) submitBtn.disabled = true;
    } else {
      if (alertDiv) alertDiv.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
    }

    document.getElementById('ns_total_preview').textContent = `₹${totalAmount.toLocaleString('en-IN')}`;
    document.getElementById('ns_deduct_preview').textContent = `${deductKg.toLocaleString('en-IN')} kg (${(deductKg / 1000).toFixed(2)} t)`;
    document.getElementById('ns_balance_preview').textContent = `₹${balance.toLocaleString('en-IN')}`;
  };

  document.getElementById('napierSaleForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveNapierSaleBtn');
    btn.textContent = 'Processing…'; btn.disabled = true;

    try {
      const custSelect = document.getElementById('ns_cust')?.value || '__NEW__';
      let customerId = custSelect;
      let customerName = '';

      if (custSelect === '__NEW__') {
        customerName = (document.getElementById('ns_new_cust_name')?.value || '').trim();
        const customerPhone = (document.getElementById('ns_new_cust_phone')?.value || '').trim();
        const customerAddress = (document.getElementById('ns_new_cust_address')?.value || '').trim();
        if (!customerName) throw new Error('Customer name is required.');
        const newC = await store.addNapierCustomer({ name: customerName, phone: customerPhone, address: customerAddress });
        customerId = newC.id;
      } else {
        const cObj = customers.find(c => c.id === custSelect);
        customerName = cObj?.name || 'Customer';
      }

      const method = document.querySelector('input[name="ns_pricing_method"]:checked').value;
      let qtySold = 0;
      let rate = 0;
      let deductKg = 0;
      let unit = 'kg';

      if (method === 'weight_based') {
        unit = document.getElementById('ns_weight_unit').value;
        qtySold = Number(document.getElementById('ns_weight_qty').value);
        rate = Number(document.getElementById('ns_weight_rate').value);
        deductKg = unit === 'tonnes' ? qtySold * 1000 : qtySold;
      } else {
        unit = 'bundle';
        qtySold = Number(document.getElementById('ns_bundle_count').value);
        rate = Number(document.getElementById('ns_bundle_rate').value);
        deductKg = Number(document.getElementById('ns_bundle_deduct_kg').value);
      }

      if (deductKg <= 0) throw new Error('Deducted stock weight must be greater than zero.');

      const payload = {
        customer_id: customerId,
        customer_name: customerName,
        sale_date: document.getElementById('ns_date').value,
        pricing_method: method,
        sale_unit: unit,
        quantity_sold: qtySold,
        rate_per_unit: rate,
        quantity_deducted_kg: deductKg,
        transport_charges: Number(document.getElementById('ns_transport').value) || 0,
        other_charges: Number(document.getElementById('ns_other').value) || 0,
        amount_paid: Number(document.getElementById('ns_paid').value) || 0,
        payment_method: document.getElementById('ns_method').value,
        due_date: document.getElementById('ns_due_date').value || null,
        notes: document.getElementById('ns_notes').value.trim()
      };

      await store.recordNapierSale(payload);
      window.showToast?.('Sale invoice created and stock deducted!');
      window.closeModal();
      renderNapierManagement();
    } catch (err) {
      alert('Sale error: ' + err.message);
      btn.textContent = 'Generate Invoice & Deduct Stock'; btn.disabled = false;
    }
  };

  window.openModal?.();
};

window.openNapierInvoiceDetailModal = function(saleId) {
  const sale = (store.data.napierSales || []).find(s => s.id === saleId || s.invoice_no === saleId);
  if (!sale) return;

  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = `📄 Napier Invoice: ${sale.invoice_no}`;
  modalBody.innerHTML = `
    <div style="padding:16px;background:#fff;border-radius:10px;">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #E2E8F0;padding-bottom:12px;margin-bottom:16px;">
        <div>
          <div style="font-size:1.3rem;font-weight:800;color:#065F46;">🌱 Sri Balaji Agro Bales</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Napier Fodder & Crop Enterprise</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Warangal, Telangana</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.1rem;font-weight:700;">INVOICE</div>
          <div style="font-size:0.85rem;font-weight:600;">${sale.invoice_no}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Date: ${sale.sale_date}</div>
        </div>
      </div>

      <div style="margin-bottom:16px;font-size:0.88rem;">
        <span style="color:var(--text-muted);">Billed To:</span><br>
        <strong>${sale.customer_name}</strong>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:16px;">
        <thead>
          <tr style="background:#F8FAFC;border-bottom:1px solid #CBD5E1;">
            <th style="padding:8px;text-align:left;">Item & Method</th>
            <th style="padding:8px;text-align:right;">Qty</th>
            <th style="padding:8px;text-align:right;">Rate</th>
            <th style="padding:8px;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #E2E8F0;">
              Fresh Green Napier Grass Biomass<br>
              <span style="font-size:0.75rem;color:var(--text-muted);">Method: ${sale.pricing_method} • Deducted: ${formatWeight(sale.quantity_deducted_kg)}</span>
            </td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #E2E8F0;">${sale.quantity_sold} ${sale.sale_unit}</td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #E2E8F0;">₹${sale.rate_per_unit}</td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #E2E8F0;"><strong>${formatCurrency(sale.subtotal || (sale.quantity_sold * sale.rate_per_unit))}</strong></td>
          </tr>
          ${Number(sale.transport_charges) > 0 ? `
            <tr>
              <td colspan="3" style="padding:6px 8px;text-align:right;">Transport Charges:</td>
              <td style="padding:6px 8px;text-align:right;">${formatCurrency(sale.transport_charges)}</td>
            </tr>
          ` : ''}
          ${Number(sale.other_charges) > 0 ? `
            <tr>
              <td colspan="3" style="padding:6px 8px;text-align:right;">Other Loading:</td>
              <td style="padding:6px 8px;text-align:right;">${formatCurrency(sale.other_charges)}</td>
            </tr>
          ` : ''}
          <tr style="font-size:1.05rem;font-weight:800;border-top:2px solid #CBD5E1;">
            <td colspan="3" style="padding:8px;text-align:right;">Total Amount:</td>
            <td style="padding:8px;text-align:right;color:#065F46;">${formatCurrency(sale.total_amount)}</td>
          </tr>
          <tr>
            <td colspan="3" style="padding:6px 8px;text-align:right;color:#059669;">Amount Received:</td>
            <td style="padding:6px 8px;text-align:right;color:#059669;font-weight:700;">${formatCurrency(sale.amount_paid)}</td>
          </tr>
          <tr style="font-weight:700;">
            <td colspan="3" style="padding:6px 8px;text-align:right;color:#DC2626;">Outstanding Balance:</td>
            <td style="padding:6px 8px;text-align:right;color:#DC2626;">${formatCurrency(sale.balance_pending)}</td>
          </tr>
        </tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button class="btn-secondary" onclick="window.closeModal()">Close</button>
        <button class="btn-primary" onclick="window.print()">🖨️ Print Invoice</button>
      </div>
    </div>
  `;

  window.openModal?.();
};

window.deleteNapierSaleConfirm = async function(saleId) {
  if (!confirm('Are you sure you want to delete this sale? Deducted biomass will be restored to available stock.')) return;
  try {
    await store.deleteNapierSale(saleId);
    window.showToast?.('Sale invoice deleted and stock restored.');
    renderNapierManagement();
  } catch (err) {
    alert('Error deleting sale: ' + err.message);
  }
};

// 5. Payment Modal
window.openNewNapierPaymentModal = function(preselectedSaleId) {
  const sales = (store.data.napierSales || []).filter(s => Number(s.balance_pending) > 0);
  if (sales.length === 0) {
    alert('All sales invoices are already fully paid! No outstanding receivables.');
    return;
  }

  const selectedSale = preselectedSaleId ? sales.find(s => s.id === preselectedSaleId) : sales[0];

  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = '💵 Record Customer Payment';
  modalBody.innerHTML = `
    <form id="napierPaymentForm" style="display:flex;flex-direction:column;gap:14px;padding:10px;">
      <div>
        <label class="form-label">Select Outstanding Invoice *</label>
        <select id="npy_sale" class="form-input" required onchange="window.updatePaymentSalePreview()">
          ${sales.map(s => `
            <option value="${s.id}" ${s.id === selectedSale?.id ? 'selected' : ''}>
              ${s.invoice_no} — ${s.customer_name} (Pending: ₹${s.balance_pending})
            </option>
          `).join('')}
        </select>
      </div>

      <div id="npy_info_box" style="background:#F8FAFC;padding:12px;border-radius:8px;font-size:0.85rem;">
        Invoice Total: <strong>${formatCurrency(selectedSale?.total_amount)}</strong> | 
        Pending Balance: <strong style="color:#DC2626;" id="npy_pending_val">${formatCurrency(selectedSale?.balance_pending)}</strong>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Payment Amount (₹) *</label>
          <input type="number" step="0.01" min="0.01" max="${selectedSale?.balance_pending || 999999}" id="npy_amount" class="form-input" required value="${selectedSale?.balance_pending || ''}">
        </div>
        <div>
          <label class="form-label">Payment Date *</label>
          <input type="date" id="npy_date" class="form-input" required value="${store.getCurrentDate()}">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Payment Method</label>
          <select id="npy_method" class="form-input">
            <option value="Cash">Cash</option>
            <option value="UPI">UPI / GPay / PhonePe</option>
            <option value="Bank Transfer">Bank Transfer (IMPS/NEFT)</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div>
          <label class="form-label">Transaction / Ref No</label>
          <input type="text" id="npy_ref" class="form-input" placeholder="e.g. UTR / Receipt Ref">
        </div>
      </div>

      <div>
        <label class="form-label">Notes</label>
        <textarea id="npy_notes" class="form-input" rows="2" placeholder="Payment notes..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveNapierPaymentBtn">Record Payment</button>
      </div>
    </form>
  `;

  window.updatePaymentSalePreview = function() {
    const sId = document.getElementById('npy_sale')?.value;
    const s = sales.find(x => x.id === sId);
    if (s) {
      document.getElementById('npy_pending_val').textContent = `₹${s.balance_pending}`;
      const amtInput = document.getElementById('npy_amount');
      if (amtInput) {
        amtInput.max = s.balance_pending;
        amtInput.value = s.balance_pending;
      }
    }
  };

  document.getElementById('napierPaymentForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveNapierPaymentBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;

    try {
      const payload = {
        sale_id: document.getElementById('npy_sale').value,
        amount: Number(document.getElementById('npy_amount').value),
        payment_date: document.getElementById('npy_date').value,
        payment_method: document.getElementById('npy_method').value,
        reference_no: document.getElementById('npy_ref').value.trim(),
        notes: document.getElementById('npy_notes').value.trim()
      };

      await store.addNapierPayment(payload);
      window.showToast?.('Payment receipt saved and invoice balance updated!');
      window.closeModal();
      renderNapierManagement();
    } catch (err) {
      alert('Payment error: ' + err.message);
      btn.textContent = 'Record Payment'; btn.disabled = false;
    }
  };

  window.openModal?.();
};

// 6. Expense Modal
window.openNewNapierExpenseModal = function() {
  const plots = store.data.napierPlots || [];
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = '💸 Log Napier Operational Expense';
  modalBody.innerHTML = `
    <form id="napierExpenseForm" style="display:flex;flex-direction:column;gap:14px;padding:10px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Category *</label>
          <select id="nexp_cat" class="form-input" required>
            <option value="Planting Material">Planting Material</option>
            <option value="Land Preparation">Land Preparation</option>
            <option value="Fertilizer & Soil Inputs">Fertilizer & Soil Inputs</option>
            <option value="Irrigation & Water">Irrigation & Water</option>
            <option value="Labour">Labour</option>
            <option value="Cultivation Maintenance">Cultivation Maintenance</option>
            <option value="Harvesting">Harvesting</option>
            <option value="Transport">Transport</option>
            <option value="Equipment & Maintenance">Equipment & Maintenance</option>
            <option value="Other Expenses" selected>Other Expenses</option>
          </select>
        </div>
        <div>
          <label class="form-label">Expense Date *</label>
          <input type="date" id="nexp_date" class="form-input" required value="${store.getCurrentDate()}">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Amount (₹) *</label>
          <input type="number" step="0.01" min="0.01" id="nexp_amount" class="form-input" required placeholder="Amount">
        </div>
        <div>
          <label class="form-label">Payment Method</label>
          <select id="nexp_method" class="form-input">
            <option value="Cash">Cash</option>
            <option value="UPI">UPI / GPay / PhonePe</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Payee / Vendor</label>
          <input type="text" id="nexp_payee" class="form-input" placeholder="e.g. Kisan Fertilizers, Borewell operator">
        </div>
        <div>
          <label class="form-label">Related Plot (Optional)</label>
          <select id="nexp_plot" class="form-input">
            <option value="">None / General Farm</option>
            ${plots.map(p => `<option value="${p.id}">${p.plot_name} (${p.plot_code})</option>`).join('')}
          </select>
        </div>
      </div>

      <div>
        <label class="form-label">Description</label>
        <input type="text" id="nexp_desc" class="form-input" placeholder="e.g. 5 bags urea for plot A, drip pipe repair">
      </div>

      <div>
        <label class="form-label">Notes</label>
        <textarea id="nexp_notes" class="form-input" rows="2" placeholder="Additional details..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveNapierExpenseBtn">Save Expense</button>
      </div>
    </form>
  `;

  document.getElementById('napierExpenseForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveNapierExpenseBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;

    try {
      const payload = {
        category: document.getElementById('nexp_cat').value,
        expense_date: document.getElementById('nexp_date').value,
        amount: Number(document.getElementById('nexp_amount').value),
        payment_method: document.getElementById('nexp_method').value,
        payee: document.getElementById('nexp_payee').value.trim(),
        plot_id: document.getElementById('nexp_plot').value || null,
        description: document.getElementById('nexp_desc').value.trim(),
        notes: document.getElementById('nexp_notes').value.trim()
      };

      await store.recordNapierExpense(payload);
      window.showToast?.('Napier expense recorded.');
      window.closeModal();
      renderNapierManagement();
    } catch (err) {
      alert('Error saving expense: ' + err.message);
      btn.textContent = 'Save Expense'; btn.disabled = false;
    }
  };

  window.openModal?.();
};

window.deleteNapierExpenseConfirm = async function(expId) {
  if (!confirm('Are you sure you want to delete this expense record?')) return;
  try {
    await store.deleteNapierExpense(expId);
    window.showToast?.('Expense deleted.');
    renderNapierManagement();
  } catch (err) {
    alert('Error deleting expense: ' + err.message);
  }
};

// 7. Customer Modal
window.openNewNapierCustomerModal = function() {
  window.openEditNapierCustomerModal(null);
};

window.openEditNapierCustomerModal = function(custId) {
  const cust = custId ? (store.data.napierCustomers || []).find(c => c.id === custId) : null;
  const isEdit = !!cust;

  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = isEdit ? '✏️ Edit Napier Customer' : '👥 Add Napier Customer';
  modalBody.innerHTML = `
    <form id="napierCustForm" style="display:flex;flex-direction:column;gap:14px;padding:10px;">
      <div>
        <label class="form-label">Customer / Farm Name *</label>
        <input type="text" id="nc_name" class="form-input" required value="${cust?.name || ''}" placeholder="e.g. Sri Balaji Dairy Farm">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label class="form-label">Phone</label>
          <input type="text" id="nc_phone" class="form-input" value="${cust?.phone || ''}" placeholder="+91 98490 ...">
        </div>
        <div>
          <label class="form-label">Address / Village</label>
          <input type="text" id="nc_address" class="form-input" value="${cust?.address || ''}" placeholder="Village, Warangal">
        </div>
      </div>

      <div>
        <label class="form-label">Notes</label>
        <textarea id="nc_notes" class="form-input" rows="2" placeholder="Daily milk capacity, payment cycle...">${cust?.notes || ''}</textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveNapierCustBtn">${isEdit ? 'Update Customer' : 'Save Customer'}</button>
      </div>
    </form>
  `;

  document.getElementById('napierCustForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveNapierCustBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;

    try {
      const payload = {
        name: document.getElementById('nc_name').value.trim(),
        phone: document.getElementById('nc_phone').value.trim(),
        address: document.getElementById('nc_address').value.trim(),
        notes: document.getElementById('nc_notes').value.trim()
      };

      if (isEdit) {
        await store.updateNapierCustomer(cust.id, payload);
        window.showToast?.('Customer updated.');
      } else {
        await store.addNapierCustomer(payload);
        window.showToast?.('Customer added.');
      }

      window.closeModal();
      renderNapierManagement();
    } catch (err) {
      alert('Error saving customer: ' + err.message);
      btn.textContent = isEdit ? 'Update Customer' : 'Save Customer'; btn.disabled = false;
    }
  };

  window.openModal?.();
};

window.deleteNapierCustomerConfirm = async function(custId) {
  if (!confirm('Are you sure you want to delete this customer?')) return;
  try {
    await store.deleteNapierCustomer(custId);
    window.showToast?.('Customer deleted.');
    renderNapierManagement();
  } catch (err) {
    alert('Error deleting customer: ' + err.message);
  }
};
