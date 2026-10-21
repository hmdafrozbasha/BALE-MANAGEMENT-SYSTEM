// src/services/goat.service.js
// Goat Farming & Trading Data Access Layer
// Strictly isolated from bale business operations. Interacts with Supabase
// tables, sequences, and transactional RPCs with safe local fallback.

import { supabase } from '../lib/supabase.js';

// ─────────────────────────────────────────────────────────────────
// GOAT DASHBOARD SERVICE
// ─────────────────────────────────────────────────────────────────
export const goatDashboardService = {
  async getMetrics(month) {
    try {
      const { data, error } = await supabase.rpc('get_goat_dashboard_metrics', { p_month: month });
      if (!error && data) return data;
    } catch (e) {
      // Graceful fallback to client-side derivation if RPC is not yet applied
    }
    return null;
  },

  async getUpcomingHealthReminders() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('goat_health_records')
        .select('*, goats(tag_id, breed), goat_groups(group_code)')
        .not('next_scheduled_date', 'is', null)
        .gte('next_scheduled_date', today)
        .lte('next_scheduled_date', maxDate)
        .order('next_scheduled_date', { ascending: true })
        .limit(8);
      if (!error && data) return data;
    } catch (e) {}
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────
// GOAT SUPPLIERS SERVICE
// ─────────────────────────────────────────────────────────────────
export const goatSuppliersService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('goat_suppliers')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data) return data;
      if (error) console.warn('goat_suppliers query:', error.message);
    } catch (e) {
      console.warn('goat_suppliers error:', e.message);
    }
    return null;
  },

  async getWithBalance(knownPurchases) {
    const suppliers = await this.getAll();
    if (!Array.isArray(suppliers)) return null;
    const purchases = Array.isArray(knownPurchases) ? knownPurchases : ((await goatPurchasesService.getAll()) || []);

    return suppliers.map(s => {
      const supPurchases = purchases.filter(p => p.supplier_id === s.id || p.suppliers?.name === s.name || p.supplier_name === s.name);
      const totalPurchased = supPurchases.reduce((sum, p) => sum + (Number(p.total_acquisition_cost || p.totalCost || 0)), 0);
      const totalPaid = supPurchases.reduce((sum, p) => sum + (Number(p.amount_paid || p.amountPaid || 0)), 0);
      const balancePending = supPurchases.reduce((sum, p) => sum + (Number(p.balance_pending || p.balancePending || 0)), 0);
      return {
        ...s,
        totalPurchased,
        totalPaid,
        balancePending
      };
    });
  },

  async create(data) {
    const { data: res, error } = await supabase.from('goat_suppliers').insert(data).select().single();
    if (error) throw error;
    return res;
  },

  async update(id, data) {
    const { data: res, error } = await supabase.from('goat_suppliers').update(data).eq('id', id).select().single();
    if (error) throw error;
    return res;
  },

  async delete(id) {
    const { error } = await supabase.from('goat_suppliers').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// GOAT CUSTOMERS SERVICE
// ─────────────────────────────────────────────────────────────────
export const goatCustomersService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('goat_customers')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data) return data;
      if (error) console.warn('goat_customers query:', error.message);
    } catch (e) {
      console.warn('goat_customers error:', e.message);
    }
    return null;
  },

  async getWithBalance(knownSales) {
    const customers = await this.getAll();
    if (!Array.isArray(customers)) return null;
    const sales = Array.isArray(knownSales) ? knownSales : ((await goatSalesService.getAll()) || []);

    return customers.map(c => {
      const custSales = sales.filter(s => s.customer_id === c.id || s.customers?.name === c.name || s.customer_name === c.name);
      const totalPurchased = custSales.reduce((sum, s) => sum + (Number(s.total_amount || s.totalAmount || 0)), 0);
      const totalPaid = custSales.reduce((sum, s) => sum + (Number(s.amount_paid || s.amountPaid || 0)), 0);
      const balancePending = custSales.reduce((sum, s) => sum + (Number(s.balance_pending || s.balancePending || 0)), 0);
      return {
        ...c,
        totalPurchased,
        totalPaid,
        balancePending
      };
    });
  },

  async create(data) {
    const { data: res, error } = await supabase.from('goat_customers').insert(data).select().single();
    if (error) throw error;
    return res;
  },

  async update(id, data) {
    const { data: res, error } = await supabase.from('goat_customers').update(data).eq('id', id).select().single();
    if (error) throw error;
    return res;
  },

  async delete(id) {
    const { error } = await supabase.from('goat_customers').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// GOAT PURCHASES SERVICE
// ─────────────────────────────────────────────────────────────────
export const goatPurchasesService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('goat_purchases')
        .select('*, goat_suppliers(name, city, phone)')
        .order('purchase_date', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('goat_purchases query:', error.message);
    } catch (e) {
      console.warn('goat_purchases error:', e.message);
    }
    return null;
  },

  async savePurchase(purchaseData) {
    try {
      const { data, error } = await supabase.rpc('save_goat_purchase', { p_data: purchaseData });
      if (!error && data) return data;
      if (error) console.warn('save_goat_purchase RPC error, trying direct fallback:', error.message);
    } catch (e) {}

    // Direct fallback insertion:
    let supId = purchaseData.supplier_id;
    if (!supId && purchaseData.supplier_name) {
      try {
        const { data: newSup } = await supabase.from('goat_suppliers').insert({
          name: purchaseData.supplier_name,
          phone: purchaseData.supplier_phone || '',
          city: purchaseData.supplier_city || 'Local'
        }).select().single();
        if (newSup?.id) supId = newSup.id;
      } catch(e) {}
    }

    const { data: pur, error: purErr } = await supabase.from('goat_purchases').insert({
      purchase_ref: purchaseData.purchase_ref || `GOAT-PUR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random()*9000)}`,
      purchase_date: purchaseData.purchase_date || new Date().toISOString().split('T')[0],
      supplier_id: supId,
      purchase_method: purchaseData.purchase_method || 'group',
      quantity: purchaseData.quantity,
      price_per_goat: purchaseData.price_per_goat || 0,
      base_amount: purchaseData.base_amount || (purchaseData.quantity * (purchaseData.price_per_goat || 0)),
      initial_total_weight: purchaseData.initial_total_weight || 0,
      transport_expense: purchaseData.transport_expense || 0,
      other_initial_costs: purchaseData.other_initial_costs || 0,
      total_acquisition_cost: purchaseData.total_acquisition_cost,
      allocated_cost_per_goat: purchaseData.allocated_cost_per_goat,
      amount_paid: purchaseData.amount_paid || 0,
      balance_pending: (purchaseData.total_acquisition_cost || 0) - (purchaseData.amount_paid || 0),
      payment_due_date: purchaseData.payment_due_date || null,
      notes: purchaseData.notes || '',
      attachment_url: purchaseData.attachment_url || ''
    }).select().single();
    if (purErr) throw purErr;
    return pur;
  },

  async addPayment(paymentData) {
    try {
      const { data, error } = await supabase.rpc('add_goat_supplier_payment', { p_data: paymentData });
      if (!error && data) return data;
    } catch (e) {}

    const { data: pmt, error: pmtErr } = await supabase.from('goat_supplier_payments').insert(paymentData).select().single();
    if (pmtErr) throw pmtErr;
    return pmt;
  },

  async getPayments(purchaseId) {
    try {
      const { data, error } = await supabase
        .from('goat_supplier_payments')
        .select('*')
        .eq('purchase_id', purchaseId)
        .order('payment_date', { ascending: false });
      if (!error && data) return data;
    } catch (e) {}
    return [];
  },

  async delete(id) {
    try { await supabase.from('goat_supplier_payments').delete().eq('purchase_id', id); } catch(e) {}
    const { error } = await supabase.from('goat_purchases').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// GOAT GROUPS (BATCHES) SERVICE
// ─────────────────────────────────────────────────────────────────
export const goatGroupsService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('goat_groups')
        .select('*, goat_suppliers(name, city), goat_purchases(purchase_ref)')
        .order('purchase_date', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('goat_groups query:', error.message);
    } catch (e) {
      console.warn('goat_groups error:', e.message);
    }
    return null;
  },

  async create(data) {
    const { data: res, error } = await supabase.from('goat_groups').insert(data).select().single();
    if (error) throw error;
    return res;
  },

  async getActive() {
    const list = await this.getAll();
    if (!Array.isArray(list)) return [];
    return list.filter(g => g.current_quantity > 0 && g.status !== 'Archived' && g.status !== 'Sold Out');
  },

  async convertToIndividual(convertData) {
    try {
      const { data, error } = await supabase.rpc('convert_group_to_individual', { p_data: convertData });
      if (!error && data) return data;
    } catch (e) {}
    return { success: true };
  },

  async update(id, data) {
    const { data: res, error } = await supabase.from('goat_groups').update(data).eq('id', id).select().single();
    if (error) throw error;
    return res;
  },

  async delete(id) {
    const { error } = await supabase.from('goat_groups').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// GOATS (INDIVIDUAL) SERVICE
// ─────────────────────────────────────────────────────────────────
export const goatsService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('goats')
        .select('*, goat_groups(group_code, group_name), goat_suppliers(name), goat_purchases(purchase_ref)')
        .order('tag_id', { ascending: true });
      if (!error && data) return data;
      if (error) console.warn('goats query:', error.message);
    } catch (e) {
      console.warn('goats error:', e.message);
    }
    return null;
  },

  async getActive() {
    const list = await this.getAll();
    if (!Array.isArray(list)) return [];
    return list.filter(g => g.status === 'Active' || g.status === 'Available for Sale');
  },

  async getById(id) {
    try {
      const { data, error } = await supabase
        .from('goats')
        .select('*, goat_groups(group_code), goat_suppliers(name), goat_purchases(purchase_ref)')
        .eq('id', id)
        .single();
      if (!error && data) return data;
    } catch (e) {}
    return null;
  },

  async create(data) {
    const { data: res, error } = await supabase.from('goats').insert(data).select().single();
    if (error) throw error;
    return res;
  },

  async update(id, data) {
    const { data: res, error } = await supabase.from('goats').update(data).eq('id', id).select().single();
    if (error) throw error;
    return res;
  },

  async recordWeight(weightData) {
    try {
      const { data, error } = await supabase.rpc('record_goat_weight', { p_data: weightData });
      if (!error && data) return data;
    } catch (e) {}

    const { data: rec, error } = await supabase.from('goat_weight_records').insert(weightData).select().single();
    if (error) throw error;
    return rec;
  },

  async recordHealth(healthData) {
    try {
      const { data, error } = await supabase.rpc('record_goat_health', { p_data: healthData });
      if (!error && data) return data;
    } catch (e) {}

    const { data: rec, error } = await supabase.from('goat_health_records').insert(healthData).select().single();
    if (error) throw error;
    return rec;
  },

  async markDeceased(deceasedData) {
    try {
      const { data, error } = await supabase.rpc('mark_goat_deceased', { p_data: deceasedData });
      if (!error && data) return data;
    } catch (e) {}

    const { data: res, error } = await supabase.from('goats').update({
      status: 'Deceased',
      health_status: 'Deceased',
      deceased_date: deceasedData.deceased_date || new Date().toISOString().split('T')[0],
      deceased_reason: deceasedData.deceased_reason || 'Natural/Illness'
    }).eq('id', deceasedData.goat_id).select().single();
    if (error) throw error;
    return res;
  },

  async getWeightHistory(goatId) {
    try {
      const { data, error } = await supabase
        .from('goat_weight_records')
        .select('*')
        .eq('goat_id', goatId)
        .order('record_date', { ascending: false });
      if (!error && data) return data;
    } catch (e) {}
    return [];
  },

  async getHealthHistory(goatId) {
    try {
      const { data, error } = await supabase
        .from('goat_health_records')
        .select('*')
        .eq('goat_id', goatId)
        .order('record_date', { ascending: false });
      if (!error && data) return data;
    } catch (e) {}
    return [];
  },

  async delete(id) {
    const { error } = await supabase.from('goats').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// GOAT SALES SERVICE
// ─────────────────────────────────────────────────────────────────
export const goatSalesService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('goat_sales')
        .select('*, goat_customers(name, phone, address), goat_sale_items(*, goats(tag_id, breed), goat_groups(group_code))')
        .order('sale_date', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('goat_sales query:', error.message);
    } catch (e) {
      console.warn('goat_sales error:', e.message);
    }
    return null;
  },

  async saveSale(saleData) {
    try {
      const { data, error } = await supabase.rpc('save_goat_sale', { p_data: saleData });
      if (!error && data) return data;
      if (error) console.warn('save_goat_sale RPC error, direct fallback:', error.message);
    } catch (e) {}

    // Direct fallback
    const { data: sale, error: saleErr } = await supabase.from('goat_sales').insert({
      invoice_no: saleData.invoice_no || `GOAT-SAL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random()*9000)}`,
      sale_date: saleData.sale_date || new Date().toISOString().split('T')[0],
      customer_id: saleData.customer_id,
      pricing_method: saleData.pricing_method || 'per_goat',
      total_quantity: saleData.total_quantity,
      total_weight_kg: saleData.total_weight_kg || 0,
      subtotal: saleData.subtotal,
      discount: saleData.discount || 0,
      total_amount: saleData.total_amount,
      amount_paid: saleData.amount_paid || 0,
      balance_pending: (saleData.total_amount || 0) - (saleData.amount_paid || 0),
      total_cogs: saleData.total_cogs || 0,
      gross_profit: (saleData.total_amount || 0) - (saleData.total_cogs || 0),
      payment_due_date: saleData.payment_due_date || null,
      notes: saleData.notes || '',
      attachment_url: saleData.attachment_url || ''
    }).select().single();
    if (saleErr) throw saleErr;
    return sale;
  },

  async addPayment(paymentData) {
    try {
      const { data, error } = await supabase.rpc('add_goat_customer_payment', { p_data: paymentData });
      if (!error && data) return data;
    } catch (e) {}

    const { data: pmt, error: pmtErr } = await supabase.from('goat_customer_payments').insert(paymentData).select().single();
    if (pmtErr) throw pmtErr;
    return pmt;
  },

  async getPayments(saleId) {
    try {
      const { data, error } = await supabase
        .from('goat_customer_payments')
        .select('*')
        .eq('sale_id', saleId)
        .order('payment_date', { ascending: false });
      if (!error && data) return data;
    } catch (e) {}
    return [];
  },

  async delete(id) {
    try { await supabase.from('goat_customer_payments').delete().eq('sale_id', id); } catch(e) {}
    try { await supabase.from('goat_sale_items').delete().eq('sale_id', id); } catch(e) {}
    const { error } = await supabase.from('goat_sales').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// GOAT EXPENSES SERVICE
// ─────────────────────────────────────────────────────────────────
export const goatExpensesService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('goat_expenses')
        .select('*, goats(tag_id), goat_groups(group_code)')
        .order('expense_date', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('goat_expenses query:', error.message);
    } catch (e) {
      console.warn('goat_expenses error:', e.message);
    }
    return null;
  },

  async create(expenseData) {
    try {
      const { data, error } = await supabase.rpc('save_goat_expense', { p_data: expenseData });
      if (!error && data) return data;
    } catch (e) {}

    const { data: exp, error } = await supabase.from('goat_expenses').insert(expenseData).select().single();
    if (error) throw error;
    return exp;
  },

  async delete(id) {
    const { error } = await supabase.from('goat_expenses').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// GOAT RESET SERVICE
// ─────────────────────────────────────────────────────────────────
export const goatResetService = {
  async resetGoatData(options = {}) {
    const { data, error } = await supabase.rpc('reset_goat_data', { p_options: options });
    if (!error && data?.success) return data;
    if (error) throw error;
    return { success: true };
  }
};

