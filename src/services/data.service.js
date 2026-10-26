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

  async updateStock(plotIdOrName, balesRemaining, status) {
    let resolvedPlotId = plotIdOrName;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plotIdOrName);
    if (!isUUID) {
      try {
        const { data: pData } = await supabase.from('plots').select('id, plot_name').eq('plot_name', plotIdOrName).single();
        if (pData?.id) resolvedPlotId = pData.id;
      } catch(e) {}
    }

    const numBales = Math.max(0, Number(balesRemaining));
    const effectiveStatus = (numBales === 0 || status === 'Empty') ? 'Empty' : status;
    const nowIso = new Date().toISOString();

    const updatePayload = {
      bales_remaining: numBales,
      status: effectiveStatus,
      updated_at: nowIso
    };

    if (effectiveStatus === 'Empty') {
      updatePayload.batch_id = null;
      updatePayload.ferm_start = null;
      updatePayload.ready_date = null;
      updatePayload.cost_per_bale = 0;
    }

    const { error } = await supabase
      .from('plot_inventory')
      .update(updatePayload)
      .eq('plot_id', resolvedPlotId);
    if (error) throw error;

    // If emptied, ensure associated batch in production_batches doesn't keep reviving this plot
    if (effectiveStatus === 'Empty') {
      try {
        await supabase
          .from('production_batches')
          .update({ status: 'Dispatched', updated_at: nowIso })
          .eq('plot_id', resolvedPlotId)
          .in('status', ['Ready', 'Fermenting']);
      } catch(e) {
        console.warn('Could not update production_batches status on empty:', e.message);
      }
    }
  },

  async moveStock(fromPlotIdOrName, toPlotIdOrName, balesToMove) {
    const numBales = Number(balesToMove);
    if (!numBales || numBales <= 0) throw new Error('Please enter a valid bale count to move');

    // Resolve source plot UUID
    let sourcePlotId = fromPlotIdOrName;
    const isSourceUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fromPlotIdOrName);
    if (!isSourceUUID) {
      const { data: pData } = await supabase.from('plots').select('id, plot_name').eq('plot_name', fromPlotIdOrName).single();
      if (pData?.id) sourcePlotId = pData.id;
    }

    // Resolve target plot UUID
    let targetPlotId = toPlotIdOrName;
    const isTargetUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(toPlotIdOrName);
    if (!isTargetUUID) {
      const { data: pData } = await supabase.from('plots').select('id, plot_name').eq('plot_name', toPlotIdOrName).single();
      if (pData?.id) targetPlotId = pData.id;
    }

    if (sourcePlotId === targetPlotId) throw new Error('Source and destination plots must be different');

    // Get source inventory
    const { data: sourceInv, error: sErr } = await supabase
      .from('plot_inventory')
      .select('*')
      .eq('plot_id', sourcePlotId)
      .single();
    if (sErr || !sourceInv) throw new Error('Source plot inventory not found');

    if ((sourceInv.bales_remaining || 0) < numBales) {
      throw new Error(`Insufficient bales in source plot. Available: ${sourceInv.bales_remaining || 0}`);
    }

    // Get target inventory
    const { data: targetInv, error: tErr } = await supabase
      .from('plot_inventory')
      .select('*')
      .eq('plot_id', targetPlotId)
      .single();
    if (tErr || !targetInv) throw new Error('Target plot inventory not found');

    const nowIso = new Date().toISOString();
    const sourceRemaining = (sourceInv.bales_remaining || 0) - numBales;
    const targetNewBales = (targetInv.bales_remaining || 0) + numBales;

    // Source update
    const sourcePayload = {
      bales_remaining: sourceRemaining,
      status: sourceRemaining <= 0 ? 'Empty' : sourceInv.status,
      updated_at: nowIso
    };
    if (sourceRemaining <= 0) {
      sourcePayload.batch_id = null;
      sourcePayload.ferm_start = null;
      sourcePayload.ready_date = null;
      sourcePayload.cost_per_bale = 0;
    }

    // Target update
    const targetPayload = {
      bales_remaining: targetNewBales,
      status: sourceInv.status || 'Ready',
      batch_id: sourceInv.batch_id || targetInv.batch_id,
      cost_per_bale: sourceInv.cost_per_bale || targetInv.cost_per_bale || 0,
      ferm_start: sourceInv.ferm_start || targetInv.ferm_start,
      ready_date: sourceInv.ready_date || targetInv.ready_date,
      updated_at: nowIso
    };

    const { error: sUpErr } = await supabase.from('plot_inventory').update(sourcePayload).eq('plot_id', sourcePlotId);
    if (sUpErr) throw sUpErr;

    const { error: tUpErr } = await supabase.from('plot_inventory').update(targetPayload).eq('plot_id', targetPlotId);
    if (tUpErr) throw tUpErr;

    // Log inventory movements
    try {
      await supabase.from('inventory_movements').insert([
        {
          movement_type: 'adjustment',
          plot_id: sourcePlotId,
          batch_id: sourceInv.batch_id,
          bales_delta: -numBales,
          notes: `Moved ${numBales} bales to plot ${toPlotIdOrName}`
        },
        {
          movement_type: 'adjustment',
          plot_id: targetPlotId,
          batch_id: sourceInv.batch_id,
          bales_delta: numBales,
          notes: `Received ${numBales} bales from plot ${fromPlotIdOrName}`
        }
      ]);
    } catch(e) { /* ignore movement log */ }

    // If source plot is emptied and was linked to a production batch, update batch
    if (sourceRemaining <= 0 && sourceInv.batch_id) {
      try {
        await supabase
          .from('production_batches')
          .update({ plot_id: targetPlotId, plot_assigned: toPlotIdOrName, updated_at: nowIso })
          .eq('id', sourceInv.batch_id);
      } catch(e) {}
    }

    return { success: true, sourceRemaining, targetNewBales };
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
// Helper to enrich sale records with bales_count and rate_per_bale from line items
function enrichSaleRecord(s) {
  if (!s) return s;
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
}

export const salesService = {
  async getAll() {
    let salesData = [];
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*, customers(name, phone, credit_limit), sale_line_items(*)')
        .order('invoice_date', { ascending: false });
      if (error) throw error;
      salesData = data || [];
    } catch (err) {
      console.warn('getAll sales with items failed, trying fallback:', err.message);
      const { data: fbData } = await supabase
        .from('sales')
        .select('*, customers(name, phone, credit_limit)')
        .order('invoice_date', { ascending: false });
      salesData = fbData || [];
    }
    return salesData.map(enrichSaleRecord);
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
    return enrichSaleRecord(data);
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
// ATTACHMENTS & LOCAL RECEIPT VAULT (IndexedDB + Supabase)
// ─────────────────────────────────────────────────────────────────
const IDB_NAME = 'bms_attachments_vault';
const IDB_STORE = 'receipts';

function openAttachmentDB() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
          store.createIndex('entity_type', 'entity_type', { unique: false });
          store.createIndex('entity_id', 'entity_id', { unique: false });
          store.createIndex('entity', ['entity_type', 'entity_id'], { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch(e) {
      resolve(null);
    }
  });
}

async function idbSaveAttachment(att) {
  const db = await openAttachmentDB();
  if (!db) return att;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(att);
      tx.oncomplete = () => resolve(att);
      tx.onerror = () => resolve(att);
    } catch(e) {
      resolve(att);
    }
  });
}

async function idbGetAttachmentsForEntity(entityType, entityId) {
  const db = await openAttachmentDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const index = store.index('entity');
      const req = index.getAll([entityType, String(entityId)]);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch(e) {
      resolve([]);
    }
  });
}

async function idbGetAttachmentsForType(entityType) {
  const db = await openAttachmentDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const index = store.index('entity_type');
      const req = index.getAll(entityType);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch(e) {
      resolve([]);
    }
  });
}

async function idbGetAttachmentById(id) {
  const db = await openAttachmentDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch(e) {
      resolve(null);
    }
  });
}

async function idbDeleteAttachment(id) {
  const db = await openAttachmentDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch(e) {
      resolve(false);
    }
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const attachmentsService = {
  async upload(file, entityType, entityId) {
    if (file.size > 5 * 1024 * 1024) throw new Error('File size exceeds 5MB limit');

    const allowed = ['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf'];
    if (!allowed.includes(file.type)) throw new Error('File type not allowed. Use JPG, PNG, WebP, GIF, or PDF');

    const dataUrl = await fileToDataUrl(file);
    const ext = file.name.split('.').pop() || 'png';
    const cleanId = String(entityId || ('temp-' + Date.now()));
    const path = `${entityType}/${cleanId}/${Date.now()}.${ext}`;

    let remoteRecord = null;
    try {
      const { error: uploadError } = await supabase.storage
        .from('bms-attachments')
        .upload(path, file, { upsert: false });

      if (!uploadError) {
        const { data: att, error: dbError } = await supabase.from('attachments').insert({
          entity_type: entityType,
          entity_id: cleanId,
          storage_path: path,
          original_name: file.name,
          mime_type: file.type,
          file_size_bytes: file.size
        }).select().single();

        if (!dbError && att) {
          remoteRecord = att;
        }
      }
    } catch(e) {
      console.warn('Backend storage upload unavailable, falling back to local vault:', e.message);
    }

    const finalRecord = {
      id: remoteRecord?.id || ('att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
      entity_type: entityType,
      entity_id: cleanId,
      storage_path: remoteRecord?.storage_path || path,
      data_url: dataUrl,
      original_name: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      created_at: remoteRecord?.created_at || new Date().toISOString()
    };

    await idbSaveAttachment(finalRecord);
    return finalRecord;
  },

  async getSignedUrl(storagePath, attachmentId = null) {
    if (!storagePath) return '';
    if (storagePath.startsWith('data:') || storagePath.startsWith('blob:')) {
      return storagePath;
    }

    // Try finding cached local data URL first
    if (attachmentId) {
      const local = await idbGetAttachmentById(attachmentId);
      if (local?.data_url) return local.data_url;
    }

    // Try Supabase signed URL
    try {
      const { data, error } = await supabase.storage
        .from('bms-attachments')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch(e) {
      console.warn('Could not get signed URL from backend:', e.message);
    }

    // Fallback: check IndexedDB by storage_path
    const all = await idbGetAttachmentsForType('expense').concat(
      await idbGetAttachmentsForType('sale'),
      await idbGetAttachmentsForType('purchase')
    );
    const found = all.find(a => a.storage_path === storagePath);
    return found?.data_url || '';
  },

  async getById(id) {
    if (!id) return null;
    const local = await idbGetAttachmentById(id);
    if (local) return local;

    try {
      const { data } = await supabase.from('attachments').select('*').eq('id', id).single();
      return data || null;
    } catch(e) {
      return null;
    }
  },

  async getForEntity(entityType, entityId) {
    const cleanId = String(entityId);
    let remoteList = [];
    try {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', cleanId)
        .order('created_at', { ascending: false });
      if (!error && data) remoteList = data;
    } catch(e) {}

    const localList = await idbGetAttachmentsForEntity(entityType, cleanId);

    // Merge: indexedDB record contains data_url for instant image rendering
    const map = new Map();
    remoteList.forEach(r => map.set(r.id, r));
    localList.forEach(l => {
      if (map.has(l.id)) {
        map.set(l.id, { ...map.get(l.id), data_url: l.data_url || map.get(l.id).data_url });
      } else {
        map.set(l.id, l);
      }
    });

    return Array.from(map.values()).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getAllForType(entityType) {
    let remoteList = [];
    try {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('entity_type', entityType)
        .order('created_at', { ascending: false });
      if (!error && data) remoteList = data;
    } catch(e) {}

    const localList = await idbGetAttachmentsForType(entityType);

    const map = new Map();
    remoteList.forEach(r => map.set(r.id, r));
    localList.forEach(l => {
      if (map.has(l.id)) {
        map.set(l.id, { ...map.get(l.id), data_url: l.data_url || map.get(l.id).data_url });
      } else {
        map.set(l.id, l);
      }
    });

    return Array.from(map.values()).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async delete(attachmentId, storagePath) {
    try {
      if (storagePath && !storagePath.startsWith('data:')) {
        await supabase.storage.from('bms-attachments').remove([storagePath]);
      }
      await supabase.from('attachments').delete().eq('id', attachmentId);
    } catch(e) {}
    await idbDeleteAttachment(attachmentId);
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
    // Attempt admin_get_users RPC first to fetch emails from auth.users
    try {
      const { data, error } = await supabase.rpc('admin_get_users');
      if (!error && data && Array.isArray(data)) {
        return data;
      }
    } catch (e) {
      console.warn('admin_get_users RPC fallback to profiles table:', e.message);
    }
    const { data, error } = await supabase.from('profiles').select('*').order('full_name');
    if (error) throw error;
    return data || [];
  },

  async setPassword(userId, newPassword) {
    if (!newPassword || newPassword.trim().length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    const { data, error } = await supabase.rpc('admin_set_user_password', {
      target_user_id: userId,
      new_password: newPassword
    });
    if (error) {
      // Check if function is missing in database
      if (error.message?.includes('function') || error.code === '42883') {
        throw new Error('Database RPC function not installed yet. Please run migration 005_owner_manage_passwords.sql in Supabase SQL Editor.');
      }
      throw error;
    }
    return data;
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
