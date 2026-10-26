// src/services/napier.service.js
// Napier Management Data Access Layer
// Strictly isolated from Bale Management and Goat Farming operations.
// Interacts with Supabase tables, sequences, and transactional RPCs with safe fallback.

import { supabase } from '../lib/supabase.js';

// ─────────────────────────────────────────────────────────────────
// NAPIER DASHBOARD SERVICE
// ─────────────────────────────────────────────────────────────────
export const napierDashboardService = {
  async getMetrics(month) {
    try {
      const { data, error } = await supabase.rpc('get_napier_dashboard_metrics', { p_month: month });
      if (!error && data) return data;
      if (error) console.warn('get_napier_dashboard_metrics RPC error:', error.message);
    } catch (e) {
      console.warn('napier dashboard RPC fallback:', e.message);
    }
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────
// NAPIER PLOTS SERVICE
// ─────────────────────────────────────────────────────────────────
export const napierPlotsService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('napier_plots')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('napier_plots query error:', error.message);
    } catch (e) {
      console.warn('napier_plots query exception:', e.message);
    }
    return null;
  },

  async create(plotData) {
    // Generate plot code if not provided
    if (!plotData.plot_code) {
      try {
        const { data: code } = await supabase.rpc('generate_napier_plot_code');
        if (code) plotData.plot_code = code;
      } catch (e) {}
      if (!plotData.plot_code) {
        plotData.plot_code = `NAP-PLT-${Math.floor(100 + Math.random() * 900)}`;
      }
    }
    const { data, error } = await supabase.from('napier_plots').insert(plotData).select().single();
    if (error) throw error;
    return data;
  },

  async update(id, plotData) {
    const { data, error } = await supabase.from('napier_plots').update(plotData).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('napier_plots').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// NAPIER CUSTOMERS SERVICE
// ─────────────────────────────────────────────────────────────────
export const napierCustomersService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('napier_customers')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data) return data;
      if (error) console.warn('napier_customers query error:', error.message);
    } catch (e) {
      console.warn('napier_customers exception:', e.message);
    }
    return null;
  },

  async create(customerData) {
    const { data, error } = await supabase.from('napier_customers').insert(customerData).select().single();
    if (error) throw error;
    return data;
  },

  async update(id, customerData) {
    const { data, error } = await supabase.from('napier_customers').update(customerData).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('napier_customers').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// NAPIER HARVESTS SERVICE
// ─────────────────────────────────────────────────────────────────
export const napierHarvestsService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('napier_harvests')
        .select('*, napier_plots(plot_code, plot_name)')
        .order('harvest_date', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('napier_harvests query error:', error.message);
    } catch (e) {
      console.warn('napier_harvests exception:', e.message);
    }
    return null;
  },

  async recordHarvest(harvestData) {
    try {
      const { data, error } = await supabase.rpc('record_napier_harvest', {
        p_plot_id: harvestData.plot_id,
        p_harvest_date: harvestData.harvest_date,
        p_input_quantity: Number(harvestData.input_quantity || harvestData.quantity_kg),
        p_input_unit: harvestData.input_unit || 'kg',
        p_labour_cost: Number(harvestData.labour_cost || 0),
        p_harvesting_cost: Number(harvestData.harvesting_cost || 0),
        p_transport_cost: Number(harvestData.transport_cost || 0),
        p_other_cost: Number(harvestData.other_cost || 0),
        p_notes: harvestData.notes || ''
      });
      if (!error && data) return data;
      if (error) {
        console.warn('record_napier_harvest RPC failed, using table insert:', error.message);
      }
    } catch (e) {
      console.warn('record_napier_harvest RPC exception:', e.message);
    }

    // Direct table insert fallback
    const qtyKg = (harvestData.input_unit === 'tonnes' || harvestData.input_unit === 'tonne')
      ? Number(harvestData.input_quantity) * 1000
      : Number(harvestData.input_quantity || harvestData.quantity_kg);

    const totalCost = Number(harvestData.labour_cost || 0) +
                      Number(harvestData.harvesting_cost || 0) +
                      Number(harvestData.transport_cost || 0) +
                      Number(harvestData.other_cost || 0);

    const costPerKg = qtyKg > 0 ? (totalCost / qtyKg) : 0;
    const ref = harvestData.harvest_ref || `NAP-HRV-${(harvestData.harvest_date || '').slice(0, 4) || '2026'}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: harvest, error: hErr } = await supabase.from('napier_harvests').insert({
      harvest_ref: ref,
      harvest_date: harvestData.harvest_date,
      plot_id: harvestData.plot_id,
      quantity_kg: qtyKg,
      input_quantity: Number(harvestData.input_quantity || qtyKg),
      input_unit: harvestData.input_unit || 'kg',
      labour_cost: Number(harvestData.labour_cost || 0),
      harvesting_cost: Number(harvestData.harvesting_cost || 0),
      transport_cost: Number(harvestData.transport_cost || 0),
      other_cost: Number(harvestData.other_cost || 0),
      total_production_cost: totalCost,
      cost_per_kg: costPerKg,
      notes: harvestData.notes || ''
    }).select().single();

    if (hErr) throw hErr;

    // Insert positive stock ledger movement
    try {
      await supabase.from('napier_stock_movements').insert({
        movement_date: harvestData.harvest_date,
        movement_type: 'HARVEST_IN',
        quantity_kg: qtyKg,
        unit_cost: costPerKg,
        total_cost: totalCost,
        reference_id: harvest.id,
        reference_no: ref,
        notes: 'Harvest from plot'
      });
    } catch (e) {
      console.warn('Stock movement insert error:', e.message);
    }

    return harvest;
  },

  async delete(id) {
    const { error } = await supabase.from('napier_harvests').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// NAPIER STOCK SERVICE
// ─────────────────────────────────────────────────────────────────
export const napierStockService = {
  async getMovements() {
    try {
      const { data, error } = await supabase
        .from('napier_stock_movements')
        .select('*')
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('napier_stock_movements query error:', error.message);
    } catch (e) {
      console.warn('napier_stock_movements exception:', e.message);
    }
    return null;
  },

  async getSummary() {
    try {
      const { data, error } = await supabase.rpc('get_napier_stock_summary');
      if (!error && data && data.length > 0) return data[0];
    } catch (e) {
      console.warn('get_napier_stock_summary RPC exception:', e.message);
    }
    return null;
  },

  async recordAdjustment(adjData) {
    try {
      const { data, error } = await supabase.rpc('record_napier_stock_adjustment', {
        p_adj_date: adjData.adj_date,
        p_adj_type: adjData.adj_type,
        p_quantity_kg: Number(adjData.quantity_kg),
        p_reason: adjData.reason,
        p_notes: adjData.notes || ''
      });
      if (!error && data) return data;
      if (error) console.warn('record_napier_stock_adjustment RPC error:', error.message);
    } catch (e) {
      console.warn('record_napier_stock_adjustment exception:', e.message);
    }

    // Direct fallback
    const ref = adjData.adj_ref || `NAP-ADJ-${(adjData.adj_date || '').slice(0, 4) || '2026'}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: adj, error: aErr } = await supabase.from('napier_stock_adjustments').insert({
      adj_ref: ref,
      adj_date: adjData.adj_date,
      adj_type: adjData.adj_type,
      quantity_kg: Number(adjData.quantity_kg),
      reason: adjData.reason,
      notes: adjData.notes || ''
    }).select().single();

    if (aErr) throw aErr;

    const delta = adjData.adj_type === 'ADDITION' ? Number(adjData.quantity_kg) : -Number(adjData.quantity_kg);
    const mType = adjData.adj_type === 'ADDITION' ? 'ADJUSTMENT_ADD' : adjData.adj_type === 'WASTAGE' ? 'WASTAGE' : 'ADJUSTMENT_SUB';

    try {
      await supabase.from('napier_stock_movements').insert({
        movement_date: adjData.adj_date,
        movement_type: mType,
        quantity_kg: delta,
        unit_cost: 0,
        total_cost: 0,
        reference_id: adj.id,
        reference_no: ref,
        notes: adjData.reason
      });
    } catch (e) {}

    return adj;
  }
};

// ─────────────────────────────────────────────────────────────────
// NAPIER SALES SERVICE
// ─────────────────────────────────────────────────────────────────
export const napierSalesService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('napier_sales')
        .select('*, napier_customers(name, phone)')
        .order('sale_date', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('napier_sales query error:', error.message);
    } catch (e) {
      console.warn('napier_sales exception:', e.message);
    }
    return null;
  },

  async recordSale(saleData) {
    try {
      const { data, error } = await supabase.rpc('record_napier_sale', {
        p_customer_id: saleData.customer_id,
        p_sale_date: saleData.sale_date,
        p_pricing_method: saleData.pricing_method || 'weight_based',
        p_sale_unit: saleData.sale_unit || 'kg',
        p_quantity_sold: Number(saleData.quantity_sold),
        p_rate_per_unit: Number(saleData.rate_per_unit),
        p_quantity_deducted_kg: Number(saleData.quantity_deducted_kg),
        p_transport_charges: Number(saleData.transport_charges || 0),
        p_other_charges: Number(saleData.other_charges || 0),
        p_amount_paid: Number(saleData.amount_paid || 0),
        p_payment_method: saleData.payment_method || 'Cash',
        p_due_date: saleData.due_date || null,
        p_notes: saleData.notes || ''
      });
      if (!error && data) return data;
      if (error) {
        console.warn('record_napier_sale RPC failed, using fallback:', error.message);
        throw error;
      }
    } catch (e) {
      if (e.message?.includes('Insufficient stock')) throw e;
      console.warn('record_napier_sale exception:', e.message);
    }

    // Direct fallback
    const subtotal = Number(saleData.quantity_sold) * Number(saleData.rate_per_unit);
    const totalAmount = subtotal + Number(saleData.transport_charges || 0) + Number(saleData.other_charges || 0);
    const amountPaid = Number(saleData.amount_paid || 0);
    const balance = Math.max(0, totalAmount - amountPaid);
    const status = balance <= 0 ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Unpaid';
    const invoiceNo = saleData.invoice_no || `NAP-SAL-${(saleData.sale_date || '').slice(0, 4) || '2026'}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: sale, error: sErr } = await supabase.from('napier_sales').insert({
      invoice_no: invoiceNo,
      sale_date: saleData.sale_date,
      customer_id: saleData.customer_id,
      pricing_method: saleData.pricing_method || 'weight_based',
      sale_unit: saleData.sale_unit || 'kg',
      quantity_sold: Number(saleData.quantity_sold),
      rate_per_unit: Number(saleData.rate_per_unit),
      quantity_deducted_kg: Number(saleData.quantity_deducted_kg),
      cogs_amount: Number(saleData.cogs_amount || 0),
      subtotal,
      transport_charges: Number(saleData.transport_charges || 0),
      other_charges: Number(saleData.other_charges || 0),
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance_pending: balance,
      payment_status: status,
      due_date: saleData.due_date || null,
      notes: saleData.notes || ''
    }).select().single();

    if (sErr) throw sErr;

    // Deduct stock
    try {
      await supabase.from('napier_stock_movements').insert({
        movement_date: saleData.sale_date,
        movement_type: 'SALE_OUT',
        quantity_kg: -Number(saleData.quantity_deducted_kg),
        unit_cost: 0,
        total_cost: 0,
        reference_id: sale.id,
        reference_no: invoiceNo,
        notes: 'Sale to customer'
      });
    } catch (e) {}

    // Record initial payment if any
    if (amountPaid > 0) {
      try {
        const pRef = `NAP-PAY-${(saleData.sale_date || '').slice(0, 4) || '2026'}-${Math.floor(1000 + Math.random() * 9000)}`;
        await supabase.from('napier_payments').insert({
          payment_ref: pRef,
          sale_id: sale.id,
          customer_id: saleData.customer_id,
          payment_date: saleData.sale_date,
          amount: amountPaid,
          payment_method: saleData.payment_method || 'Cash',
          reference_no: invoiceNo,
          notes: 'Initial payment at sale'
        });
      } catch (e) {}
    }

    return sale;
  },

  async addPayment(paymentData) {
    try {
      const { data, error } = await supabase.rpc('record_napier_payment', {
        p_sale_id: paymentData.sale_id,
        p_payment_date: paymentData.payment_date,
        p_amount: Number(paymentData.amount),
        p_payment_method: paymentData.payment_method || 'Cash',
        p_reference_no: paymentData.reference_no || '',
        p_notes: paymentData.notes || ''
      });
      if (!error && data) return data;
      if (error) throw error;
    } catch (e) {
      console.warn('record_napier_payment RPC error:', e.message);
      throw e;
    }
  },

  async delete(id) {
    const { error } = await supabase.from('napier_sales').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// NAPIER EXPENSES SERVICE
// ─────────────────────────────────────────────────────────────────
export const napierExpensesService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('napier_expenses')
        .select('*, napier_plots(plot_code, plot_name)')
        .order('expense_date', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('napier_expenses query error:', error.message);
    } catch (e) {
      console.warn('napier_expenses exception:', e.message);
    }
    return null;
  },

  async create(expenseData) {
    if (!expenseData.expense_ref) {
      try {
        const { data: ref } = await supabase.rpc('generate_napier_expense_ref', { p_date: expenseData.expense_date });
        if (ref) expenseData.expense_ref = ref;
      } catch (e) {}
      if (!expenseData.expense_ref) {
        expenseData.expense_ref = `NAP-EXP-${(expenseData.expense_date || '').slice(0, 4) || '2026'}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }
    const { data, error } = await supabase.from('napier_expenses').insert(expenseData).select().single();
    if (error) throw error;
    return data;
  },

  async update(id, expenseData) {
    const { data, error } = await supabase.from('napier_expenses').update(expenseData).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('napier_expenses').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }
};

// ─────────────────────────────────────────────────────────────────
// NAPIER PAYMENTS SERVICE
// ─────────────────────────────────────────────────────────────────
export const napierPaymentsService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('napier_payments')
        .select('*, napier_sales(invoice_no), napier_customers(name)')
        .order('payment_date', { ascending: false });
      if (!error && data) return data;
      if (error) console.warn('napier_payments query error:', error.message);
    } catch (e) {
      console.warn('napier_payments exception:', e.message);
    }
    return null;
  }
};
