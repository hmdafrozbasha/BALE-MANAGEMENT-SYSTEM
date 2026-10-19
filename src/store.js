// src/store.js — Supabase-backed store with Demo Mode fallback
// Preserves the same public API that app.js uses

import { supabase } from './lib/supabase.js';
import { INITIAL_DATA } from './data.js';
import {
  settingsService, dashboardService, suppliersService, purchasesService,
  plotsService, batchesService, customersService, salesService,
  expensesService, reportsService, profilesService, attachmentsService,
  systemService
} from './services/data.service.js';

const CACHE_KEY = 'bms_store_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class Store {
  constructor() {
    this.listeners = new Set();
    // In-memory cache
    this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
    this.currentUser = null;
    this.currentProfile = null;
    this._loading = false;
    this._backgroundRefreshPending = false;
  }

  // ─── Cache helpers ────────────────────────────────────────────────
  _saveCache() {
    try {
      const snapshot = {
        ts: Date.now(),
        plots: this.data.plots,
        batches: this.data.batches,
        suppliers: this.data.suppliers,
        customers: this.data.customers,
        purchases: this.data.purchases,
        sales: this.data.sales,
        expenses: this.data.expenses,
        settings: this.data.settings
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch(e) { /* quota exceeded — ignore */ }
  }

  _loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const snap = JSON.parse(raw);
      if (!snap || !snap.ts) return null;
      return snap;
    } catch(e) { return null; }
  }

  _clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch(e) {}
  }

  // ─── Auth Helpers ────────────────────────────────────────────────
  async initAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        this.currentUser = session.user;
        this.isDemo = false;
        await this._loadProfile();
      }
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          this.currentUser = session.user;
          this.isDemo = false;
          await this._loadProfile();
        } else if (!this.isDemo) {
          this.currentUser = null;
          this.currentProfile = null;
          this.data.settings.activeRole = 'Staff';
        }
        this.notify();
      });
      return session;
    } catch (err) {
      console.warn('initAuth warning:', err);
      return null;
    }
  }

  // (Demo mode removed — use Supabase accounts only)

  async _loadProfile() {
    if (!this.currentUser) return;
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', this.currentUser.id).single();
      if (data) {
        this.currentProfile = data;
        this.data.settings.activeRole = data.role === 'owner' ? 'Owner' : data.role === 'accountant' ? 'Accountant' : 'Staff';
      }
    } catch(e) {
      console.warn('Profile load error:', e.message);
    }
  }

  async signIn(email, password) {
    this.isDemo = false;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.currentUser = data.user;
    await this._loadProfile();
    await this.loadAll();
    this.notify();
    return data;
  }

  async signUp(email, password, fullName = '', role = 'Owner') {
    this.isDemo = false;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role.toLowerCase()
        }
      }
    });
    if (error) throw error;
    if (data?.user && data.session) {
      this.currentUser = data.user;
      await this._loadProfile();
      this.notify();
    }
    return data;
  }

  async signOut() {
    if (!this.isDemo) {
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
    }
    this.isDemo = false;
    this.currentUser = null;
    this.currentProfile = null;
    this.notify();
  }

  isAuthenticated() { return !!this.currentUser; }

  setRole(newRole) {
    this.data.settings.activeRole = newRole;
    this.notify();
  }

  // ─── Load All Data ───────────────────────────────────────────────
  async loadAll() {
    if (!this.currentUser) return;
    this._loading = true;
    try {
      const isFinance = this.canViewFinancials();

      // Fetch all data in a single parallel wave — no sequential batches
      const fetches = [
        plotsService.getAllWithInventory().catch(() => []),
        batchesService.getAll().catch(() => []),
        settingsService.get().catch(() => null),
        ...(isFinance ? [
          suppliersService.getWithBalance().catch(() => []),
          customersService.getWithBalance().catch(() => []),
          purchasesService.getAll().catch(() => []),
          salesService.getAll().catch(() => []),
          expensesService.getAll().catch(() => [])
        ] : [])
      ];

      const results = await Promise.all(fetches);
      const [plots, batches, settingsData] = results;

      this.data.plots = plots || [];
      this.data.batches = batches || [];

      // Reconcile plots with active batches: only enrich metadata for plots that are NOT empty
      if (this.data.plots && this.data.batches) {
        this.data.batches.forEach(b => {
          const bStatus = b.status || 'Fermenting';
          if (bStatus === 'Fermenting' || bStatus === 'Ready') {
            const plotName = b.plot_name || b.plotAssigned || b.plots?.plot_name;
            const p = this.data.plots.find(pt => (pt.plot_name === plotName || pt.id === b.plot_id || pt.id === plotName));
            if (p) {
              // NEVER overwrite an explicitly emptied plot!
              if (p.status !== 'Empty' && p.bales > 0) {
                p.batchNumber = p.batchNumber || b.batch_number || b.batchNumber || '';
                p.batchId = p.batchId || b.id;
                p.fermStart = p.fermStart || b.fermentation_start || b.fermentationStart || null;
                p.readyDate = p.readyDate || b.ready_date || b.readyDate || null;
                p.costPerBale = p.costPerBale || Number(b.cost_per_bale || b.costPerBale) || 0;
                p.prodDate = p.prodDate || b.production_date || b.productionDate || null;
                if (bStatus === 'Ready' && p.status === 'Fermenting') {
                  p.status = 'Ready';
                }
              }
            }
          }
        });
      }

      // Restore 1-minute fermentation countdowns from localStorage
      try {
        const minuteCountdowns = JSON.parse(localStorage.getItem('bms_minute_fermentations') || '{}');
        (this.data.plots || []).forEach(p => {
          const key = (p.plot_name || p.id || '').toUpperCase();
          const stored = minuteCountdowns[key] || minuteCountdowns[p.plot_name] || minuteCountdowns[p.id];
          if (stored && p.status === 'Fermenting') {
            p.fermUnit = 'minute';
            p.fermDuration = stored.fermDuration || 1;
            p.fermEndTimestamp = stored.fermEndTimestamp;
            p.fermStart = stored.fermStart || p.fermStart;
          }
        });
      } catch (e) {}

      if (settingsData) {
        this.data.settings.fermentationDays = settingsData.fermentation_days || 30;
        this.data.settings.companyName = settingsData.company_name || 'Bale Manager';
      }

      if (isFinance) {
        const [, , , suppliers, customers, purchases, sales, expenses] = results;
        this.data.suppliers = suppliers || [];
        this.data.customers = customers || [];
        this.data.purchases = purchases || [];
        this.data.sales = sales || [];
        this.data.expenses = expenses || [];
      }

      // Persist fresh data to cache
      this._saveCache();
    } catch(e) {
      console.warn('loadAll error:', e);
    } finally {
      this._loading = false;
      this.notify();
    }
  }

  // ─── Fast init from cache, then background-refresh ────────────────
  async loadFromCacheThenRefresh() {
    if (!this.currentUser) return;

    const snap = this._loadCache();
    const cacheAge = snap ? (Date.now() - snap.ts) : Infinity;
    const cacheValid = snap && cacheAge < CACHE_TTL_MS;

    if (snap) {
      // Immediately hydrate from cache for instant UI
      if (snap.plots) this.data.plots = snap.plots;
      if (snap.batches) this.data.batches = snap.batches;
      if (snap.suppliers) this.data.suppliers = snap.suppliers;
      if (snap.customers) this.data.customers = snap.customers;
      if (snap.purchases) this.data.purchases = snap.purchases;
      if (snap.sales) {
        this.data.sales = (snap.sales || []).map(s => {
          const items = s.sale_line_items || s.stockAllocations || [];
          const lineBales = items.reduce((sum, li) => sum + (Number(li.bales_sold || li.bale_count || li.bales) || 0), 0);
          const bales = Number(s.bales_count ?? s.balesCount ?? lineBales) || lineBales || 0;
          let rate = Number(s.rate_per_bale ?? s.ratePerBale) || 0;
          if (!rate && items.length > 0) {
            rate = Number(items[0].rate_per_bale || items[0].ratePerBale || items[0].price) || 0;
          }
          if (!rate && bales > 0 && (s.subtotal || s.invoice_total)) {
            rate = Math.round(Number(s.subtotal || s.invoice_total) / bales);
          }
          return {
            ...s,
            bales_count: bales,
            balesCount: bales,
            rate_per_bale: rate,
            ratePerBale: rate
          };
        });
      }
      if (snap.expenses) this.data.expenses = snap.expenses;
      if (snap.settings) {
        this.data.settings.fermentationDays = snap.settings.fermentationDays || 30;
        this.data.settings.companyName = snap.settings.companyName || 'Bale Manager';
        this.data.settings.activeRole = snap.settings.activeRole || this.data.settings.activeRole;
      }
      // Restore minute fermentation countdowns
      try {
        const minuteCountdowns = JSON.parse(localStorage.getItem('bms_minute_fermentations') || '{}');
        (this.data.plots || []).forEach(p => {
          const key = (p.plot_name || p.id || '').toUpperCase();
          const stored = minuteCountdowns[key];
          if (stored && p.status === 'Fermenting') {
            p.fermUnit = 'minute';
            p.fermDuration = stored.fermDuration || 1;
            p.fermEndTimestamp = stored.fermEndTimestamp;
            p.fermStart = stored.fermStart || p.fermStart;
          }
        });
      } catch(e) {}
      this.notify(); // Render immediately with cached data
    }

    // Always refresh in background (or immediately if cache is stale)
    if (!cacheValid) {
      // Cache is old — refresh immediately (but still non-blocking)
      this.loadAll().then(() => this.notify()).catch(console.warn);
    } else {
      // Cache is fresh — refresh quietly in background after 2s
      setTimeout(() => {
        this.loadAll().then(() => this.notify()).catch(console.warn);
      }, 2000);
    }
  }

  // ─── Pub/Sub ─────────────────────────────────────────────────────
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    for (const l of this.listeners) l(this.data);
  }

  // ─── Formatting Helpers ──────────────────────────────────────────
  getCurrentDate() { return new Date().toISOString().split('T')[0]; }
  setCurrentDate(dateStr) { this.data.settings.currentDate = dateStr; this.notify(); }

  formatDate(dateStr) {
    if (!dateStr) return '--';
    const s = typeof dateStr === 'string' ? dateStr : dateStr.toISOString().split('T')[0];
    if (s.includes('-') && s.split('-')[0].length === 4) {
      const [y, m, d] = s.split('T')[0].split('-');
      return `${d}-${m}-${y}`;
    }
    return s;
  }

  formatINR(val, compact = false) {
    if (val === undefined || val === null || isNaN(val)) return '₹ 0';
    const num = Math.round(Number(val));
    if (compact && Math.abs(num) >= 100000) return `₹ ${(num/100000).toFixed(2).replace(/\.00$/, '')} L`;
    const isNeg = num < 0;
    const absStr = Math.abs(num).toString();
    let result = absStr.length > 3
      ? absStr.substring(0, absStr.length-3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + absStr.substring(absStr.length-3)
      : absStr;
    return `${isNeg ? '-' : ''}₹ ${result}`;
  }

  formatNumber(val) {
    if (val === undefined || val === null || isNaN(val)) return '0';
    const num = Math.round(Number(val));
    const absStr = Math.abs(num).toString();
    const result = absStr.length > 3
      ? absStr.substring(0, absStr.length-3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + absStr.substring(absStr.length-3)
      : absStr;
    return (num < 0 ? '-' : '') + result;
  }

  getDaysDifference(from, to) {
    try {
      return Math.floor((new Date(to) - new Date(from)) / (1000*60*60*24));
    } catch { return 0; }
  }

  addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + Number(days));
    return d.toISOString().split('T')[0];
  }

  // ─── Role & Permissions ──────────────────────────────────────────
  getRole() { return this.data.settings.activeRole || 'Staff'; }
  canViewFinancials() { return this.getRole() !== 'Staff'; }
  canEditFinancials() { return ['Owner','Accountant'].includes(this.getRole()); }
  canDelete() { return ['Owner','Accountant'].includes(this.getRole()); }
  canManageUsers() { return this.getRole() === 'Owner'; }

  // ─── Raw Material (Hay) Tracking ─────────────────────────────────
  isHayMaterial(p) {
    if (!p) return false;
    const name = String(p.material_name || p.material || p.name || p.raw_materials?.name || '').trim().toLowerCase();
    // Only Hay counts towards raw material bale stock
    return name.includes('hay');
  }

  getTotalHayPurchasedKg() {
    const hayPurchases = (this.data.purchases || []).filter(p => this.isHayMaterial(p));
    return hayPurchases.reduce((sum, p) => {
      const qty = Number(p.quantity) || 0;
      const conv = Number(p.kg_conversion) || (p.unit === 'ton' ? 1000 : p.unit === 'load' ? 5000 : p.unit === 'bale' ? 28 : 1);
      return sum + (Number(p.quantity_kg) || (qty * conv));
    }, 0);
  }

  getTotalHayConsumedKg() {
    return (this.data.batches || []).reduce((sum, b) => {
      return sum + (Number(b.raw_material_kg || b.rawMaterialKg) || 0);
    }, 0);
  }

  getAvailableHayKg() {
    const totalPurchased = this.getTotalHayPurchasedKg();
    const totalConsumed = this.getTotalHayConsumedKg();
    return Math.max(0, totalPurchased - totalConsumed);
  }

  // ─── Dashboard Metrics (from Supabase RPC) ───────────────────────
  async getDashboardMetricsAsync(month) {
    try {
      // Only getBatchesReadySoon needs a network call (join data).
      // All financial metrics computed from in-memory store -- instant.
      let batchesSoon = [];
      try { batchesSoon = await dashboardService.getBatchesReadySoon(this.getCurrentDate(), this.data.settings.fermentationDays); } catch(e) {}
      const metrics = null;
      const payments = [];

      // Calculate live plot counts from store plots to avoid stale RPC race conditions
      const plotsReady = (this.data.plots || []).filter(p => p.status === 'Ready').reduce((s,p) => s + (Number(p.bales)||0), 0);
      const plotsFerm = (this.data.plots || []).filter(p => p.status === 'Fermenting').reduce((s,p) => s + (Number(p.bales)||0), 0);

      // Calculate real raw material stock: ONLY Hay purchases count as raw material stock
      const realRawKg = this.getAvailableHayKg();
      const totalHayPurchasedKg = this.getTotalHayPurchasedKg();
      const totalHayConsumedKg = this.getTotalHayConsumedKg();

      // Filter batchesReadySoon so that plots that are already 'Ready' are never displayed as fermenting
      const activeFermPlotNames = new Set(
        (this.data.plots || []).filter(p => p.status === 'Fermenting').map(p => (p.plot_name || p.id || '').toUpperCase())
      );
      const filteredBatchesSoon = (batchesSoon || [])
        .filter(b => activeFermPlotNames.has((b.plot || '').toUpperCase()))
        .map(b => {
          const p = (this.data.plots || []).find(pt => (pt.plot_name || pt.id || '').toUpperCase() === (b.plot || '').toUpperCase());
          if (p && p.fermUnit === 'minute' && p.fermEndTimestamp) {
            const secs = Math.max(0, Math.ceil((p.fermEndTimestamp - Date.now()) / 1000));
            return {
              ...b,
              isMinuteMode: true,
              fermUnit: 'minute',
              fermEndTimestamp: p.fermEndTimestamp,
              secsLeft: secs
            };
          }
          return b;
        });

      // Reconcile live sales metrics to guarantee dashboard reflects latest data immediately
      const storeSales = this.data.sales || [];
      const storePurchases = this.data.purchases || [];
      const storeExpenses = this.data.expenses || [];

      const calcCustomerDues = storeSales.reduce((s,r) => s + (Number(r.balance_pending ?? r.balancePending) || 0), 0);
      const calcSupplierDues = storePurchases.reduce((s,r) => s + (Number(r.balance_pending ?? r.balancePending) || 0), 0);
      const calcMonthSales = storeSales
        .filter(s => (s.invoice_date || s.date || '').startsWith(month))
        .reduce((s,r) => s + (Number(r.invoice_total ?? r.invoiceTotal) || 0), 0);
      const calcMonthCOGS = storeSales
        .filter(s => (s.invoice_date || s.date || '').startsWith(month))
        .reduce((s,r) => s + (Number(r.cogs_total ?? r.cogsTotal) || 0), 0);
      const calcMonthExpenses = storeExpenses
        .filter(e => (e.expense_date || e.date || '').startsWith(month))
        .reduce((s,r) => s + (Number(r.amount) || 0), 0);
      const calcMonthSoldBales = storeSales
        .filter(s => (s.invoice_date || s.date || '').startsWith(month))
        .reduce((s,r) => s + (Number(r.bales_count ?? r.balesCount ?? (r.sale_line_items || []).reduce((sb, li) => sb + (Number(li.bales_sold) || 0), 0)) || 0), 0);

      // Dashboard metrics always reflect actual loaded store records (0 when empty or reset)
      const customerDues = calcCustomerDues;
      const supplierDues = calcSupplierDues;
      const monthSales = calcMonthSales;
      const monthCOGS = calcMonthCOGS;
      const monthExpenses = calcMonthExpenses;
      const monthSoldBales = calcMonthSoldBales;
      const grossProfit = monthSales - monthCOGS;
      const netProfit = grossProfit - monthExpenses;

      // Reconcile upcoming payments if RPC list is empty
      let upcomingList = payments && payments.length > 0 ? payments : [];
      if (upcomingList.length === 0) {
        const todayStr = this.getCurrentDate();
        const custDues = storeSales
          .filter(s => (Number(s.balance_pending ?? s.balancePending) || 0) > 0)
          .map(s => {
            const dueDate = s.due_date || s.dueDate || '';
            return {
              who: s.customers?.name || s.customerName || 'Customer',
              type: 'Receive',
              amount: Number(s.balance_pending ?? s.balancePending) || 0,
              dueDate,
              isOverdue: dueDate && new Date(dueDate) < new Date(todayStr)
            };
          });
        const supDues = storePurchases
          .filter(p => (Number(p.balance_pending ?? p.balancePending) || 0) > 0)
          .map(p => {
            const dueDate = p.payment_due_date || p.paymentDueDate || '';
            return {
              who: p.suppliers?.name || p.supplierName || p.supplier_name || 'Supplier',
              type: 'Pay',
              amount: Number(p.balance_pending ?? p.balancePending) || 0,
              dueDate,
              isOverdue: dueDate && new Date(dueDate) < new Date(todayStr)
            };
          });
        upcomingList = [...custDues, ...supDues].sort((a,b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
      }

      return {
        role: this.getRole(),
        readyBales: plotsReady > 0 ? plotsReady : (metrics?.ready_bales || 0),
        fermentingBales: plotsFerm === 0 ? 0 : (metrics?.fermenting_bales || plotsFerm),
        customerDues,
        supplierDues,
        monthSales,
        monthCOGS,
        monthExpenses,
        grossProfit,
        netProfit,
        totalHayPurchasedKg,
        totalHayConsumedKg,
        rawMaterialKg: realRawKg,
        rawMaterialBalesEquiv: Math.round(realRawKg / 28),
        monthSoldBales,
        batchesReadySoon: filteredBatchesSoon,
        upcomingPayments: upcomingList
      };
    } catch(e) {
      console.warn('Dashboard metrics error, using local fallback:', e);
      return this.getDashboardMetrics(month);
    }
  }

  // Sync fallback for template rendering (uses cached data)
  getDashboardMetrics(month) {
    const today = this.getCurrentDate();
    const fermDays = this.data.settings.fermentationDays || 30;

    const readyBales = this.data.plots.filter(p => p.status === 'Ready').reduce((s,p) => s + (p.bales||0), 0);
    const fermentingBales = this.data.plots.filter(p => p.status === 'Fermenting').reduce((s,p) => s + (p.bales||0), 0);
    const customerDues = this.data.sales.reduce((s,r) => s + (Number(r.balance_pending||r.balancePending)||0), 0);
    const supplierDues = this.data.purchases.reduce((s,r) => s + (Number(r.balance_pending||r.balancePending)||0), 0);
    const monthSales = this.data.sales.filter(s => (s.invoice_date||s.date||'').startsWith(month)).reduce((s,r) => s + (Number(r.invoice_total||r.invoiceTotal)||0), 0);
    const monthCOGS = this.data.sales.filter(s => (s.invoice_date||s.date||'').startsWith(month)).reduce((s,r) => s + (Number(r.cogs_total||r.cogsTotal)||0), 0);
    const monthExpenses = this.data.expenses.filter(e => (e.expense_date||e.date||'').startsWith(month)).reduce((s,r) => s + (Number(r.amount)||0), 0);
    
    const realRawKg = this.getAvailableHayKg();
    const totalHayPurchasedKg = this.getTotalHayPurchasedKg();
    const totalHayConsumedKg = this.getTotalHayConsumedKg();

    const monthSoldBales = this.data.sales.filter(s => (s.invoice_date||s.date||'').startsWith(month)).reduce((s,r) => {
      const items = r.sale_line_items || r.stockAllocations || [];
      const lineBales = items.reduce((sum, li) => sum + (Number(li.bales_sold || li.bale_count || li.bales) || 0), 0);
      return s + (Number(r.balesCount ?? r.bales_count ?? lineBales) || lineBales || 0);
    }, 0);

    const batchesReadySoon = this.data.plots
      .filter(p => p.status === 'Fermenting' && (p.bales || 0) > 0 && p.fermStart)
      .map(p => {
        if (p.fermUnit === 'minute' && p.fermEndTimestamp) {
          const secs = Math.max(0, Math.ceil((p.fermEndTimestamp - Date.now()) / 1000));
          return {
            plot: p.plot_name || p.id,
            batch: p.batchNumber || '',
            bales: p.bales,
            daysLeft: 0,
            secsLeft: secs,
            isMinuteMode: true,
            fermEndTimestamp: p.fermEndTimestamp,
            readyDate: today
          };
        }
        const daysPassed = Math.max(0, this.getDaysDifference(p.fermStart, today));
        const daysLeft = Math.max(0, fermDays - daysPassed);
        return {
          plot: p.plot_name || p.id,
          batch: p.batchNumber || '',
          bales: p.bales,
          daysLeft,
          daysPassed,
          readyDate: this.addDays(p.fermStart, fermDays)
        };
      })
      .sort((a,b) => (a.isMinuteMode ? 0 : 1) - (b.isMinuteMode ? 0 : 1) || (a.secsLeft || a.daysLeft) - (b.secsLeft || b.daysLeft))
      .slice(0, 6);

    return {
      role: this.getRole(),
      readyBales,
      fermentingBales,
      customerDues,
      supplierDues,
      monthSales,
      monthCOGS,
      monthExpenses,
      grossProfit: monthSales - monthCOGS,
      netProfit: monthSales - monthCOGS - monthExpenses,
      totalHayPurchasedKg,
      totalHayConsumedKg,
      rawMaterialKg: realRawKg,
      rawMaterialBalesEquiv: Math.round(realRawKg/28),
      monthSoldBales,
      batchesReadySoon,
      upcomingPayments: []
    };
  }

  // ─── Purchase Actions ─────────────────────────────────────────────
  async addPurchase(purchaseData) {
    const unitConversions = { ton: 1000, load: 5000, bale: 28, kg: 1 };
    const kgConv = unitConversions[purchaseData.unit] || 1;
    const qty = Number(purchaseData.quantity) || 0;
    const rate = Number(purchaseData.rate) || 0;
    const matCost = qty * rate;
    const otherCost = (Number(purchaseData.transport)||0) + (Number(purchaseData.loading)||0) + (Number(purchaseData.commission)||0) + (Number(purchaseData.other)||0);
    const subtotal = matCost + otherCost;
    const gstRate = Number(purchaseData.gstRate) || 0;
    const gstAmount = subtotal * (gstRate / 100);
    const actualCost = subtotal + gstAmount;
    const amountPaid = Number(purchaseData.amountPaid) || 0;
    const balance = actualCost - amountPaid;

    const purYear = (purchaseData.date || this.getCurrentDate()).split('-')[0];
    const generatedInvoiceNo = purchaseData.invoiceNo?.trim() || `PUR-${purYear}-${String(this.data.purchases.length + 1001).padStart(4, '0')}`;

    try {
      const result = await purchasesService.savePurchase({
        supplier_name: purchaseData.supplierName,
        supplier_id: purchaseData.supplierId || null,
        material_name: purchaseData.material || 'Hay (loose)',
        purchase_date: purchaseData.date || this.getCurrentDate(),
        invoice_no: generatedInvoiceNo,
        quantity: qty,
        unit: purchaseData.unit,
        kg_conversion: kgConv,
        rate_per_unit: rate,
        transport: Number(purchaseData.transport) || 0,
        loading: Number(purchaseData.loading) || 0,
        commission: Number(purchaseData.commission) || 0,
        other_charges: Number(purchaseData.other) || 0,
        gst_rate: gstRate,
        amount_paid: amountPaid,
        payment_mode: purchaseData.paymentMode || 'Cash',
        payment_due_date: purchaseData.dueDate || null,
        notes: purchaseData.notes || ''
      });
      await this.loadAll();
      return result;
    } catch(err) {
      console.warn('Backend savePurchase failed, falling back to local memory:', err.message);
      // Fallback local update
      const newPur = {
        id: 'pur-' + Date.now(),
        supplierId: purchaseData.supplierId || 'sup-1',
        supplierName: purchaseData.supplierName || 'Supplier',
        date: purchaseData.date || this.getCurrentDate(),
        invoiceNo: generatedInvoiceNo,
        material: purchaseData.material || 'Hay (loose)',
        quantity: qty,
        unit: purchaseData.unit || 'ton',
        quantity_kg: qty * kgConv,
        kg_conversion: kgConv,
        rate: rate,
        materialCost: matCost,
        transport: Number(purchaseData.transport) || 0,
        loading: Number(purchaseData.loading) || 0,
        commission: Number(purchaseData.commission) || 0,
        other: Number(purchaseData.other) || 0,
        gstRate: gstRate,
        gstAmount: gstAmount,
        actualCost: actualCost,
        amountPaid: amountPaid,
        balancePending: balance,
        paymentMode: purchaseData.paymentMode || 'Cash',
        dueDate: purchaseData.dueDate || this.addDays(this.getCurrentDate(), 15)
      };
      this.data.purchases.unshift(newPur);
      this.notify();
      return newPur;
    }
  }

  // ─── Production Batch Actions ─────────────────────────────────────
  async addBatch(batchInput) {
    const plotName = batchInput.plotAssigned;
    const plots = this.data.plots;
    const plot = plots.find(p => (p.plot_name || p.id) === plotName);

    // Check if plot is already occupied by an active fermenting or ready batch
    const occupiedBatch = this.data.batches.find(b => 
      ['Fermenting', 'Ready'].includes(b.status) && 
      ((b.plot_name || b.plotAssigned || b.plots?.plot_name || '').toUpperCase() === (plotName || '').toUpperCase() ||
       (b.plot_id && plot?.id && b.plot_id === plot.id))
    );
    if (occupiedBatch || (plot && plot.status !== 'Empty' && (plot.bales || 0) > 0)) {
      throw new Error(`Plot ${plotName} is already occupied by active batch ${occupiedBatch?.batch_number || occupiedBatch?.batchNumber || plot?.batchNumber || ''}. No plot can have multiple production batches.`);
    }

    const rawKg = Number(batchInput.rawMaterialKg) || 0;
    const availableHay = this.getAvailableHayKg();

    // STRICT VALIDATION: Cannot consume more Hay than available stock
    if (rawKg > availableHay) {
      throw new Error(`Insufficient Hay stock! You entered ${rawKg} kg, but only ${availableHay} kg of Hay is available in stock. Please purchase more Hay first or reduce the quantity.`);
    }

    const rawCost = Number(batchInput.rawMaterialCost) || 0;
    const labour = Number(batchInput.labourCost) || 0;
    const wrapping = Number(batchInput.wrappingCost) || 0;
    const machinery = Number(batchInput.machineryCost) || 0;
    const other = Number(batchInput.otherCost) || 0;
    const totalCost = rawCost + labour + wrapping + machinery + other;
    const finishedBales = Number(batchInput.finishedBales) || 1;
    const costPerBale = Math.round(totalCost / finishedBales);

    const fermUnit = batchInput.fermUnit || this.data.settings.fermentationUnit || 'day';
    const fermDuration = Number(batchInput.fermDuration) || (fermUnit === 'minute' ? 1 : (this.data.settings.fermentationDays || 30));
    const now = Date.now();
    let readyDate = '';
    let fermEndTimestamp = null;

    if (fermUnit === 'minute') {
      fermEndTimestamp = now + (fermDuration * 60 * 1000);
      readyDate = this.getCurrentDate();
    } else {
      readyDate = this.addDays(batchInput.fermentationStart || this.getCurrentDate(), fermDuration);
    }

    try {
      const isUUID = plot?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plot.id);
      const result = await batchesService.saveBatch({
        batch_number: batchInput.batchNumber || '',
        production_date: batchInput.productionDate || this.getCurrentDate(),
        raw_material_kg: rawKg,
        raw_material_cost: rawCost,
        labour_cost: labour,
        wrapping_cost: wrapping,
        machinery_cost: machinery,
        other_cost: other,
        finished_bales: finishedBales,
        plot_id: isUUID ? plot.id : null,
        plot_name: batchInput.plotAssigned,
        fermentation_start: batchInput.fermentationStart || this.getCurrentDate()
      });
      await this.loadAll();
      const updatedPlot = this.data.plots.find(p => (p.plot_name || p.id) === plotName);
      if (updatedPlot) {
        updatedPlot.bales = finishedBales;
        updatedPlot.status = 'Fermenting';
        updatedPlot.fermStart = batchInput.fermentationStart || this.getCurrentDate();
        updatedPlot.fermUnit = fermUnit;
        updatedPlot.fermDuration = fermDuration;
        updatedPlot.fermStartTimestamp = now;
        updatedPlot.fermEndTimestamp = fermEndTimestamp;
        updatedPlot.readyDate = readyDate;
        updatedPlot.batchNumber = batchInput.batchNumber || result?.batch_number || '';
        updatedPlot.costPerBale = costPerBale;
        updatedPlot.prodDate = batchInput.productionDate || this.getCurrentDate();
      }
      if (fermUnit === 'minute') {
        try {
          const minuteCountdowns = JSON.parse(localStorage.getItem('bms_minute_fermentations') || '{}');
          minuteCountdowns[(plotName || '').toUpperCase()] = {
            plotName,
            fermUnit: 'minute',
            fermDuration,
            fermEndTimestamp,
            fermStart: batchInput.fermentationStart || this.getCurrentDate(),
            batchNumber: batchInput.batchNumber || result?.batch_number || ''
          };
          localStorage.setItem('bms_minute_fermentations', JSON.stringify(minuteCountdowns));
        } catch(e) {}
      }
      this.notify();
      return result;
    } catch(err) {
      if (err.message && err.message.toLowerCase().includes('insufficient')) {
        throw err;
      }
      console.warn('Backend saveBatch failed, updating in local memory:', err.message);
      const newBatch = {
        id: 'batch-' + Date.now(),
        batchNumber: batchInput.batchNumber || this.generateBatchNumber(),
        productionDate: batchInput.productionDate || this.getCurrentDate(),
        rawMaterialKg: rawKg,
        rawMaterialCost: rawCost,
        labourCost: labour,
        wrappingCost: wrapping,
        machineryCost: machinery,
        otherCost: other,
        totalProductionCost: totalCost,
        finishedBales: finishedBales,
        costPerBale: costPerBale,
        rawMaterialPerBale: Math.round(rawCost / finishedBales),
        labourPerBale: Math.round(labour / finishedBales),
        otherPerBale: Math.round((wrapping + machinery + other) / finishedBales),
        plotAssigned: plotName,
        fermentationStart: batchInput.fermentationStart || this.getCurrentDate(),
        fermUnit: fermUnit,
        fermDuration: fermDuration,
        fermEndTimestamp: fermEndTimestamp,
        readyDate: readyDate,
        status: 'Fermenting'
      };
      this.data.batches.unshift(newBatch);
      if (plot) {
        plot.bales = finishedBales;
        plot.status = 'Fermenting';
        plot.fermStart = newBatch.fermentationStart;
        plot.fermUnit = fermUnit;
        plot.fermDuration = fermDuration;
        plot.fermStartTimestamp = now;
        plot.fermEndTimestamp = fermEndTimestamp;
        plot.readyDate = readyDate;
        plot.batchNumber = newBatch.batchNumber;
        plot.costPerBale = costPerBale;
        plot.prodDate = newBatch.productionDate;
      }
      this.notify();
      return newBatch;
    }
  }

  async deleteBatch(batchId) {
    const batch = this.data.batches.find(b => b.id === batchId || b.batch_number === batchId || b.batchNumber === batchId);
    if (!batch) return false;

    const actualId = batch.id;
    const plotName = batch.plot_name || batch.plotAssigned || batch.plots?.plot_name;
    const batchNum = batch.batch_number || batch.batchNumber;

    try {
      if (actualId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualId)) {
        await batchesService.delete(actualId);
      }
    } catch(err) {
      console.warn('Backend delete batch warning, removing locally:', err.message);
    }

    // Remove from in-memory batches
    this.data.batches = this.data.batches.filter(b => b.id !== actualId && (b.batch_number || b.batchNumber) !== batchNum);

    // Release assigned plot
    if (plotName) {
      const plot = this.data.plots.find(p => (p.plot_name || p.id || '').toUpperCase() === plotName.toUpperCase());
      if (plot && (plot.batchNumber === batchNum || plot.batchId === actualId || plot.status !== 'Empty')) {
        plot.bales = 0;
        plot.status = 'Empty';
        plot.batchNumber = '';
        plot.batchId = null;
        plot.fermStart = null;
        plot.readyDate = null;
        delete plot.fermEndTimestamp;
        delete plot.fermUnit;
      }
    }

    try {
      const minuteCountdowns = JSON.parse(localStorage.getItem('bms_minute_fermentations') || '{}');
      if (plotName) delete minuteCountdowns[plotName.toUpperCase()];
      Object.keys(minuteCountdowns).forEach(k => {
        if (minuteCountdowns[k].batchNumber === batchNum) delete minuteCountdowns[k];
      });
      localStorage.setItem('bms_minute_fermentations', JSON.stringify(minuteCountdowns));
    } catch(e) {}

    // Try loading fresh state from DB
    try {
      await this.loadAll();
    } catch(e) { /* ignore */ }

    this.notify();
    return true;
  }

  async deletePurchase(purchaseId) {
    if (!this.canDelete()) {
      throw new Error('Access denied. Only Owner and Accountant can delete purchases.');
    }
    const purchase = (this.data.purchases || []).find(p => p.id === purchaseId || p.invoice_no === purchaseId || p.invoiceNo === purchaseId);
    if (!purchase) return false;

    const actualId = purchase.id;
    // Perform backend delete
    if (actualId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualId)) {
      await purchasesService.delete(actualId);
    }

    // Remove from in-memory purchases immediately
    this.data.purchases = (this.data.purchases || []).filter(p => p.id !== actualId && (p.invoice_no || p.invoiceNo) !== (purchase.invoice_no || purchase.invoiceNo));

    // Reload state and ensure deleted purchase remains excluded
    try {
      await this.loadAll();
      this.data.purchases = (this.data.purchases || []).filter(p => p.id !== actualId && (p.invoice_no || p.invoiceNo) !== (purchase.invoice_no || purchase.invoiceNo));
    } catch(e) { /* ignore */ }

    this.notify();
    return true;
  }

  async deleteSupplier(supplierId) {
    if (!this.canDelete()) {
      throw new Error('Access denied. Only Owner and Accountant can delete suppliers.');
    }
    const supplier = (this.data.suppliers || []).find(s => s.id === supplierId || s.name === supplierId);
    if (!supplier) return false;

    const actualId = supplier.id;
    // Perform backend delete
    if (actualId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualId)) {
      await suppliersService.delete(actualId);
    }

    // Remove from in-memory suppliers immediately
    this.data.suppliers = (this.data.suppliers || []).filter(s => s.id !== actualId && s.id !== supplierId && s.name !== supplier.name);

    // Reload state and ensure deleted supplier remains excluded
    try {
      await this.loadAll();
      this.data.suppliers = (this.data.suppliers || []).filter(s => s.id !== actualId && s.id !== supplierId && s.name !== supplier.name);
    } catch(e) { /* ignore */ }

    this.notify();
    return true;
  }


  generateBatchNumber() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const existing = this.data.batches.filter(b => (b.batchNumber || b.batch_number || '').startsWith(`HB-${y}-${m}`)).length;
    return `HB-${y}-${m}-${String(existing+1).padStart(3,'0')}`;
  }

  // ─── Plot Actions ─────────────────────────────────────────────────
  async updatePlotStock(plotId, newBales, newStatus) {
    const plot = this.data.plots.find(p => p.id === plotId || p.plot_name === plotId);
    if (!plot) return;
    const finalBales = Math.max(0, Number(newBales));
    const finalStatus = (finalBales === 0 || newStatus === 'Empty') ? 'Empty' : (newStatus || plot.status);

    plot.bales = finalBales;
    plot.status = finalStatus;
    if (finalStatus === 'Empty') {
      plot.batchNumber = '';
      plot.batchId = null;
    }
    this.notify();

    try {
      await plotsService.updateStock(plot.id || plot.plot_name, finalBales, finalStatus);
      await this.loadAll();
    } catch(err) {
      console.warn('Backend updateStock error, falling back locally:', err.message);
      this.notify();
    }
  }

  async movePlotStock(fromPlotId, toPlotId, balesToMove) {
    const numBales = Number(balesToMove);
    const source = this.data.plots.find(p => p.id === fromPlotId || p.plot_name === fromPlotId);
    const target = this.data.plots.find(p => p.id === toPlotId || p.plot_name === toPlotId);
    if (!source || !target) throw new Error('Invalid source or target plot');
    if ((source.bales || 0) < numBales) throw new Error(`Only ${source.bales || 0} bales available in source plot`);

    source.bales = Math.max(0, (source.bales || 0) - numBales);
    if (source.bales === 0) {
      source.status = 'Empty';
      source.batchNumber = '';
      source.batchId = null;
    }
    target.bales = (target.bales || 0) + numBales;
    target.status = source.status === 'Empty' ? 'Ready' : source.status;
    target.batchNumber = source.batchNumber || target.batchNumber;
    target.batchId = source.batchId || target.batchId;
    target.costPerBale = source.costPerBale || target.costPerBale;
    this.notify();

    try {
      await plotsService.moveStock(source.id || source.plot_name, target.id || target.plot_name, numBales);
      await this.loadAll();
    } catch(err) {
      console.warn('Backend moveStock failed, local state applied:', err.message);
      this.notify();
    }
  }

  async addPlot(plotId, section) {
    if (this.data.plots.some(p => (p.plot_name || p.id) === plotId)) throw new Error(`Plot ${plotId} already exists`);
    try {
      await plotsService.addPlot(plotId, section);
      await this.loadAll();
    } catch(err) {
      console.warn('Backend addPlot error, falling back locally:', err.message);
      this.data.plots.push({
        id: plotId,
        plot_name: plotId,
        section: section,
        bales: 0,
        status: 'Empty'
      });
      this.notify();
    }
  }

  // ─── Sale Actions ─────────────────────────────────────────────────
  async addSale(saleData) {
    const plots = this.data.plots;
    const balesCount = Number(saleData.balesCount) || (saleData.allocations || []).reduce((s, a) => s + Number(a.bales), 0);
    const rate = Number(saleData.ratePerBale) || 300;
    const subtotal = balesCount * rate;
    const gstRate = Number(saleData.gstRate) || 0;
    const gstAmount = subtotal * (gstRate / 100);
    const invoiceTotal = subtotal + gstAmount;
    const paid = Number(saleData.amountPaid) || 0;
    const balance = invoiceTotal - paid;

    try {
      const lineItems = (saleData.allocations || []).map(alloc => {
        const plot = plots.find(p => (p.plot_name || p.id) === alloc.plotId);
        return { plot_id: plot?.id, bales_sold: Number(alloc.bales), rate_per_bale: rate };
      });

      if (lineItems.length === 0) {
        const plot = plots.find(p => p.status === 'Ready' && p.bales > 0);
        if (plot) lineItems.push({ plot_id: plot.id, bales_sold: balesCount, rate_per_bale: rate });
      }

      const result = await salesService.saveSale({
        customer_id: saleData.customerId,
        invoice_date: saleData.date || this.getCurrentDate(),
        due_date: saleData.dueDate || null,
        gst_rate: gstRate,
        amount_paid: paid,
        payment_mode: saleData.paymentMode || 'Cash',
        notes: saleData.notes || '',
        line_items: lineItems
      });

      await this.loadAll();
      return result;
    } catch(err) {
      console.warn('Backend saveSale failed, falling back locally:', err.message);
      const cust = this.data.customers.find(c => c.id === saleData.customerId);
      const newSale = {
        id: 'inv-' + Date.now(),
        invoiceNumber: 'INV-' + (this.data.sales.length + 1001),
        customerId: saleData.customerId,
        customerName: cust?.name || 'Customer',
        date: saleData.date || this.getCurrentDate(),
        dueDate: saleData.dueDate || this.addDays(this.getCurrentDate(), 15),
        bales_count: balesCount,
        balesCount: balesCount,
        rate_per_bale: rate,
        ratePerBale: rate,
        subtotal: subtotal,
        gstRate: gstRate,
        gstAmount: gstAmount,
        invoiceTotal: invoiceTotal,
        cogsTotal: balesCount * 220,
        amountPaid: paid,
        balancePending: balance,
        status: balance <= 0 ? 'Paid' : (paid > 0 ? 'Partially Paid' : 'Pending'),
        paymentMode: saleData.paymentMode || 'Cash',
        sale_line_items: lineItems
      };
      this.data.sales.unshift(newSale);
      this.notify();
      return newSale;
    }
  }

  async addSalePayment(saleId, paymentInput) {
    const amt = Number(paymentInput.amountPaid) || 0;
    const safeDate = paymentInput.date 
      ? (/^\d{4}-\d{2}-\d{2}$/.test(paymentInput.date) ? paymentInput.date : paymentInput.date.split('-').reverse().join('-'))
      : this.getCurrentDate();
    try {
      const result = await salesService.addPayment({
        sale_id: saleId,
        amount: amt,
        payment_date: safeDate,
        payment_mode: paymentInput.mode || 'Cash',
        note: paymentInput.note || ''
      });
      await this.loadAll();
      return result;
    } catch(err) {
      console.warn('Backend addSalePayment failed, falling back locally:', err.message);
      const sale = this.data.sales.find(s => s.id === saleId);
      if (sale) {
        sale.amountPaid = (sale.amountPaid || 0) + amt;
        sale.balancePending = Math.max(0, (sale.balancePending || 0) - amt);
        sale.status = sale.balancePending <= 0 ? 'Paid' : 'Partially Paid';
        this.notify();
      }
      return true;
    }
  }

  // ─── Expense Actions ──────────────────────────────────────────────
  async addExpense(expenseInput) {
    const amt = Number(expenseInput.amount) || 0;
    try {
      const batch = expenseInput.relatedBatch
        ? this.data.batches.find(b => (b.batchNumber || b.batch_number) === expenseInput.relatedBatch)
        : null;

      const result = await expensesService.create({
        paid_to: expenseInput.paidTo,
        reason: expenseInput.reason,
        amount: amt,
        expense_date: expenseInput.date || this.getCurrentDate(),
        category: expenseInput.category || 'Miscellaneous',
        payment_mode: expenseInput.mode || 'Cash',
        related_batch_id: batch?.id || null,
        related_batch_number: expenseInput.relatedBatch || '',
        notes: expenseInput.notes || ''
      });

      await this.loadAll();
      return result;
    } catch(err) {
      console.warn('Backend addExpense failed, falling back locally:', err.message);
      const newExp = {
        id: 'exp-' + Date.now(),
        date: expenseInput.date || this.getCurrentDate(),
        category: expenseInput.category || 'Miscellaneous',
        paidTo: expenseInput.paidTo || '',
        reason: expenseInput.reason || '',
        amount: amt,
        mode: expenseInput.mode || 'Cash'
      };
      this.data.expenses.unshift(newExp);
      this.notify();
      return newExp;
    }
  }

  async deleteRecord(entityType, id) {
    if (!this.canDelete()) { alert('Access Denied'); return false; }
    try {
      if (entityType === 'expense') await expensesService.delete(id);
      await this.loadAll();
    } catch(e) {
      this.data.expenses = this.data.expenses.filter(ex => ex.id !== id);
      this.notify();
    }
    return true;
  }

  // ─── Settings Actions ─────────────────────────────────────
  async saveSettings(fields) {
    try {
      await settingsService.update(fields);
      await this.loadAll();
    } catch(e) {
      if (fields.fermentation_days) this.data.settings.fermentationDays = fields.fermentation_days;
      if (fields.company_name) this.data.settings.companyName = fields.company_name;
      this.notify();
    }
  }

  // ─── Fermentation Testing & Status Helpers ────────────────
  setFermentationMode(unit = 'minute', duration = 1) {
    this.data.settings.fermentationUnit = unit;
    this.data.settings.fermentationDuration = Number(duration) || (unit === 'minute' ? 1 : 30);
    this.data.settings.fermentationDays = unit === 'minute' ? 1 : (Number(duration) || 30);
    this.notify();
  }

  async fastFermentPlot(plotName) {
    const plot = this.data.plots.find(p => (p.plot_name || p.id || '').toUpperCase() === (plotName || '').toUpperCase());
    if (!plot) return false;
    plot.status = 'Ready';
    plot.fermUnit = null;
    plot.fermEndTimestamp = null;
    const today = this.getCurrentDate();
    plot.readyDate = today;

    // Clear 1-minute countdown from localStorage
    try {
      const minuteCountdowns = JSON.parse(localStorage.getItem('bms_minute_fermentations') || '{}');
      delete minuteCountdowns[(plot.plot_name || plot.id || '').toUpperCase()];
      delete minuteCountdowns[plotName];
      localStorage.setItem('bms_minute_fermentations', JSON.stringify(minuteCountdowns));
    } catch(e) {}

    const batch = this.data.batches.find(b =>
      ['Fermenting', 'Ready'].includes(b.status) &&
      (((b.plotAssigned || b.plot_name || b.plots?.plot_name || '').toUpperCase() === (plotName || '').toUpperCase()) ||
       (plot.batchNumber && (b.batchNumber === plot.batchNumber || b.batch_number === plot.batchNumber)))
    );
    if (batch) {
      batch.status = 'Ready';
      batch.readyDate = today;
      batch.ready_date = today;
    }

    // Persist to Supabase
    try {
      await plotsService.markReady(plot.id || plot.plot_name, batch?.id || batch?.batch_number);
    } catch(err) {
      console.warn('Backend markReady failed:', err.message);
    }

    this.notify();
    return true;
  }

  checkFermentationStatus() {
    let changed = false;
    const now = Date.now();
    const today = this.getCurrentDate();

    (this.data.plots || []).forEach(plot => {
      if (plot.status === 'Fermenting') {
        const isMinuteMode = plot.fermUnit === 'minute' && plot.fermEndTimestamp;
        const minuteExpired = isMinuteMode && now >= plot.fermEndTimestamp;
        const dayExpired = !isMinuteMode && plot.readyDate && today >= plot.readyDate;

        if (minuteExpired || dayExpired) {
          plot.status = 'Ready';
          plot.fermUnit = null;
          plot.fermEndTimestamp = null;
          plot.readyDate = today;
          changed = true;

          // Clear from localStorage if it was minute mode
          if (isMinuteMode) {
            try {
              const minuteCountdowns = JSON.parse(localStorage.getItem('bms_minute_fermentations') || '{}');
              delete minuteCountdowns[(plot.plot_name || plot.id || '').toUpperCase()];
              localStorage.setItem('bms_minute_fermentations', JSON.stringify(minuteCountdowns));
            } catch(e) {}
          }

          const batch = this.data.batches.find(b =>
            ['Fermenting', 'Ready'].includes(b.status) &&
            (((b.plotAssigned || b.plot_name || b.plots?.plot_name || '').toUpperCase() === (plot.plot_name || plot.id || '').toUpperCase()) ||
             (plot.batchNumber && (b.batchNumber === plot.batchNumber || b.batch_number === plot.batchNumber)))
          );
          if (batch) {
            batch.status = 'Ready';
            batch.readyDate = today;
            batch.ready_date = today;
          }

          // Persist to Supabase asynchronously
          plotsService.markReady(plot.id || plot.plot_name, batch?.id || batch?.batch_number).catch(err => {
            console.warn('Auto markReady error:', err.message);
          });
        }
      }
    });

    if (changed) {
      this.notify();
    }
    return changed;
  }

  async resetAllData(options = {}) {
    return this.resetSelectedData(options);
  }

  async resetSelectedData(options = {}) {
    if (!this.canDelete()) {
      throw new Error('Access denied. Only the Owner can reset system data.');
    }

    // Default: everything selected
    const sel = {
      sales: true,
      customers: true,
      purchases: true,
      suppliers: true,
      expenses: true,
      batches: true,
      plots: true,
      rawMaterials: true,
      ...options
    };

    // 1. Wipe Supabase in correct FK order (child tables first)
    const del = async (table) => {
      try {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) console.warn(`Reset delete ${table}:`, error.message);
      } catch(e) { console.warn(`Reset delete ${table} threw:`, e.message); }
    };
    const upd = async (table, vals, filter = {}) => {
      try {
        let q = supabase.from(table).update(vals);
        // Apply a filter that matches all rows
        q = q.neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await q;
        if (error) console.warn(`Reset update ${table}:`, error.message);
      } catch(e) { console.warn(`Reset update ${table} threw:`, e.message); }
    };

    // Try SQL RPC first (bypasses RLS)
    let rpcOk = false;
    try {
      const { data, error } = await supabase.rpc('reset_selected_data', { options: sel });
      if (!error && data?.success) rpcOk = true;
    } catch(e) {}

    if (!rpcOk) {
      // Fallback: direct table deletes (requires RLS DELETE policies)
      if (sel.sales || sel.customers) {
        await del('sale_payments');
        await del('sale_line_items');
        await del('sales');
      }
      if (sel.purchases || sel.suppliers) {
        await del('purchase_payments');
        await del('purchases');
      }
      if (sel.expenses) await del('expenses');
      await del('attachments');
      await del('inventory_movements');
      if (sel.batches || sel.plots) await del('production_batches');
      if (sel.plots) {
        await upd('plot_inventory', { status: 'Empty', bales_remaining: 0, bales_original: 0, batch_id: null, cost_per_bale: 0, ferm_start: null, ready_date: null });
      }
      if (sel.rawMaterials) {
        await upd('raw_materials', { stock_kg: 0 });
      }
      if (sel.suppliers) await del('suppliers');
      if (sel.customers) await del('customers');
    }

    // 2. Clear cache
    try { localStorage.removeItem('bms_minute_fermentations'); } catch(e) {}
    this._clearCache();

    // 3. Clear in-memory state for selected categories
    if (sel.batches) this.data.batches = [];
    if (sel.purchases) this.data.purchases = [];
    if (sel.sales) this.data.sales = [];
    if (sel.expenses) this.data.expenses = [];
    if (sel.suppliers) this.data.suppliers = [];
    if (sel.customers) this.data.customers = [];
    if (sel.rawMaterials) this.data.rawMaterial = { stockKg: 0, averageCostPerKg: 0 };
    if (sel.plots) {
      (this.data.plots || []).forEach(p => {
        p.bales = 0; p.status = 'Empty'; p.batchId = null; p.batchNumber = '';
        p.prodDate = ''; p.fermStart = ''; p.readyDate = '';
        p.fermUnit = null; p.fermDuration = null; p.fermEndTimestamp = null; p.costPerBale = 0;
      });
    }

    // 4. Notify immediately (show zeros)
    this.notify();

    // 5. Reload from Supabase to confirm state
    try { await this.loadAll(); } catch(e) { console.warn('Post-reset reload:', e.message); }

    this.notify();
    return true;
  }

  runFermentationDailyCheck() {
    return this.checkFermentationStatus();
  }
}

export const store = new Store();
export default store;

