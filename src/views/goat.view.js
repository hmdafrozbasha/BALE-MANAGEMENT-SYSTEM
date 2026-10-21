// src/views/goat.view.js
// Complete, isolated UI views and modal workflows for Goat Farming & Trading.
// Matches the BMS Emerald Liquid Glass design system.

import { store } from '../store.js';
import * as XLSX from 'xlsx';

let currentGoatSubTab = 'dashboard';
let inventoryViewMode = 'individual'; // 'individual' | 'groups'
let inventorySearchQuery = '';
let inventoryBreedFilter = 'all';
let inventoryStatusFilter = 'all';
let reportDateRange = 'this-month';

export function setGoatSubTab(tab) {
  currentGoatSubTab = tab;
  renderGoatFarming();
}

export function renderGoatFarming(subTab) {
  if (subTab) currentGoatSubTab = subTab;
  const appContent = document.getElementById('appContent');
  if (!appContent) return;

  const isFinance = store.canViewFinancials();

  // If subnav already exists in DOM, preserve its scroll position & only update active state + view content
  const existingSubnav = appContent.querySelector('.goat-subnav-container');
  const existingContent = document.getElementById('goatViewContent');

  if (existingSubnav && existingContent) {
    existingSubnav.querySelectorAll('.goat-subnav-btn').forEach(btn => {
      const match = btn.getAttribute('data-subtab') === currentGoatSubTab;
      btn.classList.toggle('active', match);
      if (match) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });
    renderActiveGoatSubView();
    return;
  }

  appContent.innerHTML = `
    <!-- Goat Module Sub-Navigation Bar -->
    <div class="goat-subnav-container">
      <button class="goat-subnav-btn ${currentGoatSubTab === 'dashboard' ? 'active' : ''}" data-subtab="dashboard" onclick="window.switchGoatTab('dashboard')">
        <span>📊</span> <span>Goat Dashboard</span>
      </button>
      ${isFinance ? `
        <button class="goat-subnav-btn ${currentGoatSubTab === 'purchases' ? 'active' : ''}" data-subtab="purchases" onclick="window.switchGoatTab('purchases')">
          <span>🛒</span> <span>Goat Purchases</span>
        </button>
      ` : ''}
      <button class="goat-subnav-btn ${currentGoatSubTab === 'inventory' ? 'active' : ''}" data-subtab="inventory" onclick="window.switchGoatTab('inventory')">
        <span>🐐</span> <span>Herd Inventory</span>
      </button>
      <button class="goat-subnav-btn ${currentGoatSubTab === 'health' ? 'active' : ''}" data-subtab="health" onclick="window.switchGoatTab('health')">
        <span>🩺</span> <span>Growth & Health</span>
      </button>
      ${isFinance ? `
        <button class="goat-subnav-btn ${currentGoatSubTab === 'sales' ? 'active' : ''}" data-subtab="sales" onclick="window.switchGoatTab('sales')">
          <span>💼</span> <span>Goat Sales</span>
        </button>
        <button class="goat-subnav-btn ${currentGoatSubTab === 'expenses' ? 'active' : ''}" data-subtab="expenses" onclick="window.switchGoatTab('expenses')">
          <span>💸</span> <span>Goat Expenses</span>
        </button>
        <button class="goat-subnav-btn ${currentGoatSubTab === 'reports' ? 'active' : ''}" data-subtab="reports" onclick="window.switchGoatTab('reports')">
          <span>📈</span> <span>Goat Reports</span>
        </button>
        <button class="goat-subnav-btn ${currentGoatSubTab === 'contacts' ? 'active' : ''}" data-subtab="contacts" onclick="window.switchGoatTab('contacts')">
          <span>👥</span> <span>Contacts & Ledgers</span>
        </button>
      ` : ''}
    </div>

    <!-- Active Sub-View Content Container -->
    <div id="goatViewContent"></div>
  `;

  renderActiveGoatSubView();
}

function renderActiveGoatSubView() {
  const container = document.getElementById('goatViewContent');
  if (!container) return;

  switch (currentGoatSubTab) {
    case 'dashboard':
      renderGoatDashboard(container);
      break;
    case 'purchases':
      renderGoatPurchases(container);
      break;
    case 'inventory':
      renderGoatInventory(container);
      break;
    case 'health':
      renderGoatHealth(container);
      break;
    case 'sales':
      renderGoatSales(container);
      break;
    case 'expenses':
      renderGoatExpenses(container);
      break;
    case 'reports':
      renderGoatReports(container);
      break;
    case 'contacts':
      renderGoatContacts(container);
      break;
    default:
      renderGoatDashboard(container);
  }
}

// ─────────────────────────────────────────────────────────────────
// 1. GOAT DASHBOARD VIEW
// ─────────────────────────────────────────────────────────────────
function renderGoatDashboard(container) {
  const isFinance = store.canViewFinancials();
  const m = store.getGoatDashboardMetrics();
  const healthRecords = store.data.goatHealthRecords || [];
  const purchases = store.data.goatPurchases || [];
  const sales = store.data.goatSales || [];
  const expenses = store.data.goatExpenses || [];
  const goats = store.data.goats || [];
  const groups = store.data.goatGroups || [];

  // Upcoming reminders (next 14 days)
  const today = store.getCurrentDate();
  const upcomingReminders = healthRecords.filter(h => {
    if (!h.next_scheduled_date) return false;
    const diffDays = Math.ceil((new Date(h.next_scheduled_date) - new Date(today)) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 14;
  });

  // Breed breakdown
  const breedCounts = {};
  goats.filter(g => g.status === 'Active' || g.status === 'Available for Sale').forEach(g => {
    breedCounts[g.breed || 'Other'] = (breedCounts[g.breed || 'Other'] || 0) + 1;
  });

  container.innerHTML = `
    <!-- Top Action Banner -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-size:1.4rem;font-weight:800;color:var(--text-dark-primary);margin:0;font-family:var(--font-heading);">Goat Farm Overview</h2>
        <div style="font-size:0.85rem;color:var(--text-sub);">Real-time livestock inventory, weight monitoring, health ledger & financial performance.</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="btn-secondary" onclick="window.triggerGlobalSync()" title="Synchronize latest cloud data">🔄 Refresh</button>
        <button class="btn-primary" onclick="window.openNewGoatPurchaseModal()">＋ Purchase Goats</button>
        ${isFinance ? `<button class="btn-primary" style="background:linear-gradient(135deg, #10B981 0%, #059669 100%);" onclick="window.openNewGoatSaleModal()">＋ Sell Goats</button>` : ''}
        ${isFinance ? `<button class="btn-secondary" onclick="window.openNewGoatExpenseModal()">＋ Add Expense</button>` : ''}
        ${store.canDelete() ? `<button class="btn-danger" style="background:#dc2626;color:#fff;border-radius:8px;padding:8px 14px;font-size:0.84rem;font-weight:700;" onclick="window.confirmResetGoatData()" title="Reset goat records">💣 Reset Goat Data</button>` : ''}
      </div>
    </div>

    <!-- Health Reminder Alert Banner -->
    ${upcomingReminders.length > 0 ? `
      <div class="goat-reminder-card">
        <div class="goat-reminder-item">
          <span style="font-size:1.4rem;">🩺</span>
          <div>
            <div style="font-weight:800;font-size:0.95rem;">${upcomingReminders.length} Upcoming Health / Vaccination Reminders Due</div>
            <div style="font-size:0.8rem;color:#78350F;">
              ${upcomingReminders.slice(0, 3).map(r => `${r.title_or_vaccine} (Due: ${r.next_scheduled_date})`).join(' • ')}
            </div>
          </div>
        </div>
        <button class="btn-secondary" style="padding:6px 14px;font-size:0.8rem;background:#FFFFFF;color:#92400E;border-color:#F59E0B;" onclick="window.switchGoatTab('health')">View Health Schedule →</button>
      </div>
    ` : ''}

    <!-- 10 KPI Summary Cards Grid -->
    <div class="goat-kpi-grid">
      <!-- 1. Total Goats Owned -->
      <div class="kpi-card total-bales">
        <div class="kpi-label">Total Goats Owned</div>
        <div class="kpi-value">${m.total_goats_owned}</div>
        <div class="kpi-subtext">Active Live Animals</div>
      </div>

      <!-- 2. Individual Goats -->
      <div class="kpi-card ready">
        <div class="kpi-label">Individually Tracked</div>
        <div class="kpi-value">${m.individual_goats_count}</div>
        <div class="kpi-subtext">Tagged Animals</div>
      </div>

      <!-- 3. Active Batches/Groups -->
      <div class="kpi-card fermenting">
        <div class="kpi-label">Active Groups / Batches</div>
        <div class="kpi-value">${m.active_groups_count}</div>
        <div class="kpi-subtext">Group Registered</div>
      </div>

      <!-- 4. Herd Inventory Valuation -->
      <div class="kpi-card empty">
        <div class="kpi-label">Herd Inventory Value</div>
        <div class="kpi-value" style="color:var(--primary-navy);">${store.formatINR(m.herd_inventory_value)}</div>
        <div class="kpi-subtext">Carrying Cost Basis</div>
      </div>

      <!-- 5. Purchases This Month -->
      <div class="kpi-card purchases-kpi">
        <div class="kpi-label">Purchases This Month</div>
        <div class="kpi-value">${store.formatINR(m.purchases_this_month)}</div>
        <div class="kpi-subtext">Acquisition Costs</div>
      </div>

      <!-- 6. Goat Sales This Month -->
      <div class="kpi-card revenue-kpi">
        <div class="kpi-label">Sales This Month</div>
        <div class="kpi-value">${store.formatINR(m.sales_this_month)}</div>
        <div class="kpi-subtext">Gross Revenue</div>
      </div>

      <!-- 7. Rearing Expenses This Month -->
      <div class="kpi-card expenses-kpi">
        <div class="kpi-label">Rearing Expenses</div>
        <div class="kpi-value" style="color:#D9534F;">${store.formatINR(m.expenses_this_month)}</div>
        <div class="kpi-subtext">Feed, Meds & Labour</div>
      </div>

      <!-- 8. Realized Profit / Loss -->
      <div class="kpi-card ${m.realized_profit_loss >= 0 ? 'profit-kpi' : 'loss-kpi'}">
        <div class="kpi-label">Realized Net Profit</div>
        <div class="kpi-value">
          ${store.formatINR(m.realized_profit_loss)}
        </div>
        <div class="kpi-subtext">Sales − COGS − Expenses</div>
      </div>

      <!-- 9. Customer Receivables -->
      <div class="kpi-card customer-due">
        <div class="kpi-label">Customer Receivables</div>
        <div class="kpi-value" style="color:#D9534F;">${store.formatINR(m.customer_receivables)}</div>
        <div class="kpi-subtext">Pending Customer Due</div>
      </div>

      <!-- 10. Supplier Payables -->
      <div class="kpi-card supplier-due">
        <div class="kpi-label">Supplier Payables</div>
        <div class="kpi-value" style="color:#087F5B;">${store.formatINR(m.supplier_payables)}</div>
        <div class="kpi-subtext">Pending To Breeders</div>
      </div>
    </div>

    <!-- Dashboard Two Columns Layout -->
    <div class="dash-two-columns" style="margin-bottom:24px;">
      <!-- Column 1: Recent Purchases -->
      <div class="section-box">
        <div class="section-box-header">
          <div class="box-title">Recent Goat Purchases</div>
          <button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem;" onclick="window.switchGoatTab('purchases')">View All →</button>
        </div>
        <div class="data-table-wrapper">
          <table class="app-table">
            <thead>
              <tr><th>Ref #</th><th>Date</th><th>Supplier</th><th>Qty</th><th>Cost</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${purchases.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:18px;">No purchases recorded yet.</td></tr>' : ''}
              ${purchases.slice(0, 5).map(p => `
                <tr>
                  <td><strong>${p.purchase_ref || p.purchaseRef}</strong></td>
                  <td>${store.formatDate(p.purchase_date || p.purchaseDate)}</td>
                  <td>${p.goat_suppliers?.name || p.supplier_name || 'Livestock Supplier'}</td>
                  <td>${p.quantity} goats</td>
                  <td><strong>${store.formatINR(p.total_acquisition_cost || p.totalCost)}</strong></td>
                  <td><span class="badge ${Number(p.balance_pending || p.balancePending || 0) > 0 ? 'badge-pay' : 'badge-ready'}">${Number(p.balance_pending || p.balancePending || 0) > 0 ? 'Due' : 'Paid'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Column 2: Recent Sales -->
      <div class="section-box">
        <div class="section-box-header">
          <div class="box-title">Recent Goat Sales</div>
          <button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem;" onclick="window.switchGoatTab('sales')">View All →</button>
        </div>
        <div class="data-table-wrapper">
          <table class="app-table">
            <thead>
              <tr><th>Invoice #</th><th>Date</th><th>Customer</th><th>Qty</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${sales.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:18px;">No sales recorded yet.</td></tr>' : ''}
              ${sales.slice(0, 5).map(s => `
                <tr>
                  <td><strong>${s.invoice_no || s.invoiceNo}</strong></td>
                  <td>${store.formatDate(s.sale_date || s.saleDate)}</td>
                  <td>${s.goat_customers?.name || s.customer_name || 'Customer'}</td>
                  <td>${s.total_quantity || s.totalQuantity} goats</td>
                  <td><strong style="color:var(--brand-blue);">${store.formatINR(s.total_amount || s.totalAmount)}</strong></td>
                  <td><span class="badge ${Number(s.balance_pending || s.balancePending || 0) > 0 ? 'badge-pay' : 'badge-ready'}">${Number(s.balance_pending || s.balancePending || 0) > 0 ? 'Unpaid' : 'Cleared'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Herd Breakdown & Recent Expenses Row -->
    <div class="dash-two-columns" style="margin-bottom:24px;">
      <!-- Herd Composition -->
      <div class="section-box">
        <div class="section-box-header">
          <div class="box-title">Herd Composition by Breed</div>
          <button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem;" onclick="window.switchGoatTab('inventory')">Herd Inventory →</button>
        </div>
        <div style="padding:16px;">
          ${Object.keys(breedCounts).length === 0 ? '<div style="color:var(--text-muted);text-align:center;padding:20px;">No goats currently in herd inventory.</div>' : ''}
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">
            ${Object.entries(breedCounts).map(([breed, count]) => `
              <div style="background:rgba(11,48,36,0.04);border:1px solid rgba(11,48,36,0.08);border-radius:12px;padding:12px;text-align:center;">
                <div style="font-size:0.8rem;color:var(--text-muted);font-weight:600;">${breed}</div>
                <div style="font-size:1.4rem;font-weight:800;color:var(--primary-navy);margin-top:4px;">${count}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Recent Expenses -->
      <div class="section-box">
        <div class="section-box-header">
          <div class="box-title">Recent Rearing Expenses</div>
          <button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem;" onclick="window.switchGoatTab('expenses')">All Expenses →</button>
        </div>
        <div class="data-table-wrapper">
          <table class="app-table">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Paid To</th><th>Amount</th></tr>
            </thead>
            <tbody>
              ${expenses.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:18px;">No expenses recorded yet.</td></tr>' : ''}
              ${expenses.slice(0, 5).map(e => `
                <tr>
                  <td>${store.formatDate(e.expense_date || e.expenseDate)}</td>
                  <td><span class="badge badge-ferm">${e.category}</span></td>
                  <td>${e.paid_to || 'Vendor'}</td>
                  <td><strong style="color:var(--red-accent);">${store.formatINR(e.amount)}</strong></td>
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
// 2. GOAT PURCHASES VIEW
// ─────────────────────────────────────────────────────────────────
function renderGoatPurchases(container) {
  const purchases = store.data.goatPurchases || [];
  const suppliers = store.data.goatSuppliers || [];

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-dark-primary);margin:0;font-family:var(--font-heading);">Goat Purchases & Livestock Intake</h2>
        <div style="font-size:0.85rem;color:var(--text-sub);">Direct intake via Group/Batch purchase or Individual Ear-Tag registration with true landed cost allocation.</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" onclick="window.openNewGoatPurchaseModal()">＋ Record Goat Purchase</button>
      </div>
    </div>

    <!-- Supplier Overview Cards -->
    <div class="goat-cards-grid">
      ${suppliers.map(sup => {
        const supPurchases = purchases.filter(p => p.supplier_id === sup.id || p.supplier_name === sup.name);
        const totalPurchased = supPurchases.reduce((s, p) => s + Number(p.total_acquisition_cost || p.totalCost || 0), 0);
        const pending = supPurchases.reduce((s, p) => s + Number(p.balance_pending || p.balancePending || 0), 0);
        return `
          <div class="finance-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-weight:700;font-size:1.05rem;color:var(--primary-navy);">${sup.name}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${sup.city || 'Livestock Breeder'} • ${sup.phone || ''}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="badge ${pending > 0 ? 'badge-pay' : 'badge-ready'}">${pending > 0 ? 'Pending' : 'Cleared'}</span>
                ${store.canDelete() ? `
                  <button class="btn-danger" style="padding:2px 7px;font-size:0.75rem;line-height:1.2;" title="Delete Supplier" onclick="window.confirmDeleteGoatRecord('supplier', '${sup.id}', '${(sup.name||'').replace(/'/g, "\\'")}')">🗑</button>
                ` : ''}
              </div>
            </div>
            <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-light);display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;">
              <div>
                <span style="color:var(--text-muted);display:block;font-size:0.75rem;">Total Intake:</span>
                <strong>${store.formatINR(totalPurchased)}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted);display:block;font-size:0.75rem;">Balance Due:</span>
                <strong style="color:var(--red-accent);">${store.formatINR(pending)}</strong>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Purchases Table -->
    <div class="section-box">
      <div class="section-box-header">
        <div class="box-title">All Goat Purchase Transactions</div>
      </div>
      <div class="data-table-wrapper">
        <table class="app-table">
          <thead>
            <tr>
              <th>Ref #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Method</th>
              <th>Qty</th>
              <th>Base Cost</th>
              <th>Landed Cost</th>
              <th>Allocated / Goat</th>
              <th>Paid</th>
              <th>Pending</th>
              <th>Due Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${purchases.length === 0 ? '<tr><td colspan="12" style="text-align:center;color:var(--text-muted);padding:24px;">No goat purchases recorded yet. Click "+ Record Goat Purchase" to register one.</td></tr>' : ''}
            ${purchases.map(p => {
              const pending = Number(p.balance_pending || p.balancePending || 0);
              return `
                <tr>
                  <td><strong>${p.purchase_ref || p.purchaseRef}</strong></td>
                  <td>${store.formatDate(p.purchase_date || p.purchaseDate)}</td>
                  <td>${p.goat_suppliers?.name || p.supplier_name || 'Supplier'}</td>
                  <td><span class="badge ${p.purchase_method === 'group' ? 'badge-ferm' : 'badge-ready'}">${p.purchase_method === 'group' ? 'Group / Batch' : 'Individual'}</span></td>
                  <td><strong>${p.quantity}</strong></td>
                  <td>${store.formatINR(p.base_amount || p.baseAmount)}</td>
                  <td><strong style="color:var(--primary-navy);">${store.formatINR(p.total_acquisition_cost || p.totalCost)}</strong></td>
                  <td>${store.formatINR(p.allocated_cost_per_goat || p.allocatedCostPerGoat)}</td>
                  <td>${store.formatINR(p.amount_paid || p.amountPaid)}</td>
                  <td><strong style="color:${pending > 0 ? 'var(--red-accent)' : '#087F5B'};">${store.formatINR(pending)}</strong></td>
                  <td>${p.payment_due_date ? store.formatDate(p.payment_due_date) : '—'}</td>
                  <td>
                    <div style="display:flex;gap:6px;align-items:center;">
                      ${pending > 0 ? `
                        <button class="btn-primary" style="padding:4px 8px;font-size:0.75rem;" onclick="window.openGoatSupplierPaymentModal('${p.id}')">Pay</button>
                      ` : ''}
                      <button class="btn-secondary" style="padding:4px 8px;font-size:0.75rem;" onclick="window.openGoatPurchaseDetailModal('${p.id}')">View</button>
                      ${store.canDelete() ? `
                        <button class="btn-danger" style="padding:4px 8px;font-size:0.75rem;" onclick="window.confirmDeleteGoatRecord('purchase', '${p.id}', '${p.purchase_ref}')">🗑</button>
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

// ─────────────────────────────────────────────────────────────────
// 3. HERD INVENTORY VIEW (Individual vs Groups)
// ─────────────────────────────────────────────────────────────────
function renderGoatInventory(container) {
  const goats = store.data.goats || [];
  const groups = store.data.goatGroups || [];

  // Filter goats
  let filteredGoats = goats.filter(g => {
    if (inventoryStatusFilter !== 'all' && g.status !== inventoryStatusFilter) return false;
    if (inventoryBreedFilter !== 'all' && g.breed !== inventoryBreedFilter) return false;
    if (inventorySearchQuery) {
      const q = inventorySearchQuery.toLowerCase();
      return (g.tag_id || '').toLowerCase().includes(q) ||
             (g.breed || '').toLowerCase().includes(q) ||
             (g.notes || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Unique breeds for filter
  const breeds = Array.from(new Set(goats.map(g => g.breed).filter(Boolean)));

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-dark-primary);margin:0;font-family:var(--font-heading);">Herd Inventory Management</h2>
        <div style="font-size:0.85rem;color:var(--text-sub);">Zero double-counting herd tracking across individually tagged goats and collective batches.</div>
      </div>
      
      <!-- Segmented View Toggle -->
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="goat-view-toggle">
          <button class="goat-toggle-btn ${inventoryViewMode === 'individual' ? 'active' : ''}" onclick="window.setInventoryMode('individual')">
            🏷 Individual Goats (${goats.filter(g => g.status === 'Active' || g.status === 'Available for Sale').length})
          </button>
          <button class="goat-toggle-btn ${inventoryViewMode === 'groups' ? 'active' : ''}" onclick="window.setInventoryMode('groups')">
            📦 Batches / Groups (${groups.filter(g => g.current_quantity > 0).length})
          </button>
        </div>
      </div>
    </div>

    ${inventoryViewMode === 'individual' ? `
      <!-- Individual Filters Bar -->
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
        <input type="text" class="form-input" style="max-width:240px;padding:8px 12px;font-size:0.85rem;" placeholder="Search Tag # or Breed..."
          value="${inventorySearchQuery}" oninput="window.setInventorySearch(this.value)" />

        <select class="form-select" style="max-width:180px;padding:8px 12px;font-size:0.85rem;" onchange="window.setInventoryBreed(this.value)">
          <option value="all">All Breeds</option>
          ${breeds.map(b => `<option value="${b}" ${inventoryBreedFilter === b ? 'selected' : ''}>${b}</option>`).join('')}
        </select>

        <select class="form-select" style="max-width:180px;padding:8px 12px;font-size:0.85rem;" onchange="window.setInventoryStatus(this.value)">
          <option value="all">All Statuses</option>
          <option value="Active" ${inventoryStatusFilter === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Available for Sale" ${inventoryStatusFilter === 'Available for Sale' ? 'selected' : ''}>Available for Sale</option>
          <option value="Sold" ${inventoryStatusFilter === 'Sold' ? 'selected' : ''}>Sold</option>
          <option value="Deceased" ${inventoryStatusFilter === 'Deceased' ? 'selected' : ''}>Deceased</option>
        </select>
      </div>

      <!-- Individual Goats Table -->
      <div class="section-box">
        <div class="data-table-wrapper">
          <table class="app-table">
            <thead>
              <tr>
                <th>Tag ID</th>
                <th>Group / Batch</th>
                <th>Breed</th>
                <th>Sex</th>
                <th>Age</th>
                <th>Latest Weight</th>
                <th>Intake Date</th>
                <th>Cost Basis</th>
                <th>Inventory Status</th>
                <th>Health</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filteredGoats.length === 0 ? '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:24px;">No individual goats match the filter.</td></tr>' : ''}
              ${filteredGoats.map(g => {
                const isDeceased = g.status === 'Deceased';
                const isSold = g.status === 'Sold';
                return `
                  <tr>
                    <td><strong>🏷 ${g.tag_id}</strong></td>
                    <td>${g.goat_groups?.group_code || g.group_code || 'Direct Individual'}</td>
                    <td>${g.breed}</td>
                    <td>${g.sex || 'Male'}</td>
                    <td>${g.age_months ? `${g.age_months}m` : '—'}</td>
                    <td><strong>${g.latest_weight ? `${g.latest_weight} kg` : '—'}</strong></td>
                    <td>${store.formatDate(g.purchase_date || g.purchaseDate)}</td>
                    <td>${store.formatINR(g.total_cost_basis || g.acquisition_cost)}</td>
                    <td>
                      <span class="badge ${isSold ? 'goat-badge-sold' : isDeceased ? 'goat-badge-deceased' : 'goat-badge-active'}">
                        ${g.status}
                      </span>
                    </td>
                    <td>
                      <span class="badge ${g.health_status === 'Healthy' ? 'badge-ready' : g.health_status === 'Vaccinated' ? 'badge-ferm' : 'goat-badge-treatment'}">
                        ${g.health_status || 'Healthy'}
                      </span>
                    </td>
                    <td>
                      <div style="display:flex;gap:6px;align-items:center;">
                        ${!isDeceased && !isSold ? `
                          <button class="btn-secondary" style="padding:4px 7px;font-size:0.75rem;" title="Record Weight" onclick="window.openRecordWeightModal('${g.id}')">⚖️</button>
                          <button class="btn-secondary" style="padding:4px 7px;font-size:0.75rem;" title="Record Vaccine / Treatment" onclick="window.openRecordHealthModal('${g.id}')">💉</button>
                          <button class="btn-danger" style="padding:4px 7px;font-size:0.75rem;" title="Mark Deceased" onclick="window.openMarkDeceasedModal('${g.id}', '${g.tag_id}')">⚠️</button>
                        ` : ''}
                        ${store.canDelete() ? `
                          <button class="btn-danger" style="padding:4px 7px;font-size:0.75rem;" title="Delete Goat Record" onclick="window.confirmDeleteGoatRecord('goat', '${g.id}', '${g.tag_id}')">🗑</button>
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
    ` : `
      <!-- Groups / Batches Table -->
      <div class="section-box">
        <div class="data-table-wrapper">
          <table class="app-table">
            <thead>
              <tr>
                <th>Batch Code</th>
                <th>Group Name</th>
                <th>Intake Date</th>
                <th>Original Qty</th>
                <th>Current Qty</th>
                <th>Total Cost Basis</th>
                <th>Cost / Animal</th>
                <th>Latest Total Weight</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${groups.length === 0 ? '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:24px;">No goat groups or batches found.</td></tr>' : ''}
              ${groups.map(grp => {
                const currQty = Number(grp.current_quantity || 0);
                return `
                  <tr>
                    <td><strong>📦 ${grp.group_code}</strong></td>
                    <td>${grp.group_name}</td>
                    <td>${store.formatDate(grp.purchase_date || grp.purchaseDate)}</td>
                    <td>${grp.initial_quantity}</td>
                    <td><strong style="color:var(--primary-navy);font-size:1.05rem;">${currQty}</strong></td>
                    <td><strong>${store.formatINR(grp.total_cost_basis)}</strong></td>
                    <td>${store.formatINR(grp.unit_cost_basis)}</td>
                    <td>${grp.current_total_weight ? `${grp.current_total_weight} kg` : '—'}</td>
                    <td>
                      <span class="badge ${currQty === 0 ? 'goat-badge-sold' : 'goat-badge-active'}">${grp.status}</span>
                    </td>
                    <td>
                      <div style="display:flex;gap:6px;align-items:center;">
                        ${currQty > 0 ? `
                          <button class="btn-primary" style="padding:4px 10px;font-size:0.76rem;" onclick="window.openConvertGroupModal('${grp.id}')">Convert to Individual 🏷</button>
                        ` : '<span style="color:var(--text-muted);font-size:0.8rem;">Batch Cleared</span>'}
                        ${store.canDelete() ? `
                          <button class="btn-danger" style="padding:4px 8px;font-size:0.76rem;" title="Delete Batch Record" onclick="window.confirmDeleteGoatRecord('group', '${grp.id}', '${grp.group_code}')">🗑</button>
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
    `}
  `;
}

// ─────────────────────────────────────────────────────────────────
// 4. GROWTH & BASIC HEALTH VIEW
// ─────────────────────────────────────────────────────────────────
function renderGoatHealth(container) {
  const healthRecords = store.data.goatHealthRecords || [];
  const weightRecords = store.data.goatWeightRecords || [];
  const goats = store.data.goats || [];

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-dark-primary);margin:0;font-family:var(--font-heading);">Growth Tracking & Livestock Health</h2>
        <div style="font-size:0.85rem;color:var(--text-sub);">Maintain historical weight gains, vaccinations, deworming, and veterinary schedules.</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-secondary" onclick="window.openRecordWeightModal()">＋ Record Weight Log</button>
        <button class="btn-primary" onclick="window.openRecordHealthModal()">＋ Record Health Entry</button>
      </div>
    </div>

    <!-- Health Log Table -->
    <div class="section-box" style="margin-bottom:24px;">
      <div class="section-box-header">
        <div class="box-title">Vaccinations, Treatments & Medical Log</div>
      </div>
      <div class="data-table-wrapper">
        <table class="app-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Animal / Tag</th>
              <th>Type</th>
              <th>Treatment / Vaccine</th>
              <th>Dosage</th>
              <th>Administered By</th>
              <th>Cost</th>
              <th>Next Scheduled Remind Date</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${healthRecords.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px;">No health records entered yet. Click "+ Record Health Entry" to add one.</td></tr>' : ''}
            ${healthRecords.map(h => {
              const goat = goats.find(g => g.id === h.goat_id);
              return `
                <tr>
                  <td>${store.formatDate(h.record_date)}</td>
                  <td><strong>${goat ? `🏷 ${goat.tag_id}` : 'Herd Batch'}</strong></td>
                  <td><span class="badge ${h.record_type === 'Vaccination' ? 'badge-ferm' : 'badge-pay'}">${h.record_type}</span></td>
                  <td><strong>${h.title_or_vaccine}</strong></td>
                  <td>${h.dosage || '—'}</td>
                  <td>${h.administered_by || 'Staff'}</td>
                  <td>${h.cost ? store.formatINR(h.cost) : '—'}</td>
                  <td><strong style="color:#B45309;">${h.next_scheduled_date ? store.formatDate(h.next_scheduled_date) : '—'}</strong></td>
                  <td>${h.notes || '—'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Weight Log Table -->
    <div class="section-box">
      <div class="section-box-header">
        <div class="box-title">Weight History & Gain Records</div>
      </div>
      <div class="data-table-wrapper">
        <table class="app-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Animal / Tag</th>
              <th>Recorded Weight</th>
              <th>Weight Gain</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${weightRecords.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No weight history logged yet. Click "+ Record Weight Log" to track weight gain.</td></tr>' : ''}
            ${weightRecords.map(w => {
              const goat = goats.find(g => g.id === w.goat_id);
              return `
                <tr>
                  <td>${store.formatDate(w.record_date)}</td>
                  <td><strong>${goat ? `🏷 ${goat.tag_id}` : 'Group'}</strong></td>
                  <td><strong>${w.weight_kg} kg</strong></td>
                  <td>
                    ${w.weight_gain > 0 ? `<span style="color:#087F5B;font-weight:700;">+${w.weight_gain} kg</span>` :
                      w.weight_gain < 0 ? `<span style="color:#D9534F;font-weight:700;">${w.weight_gain} kg</span>` : '—'}
                  </td>
                  <td>${w.notes || '—'}</td>
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
// 5. GOAT SALES & INVOICES VIEW
// ─────────────────────────────────────────────────────────────────
function renderGoatSales(container) {
  const sales = store.data.goatSales || [];
  const customers = store.data.goatCustomers || [];

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-dark-primary);margin:0;font-family:var(--font-heading);">Goat Sales & Commercial Invoicing</h2>
        <div style="font-size:0.85rem;color:var(--text-sub);">Sell individual animals or group batches using Fixed Price per Animal or Live Weight per Kilogram.</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" onclick="window.openNewGoatSaleModal()">＋ New Goat Sale Invoice</button>
      </div>
    </div>

    <!-- Customer Overview Cards -->
    <div class="goat-cards-grid">
      ${customers.map(cust => {
        const custSales = sales.filter(s => s.customer_id === cust.id || s.customer_name === cust.name);
        const totalPurchased = custSales.reduce((s, sl) => s + Number(sl.total_amount || sl.totalAmount || 0), 0);
        const pending = custSales.reduce((s, sl) => s + Number(sl.balance_pending || sl.balancePending || 0), 0);
        return `
          <div class="finance-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-weight:700;font-size:1.05rem;color:var(--primary-navy);">${cust.name}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${cust.phone || ''}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="badge ${pending > 0 ? 'badge-pay' : 'badge-ready'}">${pending > 0 ? 'Receivable' : 'Settled'}</span>
                ${store.canDelete() ? `
                  <button class="btn-danger" style="padding:2px 7px;font-size:0.75rem;line-height:1.2;" title="Delete Customer" onclick="window.confirmDeleteGoatRecord('customer', '${cust.id}', '${(cust.name||'').replace(/'/g, "\\'")}')">🗑</button>
                ` : ''}
              </div>
            </div>
            <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-light);display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;">
              <div>
                <span style="color:var(--text-muted);display:block;font-size:0.75rem;">Total Sales:</span>
                <strong>${store.formatINR(totalPurchased)}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted);display:block;font-size:0.75rem;">Pending Due:</span>
                <strong style="color:var(--red-accent);">${store.formatINR(pending)}</strong>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Sales Table -->
    <div class="section-box">
      <div class="section-box-header">
        <div class="box-title">All Goat Sales Invoices</div>
      </div>
      <div class="data-table-wrapper">
        <table class="app-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Pricing Method</th>
              <th>Quantity</th>
              <th>Total Weight</th>
              <th>Sale Amount</th>
              <th>COGS</th>
              <th>Gross Margin</th>
              <th>Paid</th>
              <th>Pending</th>
              <th>Due Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${sales.length === 0 ? '<tr><td colspan="13" style="text-align:center;color:var(--text-muted);padding:24px;">No goat sales invoices recorded yet. Click "+ New Goat Sale Invoice" to create one.</td></tr>' : ''}
            ${sales.map(s => {
              const pending = Number(s.balance_pending || s.balancePending || 0);
              const cogs = Number(s.total_cogs || s.totalCogs || 0);
              const margin = Number(s.gross_profit || s.grossProfit || ((s.total_amount || 0) - cogs));
              return `
                <tr>
                  <td><strong>${s.invoice_no || s.invoiceNo}</strong></td>
                  <td>${store.formatDate(s.sale_date || s.saleDate)}</td>
                  <td>${s.goat_customers?.name || s.customer_name || 'Customer'}</td>
                  <td><span class="badge ${s.pricing_method === 'by_weight' ? 'badge-ferm' : 'badge-ready'}">${s.pricing_method === 'by_weight' ? 'By Live Weight' : 'Per Animal'}</span></td>
                  <td><strong>${s.total_quantity || s.totalQuantity}</strong></td>
                  <td>${s.total_weight_kg ? `${s.total_weight_kg} kg` : '—'}</td>
                  <td><strong style="color:var(--brand-blue);">${store.formatINR(s.total_amount || s.totalAmount)}</strong></td>
                  <td>${store.formatINR(cogs)}</td>
                  <td><strong style="color:${margin >= 0 ? '#087F5B' : '#D9534F'};">${store.formatINR(margin)}</strong></td>
                  <td>${store.formatINR(s.amount_paid || s.amountPaid)}</td>
                  <td><strong style="color:${pending > 0 ? 'var(--red-accent)' : '#087F5B'};">${store.formatINR(pending)}</strong></td>
                  <td>${s.payment_due_date ? store.formatDate(s.payment_due_date) : '—'}</td>
                  <td>
                    <div style="display:flex;gap:6px;align-items:center;">
                      ${pending > 0 ? `
                        <button class="btn-primary" style="padding:4px 8px;font-size:0.75rem;" onclick="window.openGoatCustomerPaymentModal('${s.id}')">Receive</button>
                      ` : ''}
                      <button class="btn-secondary" style="padding:4px 8px;font-size:0.75rem;" onclick="window.openGoatInvoiceModal('${s.id}')">Invoice</button>
                      ${store.canDelete() ? `
                        <button class="btn-danger" style="padding:4px 8px;font-size:0.75rem;" onclick="window.confirmDeleteGoatRecord('sale', '${s.id}', '${s.invoice_no}')">🗑</button>
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

// ─────────────────────────────────────────────────────────────────
// 6. GOAT EXPENSES VIEW
// ─────────────────────────────────────────────────────────────────
function renderGoatExpenses(container) {
  const expenses = store.data.goatExpenses || [];
  const CATEGORIES = [
    'Feed', 'Medicines & Veterinary', 'Transport', 'Labour',
    'Other Expenses', 'Shelter & Equipment', 'Breeding Expenses'
  ];

  // Category totals
  const catTotals = {};
  CATEGORIES.forEach(c => catTotals[c] = 0);
  expenses.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount || 0);
  });
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-dark-primary);margin:0;font-family:var(--font-heading);">Goat Business Operating Expenses</h2>
        <div style="font-size:0.85rem;color:var(--text-sub);">Dedicated rearing expenses: Feed, Veterinary Care, Transport, Shelter, Labour and Breeding costs.</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" onclick="window.openNewGoatExpenseModal()">＋ Add Goat Expense</button>
      </div>
    </div>

    <!-- Category Breakdown Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px;">
      ${CATEGORIES.map(cat => `
        <div style="background:rgba(255,255,255,0.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.8);border-radius:14px;padding:14px;box-shadow:0 6px 16px rgba(0,0,0,0.06);">
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">${cat}</div>
          <div style="font-size:1.25rem;font-weight:800;color:var(--primary-navy);margin-top:4px;">${store.formatINR(catTotals[cat])}</div>
        </div>
      `).join('')}
    </div>

    <!-- Expenses Table -->
    <div class="section-box">
      <div class="section-box-header">
        <div class="box-title">Expenses Register (${store.formatINR(totalExpenses)})</div>
      </div>
      <div class="data-table-wrapper">
        <table class="app-table">
          <thead>
            <tr>
              <th>Ref #</th>
              <th>Date</th>
              <th>Category</th>
              <th>Paid To</th>
              <th>Payment Mode</th>
              <th>Related Animal / Batch</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${expenses.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px;">No goat operating expenses recorded yet. Click "+ Add Goat Expense" to add one.</td></tr>' : ''}
            ${expenses.map(e => `
              <tr>
                <td><strong>${e.expense_ref || e.expenseRef}</strong></td>
                <td>${store.formatDate(e.expense_date || e.expenseDate)}</td>
                <td><span class="badge badge-ferm">${e.category}</span></td>
                <td><strong>${e.paid_to}</strong></td>
                <td>${e.payment_mode || 'Cash'}</td>
                <td>${e.related_goat_id ? `🏷 Goat` : e.related_group_id ? `📦 Group` : 'General Herd'}</td>
                <td>${e.description || '—'}</td>
                <td><strong style="color:var(--red-accent);font-size:0.95rem;">${store.formatINR(e.amount)}</strong></td>
                <td>
                  ${store.canDelete() ? `
                    <button class="btn-danger" style="padding:4px 8px;font-size:0.75rem;" onclick="window.confirmDeleteGoatRecord('expense', '${e.id}', '${e.expense_ref}')">🗑</button>
                  ` : ''}
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
// 7. GOAT REPORTS VIEW (P&L, Herd Valuation, Profitability & Exports)
// ─────────────────────────────────────────────────────────────────
function renderGoatReports(container) {
  const m = store.getGoatDashboardMetrics();
  const sales = store.data.goatSales || [];
  const purchases = store.data.goatPurchases || [];
  const expenses = store.data.goatExpenses || [];
  const goats = store.data.goats || [];
  const groups = store.data.goatGroups || [];

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const totalCogs = sales.reduce((sum, s) => sum + Number(s.total_cogs || 0), 0);
  const grossProfit = totalRevenue - totalCogs;
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const netProfit = grossProfit - totalExpenses;

  // Active inventory valuation
  const indivActiveVal = goats.filter(g => g.status === 'Active' || g.status === 'Available for Sale')
    .reduce((sum, g) => sum + Number(g.total_cost_basis || g.acquisition_cost || 0), 0);
  const groupActiveVal = groups.filter(g => g.current_quantity > 0)
    .reduce((sum, g) => sum + Number(g.total_cost_basis || 0), 0);
  const totalInventoryVal = indivActiveVal + groupActiveVal;

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-dark-primary);margin:0;font-family:var(--font-heading);">Goat Financial & Operating Reports</h2>
        <div style="font-size:0.85rem;color:var(--text-sub);">Profit & Loss Statement, Inventory Valuation, and Cost-of-Goods-Sold (strictly segregated).</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="btn-secondary" onclick="window.exportGoatExcelReport()">📥 Export to Excel</button>
        <button class="btn-primary" onclick="window.printGoatReport()">🖨 Print P&L Statement</button>
        ${store.canDelete() ? `<button class="btn-danger" style="background:#dc2626;color:#fff;border-radius:8px;padding:8px 14px;font-size:0.84rem;font-weight:700;" onclick="window.confirmResetGoatData()" title="Reset goat records">💣 Reset Goat Data</button>` : ''}
      </div>
    </div>

    <!-- P&L Summary Cards -->
    <div class="goat-kpi-grid">
      <div class="kpi-card revenue-kpi">
        <div class="kpi-label">Total Invoiced Revenue</div>
        <div class="kpi-value">${store.formatINR(totalRevenue)}</div>
        <div class="kpi-subtext">Cumulative Sales</div>
      </div>
      <div class="kpi-card empty">
        <div class="kpi-label">Cost of Goats Sold (COGS)</div>
        <div class="kpi-value">${store.formatINR(totalCogs)}</div>
        <div class="kpi-subtext">Acquisition Basis</div>
      </div>
      <div class="kpi-card ${grossProfit >= 0 ? 'profit-kpi' : 'loss-kpi'}">
        <div class="kpi-label">Gross Margin</div>
        <div class="kpi-value">${store.formatINR(grossProfit)}</div>
        <div class="kpi-subtext">Sales − COGS</div>
      </div>
      <div class="kpi-card expenses-kpi">
        <div class="kpi-label">Operating Expenses</div>
        <div class="kpi-value" style="color:#D9534F;">${store.formatINR(totalExpenses)}</div>
        <div class="kpi-subtext">Rearing, Feed & Meds</div>
      </div>
      <div class="kpi-card ${netProfit >= 0 ? 'profit-kpi' : 'loss-kpi'}">
        <div class="kpi-label">Net Realized Profit</div>
        <div class="kpi-value">${store.formatINR(netProfit)}</div>
        <div class="kpi-subtext">Operating Net Income</div>
      </div>
    </div>

    <!-- P&L Breakdown Card & Balance Sheet Asset -->
    <div class="dash-two-columns" style="margin-bottom:24px;">
      <!-- Formal P&L Statement Box -->
      <div class="section-box" id="goatPnlPrintArea">
        <div class="section-box-header">
          <div class="box-title">Goat Enterprise Profit & Loss Statement</div>
        </div>
        <div style="padding:20px;">
          <table style="width:100%;border-collapse:collapse;font-size:0.92rem;">
            <tr style="border-bottom:1.5px solid var(--border-light);padding:8px 0;">
              <td style="padding:10px 0;font-weight:700;color:var(--primary-navy);">Goat Sales Revenue</td>
              <td style="padding:10px 0;text-align:right;font-weight:700;color:var(--brand-blue);">${store.formatINR(totalRevenue)}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-light);">
              <td style="padding:10px 0;padding-left:14px;color:var(--text-muted);">Less: Cost of Goats Sold (COGS)</td>
              <td style="padding:10px 0;text-align:right;color:var(--red-accent);">− ${store.formatINR(totalCogs)}</td>
            </tr>
            <tr style="border-bottom:2px solid var(--primary-navy);background:rgba(11,48,36,0.03);">
              <td style="padding:10px 6px;font-weight:800;color:var(--primary-navy);">GROSS PROFIT</td>
              <td style="padding:10px 6px;text-align:right;font-weight:800;color:#087F5B;">${store.formatINR(grossProfit)}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-light);">
              <td style="padding:10px 0;padding-left:14px;color:var(--text-muted);">Less: Feed & Fodder Expenses</td>
              <td style="padding:10px 0;text-align:right;color:var(--red-accent);">− ${store.formatINR(expenses.filter(e => e.category === 'Feed').reduce((s, e) => s + Number(e.amount), 0))}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-light);">
              <td style="padding:10px 0;padding-left:14px;color:var(--text-muted);">Less: Medicines & Veterinary Care</td>
              <td style="padding:10px 0;text-align:right;color:var(--red-accent);">− ${store.formatINR(expenses.filter(e => e.category === 'Medicines & Veterinary').reduce((s, e) => s + Number(e.amount), 0))}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-light);">
              <td style="padding:10px 0;padding-left:14px;color:var(--text-muted);">Less: Labour & Shelter Maintenance</td>
              <td style="padding:10px 0;text-align:right;color:var(--red-accent);">− ${store.formatINR(expenses.filter(e => e.category === 'Labour' || e.category === 'Shelter & Equipment').reduce((s, e) => s + Number(e.amount), 0))}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-light);">
              <td style="padding:10px 0;padding-left:14px;color:var(--text-muted);">Less: Other Operating & Breeding Expenses</td>
              <td style="padding:10px 0;text-align:right;color:var(--red-accent);">− ${store.formatINR(expenses.filter(e => !['Feed','Medicines & Veterinary','Labour','Shelter & Equipment'].includes(e.category)).reduce((s, e) => s + Number(e.amount), 0))}</td>
            </tr>
            <tr style="border-bottom:3px double var(--primary-navy);background:rgba(16,185,129,0.08);">
              <td style="padding:12px 6px;font-size:1.05rem;font-weight:800;color:var(--primary-navy);">NET OPERATING PROFIT / (LOSS)</td>
              <td style="padding:12px 6px;text-align:right;font-size:1.15rem;font-weight:800;color:${netProfit >= 0 ? '#087F5B' : '#D9534F'};">${store.formatINR(netProfit)}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Inventory Valuation & Balance Sheet Position -->
      <div class="section-box">
        <div class="section-box-header">
          <div class="box-title">Herd Inventory Valuation (Unrealized Asset)</div>
        </div>
        <div style="padding:20px;">
          <div style="background:rgba(11,48,36,0.04);border:1px solid rgba(11,48,36,0.08);border-radius:14px;padding:16px;margin-bottom:16px;">
            <div style="font-size:0.85rem;color:var(--text-muted);font-weight:600;">Total Current Herd Valuation</div>
            <div style="font-size:1.8rem;font-weight:800;color:var(--primary-navy);margin-top:4px;">${store.formatINR(totalInventoryVal)}</div>
            <div style="font-size:0.8rem;color:var(--text-sub);margin-top:4px;">Recorded Landed Acquisition Cost Basis of live herd</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div style="padding:12px;border:1px solid var(--border-light);border-radius:10px;">
              <div style="font-size:0.75rem;color:var(--text-muted);">Individual Goats Value</div>
              <div style="font-size:1.15rem;font-weight:700;color:var(--primary-navy);">${store.formatINR(indivActiveVal)}</div>
              <div style="font-size:0.75rem;color:var(--text-sub);">${goats.filter(g => g.status === 'Active' || g.status === 'Available for Sale').length} tagged animals</div>
            </div>
            <div style="padding:12px;border:1px solid var(--border-light);border-radius:10px;">
              <div style="font-size:0.75rem;color:var(--text-muted);">Batch Inventory Value</div>
              <div style="font-size:1.15rem;font-weight:700;color:var(--primary-navy);">${store.formatINR(groupActiveVal)}</div>
              <div style="font-size:0.75rem;color:var(--text-sub);">${groups.filter(g => g.current_quantity > 0).reduce((s, g) => s + Number(g.current_quantity), 0)} batch animals</div>
            </div>
          </div>

          <div style="font-size:0.82rem;color:var(--text-muted);line-height:1.45;background:rgba(16,185,129,0.05);padding:10px 14px;border-radius:10px;border:1px solid rgba(16,185,129,0.15);">
            ℹ️ <strong>Accounting Policy Notice:</strong> Live herd inventory is capitalized at landed purchase cost and recognized as an asset. When sold, the acquisition basis is released to Cost of Goats Sold (COGS). Ordinary feed & veterinary care are expensed as operational costs.
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────
// 8. GOAT CONTACTS & LEDGER VIEW
// ─────────────────────────────────────────────────────────────────
function renderGoatContacts(container) {
  const suppliers = store.data.goatSuppliers || [];
  const customers = store.data.goatCustomers || [];

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-dark-primary);margin:0;font-family:var(--font-heading);">Livestock Suppliers & Trade Customers</h2>
        <div style="font-size:0.85rem;color:var(--text-sub);">Separate contact ledger for breeders, livestock traders, and mutton buyers.</div>
      </div>
    </div>

    <div class="dash-two-columns" style="margin-bottom:24px;">
      <!-- Suppliers Ledger -->
      <div class="section-box">
        <div class="section-box-header">
          <div class="box-title">Goat Suppliers / Livestock Breeders</div>
        </div>
        <div class="data-table-wrapper">
          <table class="app-table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>City</th><th>Total Intake</th><th>Balance Pending</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${suppliers.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:18px;">No suppliers registered yet.</td></tr>' : ''}
              ${suppliers.map(s => `
                <tr>
                  <td><strong>${s.name}</strong></td>
                  <td>${s.phone || '—'}</td>
                  <td>${s.city || '—'}</td>
                  <td>${store.formatINR(s.totalPurchased || 0)}</td>
                  <td><strong style="color:${Number(s.balancePending || 0) > 0 ? 'var(--red-accent)' : '#087F5B'};">${store.formatINR(s.balancePending || 0)}</strong></td>
                  <td>
                    ${store.canDelete() ? `
                      <button class="btn-danger" style="padding:4px 8px;font-size:0.75rem;" title="Delete Supplier" onclick="window.confirmDeleteGoatRecord('supplier', '${s.id}', '${(s.name||'').replace(/'/g, "\\'")}')">🗑</button>
                    ` : '—'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Customers Ledger -->
      <div class="section-box">
        <div class="section-box-header">
          <div class="box-title">Goat Customers / Commercial Buyers</div>
        </div>
        <div class="data-table-wrapper">
          <table class="app-table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Address</th><th>Total Sales</th><th>Receivable Pending</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${customers.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:18px;">No customers registered yet.</td></tr>' : ''}
              ${customers.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.phone || '—'}</td>
                  <td>${c.address || '—'}</td>
                  <td>${store.formatINR(c.totalPurchased || 0)}</td>
                  <td><strong style="color:${Number(c.balancePending || 0) > 0 ? 'var(--red-accent)' : '#087F5B'};">${store.formatINR(c.balancePending || 0)}</strong></td>
                  <td>
                    ${store.canDelete() ? `
                      <button class="btn-danger" style="padding:4px 8px;font-size:0.75rem;" title="Delete Customer" onclick="window.confirmDeleteGoatRecord('customer', '${c.id}', '${(c.name||'').replace(/'/g, "\\'")}')">🗑</button>
                    ` : '—'}
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
// MODAL WORKFLOWS
// ─────────────────────────────────────────────────────────────────

// Modal A: New Goat Purchase
window.openNewGoatPurchaseModal = function() {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  const commonModalCard = document.getElementById('commonModalCard');
  if (!modalBody || !commonModalOverlay) return;

  if (commonModalCard) {
    commonModalCard.style.maxWidth = '780px';
  }

  // Deduplicate and aggregate all known suppliers from contacts and past purchase records
  const supMap = new Map();
  (store.data.goatSuppliers || []).forEach(s => {
    if (s?.name) {
      supMap.set(s.name.toLowerCase().trim(), {
        id: s.id || '',
        name: s.name,
        phone: s.phone || '',
        city: s.city || ''
      });
    }
  });
  (store.data.goatPurchases || []).forEach(p => {
    const name = p.supplier_name || p.goat_suppliers?.name;
    if (name && !supMap.has(name.toLowerCase().trim())) {
      supMap.set(name.toLowerCase().trim(), {
        id: p.supplier_id || '',
        name: name,
        phone: p.supplier_phone || '',
        city: p.supplier_city || ''
      });
    }
  });
  const suppliers = Array.from(supMap.values());

  modalTitle.textContent = 'Record Goat Purchase (Livestock Intake)';
  modalBody.innerHTML = `
    <form id="newGoatPurchaseForm">
      <!-- Top Section: Dedicated Full-Width Supplier / Breeder Selector Card -->
      <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-size:0.95rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:6px;">
              <span>🧑‍🌾</span> <span>Supplier / Breeder Information</span> <span style="color:#ef4444;">*</span>
            </div>
            <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Select an existing supplier from your records or register a new seller</div>
          </div>
          <div style="display:inline-flex;background:#e2e8f0;border-radius:8px;padding:3px;gap:3px;">
            <button type="button" id="gp_tab_existing_sup" onclick="window.setGoatSupplierMode('existing')" style="padding:6px 14px;border-radius:6px;font-size:0.8rem;font-weight:700;cursor:pointer;border:none;background:#ffffff;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,0.1);transition:all 0.15s ease;">
              🧑‍🌾 Choose Existing (${suppliers.length})
            </button>
            <button type="button" id="gp_tab_new_sup" onclick="window.setGoatSupplierMode('new')" style="padding:6px 14px;border-radius:6px;font-size:0.8rem;font-weight:700;cursor:pointer;border:none;background:transparent;color:#475569;transition:all 0.15s ease;">
              ➕ Add New Supplier
            </button>
          </div>
        </div>

        <!-- Mode 1: Existing Supplier Dropdown -->
        <div id="gp_existing_sup_wrap">
          <select id="gp_supplier_select" class="form-select" style="font-size:0.92rem;padding:9px 12px;height:42px;width:100%;border:1.5px solid #94a3b8;background:#ffffff;" onchange="window.onGoatSupplierSelected(this)" required>
            <option value="">-- Click here to select an existing supplier / breeder --</option>
            ${suppliers.map(s => `
              <option value="${s.id || s.name}" data-name="${s.name}" data-phone="${s.phone || ''}" data-city="${s.city || ''}">
                🧑‍🌾 ${s.name} ${s.city ? `(${s.city})` : ''} ${s.phone ? `• 📞 ${s.phone}` : ''}
              </option>
            `).join('')}
          </select>
          <div id="gp_selected_sup_badge" style="display:none;margin-top:10px;font-size:0.85rem;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:8px;padding:8px 14px;"></div>
        </div>

        <!-- Mode 2: New Supplier Details Form -->
        <div id="gp_new_sup_wrap" style="display:none;">
          <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px;">
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:#1e293b;display:block;margin-bottom:5px;">
                Supplier / Farm Name <span style="color:#ef4444;">*</span>
              </label>
              <input type="text" id="gp_new_sup_name" class="form-input" placeholder="e.g. Balaji Livestock Farms" style="font-size:0.9rem;padding:9px 12px;height:42px;width:100%;border:1.5px solid #94a3b8;" autocomplete="off" />
            </div>
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:#1e293b;display:block;margin-bottom:5px;">
                Phone Number <span style="font-size:0.75rem;font-weight:400;color:#64748b;">(Optional)</span>
              </label>
              <input type="tel" id="gp_new_sup_phone" class="form-input" placeholder="e.g. +91 98480 12345" style="font-size:0.9rem;padding:9px 12px;height:42px;width:100%;border:1.5px solid #94a3b8;" />
            </div>
            <div>
              <label style="font-size:0.8rem;font-weight:700;color:#1e293b;display:block;margin-bottom:5px;">
                City / District <span style="font-size:0.75rem;font-weight:400;color:#64748b;">(Optional)</span>
              </label>
              <input type="text" id="gp_new_sup_city" class="form-input" placeholder="e.g. Warangal" style="font-size:0.9rem;padding:9px 12px;height:42px;width:100%;border:1.5px solid #94a3b8;" />
            </div>
          </div>
        </div>
      </div>

      <!-- Purchase Date & Method -->
      <div class="form-grid-2" style="margin-bottom:14px;">
        <div class="form-group">
          <label class="form-label">Purchase Date <span style="color:#ef4444;">*</span></label>
          <input type="date" id="gp_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Purchase Method</label>
          <select id="gp_method" class="form-select" onchange="window.toggleGoatPurchaseMethod(this.value)">
            <option value="group" selected>Group / Batch Purchase</option>
            <option value="individual">Individual Ear-Tag Registration</option>
          </select>
        </div>
      </div>

      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Number of Goats <span style="color:#ef4444;">*</span></label>
          <input type="number" id="gp_qty" class="form-input" value="10" min="1" step="1" required oninput="window.calcGoatPurchaseTotals()" />
        </div>
        <div class="form-group">
          <label class="form-label">Price per Goat (₹) <span style="color:#ef4444;">*</span></label>
          <input type="number" id="gp_price_per_goat" class="form-input" value="7000" min="0" required oninput="window.calcGoatPurchaseTotals()" />
        </div>
        <div class="form-group">
          <label class="form-label">Breed</label>
          <select id="gp_breed" class="form-select">
            <option value="Boer" selected>Boer</option>
            <option value="Sirohi">Sirohi</option>
            <option value="Barbari">Barbari</option>
            <option value="Osmanabadi">Osmanabadi</option>
            <option value="Black Bengal">Black Bengal</option>
            <option value="Jamnapari">Jamnapari</option>
            <option value="Beetal">Beetal</option>
            <option value="Mixed/Local">Mixed / Local</option>
          </select>
        </div>
      </div>

      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Total Initial Weight (kg) <span style="font-size:0.75rem;color:var(--text-muted);">(Optional)</span></label>
          <input type="number" id="gp_weight" class="form-input" value="220" min="0" step="0.1" />
        </div>
        <div class="form-group">
          <label class="form-label">Transport Expense (₹)</label>
          <input type="number" id="gp_transport" class="form-input" value="2500" min="0" oninput="window.calcGoatPurchaseTotals()" />
        </div>
        <div class="form-group">
          <label class="form-label">Other Acquisition Charges (₹)</label>
          <input type="number" id="gp_other" class="form-input" value="500" min="0" oninput="window.calcGoatPurchaseTotals()" />
        </div>
      </div>

      <!-- Auto-Calculated Cost Summary Box -->
      <div style="background:rgba(11,48,36,0.05);border:1px solid rgba(11,48,36,0.12);border-radius:14px;padding:16px;margin:16px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);display:block;">Base Amount:</span>
          <strong id="gp_preview_base" style="font-size:1.05rem;color:var(--primary-navy);">₹70,000</strong>
        </div>
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);display:block;">Total Landed Cost:</span>
          <strong id="gp_preview_total" style="font-size:1.15rem;color:var(--brand-blue);">₹73,000</strong>
        </div>
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);display:block;">Allocated Cost / Goat:</span>
          <strong id="gp_preview_allocated" style="font-size:1.05rem;color:#087F5B;">₹7,300</strong>
        </div>
      </div>

      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Amount Paid (₹)</label>
          <input type="number" id="gp_paid" class="form-input" value="50000" min="0" required oninput="window.calcGoatPurchaseTotals()" />
        </div>
        <div class="form-group">
          <label class="form-label">Pending Balance (₹)</label>
          <input type="text" id="gp_balance" class="form-input" value="₹23,000" readonly style="background:#F8FAFC;font-weight:700;color:var(--red-accent);" />
        </div>
        <div class="form-group">
          <label class="form-label">Payment Due Date</label>
          <input type="date" id="gp_due_date" class="form-input" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Notes & Intake Remarks</label>
        <textarea id="gp_notes" class="form-textarea" rows="2" placeholder="Seller details, vaccination on arrival, physical check notes..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveGoatPurchaseBtn">Confirm & Record Intake</button>
      </div>
    </form>
  `;

  commonModalOverlay.classList.add('open');
  window.calcGoatPurchaseTotals();

  document.getElementById('newGoatPurchaseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveGoatPurchaseBtn');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      let supplierId = '';
      let supplierName = '';
      let supplierPhone = '';
      let supplierCity = '';

      const isNewSupplier = document.getElementById('gp_new_sup_wrap')?.style.display !== 'none';
      if (isNewSupplier) {
        supplierName = (document.getElementById('gp_new_sup_name')?.value || '').trim();
        supplierPhone = (document.getElementById('gp_new_sup_phone')?.value || '').trim();
        supplierCity = (document.getElementById('gp_new_sup_city')?.value || '').trim();

        if (!supplierName) {
          alert('Please enter the supplier / breeder name.');
          document.getElementById('gp_new_sup_name')?.focus();
          btn.textContent = 'Confirm & Record Intake';
          btn.disabled = false;
          return;
        }
      } else {
        const select = document.getElementById('gp_supplier_select');
        const opt = select?.options[select.selectedIndex];
        const val = select?.value;

        if (!val) {
          alert('Please select an existing supplier or click "➕ Add New Supplier" to enter a new one.');
          select?.focus();
          btn.textContent = 'Confirm & Record Intake';
          btn.disabled = false;
          return;
        }

        supplierId = val;
        supplierName = opt?.getAttribute('data-name') || opt?.text?.replace(/^🧑‍🌾\s*/, '').trim() || '';
        supplierPhone = opt?.getAttribute('data-phone') || '';
        supplierCity = opt?.getAttribute('data-city') || '';
      }

      const qty = Number(document.getElementById('gp_qty').value);
      const pricePerGoat = Number(document.getElementById('gp_price_per_goat').value);
      const transport = Number(document.getElementById('gp_transport').value) || 0;
      const other = Number(document.getElementById('gp_other').value) || 0;
      const baseAmount = qty * pricePerGoat;
      const totalCost = baseAmount + transport + other;
      const allocated = Math.round((totalCost / qty) * 100) / 100;
      const paid = Number(document.getElementById('gp_paid').value) || 0;

      await store.addGoatPurchase({
        supplier_id: (supplierId && supplierId !== supplierName) ? supplierId : null,
        supplier_name: supplierName,
        supplier_phone: supplierPhone,
        supplier_city: supplierCity,
        purchase_date: document.getElementById('gp_date').value,
        purchase_method: document.getElementById('gp_method').value,
        quantity: qty,
        price_per_goat: pricePerGoat,
        base_amount: baseAmount,
        breed: document.getElementById('gp_breed').value,
        initial_total_weight: Number(document.getElementById('gp_weight').value) || 0,
        transport_expense: transport,
        other_initial_costs: other,
        total_acquisition_cost: totalCost,
        allocated_cost_per_goat: allocated,
        amount_paid: paid,
        payment_due_date: document.getElementById('gp_due_date').value || null,
        notes: document.getElementById('gp_notes').value.trim()
      });

      if (commonModalCard) commonModalCard.style.maxWidth = '';
      window.closeModal();
      window.showToast?.('🐐 Goat purchase recorded and inventory updated!');
      renderGoatFarming();
    } catch(err) {
      alert('Error recording goat purchase: ' + err.message);
      btn.textContent = 'Confirm & Record Intake';
      btn.disabled = false;
    }
  });
};

window.setGoatSupplierMode = function(mode) {
  const existingWrap = document.getElementById('gp_existing_sup_wrap');
  const newWrap = document.getElementById('gp_new_sup_wrap');
  const tabExisting = document.getElementById('gp_tab_existing_sup');
  const tabNew = document.getElementById('gp_tab_new_sup');
  const select = document.getElementById('gp_supplier_select');
  const nameInput = document.getElementById('gp_new_sup_name');

  if (mode === 'new') {
    if (existingWrap) existingWrap.style.display = 'none';
    if (newWrap) newWrap.style.display = 'block';

    if (tabExisting) {
      tabExisting.style.background = 'transparent';
      tabExisting.style.color = '#475569';
      tabExisting.style.boxShadow = 'none';
    }
    if (tabNew) {
      tabNew.style.background = '#ffffff';
      tabNew.style.color = '#0f172a';
      tabNew.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }

    if (select) select.removeAttribute('required');
    if (nameInput) {
      nameInput.setAttribute('required', 'required');
      setTimeout(() => nameInput.focus(), 50);
    }
  } else {
    if (newWrap) newWrap.style.display = 'none';
    if (existingWrap) existingWrap.style.display = 'block';

    if (tabNew) {
      tabNew.style.background = 'transparent';
      tabNew.style.color = '#475569';
      tabNew.style.boxShadow = 'none';
    }
    if (tabExisting) {
      tabExisting.style.background = '#ffffff';
      tabExisting.style.color = '#0f172a';
      tabExisting.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }

    if (nameInput) nameInput.removeAttribute('required');
    if (select) {
      select.setAttribute('required', 'required');
      window.onGoatSupplierSelected(select);
    }
  }
};

window.toggleGoatPurchaseNewSupplier = function(forceShow) {
  const newWrap = document.getElementById('gp_new_sup_wrap');
  const showNew = (forceShow !== undefined) ? forceShow : (newWrap?.style.display === 'none');
  window.setGoatSupplierMode(showNew ? 'new' : 'existing');
};

window.onGoatSupplierSelected = function(selectEl) {
  if (!selectEl) return;
  const val = selectEl.value;
  const badge = document.getElementById('gp_selected_sup_badge');

  if (!val) {
    if (badge) badge.style.display = 'none';
    return;
  }

  const opt = selectEl.options[selectEl.selectedIndex];
  const name = opt?.getAttribute('data-name') || '';
  const phone = opt?.getAttribute('data-phone') || '';
  const city = opt?.getAttribute('data-city') || '';

  if (badge) {
    badge.innerHTML = `✓ Selected: <strong>${name}</strong>${city ? ` &bull; ${city}` : ''}${phone ? ` &bull; 📞 ${phone}` : ''}`;
    badge.style.display = 'block';
  }
};

window.calcGoatPurchaseTotals = function() {
  const qty = Number(document.getElementById('gp_qty')?.value) || 1;
  const price = Number(document.getElementById('gp_price_per_goat')?.value) || 0;
  const transport = Number(document.getElementById('gp_transport')?.value) || 0;
  const other = Number(document.getElementById('gp_other')?.value) || 0;
  const paid = Number(document.getElementById('gp_paid')?.value) || 0;

  const base = qty * price;
  const total = base + transport + other;
  const allocated = Math.round((total / qty) * 100) / 100;
  const balance = Math.max(0, total - paid);

  const prevBase = document.getElementById('gp_preview_base');
  const prevTot = document.getElementById('gp_preview_total');
  const prevAlloc = document.getElementById('gp_preview_allocated');
  const balInput = document.getElementById('gp_balance');

  if (prevBase) prevBase.textContent = store.formatINR(base);
  if (prevTot) prevTot.textContent = store.formatINR(total);
  if (prevAlloc) prevAlloc.textContent = store.formatINR(allocated);
  if (balInput) balInput.value = store.formatINR(balance);
};

window.toggleGoatPurchaseMethod = function(val) {
  // Can be extended if extra fields needed
};

// Modal B: New Goat Sale
window.openNewGoatSaleModal = function() {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const customers = store.data.goatCustomers || [];
  const activeGoats = store.data.goats.filter(g => g.status === 'Active' || g.status === 'Available for Sale');
  const activeGroups = store.data.goatGroups.filter(g => g.current_quantity > 0);

  modalTitle.textContent = 'New Goat Sale & Commercial Invoice';
  modalBody.innerHTML = `
    <form id="newGoatSaleForm">
      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Buyer / Customer</label>
          <input type="text" id="gs_customer" class="form-input" list="goatCustomerList" placeholder="Customer name" required />
          <datalist id="goatCustomerList">
            ${customers.map(c => `<option value="${c.name}"></option>`).join('')}
          </datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Sale Date</label>
          <input type="date" id="gs_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Pricing Method</label>
          <select id="gs_method" class="form-select" onchange="window.calcGoatSaleTotals()">
            <option value="per_goat" selected>Fixed Price per Animal (₹/Goat)</option>
            <option value="by_weight">Live Weight Rate (₹/kg)</option>
          </select>
        </div>
      </div>

      <!-- Item Source Selector -->
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Select Inventory Source</label>
          <select id="gs_source_type" class="form-select" onchange="window.updateGoatSaleSource(this.value)">
            <option value="individual">Specific Individually Tagged Goats</option>
            <option value="group">Batch / Group Goats</option>
          </select>
        </div>
        <div class="form-group" id="gs_source_container">
          <!-- Populated dynamically -->
        </div>
      </div>

      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Quantity Sold</label>
          <input type="number" id="gs_qty" class="form-input" value="1" min="1" step="1" required oninput="window.calcGoatSaleTotals()" />
        </div>
        <div class="form-group">
          <label class="form-label" id="gs_rate_label">Rate per Goat (₹)</label>
          <input type="number" id="gs_rate" class="form-input" value="9500" min="0" required oninput="window.calcGoatSaleTotals()" />
        </div>
        <div class="form-group" id="gs_weight_group">
          <label class="form-label">Total Live Weight (kg)</label>
          <input type="number" id="gs_weight" class="form-input" value="35" min="0" step="0.1" oninput="window.calcGoatSaleTotals()" />
        </div>
      </div>

      <!-- Calculated Totals Preview -->
      <div style="background:rgba(11,48,36,0.05);border:1px solid rgba(11,48,36,0.12);border-radius:14px;padding:16px;margin:16px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);display:block;">Invoiced Total:</span>
          <strong id="gs_preview_total" style="font-size:1.2rem;color:var(--brand-blue);">₹9,500</strong>
        </div>
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);display:block;">Cost Basis (COGS):</span>
          <strong id="gs_preview_cogs" style="font-size:1.05rem;color:var(--text-muted);">₹7,300</strong>
        </div>
        <div>
          <span style="font-size:0.75rem;color:var(--text-muted);display:block;">Realized Gross Margin:</span>
          <strong id="gs_preview_margin" style="font-size:1.15rem;color:#087F5B;">+₹2,200</strong>
        </div>
      </div>

      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Amount Received (₹)</label>
          <input type="number" id="gs_paid" class="form-input" value="9500" min="0" required oninput="window.calcGoatSaleTotals()" />
        </div>
        <div class="form-group">
          <label class="form-label">Balance Pending (₹)</label>
          <input type="text" id="gs_balance" class="form-input" value="₹0" readonly style="background:#F8FAFC;font-weight:700;color:#087F5B;" />
        </div>
        <div class="form-group">
          <label class="form-label">Payment Due Date</label>
          <input type="date" id="gs_due_date" class="form-input" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Sale Remarks / Terms</label>
        <textarea id="gs_notes" class="form-textarea" rows="2" placeholder="Vehicle #, live weighment notes, payment mode..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveGoatSaleBtn">Generate Invoice & Complete Sale</button>
      </div>
    </form>
  `;

  commonModalOverlay.classList.add('open');
  window.updateGoatSaleSource('individual');

  document.getElementById('newGoatSaleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveGoatSaleBtn');
    btn.textContent = 'Processing…';
    btn.disabled = true;

    try {
      const method = document.getElementById('gs_method').value;
      const sourceType = document.getElementById('gs_source_type').value;
      const qty = Number(document.getElementById('gs_qty').value);
      const rate = Number(document.getElementById('gs_rate').value);
      const weight = Number(document.getElementById('gs_weight').value) || 0;
      const paid = Number(document.getElementById('gs_paid').value) || 0;

      let items = [];
      if (sourceType === 'individual') {
        const goatId = document.getElementById('gs_goat_id').value;
        const goat = activeGoats.find(g => g.id === goatId);
        items.push({
          item_type: 'individual',
          goat_id: goatId,
          quantity: 1,
          weight_kg: weight || goat?.latest_weight || 0,
          rate: rate
        });
      } else {
        const groupId = document.getElementById('gs_group_id').value;
        items.push({
          item_type: 'group',
          group_id: groupId,
          quantity: qty,
          weight_kg: weight,
          rate: rate
        });
      }

      await store.addGoatSale({
        customer_name: document.getElementById('gs_customer').value.trim(),
        sale_date: document.getElementById('gs_date').value,
        pricing_method: method,
        items: items,
        amount_paid: paid,
        payment_due_date: document.getElementById('gs_due_date').value || null,
        notes: document.getElementById('gs_notes').value.trim()
      });

      window.closeModal();
      window.showToast?.('💼 Goat sale completed and inventory updated!');
      renderGoatFarming();
    } catch(err) {
      alert('Error completing goat sale: ' + err.message);
      btn.textContent = 'Generate Invoice & Complete Sale';
      btn.disabled = false;
    }
  });
};

window.updateGoatSaleSource = function(type) {
  const container = document.getElementById('gs_source_container');
  if (!container) return;

  const activeGoats = store.data.goats.filter(g => g.status === 'Active' || g.status === 'Available for Sale');
  const activeGroups = store.data.goatGroups.filter(g => g.current_quantity > 0);

  if (type === 'individual') {
    container.innerHTML = `
      <label class="form-label">Select Available Goat</label>
      <select id="gs_goat_id" class="form-select" onchange="window.calcGoatSaleTotals()">
        ${activeGoats.length === 0 ? '<option value="">No individual goats available</option>' : ''}
        ${activeGoats.map(g => `<option value="${g.id}">🏷 ${g.tag_id} (${g.breed}, ${g.latest_weight || 0} kg) - Cost: ₹${g.total_cost_basis}</option>`).join('')}
      </select>
    `;
    const qtyInput = document.getElementById('gs_qty');
    if (qtyInput) { qtyInput.value = 1; qtyInput.readOnly = true; }
  } else {
    container.innerHTML = `
      <label class="form-label">Select Available Batch / Group</label>
      <select id="gs_group_id" class="form-select" onchange="window.calcGoatSaleTotals()">
        ${activeGroups.length === 0 ? '<option value="">No active batches available</option>' : ''}
        ${activeGroups.map(grp => `<option value="${grp.id}">📦 ${grp.group_code} (${grp.current_quantity} available) - Unit Cost: ₹${grp.unit_cost_basis}</option>`).join('')}
      </select>
    `;
    const qtyInput = document.getElementById('gs_qty');
    if (qtyInput) { qtyInput.readOnly = false; }
  }

  window.calcGoatSaleTotals();
};

window.calcGoatSaleTotals = function() {
  const method = document.getElementById('gs_method')?.value || 'per_goat';
  const sourceType = document.getElementById('gs_source_type')?.value || 'individual';
  const qty = Number(document.getElementById('gs_qty')?.value) || 1;
  const rate = Number(document.getElementById('gs_rate')?.value) || 0;
  const weight = Number(document.getElementById('gs_weight')?.value) || 0;
  const paid = Number(document.getElementById('gs_paid')?.value) || 0;

  const rateLabel = document.getElementById('gs_rate_label');
  if (rateLabel) {
    rateLabel.textContent = method === 'per_goat' ? 'Rate per Goat (₹)' : 'Rate per kg Live Weight (₹)';
  }

  const subtotal = method === 'per_goat' ? (qty * rate) : (weight * rate);

  let cogs = 0;
  if (sourceType === 'individual') {
    const goatId = document.getElementById('gs_goat_id')?.value;
    const goat = store.data.goats.find(g => g.id === goatId);
    cogs = Number(goat?.total_cost_basis || goat?.acquisition_cost || 0);
  } else {
    const groupId = document.getElementById('gs_group_id')?.value;
    const group = store.data.goatGroups.find(g => g.id === groupId);
    cogs = qty * Number(group?.unit_cost_basis || 0);
  }

  const margin = subtotal - cogs;
  const balance = Math.max(0, subtotal - paid);

  const prevTot = document.getElementById('gs_preview_total');
  const prevCogs = document.getElementById('gs_preview_cogs');
  const prevMarg = document.getElementById('gs_preview_margin');
  const balInput = document.getElementById('gs_balance');

  if (prevTot) prevTot.textContent = store.formatINR(subtotal);
  if (prevCogs) prevCogs.textContent = store.formatINR(cogs);
  if (prevMarg) {
    prevMarg.textContent = (margin >= 0 ? '+' : '') + store.formatINR(margin);
    prevMarg.style.color = margin >= 0 ? '#087F5B' : '#D9534F';
  }
  if (balInput) {
    balInput.value = store.formatINR(balance);
    balInput.style.color = balance > 0 ? 'var(--red-accent)' : '#087F5B';
  }
};

// Modal C: New Goat Expense
window.openNewGoatExpenseModal = function() {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const CATEGORIES = [
    'Feed', 'Medicines & Veterinary', 'Transport', 'Labour',
    'Other Expenses', 'Shelter & Equipment', 'Breeding Expenses'
  ];

  modalTitle.textContent = 'Record Goat Operation Expense';
  modalBody.innerHTML = `
    <form id="newGoatExpenseForm">
      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Expense Category</label>
          <select id="ge_cat" class="form-select" required>
            ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Expense Date</label>
          <input type="date" id="ge_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Amount (₹)</label>
          <input type="number" id="ge_amount" class="form-input" min="1" step="any" required placeholder="₹ 0.00" />
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Paid To / Vendor</label>
          <input type="text" id="ge_paid_to" class="form-input" required placeholder="Vendor or staff name" />
        </div>
        <div class="form-group">
          <label class="form-label">Payment Mode</label>
          <select id="ge_mode" class="form-select">
            <option value="Cash" selected>Cash</option>
            <option value="UPI">UPI / GPay</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Description / Bill Particulars</label>
        <textarea id="ge_desc" class="form-textarea" rows="2" placeholder="e.g. 5 bags of goat feed concentrates, antibiotic injection..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveGoatExpenseBtn">Save Expense</button>
      </div>
    </form>
  `;

  commonModalOverlay.classList.add('open');

  document.getElementById('newGoatExpenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveGoatExpenseBtn');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      await store.addGoatExpense({
        category: document.getElementById('ge_cat').value,
        expense_date: document.getElementById('ge_date').value,
        amount: Number(document.getElementById('ge_amount').value),
        paid_to: document.getElementById('ge_paid_to').value.trim(),
        payment_mode: document.getElementById('ge_mode').value,
        description: document.getElementById('ge_desc').value.trim()
      });

      window.closeModal();
      window.showToast?.('💸 Goat expense saved!');
      renderGoatFarming();
    } catch(err) {
      alert('Error saving goat expense: ' + err.message);
      btn.textContent = 'Save Expense';
      btn.disabled = false;
    }
  });
};

// Modal D: Record Weight
window.openRecordWeightModal = function(preselectedGoatId) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const goats = store.data.goats.filter(g => g.status === 'Active' || g.status === 'Available for Sale');

  modalTitle.textContent = 'Record Weight Measurement';
  modalBody.innerHTML = `
    <form id="recordWeightForm">
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Select Animal (Tag ID)</label>
          <select id="rw_goat" class="form-select" required>
            ${goats.map(g => `<option value="${g.id}" ${preselectedGoatId === g.id ? 'selected' : ''}>🏷 ${g.tag_id} (${g.breed}) - Last: ${g.latest_weight || 0} kg</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Measurement Date</label>
          <input type="date" id="rw_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">New Live Weight (kg)</label>
          <input type="number" id="rw_weight" class="form-input" min="0.1" step="0.1" required placeholder="e.g. 28.5" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <input type="text" id="rw_notes" class="form-input" placeholder="Weekly weigh-in, post-grazing..." />
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveWeightBtn">Save Weight Record</button>
      </div>
    </form>
  `;

  commonModalOverlay.classList.add('open');

  document.getElementById('recordWeightForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveWeightBtn');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      await store.recordGoatWeight({
        goat_id: document.getElementById('rw_goat').value,
        record_date: document.getElementById('rw_date').value,
        weight_kg: Number(document.getElementById('rw_weight').value),
        notes: document.getElementById('rw_notes').value.trim()
      });

      window.closeModal();
      window.showToast?.('⚖️ Weight record updated!');
      renderGoatFarming();
    } catch(err) {
      alert('Error recording weight: ' + err.message);
      btn.textContent = 'Save Weight Record';
      btn.disabled = false;
    }
  });
};

// Modal E: Record Health / Vaccine
window.openRecordHealthModal = function(preselectedGoatId) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const goats = store.data.goats.filter(g => g.status === 'Active' || g.status === 'Available for Sale');

  modalTitle.textContent = 'Record Health / Vaccination Event';
  modalBody.innerHTML = `
    <form id="recordHealthForm">
      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Animal / Tag</label>
          <select id="rh_goat" class="form-select">
            <option value="">Herd-Wide / Collective Batch</option>
            ${goats.map(g => `<option value="${g.id}" ${preselectedGoatId === g.id ? 'selected' : ''}>🏷 ${g.tag_id} (${g.breed})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Event Type</label>
          <select id="rh_type" class="form-select" required>
            <option value="Vaccination" selected>Vaccination (PPR, ET, FMD)</option>
            <option value="Deworming">Deworming</option>
            <option value="Treatment">Medical Treatment</option>
            <option value="Vet Visit">Veterinary Inspection</option>
            <option value="General Checkup">General Health Check</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Date Administered</label>
          <input type="date" id="rh_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
      </div>

      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Vaccine / Medicine Title</label>
          <input type="text" id="rh_title" class="form-input" required placeholder="e.g. PPR Vaccine, Albendazole" />
        </div>
        <div class="form-group">
          <label class="form-label">Dosage</label>
          <input type="text" id="rh_dosage" class="form-input" placeholder="e.g. 2 ml subcutaneous" />
        </div>
        <div class="form-group">
          <label class="form-label">Next Scheduled Due Date</label>
          <input type="date" id="rh_next_date" class="form-input" />
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Administered By</label>
          <input type="text" id="rh_admin" class="form-input" placeholder="Veterinarian Dr. Rao / Yard Staff" />
        </div>
        <div class="form-group">
          <label class="form-label">Treatment Cost (₹) <span style="font-size:0.75rem;color:var(--text-muted);">(Optional)</span></label>
          <input type="number" id="rh_cost" class="form-input" min="0" placeholder="0" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Clinical Observations & Notes</label>
        <textarea id="rh_notes" class="form-textarea" rows="2" placeholder="Symptoms, medicine batch number, recovery progress..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveHealthBtn">Save Health Record</button>
      </div>
    </form>
  `;

  commonModalOverlay.classList.add('open');

  document.getElementById('recordHealthForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveHealthBtn');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      await store.recordGoatHealth({
        goat_id: document.getElementById('rh_goat').value || null,
        record_type: document.getElementById('rh_type').value,
        record_date: document.getElementById('rh_date').value,
        title_or_vaccine: document.getElementById('rh_title').value.trim(),
        dosage: document.getElementById('rh_dosage').value.trim(),
        next_scheduled_date: document.getElementById('rh_next_date').value || null,
        administered_by: document.getElementById('rh_admin').value.trim(),
        cost: Number(document.getElementById('rh_cost').value) || 0,
        notes: document.getElementById('rh_notes').value.trim()
      });

      window.closeModal();
      window.showToast?.('🩺 Health entry logged successfully!');
      renderGoatFarming();
    } catch(err) {
      alert('Error saving health record: ' + err.message);
      btn.textContent = 'Save Health Record';
      btn.disabled = false;
    }
  });
};

// Modal F: Convert Group to Individual
window.openConvertGroupModal = function(groupId) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const group = store.data.goatGroups.find(g => g.id === groupId);
  if (!group) return;

  modalTitle.textContent = `Convert Batch ${group.group_code} to Individual Ear-Tags`;
  modalBody.innerHTML = `
    <form id="convertGroupForm">
      <div style="background:rgba(11,48,36,0.05);padding:12px;border-radius:10px;margin-bottom:16px;font-size:0.85rem;">
        <div>Batch: <strong>${group.group_code} (${group.group_name})</strong></div>
        <div>Current Available Quantity: <strong>${group.current_quantity} goats</strong></div>
        <div>Unit Acquisition Cost Basis: <strong>₹${group.unit_cost_basis}</strong></div>
      </div>

      <div class="form-group">
        <label class="form-label">Number of Goats to Convert</label>
        <input type="number" id="cg_count" class="form-input" value="1" min="1" max="${group.current_quantity}" required />
      </div>

      <div class="form-group">
        <label class="form-label">Ear-Tag Prefix / Base Tag</label>
        <input type="text" id="cg_prefix" class="form-input" value="GT-" placeholder="e.g. GT-" />
      </div>

      <div style="font-size:0.8rem;color:var(--text-muted);margin:10px 0;">
        💡 Converting transfers the exact cost basis from the batch into unique individual tags. Zero animals or costs are double-counted.
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveConvertBtn">Convert to Tagged Animals</button>
      </div>
    </form>
  `;

  commonModalOverlay.classList.add('open');

  document.getElementById('convertGroupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveConvertBtn');
    btn.textContent = 'Converting…';
    btn.disabled = true;

    try {
      const count = Number(document.getElementById('cg_count').value);
      const prefix = document.getElementById('cg_prefix').value.trim() || 'GT-';
      const goatsList = Array.from({ length: count }).map((_, i) => ({
        tag_id: `${prefix}${Math.floor(100 + Math.random() * 900)}`,
        breed: group.breed || 'Mixed/Local',
        sex: 'Male',
        initial_weight: Math.round((Number(group.current_total_weight || 0) / (group.current_quantity || 1)) * 10) / 10 || 22
      }));

      await store.convertGoatGroup({
        group_id: groupId,
        count: count,
        goats: goatsList
      });

      window.closeModal();
      window.showToast?.(`🏷 Converted ${count} goats to individual inventory!`);
      renderGoatFarming();
    } catch(err) {
      alert('Error converting group: ' + err.message);
      btn.textContent = 'Convert to Tagged Animals';
      btn.disabled = false;
    }
  });
};

// Modal G: Mark Deceased
window.openMarkDeceasedModal = function(goatId, tagId) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  modalTitle.textContent = `Report Mortality (Tag: ${tagId})`;
  modalBody.innerHTML = `
    <form id="markDeceasedForm">
      <div class="form-group">
        <label class="form-label">Date of Death</label>
        <input type="date" id="md_date" class="form-input" value="${store.getCurrentDate()}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Cause of Death / Veterinary Findings</label>
        <input type="text" id="md_reason" class="form-input" required placeholder="e.g. Enterotoxaemia, pneumonia, natural..." />
      </div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin:10px 0;">
        ⚠️ Marking an animal deceased safely updates herd inventory count. The remaining cost basis is recognized as a mortality loss in reports, NOT as a sale.
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-danger" id="confirmDeceasedBtn">Confirm Mortality Record</button>
      </div>
    </form>
  `;

  commonModalOverlay.classList.add('open');

  document.getElementById('markDeceasedForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('confirmDeceasedBtn');
    btn.textContent = 'Updating…';
    btn.disabled = true;

    try {
      await store.markGoatDeceased({
        goat_id: goatId,
        deceased_date: document.getElementById('md_date').value,
        deceased_reason: document.getElementById('md_reason').value.trim()
      });

      window.closeModal();
      window.showToast?.('Mortality recorded.');
      renderGoatFarming();
    } catch(err) {
      alert('Error: ' + err.message);
      btn.textContent = 'Confirm Mortality Record';
      btn.disabled = false;
    }
  });
};

// Modal H: Supplier Payment
window.openGoatSupplierPaymentModal = function(purchaseId) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const pur = store.data.goatPurchases.find(p => p.id === purchaseId);
  if (!pur) return;

  const pending = Number(pur.balance_pending || pur.balancePending || 0);

  modalTitle.textContent = `Record Supplier Payment (${pur.purchase_ref})`;
  modalBody.innerHTML = `
    <form id="goatSuppPaymentForm">
      <div style="background:rgba(11,48,36,0.04);padding:12px;border-radius:10px;margin-bottom:14px;font-size:0.85rem;">
        <div>Supplier: <strong>${pur.goat_suppliers?.name || pur.supplier_name}</strong></div>
        <div>Total Landed Cost: <strong>${store.formatINR(pur.total_acquisition_cost || pur.totalCost)}</strong></div>
        <div>Current Pending Due: <strong style="color:var(--red-accent);">${store.formatINR(pending)}</strong></div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Payment Date</label>
          <input type="date" id="gsp_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Payment Amount (₹)</label>
          <input type="number" id="gsp_amount" class="form-input" value="${pending}" max="${pending}" min="1" step="any" required />
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Payment Method</label>
          <select id="gsp_method" class="form-select">
            <option value="Cash" selected>Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Reference # / UTR</label>
          <input type="text" id="gsp_ref" class="form-input" placeholder="UTR or cheque number" />
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveSuppPaymentBtn">Confirm Payment</button>
      </div>
    </form>
  `;

  commonModalOverlay.classList.add('open');

  document.getElementById('goatSuppPaymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveSuppPaymentBtn');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      await store.addGoatSupplierPayment(purchaseId, {
        payment_date: document.getElementById('gsp_date').value,
        amount: Number(document.getElementById('gsp_amount').value),
        payment_method: document.getElementById('gsp_method').value,
        reference_no: document.getElementById('gsp_ref').value.trim()
      });

      window.closeModal();
      window.showToast?.('Supplier payment recorded!');
      renderGoatFarming();
    } catch(err) {
      alert('Error recording payment: ' + err.message);
      btn.textContent = 'Confirm Payment';
      btn.disabled = false;
    }
  });
};

// Modal I: Customer Payment
window.openGoatCustomerPaymentModal = function(saleId) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const sale = store.data.goatSales.find(s => s.id === saleId);
  if (!sale) return;

  const pending = Number(sale.balance_pending || sale.balancePending || 0);

  modalTitle.textContent = `Receive Customer Payment (${sale.invoice_no})`;
  modalBody.innerHTML = `
    <form id="goatCustPaymentForm">
      <div style="background:rgba(11,48,36,0.04);padding:12px;border-radius:10px;margin-bottom:14px;font-size:0.85rem;">
        <div>Customer: <strong>${sale.goat_customers?.name || sale.customer_name}</strong></div>
        <div>Total Invoice Amount: <strong>${store.formatINR(sale.total_amount || sale.totalAmount)}</strong></div>
        <div>Outstanding Receivable: <strong style="color:var(--red-accent);">${store.formatINR(pending)}</strong></div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Payment Date</label>
          <input type="date" id="gcp_date" class="form-input" value="${store.getCurrentDate()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Amount Received (₹)</label>
          <input type="number" id="gcp_amount" class="form-input" value="${pending}" max="${pending}" min="1" step="any" required />
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Payment Method</label>
          <select id="gcp_method" class="form-select">
            <option value="Cash" selected>Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Reference # / UTR</label>
          <input type="text" id="gcp_ref" class="form-input" placeholder="UTR or cheque number" />
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" id="saveCustPaymentBtn">Confirm Receipt</button>
      </div>
    </form>
  `;

  commonModalOverlay.classList.add('open');

  document.getElementById('goatCustPaymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveCustPaymentBtn');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      await store.addGoatCustomerPayment(saleId, {
        payment_date: document.getElementById('gcp_date').value,
        amount: Number(document.getElementById('gcp_amount').value),
        payment_method: document.getElementById('gcp_method').value,
        reference_no: document.getElementById('gcp_ref').value.trim()
      });

      window.closeModal();
      window.showToast?.('Customer receipt recorded!');
      renderGoatFarming();
    } catch(err) {
      alert('Error recording payment: ' + err.message);
      btn.textContent = 'Confirm Receipt';
      btn.disabled = false;
    }
  });
};

// Modal J: Printable Goat Invoice Modal
window.openGoatInvoiceModal = function(saleId) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const sale = store.data.goatSales.find(s => s.id === saleId);
  if (!sale) return;

  modalTitle.textContent = `Invoice ${sale.invoice_no}`;
  modalBody.innerHTML = `
    <div style="background:#FFFFFF;border-radius:12px;padding:24px;border:1px solid var(--border-light);font-family:var(--font-body);" id="printableGoatInvoice">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid var(--primary-navy);padding-bottom:14px;margin-bottom:16px;">
        <div>
          <h2 style="margin:0;font-size:1.4rem;color:var(--primary-navy);font-family:var(--font-heading);">Sri Balaji Livestock & Goat Farm</h2>
          <div style="font-size:0.8rem;color:var(--text-muted);">Commercial Goat Breeding & Trading Division</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.1rem;font-weight:800;color:var(--primary-navy);">${sale.invoice_no}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">${store.formatDate(sale.sale_date)}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;font-size:0.88rem;">
        <div>
          <strong>Billed To:</strong><br />
          ${sale.goat_customers?.name || sale.customer_name}<br />
          ${sale.goat_customers?.phone || ''}
        </div>
        <div style="text-align:right;">
          <strong>Pricing Mode:</strong> ${sale.pricing_method === 'by_weight' ? 'Live Weight (₹/kg)' : 'Fixed Price per Animal'}<br />
          <strong>Status:</strong> ${Number(sale.balance_pending || 0) > 0 ? 'Payment Due' : 'Paid in Full'}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:0.88rem;">
        <thead>
          <tr style="background:rgba(11,48,36,0.06);border-bottom:1.5px solid var(--primary-navy);">
            <th style="padding:8px;text-align:left;">Item / Tag #</th>
            <th style="padding:8px;text-align:center;">Quantity</th>
            <th style="padding:8px;text-align:center;">Live Weight</th>
            <th style="padding:8px;text-align:right;">Rate</th>
            <th style="padding:8px;text-align:right;">Line Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:10px 8px;">Live Goats (${sale.pricing_method === 'by_weight' ? 'Live Weight' : 'Per Animal'})</td>
            <td style="padding:10px 8px;text-align:center;">${sale.total_quantity}</td>
            <td style="padding:10px 8px;text-align:center;">${sale.total_weight_kg ? `${sale.total_weight_kg} kg` : '—'}</td>
            <td style="padding:10px 8px;text-align:right;">${store.formatINR(sale.items?.[0]?.rate || (sale.total_amount / (sale.total_quantity || 1)))}</td>
            <td style="padding:10px 8px;text-align:right;"><strong>${store.formatINR(sale.total_amount)}</strong></td>
          </tr>
        </tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;margin-top:14px;font-size:0.92rem;">
        <div style="width:240px;">
          <div style="display:flex;justify-content:space-between;padding:4px 0;">
            <span>Subtotal:</span> <strong>${store.formatINR(sale.subtotal || sale.total_amount)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;">
            <span>Amount Paid:</span> <strong style="color:#087F5B;">${store.formatINR(sale.amount_paid)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1.5px solid var(--primary-navy);font-weight:800;font-size:1.05rem;">
            <span>Balance Due:</span> <strong style="color:${Number(sale.balance_pending || 0) > 0 ? 'var(--red-accent)' : '#087F5B'};">${store.formatINR(sale.balance_pending || 0)}</strong>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">
      <button class="btn-secondary" onclick="window.closeModal()">Close</button>
      <button class="btn-primary" onclick="window.printInvoiceDiv()">🖨 Print Invoice</button>
    </div>
  `;

  commonModalOverlay.classList.add('open');
};

// Modal K: Purchase Detail Modal
window.openGoatPurchaseDetailModal = function(purchaseId) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const pur = store.data.goatPurchases.find(p => p.id === purchaseId);
  if (!pur) return;

  modalTitle.textContent = `Purchase Intake ${pur.purchase_ref}`;
  modalBody.innerHTML = `
    <div style="background:#FFFFFF;border-radius:12px;padding:20px;border:1px solid var(--border-light);font-size:0.9rem;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
        <div><strong>Supplier:</strong> ${pur.goat_suppliers?.name || pur.supplier_name}</div>
        <div><strong>Purchase Date:</strong> ${store.formatDate(pur.purchase_date)}</div>
        <div><strong>Intake Method:</strong> ${pur.purchase_method === 'group' ? 'Group / Batch' : 'Individual Tagging'}</div>
        <div><strong>Quantity:</strong> ${pur.quantity} goats</div>
        <div><strong>Base Animal Cost:</strong> ${store.formatINR(pur.base_amount)}</div>
        <div><strong>Transport & Landed Costs:</strong> ${store.formatINR((pur.transport_expense || 0) + (pur.other_initial_costs || 0))}</div>
        <div><strong>Total Landed Cost:</strong> <strong>${store.formatINR(pur.total_acquisition_cost)}</strong></div>
        <div><strong>Allocated Cost / Animal:</strong> <strong>${store.formatINR(pur.allocated_cost_per_goat)}</strong></div>
        <div><strong>Amount Paid:</strong> ${store.formatINR(pur.amount_paid)}</div>
        <div><strong>Balance Due:</strong> <strong style="color:var(--red-accent);">${store.formatINR(pur.balance_pending)}</strong></div>
      </div>
      ${pur.notes ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-light);"><strong>Notes:</strong> ${pur.notes}</div>` : ''}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:16px;">
      <button class="btn-secondary" onclick="window.closeModal()">Close</button>
    </div>
  `;

  commonModalOverlay.classList.add('open');
};

// Helper: Delete confirmation modal (no browser popup blockers)
window.confirmDeleteGoatRecord = function(type, id, ref) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const commonModalOverlay = document.getElementById('commonModalOverlay');
  if (!modalBody || !commonModalOverlay) return;

  const displayType = type.charAt(0).toUpperCase() + type.slice(1);
  const displayName = ref || id;

  modalTitle.textContent = `Delete ${displayType}`;
  modalBody.innerHTML = `
    <div style="padding:10px 0;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
        <div style="width:48px;height:48px;border-radius:14px;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0;">
          🗑️
        </div>
        <div>
          <div style="font-size:1.05rem;font-weight:700;color:var(--primary-navy);">
            Are you sure you want to delete ${displayType.toLowerCase()} "${displayName}"?
          </div>
          <div style="font-size:0.83rem;color:var(--text-sub);margin-top:2px;">
            This will remove the record and recalculate your livestock inventory and accounts.
          </div>
        </div>
      </div>
      <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px 14px;font-size:0.84rem;color:#B91C1C;margin-bottom:20px;line-height:1.45;">
        ⚠️ <strong>Notice:</strong> This action is permanent and cannot be undone.
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="button" id="doDeleteGoatRecordBtn" class="btn-danger" style="padding:8px 18px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
          🗑 Yes, Delete
        </button>
      </div>
    </div>
  `;

  document.getElementById('doDeleteGoatRecordBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('doDeleteGoatRecordBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
    try {
      await store.deleteGoatRecord(type, id);
      window.closeModal();
      window.showToast?.(`Goat ${type} record deleted successfully.`);
      renderGoatFarming();
    } catch (err) {
      alert('Delete failed: ' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = '🗑 Yes, Delete'; }
    }
  });

  commonModalOverlay.classList.add('open');
};

// Excel Export
window.exportGoatExcelReport = function() {
  const wb = XLSX.utils.book_new();

  // P&L Summary Sheet
  const m = store.getGoatDashboardMetrics();
  const summaryData = [
    ['GOAT FARMING & TRADING — FINANCIAL REPORT'],
    ['Generated On', new Date().toLocaleString()],
    [''],
    ['METRIC', 'VALUE'],
    ['Total Goats Currently Owned', m.total_goats_owned],
    ['Individually Tracked Goats', m.individual_goats_count],
    ['Active Batches / Groups', m.active_groups_count],
    ['Herd Inventory Value (Carrying Basis)', m.herd_inventory_value],
    ['Purchases This Month', m.purchases_this_month],
    ['Sales This Month', m.sales_this_month],
    ['COGS This Month', m.cogs_this_month],
    ['Gross Margin This Month', m.gross_profit_this_month],
    ['Rearing Expenses This Month', m.expenses_this_month],
    ['Realized Net Profit / (Loss)', m.realized_profit_loss],
    ['Customer Receivables Pending', m.customer_receivables],
    ['Supplier Payables Pending', m.supplier_payables]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'P&L Summary');

  // Goats Inventory Sheet
  const goatsData = [
    ['Tag ID', 'Group', 'Breed', 'Sex', 'Weight (kg)', 'Acquisition Cost', 'Status', 'Health Status', 'Purchase Date'],
    ...store.data.goats.map(g => [
      g.tag_id, g.goat_groups?.group_code || g.group_code || '', g.breed, g.sex || '',
      g.latest_weight || '', g.total_cost_basis || '', g.status, g.health_status || '', g.purchase_date || ''
    ])
  ];
  const wsGoats = XLSX.utils.aoa_to_sheet(goatsData);
  XLSX.utils.book_append_sheet(wb, wsGoats, 'Goat Herd');

  // Sales Sheet
  const salesData = [
    ['Invoice #', 'Sale Date', 'Customer', 'Pricing Method', 'Quantity', 'Weight (kg)', 'Total Amount', 'Amount Paid', 'Balance Pending', 'COGS', 'Gross Profit'],
    ...store.data.goatSales.map(s => [
      s.invoice_no, s.sale_date, s.goat_customers?.name || s.customer_name || '', s.pricing_method,
      s.total_quantity, s.total_weight_kg || '', s.total_amount, s.amount_paid, s.balance_pending,
      s.total_cogs || '', s.gross_profit || ''
    ])
  ];
  const wsSales = XLSX.utils.aoa_to_sheet(salesData);
  XLSX.utils.book_append_sheet(wb, wsSales, 'Goat Sales');

  // Expenses Sheet
  const expData = [
    ['Ref #', 'Date', 'Category', 'Paid To', 'Payment Mode', 'Amount', 'Description'],
    ...store.data.goatExpenses.map(e => [
      e.expense_ref, e.expense_date, e.category, e.paid_to, e.payment_mode, e.amount, e.description || ''
    ])
  ];
  const wsExp = XLSX.utils.aoa_to_sheet(expData);
  XLSX.utils.book_append_sheet(wb, wsExp, 'Goat Expenses');

  XLSX.writeFile(wb, `Goat_Farming_Report_${store.getCurrentDate()}.xlsx`);
};

window.printGoatReport = function() {
  const printArea = document.getElementById('goatPnlPrintArea');
  if (!printArea) { window.print(); return; }
  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <head>
        <title>Goat Enterprise P&L Statement</title>
        <style>
          body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 30px; color: #14231D; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          td, th { padding: 10px; }
        </style>
      </head>
      <body>
        <h1 style="color:#0B3024;">Sri Balaji Livestock & Goat Farm</h1>
        <p>Goat Operations • Profit & Loss Statement as of ${store.getCurrentDate()}</p>
        <hr />
        ${printArea.innerHTML}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 250);
};

window.printInvoiceDiv = function() {
  const inv = document.getElementById('printableGoatInvoice');
  if (!inv) return;
  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <head>
        <title>Goat Sales Invoice</title>
        <style>
          body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 30px; color: #14231D; }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        ${inv.innerHTML}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 250);
};

// Global hooks for tab and filter switching
window.switchGoatTab = function(tab) {
  currentGoatSubTab = tab;
  renderGoatFarming();
};

window.setInventoryMode = function(mode) {
  inventoryViewMode = mode;
  renderGoatFarming();
};

window.setInventorySearch = function(q) {
  inventorySearchQuery = q;
  renderGoatInventory(document.getElementById('goatViewContent'));
};

window.setInventoryBreed = function(b) {
  inventoryBreedFilter = b;
  renderGoatInventory(document.getElementById('goatViewContent'));
};

window.setInventoryStatus = function(s) {
  inventoryStatusFilter = s;
  renderGoatInventory(document.getElementById('goatViewContent'));
};
