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
import {
  goatDashboardService, goatSuppliersService, goatCustomersService,
  goatPurchasesService, goatGroupsService, goatsService,
  goatSalesService, goatExpensesService, goatResetService
} from './services/goat.service.js';

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
        settings: this.data.settings,
        // Strictly isolated Goat Farming module records
        goatSuppliers: this.data.goatSuppliers || [],
        goatCustomers: this.data.goatCustomers || [],
        goatPurchases: this.data.goatPurchases || [],
        goatGroups: this.data.goatGroups || [],
        goats: this.data.goats || [],
        goatSales: this.data.goatSales || [],
        goatExpenses: this.data.goatExpenses || [],
        goatWeightRecords: this.data.goatWeightRecords || [],
        goatHealthRecords: this.data.goatHealthRecords || [],
        goatSupplierPayments: this.data.goatSupplierPayments || [],
        goatCustomerPayments: this.data.goatCustomerPayments || []
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
        ] : []),
        // Parallel Goat Data fetches (strictly independent)
        goatGroupsService.getAll().catch(() => null),
        goatsService.getAll().catch(() => null),
        ...(isFinance ? [
          goatSuppliersService.getAll().catch(() => null),
          goatCustomersService.getAll().catch(() => null),
          goatPurchasesService.getAll().catch(() => null),
          goatSalesService.getAll().catch(() => null),
          goatExpensesService.getAll().catch(() => null)
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

      let offset = 3;
      if (isFinance) {
        this.data.suppliers = results[offset++] || [];
        this.data.customers = results[offset++] || [];
        this.data.purchases = results[offset++] || [];
        this.data.sales = results[offset++] || [];
        this.data.expenses = results[offset++] || [];
      }

      // Populate goat records if fetched from Supabase (preserve local fallback if table missing/error)
      const fetchedGoatGroups = results[offset++];
      const fetchedGoats = results[offset++];
      if (Array.isArray(fetchedGoatGroups)) this.data.goatGroups = fetchedGoatGroups;
      if (Array.isArray(fetchedGoats)) this.data.goats = fetchedGoats;

      if (isFinance) {
        const rawSuppliers = results[offset++];
        const rawCustomers = results[offset++];
        const fPurchases = results[offset++];
        const fSales = results[offset++];
        const fExpenses = results[offset++];

        if (Array.isArray(fPurchases)) this.data.goatPurchases = fPurchases;
        if (Array.isArray(fSales)) this.data.goatSales = fSales;
        if (Array.isArray(fExpenses)) this.data.goatExpenses = fExpenses;

        if (Array.isArray(rawSuppliers)) {
          const purchases = this.data.goatPurchases || [];
          this.data.goatSuppliers = rawSuppliers.map(s => {
            const supPurchases = purchases.filter(p => p.supplier_id === s.id || p.suppliers?.name === s.name || p.supplier_name === s.name);
            const totalPurchased = supPurchases.reduce((sum, p) => sum + (Number(p.total_acquisition_cost || p.totalCost || 0)), 0);
            const totalPaid = supPurchases.reduce((sum, p) => sum + (Number(p.amount_paid || p.amountPaid || 0)), 0);
            const balancePending = supPurchases.reduce((sum, p) => sum + (Number(p.balance_pending || p.balancePending || 0)), 0);
            return { ...s, totalPurchased, totalPaid, balancePending };
          });
        }

        if (Array.isArray(rawCustomers)) {
          const sales = this.data.goatSales || [];
          this.data.goatCustomers = rawCustomers.map(c => {
            const custSales = sales.filter(s => s.customer_id === c.id || s.customers?.name === c.name || s.customer_name === c.name);
            const totalPurchased = custSales.reduce((sum, s) => sum + (Number(s.total_amount || s.totalAmount || 0)), 0);
            const totalPaid = custSales.reduce((sum, s) => sum + (Number(s.amount_paid || s.amountPaid || 0)), 0);
            const balancePending = custSales.reduce((sum, s) => sum + (Number(s.balance_pending || s.balancePending || 0)), 0);
            return { ...c, totalPurchased, totalPaid, balancePending };
          });
        }
      }

      // If goat tables exist in cloud, auto-sync any local offline records
      if (Array.isArray(fetchedGoats) || Array.isArray(fetchedGoatGroups)) {
        await this.syncLocalGoatDataToCloud();
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

  // ─── Automatic Cloud Sync for Local Offline Goat Records ──────────
  async syncLocalGoatDataToCloud() {
    if (!this.currentUser || this._syncingGoats) return;
    this._syncingGoats = true;

    try {
      const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      // 1. Sync local suppliers
      const localSuppliers = (this.data.goatSuppliers || []).filter(s => s.id && !isUUID(s.id));
      for (const s of localSuppliers) {
        try {
          const res = await goatSuppliersService.create({
            name: s.name,
            phone: s.phone || '',
            city: s.city || 'Local'
          });
          if (res?.id) {
            const oldId = s.id;
            s.id = res.id;
            (this.data.goatPurchases || []).forEach(p => { if (p.supplier_id === oldId) p.supplier_id = res.id; });
            (this.data.goatGroups || []).forEach(g => { if (g.supplier_id === oldId) g.supplier_id = res.id; });
            (this.data.goats || []).forEach(g => { if (g.supplier_id === oldId) g.supplier_id = res.id; });
          }
        } catch(e) {}
      }

      // 2. Sync local purchases
      const localPurchases = (this.data.goatPurchases || []).filter(p => p.id && !isUUID(p.id));
      for (const p of localPurchases) {
        try {
          const res = await goatPurchasesService.savePurchase({
            ...p,
            supplier_id: isUUID(p.supplier_id) ? p.supplier_id : null
          });
          if (res?.purchase_id || res?.id) {
            const newId = res.purchase_id || res.id;
            const oldId = p.id;
            p.id = newId;
            if (res.purchase_ref) p.purchase_ref = res.purchase_ref;
            (this.data.goatGroups || []).forEach(g => { if (g.purchase_id === oldId) g.purchase_id = newId; });
            (this.data.goats || []).forEach(g => { if (g.purchase_id === oldId) g.purchase_id = newId; });
          }
        } catch(e) {}
      }

      // 3. Sync local goat groups
      const localGroups = (this.data.goatGroups || []).filter(g => g.id && !isUUID(g.id));
      for (const g of localGroups) {
        try {
          const res = await goatGroupsService.create({
            group_code: g.group_code,
            group_name: g.group_name || `Batch ${g.group_code}`,
            purchase_id: isUUID(g.purchase_id) ? g.purchase_id : null,
            supplier_id: isUUID(g.supplier_id) ? g.supplier_id : null,
            purchase_date: g.purchase_date || this.getCurrentDate(),
            initial_quantity: Number(g.initial_quantity) || 1,
            current_quantity: Number(g.current_quantity) || 1,
            total_cost_basis: Number(g.total_cost_basis) || 0,
            unit_cost_basis: Number(g.unit_cost_basis) || 0,
            initial_total_weight: Number(g.initial_total_weight) || 0,
            current_total_weight: Number(g.current_total_weight) || 0,
            breed: g.breed || 'Mixed/Local',
            status: g.status || 'Active',
            notes: g.notes || ''
          });
          if (res?.id) g.id = res.id;
        } catch(e) {}
      }

      // 4. Sync local individual goats
      const localGoats = (this.data.goats || []).filter(g => g.id && !isUUID(g.id));
      for (const g of localGoats) {
        try {
          const res = await goatsService.create({
            tag_id: g.tag_id,
            name: g.name || '',
            purchase_id: isUUID(g.purchase_id) ? g.purchase_id : null,
            supplier_id: isUUID(g.supplier_id) ? g.supplier_id : null,
            purchase_date: g.purchase_date || this.getCurrentDate(),
            breed: g.breed || 'Boer',
            sex: g.sex || 'Male',
            age_months: Number(g.age_months) || 12,
            initial_weight: Number(g.initial_weight) || 0,
            latest_weight: Number(g.latest_weight) || Number(g.initial_weight) || 0,
            last_weight_date: g.last_weight_date || g.purchase_date || this.getCurrentDate(),
            acquisition_cost: Number(g.acquisition_cost) || 0,
            allocated_costs: Number(g.allocated_costs) || 0,
            total_cost_basis: Number(g.total_cost_basis) || Number(g.acquisition_cost) || 0,
            status: g.status || 'Active',
            health_status: g.health_status || 'Healthy',
            notes: g.notes || ''
          });
          if (res?.id) g.id = res.id;
        } catch(e) {}
      }

      this._saveCache();
    } catch(e) {
      console.warn('syncLocalGoatDataToCloud error:', e.message);
    } finally {
      this._syncingGoats = false;
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

      // Hydrate goat data from cache
      if (snap.goatSuppliers) this.data.goatSuppliers = snap.goatSuppliers;
      if (snap.goatCustomers) this.data.goatCustomers = snap.goatCustomers;
      if (snap.goatPurchases) this.data.goatPurchases = snap.goatPurchases;
      if (snap.goatGroups) this.data.goatGroups = snap.goatGroups;
      if (snap.goats) this.data.goats = snap.goats;
      if (snap.goatSales) this.data.goatSales = snap.goatSales;
      if (snap.goatExpenses) this.data.goatExpenses = snap.goatExpenses;
      if (snap.goatWeightRecords) this.data.goatWeightRecords = snap.goatWeightRecords;
      if (snap.goatHealthRecords) this.data.goatHealthRecords = snap.goatHealthRecords;
      if (snap.goatSupplierPayments) this.data.goatSupplierPayments = snap.goatSupplierPayments;
      if (snap.goatCustomerPayments) this.data.goatCustomerPayments = snap.goatCustomerPayments;

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

    // Always refresh without delay for live sync
    this.loadAll().then(() => this.notify()).catch(console.warn);
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
  getRole() {
    const raw = String(this.data.settings?.activeRole || 'Staff').trim().toLowerCase();
    if (raw === 'owner') return 'Owner';
    if (raw === 'accountant') return 'Accountant';
    return 'Staff';
  }
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

  async resetGoatData(options = {}) {
    if (!this.canDelete()) {
      throw new Error('Access denied. Only the Owner can reset system data.');
    }

    const sel = {
      goats: true,
      purchases: true,
      sales: true,
      expenses: true,
      contacts: true,
      sequences: true,
      ...options
    };

    if (sel.contacts) {
      sel.sales = true;
      sel.purchases = true;
    }

    const del = async (table) => {
      try {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) console.warn(`Reset delete ${table}:`, error.message);
      } catch(e) { console.warn(`Reset delete ${table} threw:`, e.message); }
    };

    // 1. Try SQL RPC first
    let rpcOk = false;
    try {
      const res = await goatResetService.resetGoatData(sel);
      if (res?.success) rpcOk = true;
    } catch(e) {
      console.warn('reset_goat_data RPC failed, running direct deletes:', e.message);
    }

    if (!rpcOk) {
      // Fallback: direct table deletes in FK order
      if (sel.sales) {
        await del('goat_customer_payments');
        await del('goat_sale_items');
        await del('goat_sales');
      }
      if (sel.expenses) {
        await del('goat_expenses');
      }
      if (sel.goats) {
        await del('goat_health_records');
        await del('goat_weight_records');
        await del('goats');
        await del('goat_groups');
      }
      if (sel.purchases) {
        await del('goat_supplier_payments');
        await del('goat_purchases');
      }
      if (sel.contacts) {
        await del('goat_customers');
        await del('goat_suppliers');
      }
    }

    // 2. Clear cache
    this._clearCache();

    // 3. Clear in-memory goat state for selected categories
    if (sel.goats) {
      this.data.goats = [];
      this.data.goatGroups = [];
      this.data.goatHealthRecords = [];
      this.data.goatWeightRecords = [];
    }
    if (sel.purchases) {
      this.data.goatPurchases = [];
      this.data.goatSupplierPayments = [];
    }
    if (sel.sales) {
      this.data.goatSales = [];
      this.data.goatCustomerPayments = [];
    }
    if (sel.expenses) {
      this.data.goatExpenses = [];
    }
    if (sel.contacts) {
      this.data.goatSuppliers = [];
      this.data.goatCustomers = [];
    }

    // 4. Notify immediately
    this.notify();

    // 5. Reload from Supabase
    try { await this.loadAll(); } catch(e) { console.warn('Post-goat-reset reload:', e.message); }

    this.notify();
    return true;
  }


  // ─────────────────────────────────────────────────────────────────
  // GOAT FARMING & TRADING METHODS (Strictly Isolated Business Logic)
  // ─────────────────────────────────────────────────────────────────

  getGoatDashboardMetrics(month) {
    const curMonth = month || this.getCurrentDate().slice(0, 7);
    const goats = this.data.goats || [];
    const groups = this.data.goatGroups || [];
    const purchases = this.data.goatPurchases || [];
    const sales = this.data.goatSales || [];
    const expenses = this.data.goatExpenses || [];

    // 1 & 2: Active individual goats
    const activeGoats = goats.filter(g => g.status === 'Active' || g.status === 'Available for Sale');
    const indivGoatsCount = activeGoats.length;
    const indivValuation = activeGoats.reduce((sum, g) => sum + Number(g.total_cost_basis || g.totalCostBasis || g.acquisition_cost || 0), 0);

    // 3: Active groups
    const activeGroups = groups.filter(g => Number(g.current_quantity || g.currentQuantity || 0) > 0 && g.status !== 'Archived' && g.status !== 'Sold Out');
    const activeGroupsCount = activeGroups.length;
    const groupGoatsCount = activeGroups.reduce((sum, g) => sum + Number(g.current_quantity || g.currentQuantity || 0), 0);
    const groupValuation = activeGroups.reduce((sum, g) => sum + Number(g.total_cost_basis || g.totalCostBasis || 0), 0);

    const totalGoatsOwned = indivGoatsCount + groupGoatsCount;
    const herdInventoryValue = indivValuation + groupValuation;

    // 4: Purchases this month
    const purchasesMonth = purchases
      .filter(p => (p.purchase_date || p.purchaseDate || '').startsWith(curMonth))
      .reduce((sum, p) => sum + Number(p.total_acquisition_cost || p.totalCost || 0), 0);

    // 5: Sales this month & COGS
    const monthSales = sales.filter(s => (s.sale_date || s.saleDate || '').startsWith(curMonth));
    const salesMonth = monthSales.reduce((sum, s) => sum + Number(s.total_amount || s.totalAmount || 0), 0);
    const cogsMonth = monthSales.reduce((sum, s) => sum + Number(s.total_cogs || s.totalCogs || 0), 0);

    // 6: Expenses this month
    const expensesMonth = expenses
      .filter(e => (e.expense_date || e.expenseDate || '').startsWith(curMonth))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // 7: Customer receivables
    const customerReceivables = sales.reduce((sum, s) => sum + Math.max(0, Number(s.balance_pending || s.balancePending || 0)), 0);

    // 8: Supplier payables
    const supplierPayables = purchases.reduce((sum, p) => sum + Math.max(0, Number(p.balance_pending || p.balancePending || 0)), 0);

    // 9 & 10: Gross profit and Realized P&L
    const grossProfit = salesMonth - cogsMonth;
    const realizedProfitLoss = grossProfit - expensesMonth;

    return {
      total_goats_owned: totalGoatsOwned,
      individual_goats_count: indivGoatsCount,
      active_groups_count: activeGroupsCount,
      purchases_this_month: purchasesMonth,
      sales_this_month: salesMonth,
      expenses_this_month: expensesMonth,
      customer_receivables: customerReceivables,
      supplier_payables: supplierPayables,
      herd_inventory_value: herdInventoryValue,
      realized_profit_loss: realizedProfitLoss,
      cogs_this_month: cogsMonth,
      gross_profit_this_month: grossProfit
    };
  }

  async getGoatDashboardMetricsAsync(month) {
    try {
      const rpcData = await goatDashboardService.getMetrics(month);
      if (rpcData && typeof rpcData === 'object') return rpcData;
    } catch(e) {}
    return this.getGoatDashboardMetrics(month);
  }

  async addGoatPurchase(purchaseInput) {
    const isGroup = purchaseInput.purchase_method === 'group';
    const qty = Number(purchaseInput.quantity) || 1;
    const pricePerGoat = Number(purchaseInput.price_per_goat) || 0;
    const baseAmount = Number(purchaseInput.base_amount) || (qty * pricePerGoat);
    const transport = Number(purchaseInput.transport_expense) || 0;
    const other = Number(purchaseInput.other_initial_costs) || 0;
    const totalCost = baseAmount + transport + other;
    const allocatedPerGoat = Math.round((totalCost / qty) * 100) / 100;
    const paid = Number(purchaseInput.amount_paid) || 0;
    const balance = totalCost - paid;

    const purDate = purchaseInput.purchase_date || this.getCurrentDate();
    const purchaseRef = purchaseInput.purchase_ref || `GOAT-PUR-${purDate.slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newPurchase = {
      id: purchaseInput.id || `gpur-${Date.now()}`,
      purchase_ref: purchaseRef,
      purchase_date: purDate,
      supplier_id: purchaseInput.supplier_id || `gsup-${Date.now()}`,
      supplier_name: purchaseInput.supplier_name || 'Direct Livestock Seller',
      purchase_method: purchaseInput.purchase_method || 'group',
      quantity: qty,
      price_per_goat: pricePerGoat,
      base_amount: baseAmount,
      initial_total_weight: Number(purchaseInput.initial_total_weight) || 0,
      transport_expense: transport,
      other_initial_costs: other,
      total_acquisition_cost: totalCost,
      allocated_cost_per_goat: allocatedPerGoat,
      amount_paid: paid,
      balance_pending: balance,
      payment_due_date: purchaseInput.payment_due_date || null,
      notes: purchaseInput.notes || '',
      attachment_url: purchaseInput.attachment_url || '',
      created_at: new Date().toISOString()
    };

    // Try Supabase save
    try {
      const res = await goatPurchasesService.savePurchase({
        ...newPurchase,
        supplier_id: purchaseInput.supplier_id || null,
        supplier_name: purchaseInput.supplier_name,
        supplier_phone: purchaseInput.supplier_phone || '',
        supplier_city: purchaseInput.supplier_city || '',
        goats: purchaseInput.goats
      });
      if (res?.purchase_id) newPurchase.id = res.purchase_id;
      if (res?.purchase_ref) newPurchase.purchase_ref = res.purchase_ref;
      if (res?.supplier_id) newPurchase.supplier_id = res.supplier_id;
    } catch(e) {
      console.warn('addGoatPurchase RPC fallback:', e.message);
    }

    // Add purchase to local store
    this.data.goatPurchases.unshift(newPurchase);

    // Create inventory records
    if (isGroup) {
      const groupCode = purchaseInput.group_code || `GRP-${purDate.slice(0, 4)}-${Math.floor(100 + Math.random() * 900)}`;
      const groupName = purchaseInput.group_name || `Batch ${groupCode}`;
      const newGroup = {
        id: `ggrp-${Date.now()}`,
        group_code: groupCode,
        group_name: groupName,
        purchase_id: newPurchase.id,
        supplier_id: newPurchase.supplier_id,
        supplier_name: newPurchase.supplier_name,
        purchase_date: purDate,
        initial_quantity: qty,
        current_quantity: qty,
        total_cost_basis: totalCost,
        unit_cost_basis: allocatedPerGoat,
        initial_total_weight: Number(purchaseInput.initial_total_weight) || 0,
        current_total_weight: Number(purchaseInput.initial_total_weight) || 0,
        breed: purchaseInput.breed || 'Mixed/Local',
        status: 'Active',
        notes: purchaseInput.notes || '',
        created_at: new Date().toISOString()
      };
      this.data.goatGroups.unshift(newGroup);
    } else {
      // Individual registration
      const goatsArr = Array.isArray(purchaseInput.goats) && purchaseInput.goats.length > 0
        ? purchaseInput.goats
        : Array.from({ length: qty }).map((_, i) => ({
            tag_id: `GT-${Math.floor(100 + Math.random() * 900)}`,
            breed: purchaseInput.breed || 'Boer',
            sex: 'Male',
            initial_weight: Math.round((Number(purchaseInput.initial_total_weight) || 20 * qty) / qty),
            acquisition_cost: allocatedPerGoat
          }));

      goatsArr.forEach(g => {
        const costBasis = Number(g.acquisition_cost) || allocatedPerGoat;
        const newGoat = {
          id: `gt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          tag_id: g.tag_id || `GT-${Math.floor(100 + Math.random() * 900)}`,
          name: g.name || '',
          purchase_id: newPurchase.id,
          supplier_id: newPurchase.supplier_id,
          supplier_name: newPurchase.supplier_name,
          purchase_date: purDate,
          breed: g.breed || 'Boer',
          sex: g.sex || 'Male',
          age_months: Number(g.age_months) || 12,
          initial_weight: Number(g.initial_weight) || 0,
          latest_weight: Number(g.initial_weight) || 0,
          last_weight_date: purDate,
          acquisition_cost: costBasis,
          allocated_costs: 0,
          total_cost_basis: costBasis,
          status: 'Active',
          health_status: 'Healthy',
          notes: g.notes || '',
          created_at: new Date().toISOString()
        };
        this.data.goats.unshift(newGoat);
      });
    }

    // Update or add supplier record
    let sup = this.data.goatSuppliers.find(s => s.id === newPurchase.supplier_id || s.name === newPurchase.supplier_name);
    if (!sup) {
      sup = {
        id: newPurchase.supplier_id,
        name: newPurchase.supplier_name,
        phone: purchaseInput.supplier_phone || '',
        city: purchaseInput.supplier_city || 'Local',
        totalPurchased: 0,
        totalPaid: 0,
        balancePending: 0
      };
      this.data.goatSuppliers.push(sup);
    }
    sup.totalPurchased = (Number(sup.totalPurchased) || 0) + totalCost;
    sup.totalPaid = (Number(sup.totalPaid) || 0) + paid;
    sup.balancePending = (Number(sup.balancePending) || 0) + balance;

    this._saveCache();
    this.notify();
    return newPurchase;
  }

  async addGoatSupplierPayment(purchaseId, paymentInput) {
    const pur = this.data.goatPurchases.find(p => p.id === purchaseId || p.purchase_ref === purchaseId);
    if (!pur) throw new Error('Purchase record not found');

    const amount = Number(paymentInput.amount) || 0;
    if (amount <= 0) throw new Error('Payment amount must be greater than zero');

    const payment = {
      id: `gsp-${Date.now()}`,
      purchase_id: pur.id,
      payment_date: paymentInput.payment_date || this.getCurrentDate(),
      amount: amount,
      payment_method: paymentInput.payment_method || 'Cash',
      reference_no: paymentInput.reference_no || '',
      notes: paymentInput.notes || '',
      created_at: new Date().toISOString()
    };

    try {
      await goatPurchasesService.addPayment(payment);
    } catch(e) {
      console.warn('addGoatSupplierPayment RPC fallback:', e.message);
    }

    pur.amount_paid = (Number(pur.amount_paid) || 0) + amount;
    pur.balance_pending = Math.max(0, (Number(pur.balance_pending) || 0) - amount);

    // Update supplier balance
    const sup = this.data.goatSuppliers.find(s => s.id === pur.supplier_id || s.name === pur.supplier_name);
    if (sup) {
      sup.totalPaid = (Number(sup.totalPaid) || 0) + amount;
      sup.balancePending = Math.max(0, (Number(sup.balancePending) || 0) - amount);
    }

    this.data.goatSupplierPayments = this.data.goatSupplierPayments || [];
    this.data.goatSupplierPayments.unshift(payment);

    this._saveCache();
    this.notify();
    return payment;
  }

  async addGoatSale(saleInput) {
    const saleDate = saleInput.sale_date || this.getCurrentDate();
    const invoiceNo = saleInput.invoice_no || `GOAT-SAL-${saleDate.slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const method = saleInput.pricing_method || 'per_goat';
    const items = saleInput.items || [];
    const discount = Number(saleInput.discount) || 0;
    const paid = Number(saleInput.amount_paid) || 0;

    let totalQty = 0;
    let totalWeight = 0;
    let subtotal = 0;
    let totalCogs = 0;

    // Validate items and compute totals
    items.forEach(it => {
      const itQty = Number(it.quantity) || 1;
      const itWeight = Number(it.weight_kg) || 0;
      const itRate = Number(it.rate) || 0;
      const itTotal = method === 'per_goat' ? (itQty * itRate) : (itWeight * itRate);

      totalQty += itQty;
      totalWeight += itWeight;
      subtotal += itTotal;

      if (it.item_type === 'individual') {
        const goat = this.data.goats.find(g => g.id === it.goat_id || g.tag_id === it.goat_id);
        if (!goat) throw new Error(`Goat ${it.goat_id} not found`);
        if (goat.status === 'Sold') throw new Error(`Goat ${goat.tag_id} is already sold`);
        if (goat.status === 'Deceased') throw new Error(`Goat ${goat.tag_id} is deceased and cannot be sold`);
        const costBasis = Number(goat.total_cost_basis || goat.acquisition_cost || 0);
        it.cost_basis = costBasis;
        totalCogs += costBasis;
      } else {
        const group = this.data.goatGroups.find(g => g.id === it.group_id || g.group_code === it.group_id);
        if (!group) throw new Error(`Goat group ${it.group_id} not found`);
        const currQty = Number(group.current_quantity || 0);
        if (currQty < itQty) throw new Error(`Insufficient inventory in group ${group.group_code}. Available: ${currQty}, requested: ${itQty}`);
        const unitCost = Number(group.unit_cost_basis || 0);
        const costBasis = itQty * unitCost;
        it.cost_basis = costBasis;
        totalCogs += costBasis;
      }
    });

    const totalAmount = Math.max(0, subtotal - discount);
    const balance = totalAmount - paid;
    const grossProfit = totalAmount - totalCogs;

    const newSale = {
      id: saleInput.id || `gsal-${Date.now()}`,
      invoice_no: invoiceNo,
      sale_date: saleDate,
      customer_id: saleInput.customer_id || `gcust-${Date.now()}`,
      customer_name: saleInput.customer_name || 'Direct Livestock Buyer',
      pricing_method: method,
      total_quantity: totalQty,
      total_weight_kg: totalWeight,
      subtotal: subtotal,
      discount: discount,
      total_amount: totalAmount,
      amount_paid: paid,
      balance_pending: balance,
      total_cogs: totalCogs,
      gross_profit: grossProfit,
      payment_due_date: saleInput.payment_due_date || null,
      notes: saleInput.notes || '',
      attachment_url: saleInput.attachment_url || '',
      items: items,
      created_at: new Date().toISOString()
    };

    // Try Supabase RPC
    try {
      const res = await goatSalesService.saveSale(newSale);
      if (res?.sale_id) newSale.id = res.sale_id;
      if (res?.invoice_no) newSale.invoice_no = res.invoice_no;
    } catch(e) {
      console.warn('addGoatSale RPC fallback:', e.message);
    }

    // Apply inventory deductions
    items.forEach(it => {
      if (it.item_type === 'individual') {
        const goat = this.data.goats.find(g => g.id === it.goat_id || g.tag_id === it.goat_id);
        if (goat) {
          goat.status = 'Sold';
          goat.sale_id = newSale.id;
          goat.sale_date = saleDate;
        }
      } else {
        const group = this.data.goatGroups.find(g => g.id === it.group_id || g.group_code === it.group_id);
        if (group) {
          const qtySold = Number(it.quantity) || 1;
          group.current_quantity = Math.max(0, Number(group.current_quantity || 0) - qtySold);
          group.total_cost_basis = Math.max(0, Number(group.total_cost_basis || 0) - (qtySold * Number(group.unit_cost_basis || 0)));
          if (group.current_quantity <= 0) {
            group.status = 'Sold Out';
          } else {
            group.status = 'Partially Sold';
          }
        }
      }
    });

    this.data.goatSales.unshift(newSale);

    // Update customer balances
    let cust = this.data.goatCustomers.find(c => c.id === newSale.customer_id || c.name === newSale.customer_name);
    if (!cust) {
      cust = {
        id: newSale.customer_id,
        name: newSale.customer_name,
        phone: saleInput.customer_phone || '',
        address: saleInput.customer_address || '',
        totalPurchased: 0,
        totalPaid: 0,
        balancePending: 0
      };
      this.data.goatCustomers.push(cust);
    }
    cust.totalPurchased = (Number(cust.totalPurchased) || 0) + totalAmount;
    cust.totalPaid = (Number(cust.totalPaid) || 0) + paid;
    cust.balancePending = (Number(cust.balancePending) || 0) + balance;

    this._saveCache();
    this.notify();
    return newSale;
  }

  async addGoatCustomerPayment(saleId, paymentInput) {
    const sale = this.data.goatSales.find(s => s.id === saleId || s.invoice_no === saleId);
    if (!sale) throw new Error('Sale invoice not found');

    const amount = Number(paymentInput.amount) || 0;
    if (amount <= 0) throw new Error('Payment amount must be greater than zero');

    const payment = {
      id: `gcp-${Date.now()}`,
      sale_id: sale.id,
      payment_date: paymentInput.payment_date || this.getCurrentDate(),
      amount: amount,
      payment_method: paymentInput.payment_method || 'Cash',
      reference_no: paymentInput.reference_no || '',
      notes: paymentInput.notes || '',
      created_at: new Date().toISOString()
    };

    try {
      await goatSalesService.addPayment(payment);
    } catch(e) {
      console.warn('addGoatCustomerPayment RPC fallback:', e.message);
    }

    sale.amount_paid = (Number(sale.amount_paid) || 0) + amount;
    sale.balance_pending = Math.max(0, (Number(sale.balance_pending) || 0) - amount);

    // Update customer balance
    const cust = this.data.goatCustomers.find(c => c.id === sale.customer_id || c.name === sale.customer_name);
    if (cust) {
      cust.totalPaid = (Number(cust.totalPaid) || 0) + amount;
      cust.balancePending = Math.max(0, (Number(cust.balancePending) || 0) - amount);
    }

    this.data.goatCustomerPayments = this.data.goatCustomerPayments || [];
    this.data.goatCustomerPayments.unshift(payment);

    this._saveCache();
    this.notify();
    return payment;
  }

  async addGoatExpense(expenseInput) {
    const expDate = expenseInput.expense_date || this.getCurrentDate();
    const expRef = expenseInput.expense_ref || `GOAT-EXP-${expDate.slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const amount = Number(expenseInput.amount) || 0;
    if (amount <= 0) throw new Error('Expense amount must be greater than zero');

    const newExpense = {
      id: expenseInput.id || `gexp-${Date.now()}`,
      expense_ref: expRef,
      expense_date: expDate,
      category: expenseInput.category || 'Feed',
      amount: amount,
      paid_to: expenseInput.paid_to || 'General Vendor',
      payment_mode: expenseInput.payment_mode || 'Cash',
      description: expenseInput.description || '',
      related_goat_id: expenseInput.related_goat_id || null,
      related_group_id: expenseInput.related_group_id || null,
      attachment_url: expenseInput.attachment_url || '',
      notes: expenseInput.notes || '',
      created_at: new Date().toISOString()
    };

    try {
      const res = await goatExpensesService.create(newExpense);
      if (res?.id) newExpense.id = res.id;
      if (res?.expense_ref) newExpense.expense_ref = res.expense_ref;
    } catch(e) {
      console.warn('addGoatExpense RPC fallback:', e.message);
    }

    this.data.goatExpenses.unshift(newExpense);
    this._saveCache();
    this.notify();
    return newExpense;
  }

  async recordGoatWeight(weightInput) {
    const goat = this.data.goats.find(g => g.id === weightInput.goat_id || g.tag_id === weightInput.goat_id);
    const weight = Number(weightInput.weight_kg) || 0;
    if (weight <= 0) throw new Error('Weight must be greater than zero');

    const recordDate = weightInput.record_date || this.getCurrentDate();
    let weightGain = 0;

    if (goat) {
      const prevWeight = Number(goat.latest_weight || goat.initial_weight || 0);
      if (prevWeight > 0) weightGain = Math.round((weight - prevWeight) * 100) / 100;
      goat.latest_weight = weight;
      goat.last_weight_date = recordDate;
    }

    const newRecord = {
      id: `gwt-${Date.now()}`,
      goat_id: goat?.id || weightInput.goat_id,
      group_id: weightInput.group_id || null,
      record_date: recordDate,
      weight_kg: weight,
      weight_gain: weightGain,
      notes: weightInput.notes || '',
      created_at: new Date().toISOString()
    };

    try {
      await goatsService.recordWeight(newRecord);
    } catch(e) {
      console.warn('recordGoatWeight RPC fallback:', e.message);
    }

    this.data.goatWeightRecords = this.data.goatWeightRecords || [];
    this.data.goatWeightRecords.unshift(newRecord);

    this._saveCache();
    this.notify();
    return newRecord;
  }

  async recordGoatHealth(healthInput) {
    const goat = this.data.goats.find(g => g.id === healthInput.goat_id || g.tag_id === healthInput.goat_id);
    const newRecord = {
      id: `ghl-${Date.now()}`,
      goat_id: goat?.id || healthInput.goat_id,
      group_id: healthInput.group_id || null,
      record_date: healthInput.record_date || this.getCurrentDate(),
      record_type: healthInput.record_type || 'Vaccination',
      title_or_vaccine: healthInput.title_or_vaccine || 'General Vaccine',
      dosage: healthInput.dosage || '',
      administered_by: healthInput.administered_by || '',
      next_scheduled_date: healthInput.next_scheduled_date || null,
      cost: Number(healthInput.cost) || 0,
      notes: healthInput.notes || '',
      created_at: new Date().toISOString()
    };

    if (goat) {
      if (newRecord.record_type === 'Vaccination') goat.health_status = 'Vaccinated';
      else if (newRecord.record_type === 'Treatment') goat.health_status = 'Under Treatment';
    }

    try {
      await goatsService.recordHealth(newRecord);
    } catch(e) {
      console.warn('recordGoatHealth RPC fallback:', e.message);
    }

    this.data.goatHealthRecords = this.data.goatHealthRecords || [];
    this.data.goatHealthRecords.unshift(newRecord);

    this._saveCache();
    this.notify();
    return newRecord;
  }

  async markGoatDeceased(deceasedInput) {
    const goat = this.data.goats.find(g => g.id === deceasedInput.goat_id || g.tag_id === deceasedInput.goat_id);
    if (!goat) throw new Error('Goat not found');

    goat.status = 'Deceased';
    goat.health_status = 'Deceased';
    goat.deceased_date = deceasedInput.deceased_date || this.getCurrentDate();
    goat.deceased_reason = deceasedInput.deceased_reason || 'Natural/Illness';

    try {
      await goatsService.markDeceased({
        goat_id: goat.id,
        deceased_date: goat.deceased_date,
        deceased_reason: goat.deceased_reason
      });
    } catch(e) {
      console.warn('markGoatDeceased RPC fallback:', e.message);
    }

    this._saveCache();
    this.notify();
    return goat;
  }

  async convertGoatGroup(convertInput) {
    const group = this.data.goatGroups.find(g => g.id === convertInput.group_id || g.group_code === convertInput.group_id);
    if (!group) throw new Error('Group not found');

    const count = Number(convertInput.count) || 1;
    const currQty = Number(group.current_quantity || 0);
    if (currQty < count) throw new Error(`Cannot convert ${count} goats; group only has ${currQty} available`);

    const unitCost = Number(group.unit_cost_basis || 0);
    const goatsList = Array.isArray(convertInput.goats) && convertInput.goats.length > 0
      ? convertInput.goats
      : Array.from({ length: count }).map((_, i) => ({
          tag_id: `GT-${Math.floor(100 + Math.random() * 900)}`,
          breed: group.breed || 'Mixed/Local',
          sex: 'Male',
          initial_weight: Math.round((Number(group.current_total_weight || 0) / currQty) * 10) / 10 || 22
        }));

    goatsList.forEach(g => {
      const newGoat = {
        id: `gt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tag_id: g.tag_id || `GT-${Math.floor(100 + Math.random() * 900)}`,
        name: g.name || '',
        group_id: group.id,
        group_code: group.group_code,
        purchase_id: group.purchase_id,
        supplier_id: group.supplier_id,
        supplier_name: group.supplier_name,
        purchase_date: group.purchase_date,
        breed: g.breed || group.breed || 'Mixed/Local',
        sex: g.sex || 'Male',
        age_months: Number(g.age_months) || 10,
        initial_weight: Number(g.initial_weight) || 0,
        latest_weight: Number(g.initial_weight) || 0,
        last_weight_date: this.getCurrentDate(),
        acquisition_cost: unitCost,
        allocated_costs: 0,
        total_cost_basis: unitCost,
        status: 'Active',
        health_status: 'Healthy',
        notes: `Converted from group ${group.group_code}. ${g.notes || ''}`.trim(),
        created_at: new Date().toISOString()
      };
      this.data.goats.unshift(newGoat);
    });

    group.current_quantity = currQty - count;
    group.total_cost_basis = Math.max(0, Number(group.total_cost_basis || 0) - (count * unitCost));
    if (group.current_quantity <= 0) {
      group.status = 'Archived';
    }

    try {
      await goatGroupsService.convertToIndividual({
        group_id: group.id,
        count: count,
        goats: goatsList
      });
    } catch(e) {
      console.warn('convertGoatGroup RPC fallback:', e.message);
    }

    this._saveCache();
    this.notify();
    return { success: true, count };
  }

  async deleteGoatRecord(entityType, id) {
    if (!this.canDelete()) throw new Error('Staff users cannot delete records');

    if (entityType === 'purchase') {
      const pur = (this.data.goatPurchases || []).find(p => p.id === id || p.purchase_ref === id);
      const actualId = pur?.id || id;
      if (pur) {
        // Remove individual goats linked to this purchase
        this.data.goats = (this.data.goats || []).filter(g => g.purchase_id !== actualId && g.purchase_id !== pur.purchase_ref);
        // Remove batches linked to this purchase
        this.data.goatGroups = (this.data.goatGroups || []).filter(g => g.purchase_id !== actualId && g.purchase_id !== pur.purchase_ref);
        // Adjust supplier balances
        const sup = (this.data.goatSuppliers || []).find(s => s.id === pur.supplier_id || s.name === pur.supplier_name);
        if (sup) {
          sup.totalPurchased = Math.max(0, (Number(sup.totalPurchased) || 0) - (Number(pur.total_acquisition_cost) || 0));
          sup.totalPaid = Math.max(0, (Number(sup.totalPaid) || 0) - (Number(pur.amount_paid) || 0));
          sup.balancePending = Math.max(0, (Number(sup.balancePending) || 0) - (Number(pur.balance_pending) || 0));
        }
      }
      this.data.goatPurchases = (this.data.goatPurchases || []).filter(p => p.id !== actualId && p.purchase_ref !== id);
      try { await goatPurchasesService.delete(actualId); } catch(e) {}
    } else if (entityType === 'sale') {
      const sale = (this.data.goatSales || []).find(s => s.id === id || s.invoice_no === id);
      const actualId = sale?.id || id;
      if (sale) {
        // Revert any sold goats or deducted groups back to inventory
        if (Array.isArray(sale.items)) {
          sale.items.forEach(it => {
            if (it.item_type === 'individual') {
              const goat = (this.data.goats || []).find(g => g.id === it.goat_id || g.tag_id === it.goat_id);
              if (goat) {
                goat.status = 'Active';
                delete goat.sale_id;
                delete goat.sale_date;
              }
            } else {
              const group = (this.data.goatGroups || []).find(g => g.id === it.group_id || g.group_code === it.group_id);
              if (group) {
                const qtySold = Number(it.quantity) || 0;
                group.current_quantity = (Number(group.current_quantity) || 0) + qtySold;
                group.total_cost_basis = (Number(group.total_cost_basis) || 0) + (qtySold * Number(group.unit_cost_basis || 0));
                group.status = group.current_quantity > 0 ? 'Active' : 'Sold Out';
              }
            }
          });
        }
        // Adjust customer balances
        const cust = (this.data.goatCustomers || []).find(c => c.id === sale.customer_id || c.name === sale.customer_name);
        if (cust) {
          cust.totalPurchased = Math.max(0, (Number(cust.totalPurchased) || 0) - (Number(sale.total_amount) || 0));
          cust.totalPaid = Math.max(0, (Number(cust.totalPaid) || 0) - (Number(sale.amount_paid) || 0));
          cust.balancePending = Math.max(0, (Number(cust.balancePending) || 0) - (Number(sale.balance_pending) || 0));
        }
      }
      this.data.goatSales = (this.data.goatSales || []).filter(s => s.id !== actualId && s.invoice_no !== id);
      try { await goatSalesService.delete(actualId); } catch(e) {}
    } else if (entityType === 'expense') {
      this.data.goatExpenses = (this.data.goatExpenses || []).filter(e => e.id !== id && e.expense_ref !== id);
      try { await goatExpensesService.delete(id); } catch(e) {}
    } else if (entityType === 'goat') {
      this.data.goats = (this.data.goats || []).filter(g => g.id !== id && g.tag_id !== id);
      try { await goatsService.delete(id); } catch(e) {}
    } else if (entityType === 'group') {
      this.data.goatGroups = (this.data.goatGroups || []).filter(g => g.id !== id && g.group_code !== id);
      try { await goatGroupsService.delete(id); } catch(e) {}
    } else if (entityType === 'supplier') {
      this.data.goatSuppliers = (this.data.goatSuppliers || []).filter(s => s.id !== id && s.name !== id);
      try { await goatSuppliersService.delete(id); } catch(e) {}
    } else if (entityType === 'customer') {
      this.data.goatCustomers = (this.data.goatCustomers || []).filter(c => c.id !== id && c.name !== id);
      try { await goatCustomersService.delete(id); } catch(e) {}
    }

    this._saveCache();
    this.notify();
    return { success: true };
  }

  runFermentationDailyCheck() {
    return this.checkFermentationStatus();
  }
}

export const store = new Store();
export default store;

