// src/data.js — Clean initial data without mock transactions
// All plots are initially empty so user can add fresh production batches and test fermentation

export const INITIAL_DATA = {
  settings: {
    fermentationDays: 30,
    fermentationDuration: 30,
    fermentationUnit: 'day', // 'day' | 'minute'
    currencySymbol: 'INR',
    companyName: 'Sri Balaji Agro Bales',
    gstin: '36AAAAA0000A1Z5',
    phone: '+91 98765 43210',
    address: 'Plot 45, Industrial Area, Warangal, Telangana - 506001',
    currentDate: new Date().toISOString().split('T')[0],
    activeRole: 'Owner'
  },
  
  rawMaterial: {
    stockKg: 0, // start at 0 until raw material purchases are recorded
    averageCostPerKg: 0
  },

  suppliers: [
    {
      id: 'sup-1',
      name: 'K. Rao Traders',
      phone: '+91 94401 23456',
      city: 'Khammam',
      totalPurchased: 0,
      totalPaid: 0,
      balancePending: 0
    },
    {
      id: 'sup-2',
      name: 'Supplier K. Rao',
      phone: '+91 98480 11223',
      city: 'Nalgonda',
      totalPurchased: 0,
      totalPaid: 0,
      balancePending: 0
    },
    {
      id: 'sup-3',
      name: 'Krishna Biomass Depot',
      phone: '+91 91234 56789',
      city: 'Miryalaguda',
      totalPurchased: 0,
      totalPaid: 0,
      balancePending: 0
    }
  ],

  customers: [
    {
      id: 'cust-1',
      name: 'Sri Hay Traders',
      phone: '+91 98850 99887',
      address: 'Shop 14, Grain Market, Hyderabad',
      gstNumber: '36ABCDE1234F1Z8',
      creditLimit: 300000,
      totalPurchased: 0,
      totalPaid: 0,
      balancePending: 0,
      lastPurchaseDate: ''
    },
    {
      id: 'cust-2',
      name: 'Ravi Farms',
      phone: '+91 97000 44556',
      address: 'Dairy Complex Road, Karimnagar',
      gstNumber: '36FGHIJ5678K1Z2',
      creditLimit: 250000,
      totalPurchased: 0,
      totalPaid: 0,
      balancePending: 0,
      lastPurchaseDate: ''
    },
    {
      id: 'cust-3',
      name: 'Deccan Agro Exports',
      phone: '+91 99490 88776',
      address: 'Dry Port Hub, Secunderabad',
      gstNumber: '36KLMNO9012P1Z4',
      creditLimit: 500000,
      totalPurchased: 0,
      totalPaid: 0,
      balancePending: 0,
      lastPurchaseDate: ''
    }
  ],

  purchases: [],
  batches: [],
  sales: [],
  expenses: [],

  plots: [
    // Section A (A1 to A20)
    { id: 'A1', plot_name: 'A1', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A2', plot_name: 'A2', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A3', plot_name: 'A3', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A4', plot_name: 'A4', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A5', plot_name: 'A5', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A6', plot_name: 'A6', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A7', plot_name: 'A7', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A8', plot_name: 'A8', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A9', plot_name: 'A9', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A10', plot_name: 'A10', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A11', plot_name: 'A11', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A12', plot_name: 'A12', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A13', plot_name: 'A13', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A14', plot_name: 'A14', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A15', plot_name: 'A15', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A16', plot_name: 'A16', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A17', plot_name: 'A17', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A18', plot_name: 'A18', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A19', plot_name: 'A19', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'A20', plot_name: 'A20', section: 'A', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },

    // Section B (B1 to B10)
    { id: 'B1', plot_name: 'B1', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'B2', plot_name: 'B2', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'B3', plot_name: 'B3', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'B4', plot_name: 'B4', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'B5', plot_name: 'B5', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'B6', plot_name: 'B6', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'B7', plot_name: 'B7', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'B8', plot_name: 'B8', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'B9', plot_name: 'B9', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'B10', plot_name: 'B10', section: 'B', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },

    // Section C & D
    { id: 'C1', plot_name: 'C1', section: 'C', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'C2', plot_name: 'C2', section: 'C', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' },
    { id: 'D1', plot_name: 'D1', section: 'D', bales: 0, batchId: null, batchNumber: '', prodDate: '', fermStart: '', costPerBale: 0, status: 'Empty' }
  ],

  // ─────────────────────────────────────────────────────────────────
  // GOAT FARMING & TRADING (Strictly Isolated Business Records)
  // ─────────────────────────────────────────────────────────────────
  goatSuppliers: [
    { id: 'gsup-1', name: 'Telangana Livestock Breeders', phone: '+91 98490 55441', city: 'Mahbubnagar', totalPurchased: 0, totalPaid: 0, balancePending: 0 },
    { id: 'gsup-2', name: 'Deccan Boer & Sirohi Farms', phone: '+91 99881 22334', city: 'Suryapet', totalPurchased: 0, totalPaid: 0, balancePending: 0 }
  ],
  goatCustomers: [
    { id: 'gcust-1', name: 'Hyderabad Mutton Traders', phone: '+91 97000 88991', address: 'Old City, Hyderabad', totalPurchased: 0, totalPaid: 0, balancePending: 0 },
    { id: 'gcust-2', name: 'Raju Meat Mart', phone: '+91 98481 77665', address: 'Main Road, Warangal', totalPurchased: 0, totalPaid: 0, balancePending: 0 }
  ],
  goatPurchases: [],
  goatGroups: [],
  goats: [],
  goatSales: [],
  goatExpenses: [],
  goatWeightRecords: [],
  goatHealthRecords: [],
  goatSupplierPayments: [],
  goatCustomerPayments: [],

  // ─────────────────────────────────────────────────────────────────
  // NAPIER MANAGEMENT (Strictly Isolated Business Records)
  // ─────────────────────────────────────────────────────────────────
  napierPlots: [
    {
      id: 'nplt-1',
      plot_code: 'NAP-PLT-001',
      plot_name: 'Plot A - North Field',
      location: 'Sector 4, Main Farm',
      area: 2.5,
      area_unit: 'Acres',
      napier_variety: 'Super Napier',
      planting_date: '2026-01-15',
      establishment_cost: 35000,
      irrigation_type: 'Drip',
      status: 'Ready for Harvest',
      notes: 'High yield potential, ready for cycle cut'
    },
    {
      id: 'nplt-2',
      plot_code: 'NAP-PLT-002',
      plot_name: 'Plot B - Canal Bank',
      location: 'Sector 7, Canal Road',
      area: 1.8,
      area_unit: 'Acres',
      napier_variety: 'Pakchong 1 (Super Napier)',
      planting_date: '2026-02-10',
      establishment_cost: 26000,
      irrigation_type: 'Flood',
      status: 'Growing',
      notes: 'Planted after soil enrichment'
    }
  ],
  napierCustomers: [
    { id: 'ncust-1', name: 'Krishna Dairy Farm', phone: '+91 98491 12345', address: 'Village Road, Warangal', is_active: true },
    { id: 'ncust-2', name: 'Sri Venkateswara Cattle Feed', phone: '+91 97012 34567', address: 'Industrial Area, Hanamkonda', is_active: true }
  ],
  napierHarvests: [],
  napierStockMovements: [],
  napierSales: [],
  napierExpenses: [],
  napierPayments: [],
  napierStockAdjustments: []
};

