// src/store.js — Supabase-backed store with Demo Mode fallback
// Preserves the same public API that app.js uses

import { supabase } from './lib/supabase.js';
import { INITIAL_DATA } from './data.js';
import {
  settingsService, dashboardService, suppliersService, purchasesService,
  plotsService, batchesService, customersService, salesService,
  expensesService, reportsService, profilesService, attachmentsService
} from './services/data.service.js';

class Store {
  constructor() {
    this.listeners = new Set();
    // In-memory cache
    this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
    this.currentUser = null;
    this.currentProfile = null;
    this._loading = false;
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
      const role = this.getRole();
      const isFinance = this.canViewFinancials();

      // Always load
      const [plots, batches, settingsData] = await Promise.all([
        plotsService.getAllWithInventory().catch(() => []),
        batchesService.getAll().catch(() => []),
        settingsService.get().catch(() => null)
      ]);

      // If Supabase returns empty, show empty state — do NOT load seed/demo data
      if (!plots || plots.length === 0) {
        console.info('No plots found in Supabase — starting with empty state.');
        this.data.plots = [];
      }
      if (!batches || batches.length === 0) {
        this.data.batches = [];
      }

      this.data.plots = plots;
      this.data.batches = batches;

      // Reconcile plots with active batches if plot_inventory in DB was unassigned/empty
      if (this.data.plots && this.data.batches) {
        this.data.batches.forEach(b => {
          const bStatus = b.status || 'Fermenting';
          if (bStatus === 'Fermenting' || bStatus === 'Ready') {
            const plotName = b.plot_name || b.plotAssigned || b.plots?.plot_name;
            const p = this.data.plots.find(pt => (pt.plot_name === plotName || pt.id === b.plot_id || pt.id === plotName));
            if (p) {
              if (p.status === 'Empty' || !p.bales) {
                p.bales = Number(b.finished_bales || b.finishedBales) || 0;
                p.status = bStatus;
                p.batchNumber = b.batch_number || b.batchNumber || '';
                p.batchId = b.id;
                p.fermStart = b.fermentation_start || b.fermentationStart || null;
                p.readyDate = b.ready_date || b.readyDate || null;
                p.costPerBale = Number(b.cost_per_bale || b.costPerBale) || 0;
                p.prodDate = b.production_date || b.productionDate || null;
              } else if (bStatus === 'Ready' && p.status === 'Fermenting') {
                p.status = 'Ready';
              }
            }
          }
        });
      }

      // Restore active 1-minute countdowns from localStorage
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

      // Finance-only data
      if (isFinance) {
        const [suppliers, customers, purchases, sales, expenses] = await Promise.all([
          suppliersService.getWithBalance().catch(() => []),
          customersService.getWithBalance().catch(() => []),
          purchasesService.getAll().catch(() => []),
          salesService.getAll().catch(() => []),
          expensesService.getAll().catch(() => [])
        ]);
        this.data.suppliers = suppliers;
        this.data.customers = customers;
        this.data.purchases = purchases;
        this.data.sales = sales;
        this.data.expenses = expenses;

        if (purchases.length === 0) {
          try {
            supabase.from('raw_materials').update({ stock_kg: 0 }).neq('stock_kg', 0).then(() => {}).catch(() => {});
          } catch(e) {}
        }
      }
    } catch(e) {
      console.warn('Load error, using seed template:', e);
      const backup = JSON.parse(JSON.stringify(INITIAL_DATA));
      this.data.plots = backup.plots;
      this.data.batches = backup.batches;
      this.data.suppliers = backup.suppliers;
      this.data.customers = backup.customers;
      this.data.purchases = backup.purchases;
      this.data.sales = backup.sales;
      this.data.expenses = backup.expenses;
    } finally {
      this._loading = false;
      this.notify();
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

  // ─── Dashboard Metrics (from Supabase RPC) ───────────────────────
  async getDashboardMetricsAsync(month) {
    try {
      const [metrics, batchesSoon, payments] = await Promise.all([
        dashboardService.getMetrics(month),
        dashboardService.getBatchesReadySoon(this.getCurrentDate(), this.data.settings.fermentationDays),
        dashboardService.getUpcomingPayments()
      ]);

      // Calculate live plot counts from store plots to avoid stale RPC race conditions
      const plotsReady = (this.data.plots || []).filter(p => p.status === 'Ready').reduce((s,p) => s + (Number(p.bales)||0), 0);
      const plotsFerm = (this.data.plots || []).filter(p => p.status === 'Fermenting').reduce((s,p) => s + (Number(p.bales)||0), 0);

      // Calculate real raw material stock: if no purchases exist, raw material stock is 0
      let realRawKg = 0;
      if (this.data.purchases && this.data.purchases.length > 0) {
        const totalPurchasedKg = this.data.purchases.reduce((sum, p) => {
          const qty = Number(p.quantity) || 0;
          const conv = Number(p.kg_conversion) || (p.unit === 'ton' ? 1000 : p.unit === 'load' ? 5000 : p.unit === 'bale' ? 28 : 1);
          return sum + (Number(p.quantity_kg) || (qty * conv));
        }, 0);
        const totalConsumedKg = (this.data.batches || []).reduce((sum, b) => sum + (Number(b.raw_material_kg || b.rawMaterialKg) || 0), 0);
        realRawKg = Math.max(0, totalPurchasedKg - totalConsumedKg);
      } else {
        realRawKg = 0;
      }

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

      return {
        role: this.getRole(),
        readyBales: plotsReady > 0 ? plotsReady : (metrics?.ready_bales || 0),
        fermentingBales: plotsFerm === 0 ? 0 : (metrics?.fermenting_bales || plotsFerm),
        customerDues: metrics?.customer_dues || 0,
        supplierDues: metrics?.supplier_dues || 0,
        monthSales: metrics?.month_sales || 0,
        monthCOGS: metrics?.month_cogs || 0,
        monthExpenses: metrics?.month_expenses || 0,
        grossProfit: metrics?.gross_profit || 0,
        netProfit: metrics?.net_profit || 0,
        rawMaterialKg: realRawKg,
        rawMaterialBalesEquiv: Math.round(realRawKg / 28),
        monthSoldBales: metrics?.month_sold_bales || 0,
        batchesReadySoon: filteredBatchesSoon,
        upcomingPayments: payments || []
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
    
    let realRawKg = 0;
    if (this.data.purchases && this.data.purchases.length > 0) {
      const totalPurchasedKg = this.data.purchases.reduce((sum, p) => {
        const qty = Number(p.quantity) || 0;
        const conv = Number(p.kg_conversion) || (p.unit === 'ton' ? 1000 : p.unit === 'load' ? 5000 : p.unit === 'bale' ? 28 : 1);
        return sum + (Number(p.quantity_kg) || (qty * conv));
      }, 0);
      const totalConsumedKg = (this.data.batches || []).reduce((sum, b) => sum + (Number(b.raw_material_kg || b.rawMaterialKg) || 0), 0);
      realRawKg = Math.max(0, totalPurchasedKg - totalConsumedKg);
    }
    const monthSoldBales = this.data.sales.filter(s => (s.invoice_date||s.date||'').startsWith(month)).reduce((s,r) => s + (Number(r.balesCount||r.bales_count)||0), 0);

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

    return { role: this.getRole(), readyBales, fermentingBales, customerDues, supplierDues, monthSales, monthCOGS, monthExpenses, grossProfit: monthSales - monthCOGS, netProfit: monthSales - monthCOGS - monthExpenses, rawMaterialKg: realRawKg, rawMaterialBalesEquiv: Math.round(realRawKg/28), monthSoldBales, batchesReadySoon, upcomingPayments: [] };
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

    try {
      const result = await purchasesService.savePurchase({
        supplier_name: purchaseData.supplierName,
        supplier_id: purchaseData.supplierId || null,
        material_name: purchaseData.material || 'Hay (loose)',
        purchase_date: purchaseData.date || this.getCurrentDate(),
        invoice_no: purchaseData.invoiceNo,
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
        invoiceNo: purchaseData.invoiceNo || 'PUR-' + Date.now(),
        material: purchaseData.material || 'Hay (loose)',
        quantity: qty,
        unit: purchaseData.unit || 'ton',
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

  resetAllData() {
    const role = this.getRole();
    this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
    this.data.settings.activeRole = role;
    this.notify();
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
    try {
      if (actualId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualId)) {
        await purchasesService.delete(actualId);
      }
    } catch(err) {
      console.warn('Backend delete purchase warning, removing locally:', err.message);
    }

    // Remove from in-memory purchases
    this.data.purchases = (this.data.purchases || []).filter(p => p.id !== actualId && (p.invoice_no || p.invoiceNo) !== (purchase.invoice_no || purchase.invoiceNo));

    // Try loading fresh state from DB
    try {
      await this.loadAll();
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
    const finalStatus = newStatus || (finalBales === 0 ? 'Empty' : plot.status);

    try {
      await plotsService.updateStock(plot.id, finalBales, finalStatus);
      await this.loadAll();
    } catch(err) {
      console.warn('Backend updateStock error, falling back locally:', err.message);
      plot.bales = finalBales;
      plot.status = finalStatus;
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
        balesCount: balesCount,
        ratePerBale: rate,
        subtotal: subtotal,
        gstRate: gstRate,
        gstAmount: gstAmount,
        invoiceTotal: invoiceTotal,
        cogsTotal: balesCount * 220,
        amountPaid: paid,
        balancePending: balance,
        paymentMode: saleData.paymentMode || 'Cash'
      };
      this.data.sales.unshift(newSale);
      this.notify();
      return newSale;
    }
  }

  async addSalePayment(saleId, paymentInput) {
    const amt = Number(paymentInput.amountPaid) || 0;
    try {
      const result = await salesService.addPayment({
        sale_id: saleId,
        amount: amt,
        payment_date: paymentInput.date ? paymentInput.date.split('-').reverse().join('-') : this.getCurrentDate(),
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

  resetAllData() {
    this.data.batches = [];
    this.data.purchases = [];
    this.data.sales = [];
    this.data.expenses = [];
    this.data.rawMaterial = { stockKg: 60000, averageCostPerKg: 4.80 };
    if (this.data.suppliers) {
      this.data.suppliers.forEach(s => { s.totalPurchased = 0; s.totalPaid = 0; s.balancePending = 0; });
    }
    if (this.data.customers) {
      this.data.customers.forEach(c => { c.totalPurchased = 0; c.totalPaid = 0; c.balancePending = 0; c.lastPurchaseDate = ''; });
    }
    this.data.plots.forEach(p => {
      p.bales = 0;
      p.status = 'Empty';
      p.batchId = null;
      p.batchNumber = '';
      p.prodDate = '';
      p.fermStart = '';
      p.fermUnit = null;
      p.fermDuration = null;
      p.fermEndTimestamp = null;
      p.costPerBale = 0;
    });
    this.notify();
  }

  runFermentationDailyCheck() {
    return this.checkFermentationStatus();
  }
}

export const store = new Store();
export default store;
