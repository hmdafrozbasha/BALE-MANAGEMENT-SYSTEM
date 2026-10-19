// src/services/data.service.js
// Complete data access layer — replaces localStorage store

import { supabase } from '../lib/supabase.js';

// ─────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────
export const settingsService = {
  async get() {
    const { data, error } = await supabase.from('app_settings').select('*').single();
    if (error) throw error;
    return data;
  },
  async update(fields) {
    const { data, error } = await supabase
      .from('app_settings')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

// ─────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────
export const dashboardService = {
  async getMetrics(month) {
    const { data, error } = await supabase.rpc('get_dashboard_metrics', { p_month: month });
    if (error) throw error;
    return data;
  },

  async getBatchesReadySoon(today, fermDays) {
    const { data, error } = await supabase
      .from('plot_inventory')
      .select(`
        plot_id,
        bales_remaining,
        ferm_start,
        ready_date,
        status,
        plots(plot_name, section),
        production_batches(batch_number)
      `)
      .eq('status', 'Fermenting')
      .not('ferm_start', 'is', null)
      .order('ready_date', { ascending: true })
      .limit(8);
    if (error) throw error;

    return (data || []).map(pi => {
      const fermStart = pi.ferm_start;
      const startDate = new Date(fermStart);
      const todayDate = new Date(today);
      const daysPassed = Math.max(0, Math.floor((todayDate - startDate) / (1000*60*60*24)));
      const daysLeft = Math.max(0, fermDays - daysPassed);
      return {
        plot: pi.plots?.plot_name || pi.plot_id,
        batch: pi.production_batches?.batch_number || '',
        bales: pi.bales_remaining,
        daysLeft,
        daysPassed,
        readyDate: pi.ready_date
      };
    });
  },

  async getUpcomingPayments() {
    const sales = await salesService.getAll();
    const purchases = await purchasesService.getAll();
    const list = [];

    (sales || []).forEach(s => {
      if (s.balance_pending > 0 && s.due_date) {
        const due = new Date(s.due_date);
        const today = new Date();
        const diffDays = Math.ceil((due - today) / (1000*60*60*24));
        list.push({
          who: s.customers?.name || 'Customer',
          type: 'Receive',
          amount: s.balance_pending,
          dueDate: s.due_date,
          diffDays,
          isOverdue: diffDays < 0,
          refId: s.id,
          entityType: 'sale'
        });
      }
    });

    (purchases || []).forEach(p => {
      if (p.balance_pending > 0 && p.payment_due_date) {
        const due = new Date(p.payment_due_date);
        const today = new Date();
        const diffDays = Math.ceil((due - today) / (1000*60*60*24));
        list.push({
          who: p.suppliers?.name || 'Supplier',
          type: 'Pay',
          amount: p.balance_pending,
          dueDate: p.payment_due_date,
          diffDays,
          isOverdue: diffDays < 0,
          refId: p.id,
          entityType: 'purchase'
        });
      }
    });

    return list.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }
};

// ─────────────────────────────────────────────────────────────────
// SUPPLIERS
// ─────────────────────────────────────────────────────────────────
export const suppliersService = {
  async getAll() {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async getWithBalance() {
    const suppliers = await this.getAll();
    const { data: purchases } = await supabase
      .from('purchases')
      .select('supplier_id, actual_cost, amount_paid, balance_pending');

    const map = {};
    (purchases || []).forEach(p => {
      if (!map[p.supplier_id]) map[p.supplier_id] = { totalPurchased: 0, totalPaid: 0, balancePending: 0 };
      map[p.supplier_id].totalPurchased += Number(p.actual_cost) || 0;
      map[p.supplier_id].totalPaid += Number(p.amount_paid) || 0;
      map[p.supplier_id].balancePending += Number(p.balance_pending) || 0;
    });

    return suppliers.map(s => ({
      ...s,
      totalPurchased: map[s.id]?.totalPurchased || 0,
      totalPaid: map[s.id]?.totalPaid || 0,
      balancePending: map[s.id]?.balancePending || 0
    }));
  },

  async create(data) {
    const { data: sup, error } = await supabase.from('suppliers').insert(data).select().single();
    if (error) throw error;
    return sup;
  },

  async update(id, data) {
    const { data: sup, error } = await supabase.from('suppliers').update(data).eq('id', id).select().single();
    if (error) throw error;
    return sup;
  },

  async delete(supplierId) {
    try {
      const { data, error } = await supabase.rpc('delete_supplier', { p_supplier_id: supplierId });
      if (!error && (data?.success || data === true)) return data;
      if (error) console.warn('delete_supplier RPC error, trying direct deletion:', error.message);
    } catch(e) {
      console.warn('delete_supplier RPC threw:', e.message);
    }

    // Direct delete fallback:
    // First try hard delete:
    const { error: hardErr } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', supplierId);

    // If hard delete failed (due to foreign key constraints with historical purchases), soft delete:
    if (hardErr) {
      const { error: softErr } = await supabase
        .from('suppliers')
        .update({ is_active: false })
        .eq('id', supplierId);
      if (softErr) throw softErr;
    }
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// PURCHASES
// ─────────────────────────────────────────────────────────────────
export const purchasesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('purchases')
      .select('*, suppliers(name, city, phone)')
      .order('purchase_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async savePurchase(purchaseData) {
    const { data, error } = await supabase.rpc('save_purchase', { p_data: purchaseData });
    if (error) throw error;
    return data;
  },

  async addPayment(paymentData) {
    const { data, error } = await supabase.rpc('add_purchase_payment', { p_data: paymentData });
    if (error) throw error;
    return data;
  },

  async getPayments(purchaseId) {
    const { data, error } = await supabase
      .from('purchase_payments')
      .select('*')
      .eq('purchase_id', purchaseId)
      .order('payment_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async delete(purchaseId) {
    try {
      const { data, error } = await supabase.rpc('delete_purchase', { p_purchase_id: purchaseId });
      if (!error && (data?.success || data === true)) return data;
      if (error) console.warn('delete_purchase RPC error, trying direct delete:', error.message);
    } catch (e) {
      console.warn('delete_purchase RPC threw:', e.message);
    }

    // Direct delete fallback: clean up dependencies first to avoid foreign key violations
    try { await supabase.from('purchase_payments').delete().eq('purchase_id', purchaseId); } catch(e) {}
    try { await supabase.from('attachments').delete().eq('entity_type', 'purchase').eq('entity_id', purchaseId); } catch(e) {}
    try { await supabase.from('inventory_movements').delete().eq('reference_id', purchaseId); } catch(e) {}

    const { error: delErr } = await supabase
      .from('purchases')
      .delete()
      .eq('id', purchaseId);
    if (delErr) throw delErr;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// SYSTEM / ADMIN
// ─────────────────────────────────────────────────────────────────
export const systemService = {
  async resetEverything() {
    // Try the SQL RPC first (runs as SECURITY DEFINER, bypasses RLS)
    try {
      const { data, error } = await supabase.rpc('reset_all_data');
      if (!error && (data?.success || data === true)) {
        console.log('reset_all_data RPC succeeded');
        return data;
      }
      if (error) console.warn('reset_all_data RPC error, running direct deletes:', error.message);
    } catch(e) {
      console.warn('reset_all_data RPC threw:', e.message);
    }

    // ALWAYS run direct table deletes as fallback / confirmation
    // (safe neq filter works with authenticated Supabase client)
    const deleteTable = async (table) => {
      try {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) console.warn(`Direct delete ${table} error:`, error.message);
      } catch(e) { console.warn(`Direct delete ${table} threw:`, e.message); }
    };

    // Delete in correct FK order: child tables first
    await deleteTable('sale_payments');
    await deleteTable('sale_line_items');
    await deleteTable('sales');
    await deleteTable('purchase_payments');
    await deleteTable('purchases');
    await deleteTable('expenses');
    await deleteTable('attachments');
    await deleteTable('inventory_movements');
    await deleteTable('production_batches');

    // Reset plot inventory
    try {
      await supabase.from('plot_inventory').update({
        status: 'Empty',
        bales_remaining: 0,
        bales_original: 0,
        batch_id: null,
        cost_per_bale: 0,
        ferm_start: null,
        ready_date: null
      }).neq('status', '__NONE__IMPOSSIBLE__');
    } catch(e) { console.warn('plot_inventory reset error:', e.message); }

    // Reset raw materials stock
    try {
      await supabase.from('raw_materials').update({ stock_kg: 0 }).neq('stock_kg', -999999);
    } catch(e) { console.warn('raw_materials reset error:', e.message); }

    // Delete suppliers and customers last
    await deleteTable('suppliers');
    await deleteTable('customers');

    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// PLOTS
// ─────────────────────────────────────────────────────────────────
export const plotsService = {
  async getAllWithInventory() {
    // Fetch plots and plot_inventory separately to avoid nested RLS issues
    const { data: plots, error: plotsError } = await supabase
      .from('plots')
      .select('*')
      .eq('is_active', true)
      .order('plot_name');
    if (plotsError) throw plotsError;

    const { data: inventory, error: invError } = await supabase
      .from('plot_inventory')
      .select('*');
    if (invError) throw invError;

    // Build a map of plot_id → inventory row
    const invMap = {};
    (inventory || []).forEach(row => { invMap[row.plot_id] = row; });

    // Fetch batch numbers for any active batch_ids
    const batchIds = [...new Set((inventory || []).map(r => r.batch_id).filter(Boolean))];
    let batchMap = {};
    if (batchIds.length > 0) {
      const { data: batches } = await supabase
        .from('production_batches')
        .select('id, batch_number, cost_per_bale')
        .in('id', batchIds);
      (batches || []).forEach(b => { batchMap[b.id] = b; });
    }

    return (plots || []).map(plot => {
      const inv = invMap[plot.id] || {};
      const batch = batchMap[inv.batch_id] || {};
      return {
        id: plot.id,
        plot_name: plot.plot_name,
        section: plot.section,
        bales: Number(inv.bales_remaining) || 0,
        balesOriginal: Number(inv.bales_original) || 0,
        costPerBale: Number(inv.cost_per_bale) || 0,
        fermStart: inv.ferm_start || null,
        readyDate: inv.ready_date || null,
        status: inv.status || 'Empty',
        batchId: inv.batch_id || null,
        batchNumber: batch.batch_number || ''
      };
    });
  },

  async updateStock(plotId, balesRemaining, status) {
    const { error } = await supabase
      .from('plot_inventory')
      .update({ bales_remaining: balesRemaining, status, updated_at: new Date().toISOString() })
      .eq('plot_id', plotId);
    if (error) throw error;
  },

  async markReady(plotIdOrName, batchIdOrNumber) {
    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    let resolvedPlotId = plotIdOrName;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plotIdOrName);
    if (!isUUID) {
      try {
        const { data: pData } = await supabase.from('plots').select('id').eq('plot_name', plotIdOrName).single();
        if (pData?.id) resolvedPlotId = pData.id;
      } catch (e) { /* ignore */ }
    }

    try {
      await supabase.rpc('mark_plot_fermented', { p_plot_id: resolvedPlotId });
    } catch(e) {
      // RPC fallback
    }

    try {
      await supabase
        .from('plot_inventory')
        .update({ status: 'Ready', ready_date: today, updated_at: nowIso })
        .eq('plot_id', resolvedPlotId);
    } catch(e) {
      console.warn('Direct update plot_inventory error:', e.message);
    }

    if (batchIdOrNumber) {
      try {
        const isBatchUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchIdOrNumber);
        if (isBatchUUID) {
          await supabase
            .from('production_batches')
            .update({ status: 'Ready', ready_date: today, updated_at: nowIso })
            .eq('id', batchIdOrNumber);
        } else {
          await supabase
            .from('production_batches')
            .update({ status: 'Ready', ready_date: today, updated_at: nowIso })
            .eq('batch_number', batchIdOrNumber);
        }
      } catch(e) {
        console.warn('Direct update production_batches error:', e.message);
      }
    }
  },

  async addPlot(plotName, section) {
    const { data: plot, error } = await supabase
      .from('plots')
      .insert({ plot_name: plotName.toUpperCase(), section })
      .select()
      .single();
    if (error) throw error;

    await supabase.from('plot_inventory').insert({
      plot_id: plot.id, bales_original: 0, bales_remaining: 0, cost_per_bale: 0, status: 'Empty'
    });
    return plot;
  }
};

// ─────────────────────────────────────────────────────────────────
// PRODUCTION BATCHES
// ─────────────────────────────────────────────────────────────────
export const batchesService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('production_batches')
        .select('*')
        .order('production_date', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch(err) {
      console.warn('batchesService.getAll error:', err.message);
      return [];
    }
  },

  async saveBatch(batchData) {
    const { data, error } = await supabase.rpc('save_production_batch', { p_data: batchData });
    if (error) throw error;
    return data;
  },

  async generateBatchNumber(date) {
    const { data, error } = await supabase.rpc('generate_batch_number', { prod_date: date });
    if (error) throw error;
    return data;
  },

  async delete(batchId) {
    try {
      const { data, error } = await supabase.rpc('delete_production_batch', { p_batch_id: batchId });
      if (!error && data?.success) return data;
    } catch (e) {
      // Fallback if RPC not yet deployed
    }
    const { error: delErr } = await supabase
      .from('production_batches')
      .delete()
      .eq('id', batchId);
    if (delErr) throw delErr;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────────────────────────
export const customersService = {
  async getAll() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async getWithBalance() {
    const customers = await this.getAll();
    const { data: sales } = await supabase
      .from('sales')
      .select('customer_id, invoice_total, amount_paid, balance_pending');

    const map = {};
    (sales || []).forEach(s => {
      if (!map[s.customer_id]) map[s.customer_id] = { totalPurchased: 0, totalPaid: 0, balancePending: 0 };
      map[s.customer_id].totalPurchased += Number(s.invoice_total) || 0;
      map[s.customer_id].totalPaid += Number(s.amount_paid) || 0;
      map[s.customer_id].balancePending += Number(s.balance_pending) || 0;
    });

    return customers.map(c => ({
      ...c,
      totalPurchased: map[c.id]?.totalPurchased || 0,
      totalPaid: map[c.id]?.totalPaid || 0,
      balancePending: map[c.id]?.balancePending || 0
    }));
  },

  async create(data) {
    const { data: cust, error } = await supabase.from('customers').insert(data).select().single();
    if (error) throw error;
    return cust;
  },

  async update(id, data) {
    const { data: cust, error } = await supabase.from('customers').update(data).eq('id', id).select().single();
    if (error) throw error;
    return cust;
  }
};

// ─────────────────────────────────────────────────────────────────
// SALES
// ─────────────────────────────────────────────────────────────────
export const salesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('sales')
      .select('*, customers(name, phone, credit_limit)')
      .order('invoice_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        customers(name, phone, address, credit_limit),
        sale_line_items(*),
        sale_payments(*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async saveSale(saleData) {
    const { data, error } = await supabase.rpc('save_sale', { p_data: saleData });
    if (error) throw error;
    return data;
  },

  async addPayment(paymentData) {
    const { data, error } = await supabase.rpc('add_sale_payment', { p_data: paymentData });
    if (error) throw error;
    return data;
  },

  async getPayments(saleId) {
    const { data, error } = await supabase
      .from('sale_payments')
      .select('*')
      .eq('sale_id', saleId)
      .order('payment_date', { ascending: false });
    if (error) throw error;
    return data || [];
  }
};

// ─────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────
export const expensesService = {
  async getAll(filters = {}) {
    let query = supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false });

    if (filters.category) query = query.eq('category', filters.category);
    if (filters.dateFrom) query = query.gte('expense_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('expense_date', filters.dateTo);
    if (filters.batchNumber) query = query.eq('related_batch_number', filters.batchNumber);
    if (filters.search) query = query.ilike('paid_to', `%${filters.search}%`);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async create(expenseData) {
    const { data, error } = await supabase.from('expenses').insert(expenseData).select().single();
    if (error) throw error;
    return data;
  },

  async update(id, expenseData) {
    const { data, error } = await supabase.from('expenses').update(expenseData).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
  }
};

// ─────────────────────────────────────────────────────────────────
// ATTACHMENTS
// ─────────────────────────────────────────────────────────────────
export const attachmentsService = {
  async upload(file, entityType, entityId) {
    if (file.size > 5 * 1024 * 1024) throw new Error('File size exceeds 5MB limit');

    const allowed = ['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
    if (!allowed.includes(file.type)) throw new Error('File type not allowed. Use JPG, PNG, WebP, GIF, or PDF');

    const ext = file.name.split('.').pop();
    const path = `${entityType}/${entityId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('bms-attachments')
      .upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;

    const { data: att, error: dbError } = await supabase.from('attachments').insert({
      entity_type: entityType,
      entity_id: entityId,
      storage_path: path,
      original_name: file.name,
      mime_type: file.type,
      file_size_bytes: file.size
    }).select().single();
    if (dbError) {
      await supabase.storage.from('bms-attachments').remove([path]);
      throw dbError;
    }
    return att;
  },

  async getSignedUrl(storagePath) {
    const { data, error } = await supabase.storage
      .from('bms-attachments')
      .createSignedUrl(storagePath, 300); // 5 min expiry
    if (error) throw error;
    return data.signedUrl;
  },

  async getForEntity(entityType, entityId) {
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async delete(attachmentId, storagePath) {
    await supabase.storage.from('bms-attachments').remove([storagePath]);
    const { error } = await supabase.from('attachments').delete().eq('id', attachmentId);
    if (error) throw error;
  }
};

// ─────────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────────
export const reportsService = {
  async getProfitAndLoss(dateFrom, dateTo) {
    let salesQ = supabase.from('sales').select('invoice_total, cogs_total, invoice_date');
    if (dateFrom) salesQ = salesQ.gte('invoice_date', dateFrom);
    if (dateTo) salesQ = salesQ.lte('invoice_date', dateTo);

    let expQ = supabase.from('expenses').select('amount, category, expense_date');
    if (dateFrom) expQ = expQ.gte('expense_date', dateFrom);
    if (dateTo) expQ = expQ.lte('expense_date', dateTo);

    const [{ data: sales }, { data: expenses }] = await Promise.all([salesQ, expQ]);

    const totalSales = (sales || []).reduce((s, r) => s + Number(r.invoice_total || 0), 0);
    const totalCOGS = (sales || []).reduce((s, r) => s + Number(r.cogs_total || 0), 0);
    const grossProfit = totalSales - totalCOGS;

    const byCategory = {};
    (expenses || []).forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
    });
    const totalExpenses = Object.values(byCategory).reduce((a, b) => a + b, 0);
    const netProfit = grossProfit - totalExpenses;

    return { totalSales, totalCOGS, grossProfit, byCategory, totalExpenses, netProfit };
  },

  async getBatchReport() {
    const { data: batches, error } = await supabase
      .from('production_batches')
      .select(`
        *,
        sale_line_items(bales_sold, rate_per_bale)
      `)
      .order('production_date', { ascending: false });
    if (error) throw error;
    return batches || [];
  }
};

// ─────────────────────────────────────────────────────────────────
// PROFILES / USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────
export const profilesService = {
  async getAll() {
    const { data, error } = await supabase.from('profiles').select('*').order('full_name');
    if (error) throw error;
    return data || [];
  },

  async updateRole(userId, role) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async setActive(userId, isActive) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};
