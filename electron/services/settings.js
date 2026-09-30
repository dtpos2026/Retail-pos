'use strict';

const ctx = require('../core/context');
const { AppError } = require('../core/errors');

/** Every setting section with its default values. Unknown keys are dropped on save. */
const DEFAULTS = {
  business: {
    name: 'My Business',
    tagline: '',
    address: '',
    phone: '',
    email: '',
    ntn: '',
    extraInfo: '',
    logo: null, // PNG/JPEG data URL
    businessType: 'restaurant',
  },
  receipt: {
    paperWidth: 80,
    template: 'classic',
    marginTop: 1,
    marginBottom: 3,
    marginLeft: 1,
    marginRight: 1,
    showLogo: true,
    logoWidth: 45, // percentage of printable width
    logoAlign: 'center',
    nameAlign: 'center',
    fontSize: 12,
    fontFamily: 'sans',
    footerText: 'Thank you for your visit! Please come again.',
    showCustomer: true,
    showCashier: true,
    showOrderNo: true,
    showPayment: true,
    showDiscount: true,
    showTable: true,
    showNtn: true,
    showItemNotes: true,
    compact: false,
    copies: 1,
    showPoweredBy: true,
    amountInWords: false,
    qrMode: 'off', // off | order | custom
    qrText: '',
    qrLabel: 'Scan to pay / follow us',
  },
  printer: {
    receiptPrinter: '',
    tokenPrinter: '',
    autoPrintReceipt: true,
    autoPrintToken: true,
    method: 'thermal', // thermal = direct ESC/POS (fast, exact length, exact cut) | driver = Windows driver
    cut: 'partial', // partial | full | none
    feedMm: 3, // extra blank feed after the receipt before the cut
    darkness: 'normal', // light | normal | dark
    dots: 0, // 0 = auto (384 for 58mm, 576 for 80mm)
    shift: 0, // horizontal balance in dots (+ moves the print to the right, - to the left)
    autoDetect: true, // pick the thermal printer automatically when none is chosen
    compatCut: false, // older printers without "feed and cut"
  },
  token: {
    enabled: true,
    mode: 'combined', // combined | item | none
    reset: 'daily', // daily | continuous
    digits: 3,
    prefix: '',
    title: 'TOKEN',
    paperWidth: 80,
    showItems: true,
    showPrices: true,
    showTotal: true,
    showBusinessName: true,
    showLogo: false,
    numberSize: 56,
    design: 'classic', // classic | boxed | bold | minimal | ticket
    footer: 'Please wait for your number to be called.',
    orderTypes: ['takeaway', 'delivery'],
  },
  sales: {
    enableDineIn: true,
    enableTakeaway: true,
    enableDelivery: true,
    defaultOrderType: 'takeaway',
    taxEnabled: false,
    taxRate: 0,
    taxLabel: 'GST',
    defaultDeliveryCharges: 0,
    roundTotal: true,
    allowCredit: true,
    orderPrefix: 'ORD-',
    orderDigits: 6,
  },
  inventory: {
    enabled: false,
    allowNegative: true,
  },
  payment: {
    methods: [
      { key: 'cash', label: 'Cash', enabled: true },
      { key: 'card', label: 'Card', enabled: true },
      { key: 'bank', label: 'Bank Transfer', enabled: true },
      { key: 'other', label: 'Other', enabled: true },
    ],
    quickCash: [100, 500, 1000, 5000],
  },
  backup: {
    autoBackup: true,
    folder: '',
    keep: 15,
    lastBackupAt: null,
    lastBackupFile: null,
  },
  general: {
    currency: 'Rs.',
    showImagesOnPos: true,
    posGridSize: 'medium',
    onboarded: false,
  },
  appearance: {
    theme: 'royal', // royal | crimson | gold | emerald | sunset | ocean | night
    animations: true,
    bannerEnabled: false,
    bannerTitle: '',
    bannerSubtitle: '',
    bannerImage: null,
    bannerOnPos: true,
    bannerOnDashboard: true,
  },
};

const SECTIONS = Object.keys(DEFAULTS);

// Sections a non-admin user may read (never contains secrets anyway).
const cache = new Map();

function merge(defaults, stored) {
  const out = {};
  for (const key of Object.keys(defaults)) {
    const d = defaults[key];
    const v = stored ? stored[key] : undefined;
    if (v === undefined || v === null) out[key] = d;
    else if (d && typeof d === 'object' && !Array.isArray(d)) out[key] = merge(d, v);
    else if (typeof d === 'number') out[key] = Number.isFinite(Number(v)) ? Number(v) : d;
    else if (typeof d === 'boolean') out[key] = !!v;
    else out[key] = v;
  }
  return out;
}

function get(section) {
  if (!DEFAULTS[section]) throw new AppError('Unknown settings section.');
  if (cache.has(section)) return cache.get(section);
  const row = ctx.db.get('SELECT value FROM settings WHERE key = ?', [section]);
  let stored = null;
  if (row) {
    try {
      stored = JSON.parse(row.value);
    } catch {
      stored = null;
    }
  }
  const value = merge(DEFAULTS[section], stored);
  cache.set(section, value);
  return value;
}

function getAll() {
  const out = {};
  for (const s of SECTIONS) out[s] = get(s);
  return out;
}

function set(section, patch) {
  if (!DEFAULTS[section]) throw new AppError('Unknown settings section.');
  const current = get(section);
  const value = merge(DEFAULTS[section], { ...current, ...(patch || {}) });
  validate(section, value);
  ctx.db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [section, JSON.stringify(value)]
  );
  cache.set(section, value);
  return value;
}

function validate(section, v) {
  if (section === 'receipt') {
    if (![58, 80].includes(Number(v.paperWidth))) throw new AppError('Paper width must be 58mm or 80mm.');
    for (const k of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight']) {
      if (v[k] < 0 || v[k] > 20) throw new AppError('Margins must be between 0 and 20 mm.');
    }
    if (v.fontSize < 8 || v.fontSize > 20) throw new AppError('Font size must be between 8 and 20.');
    if (v.logoWidth < 10 || v.logoWidth > 100) throw new AppError('Logo size must be between 10% and 100%.');
    if (v.copies < 1 || v.copies > 5) throw new AppError('Copies must be between 1 and 5.');
  }
  if (section === 'printer') {
    if (!['thermal', 'driver'].includes(v.method)) throw new AppError('Unknown print method.');
    if (!['partial', 'full', 'none'].includes(v.cut)) throw new AppError('Unknown cut mode.');
    if (!Number.isInteger(Number(v.shift)) || v.shift < -96 || v.shift > 96) throw new AppError('Side balance must be a whole number between -96 and 96 dots.');
    if (v.feedMm < 0 || v.feedMm > 30) throw new AppError('Feed must be between 0 and 30 mm.');
    if (v.dots && (v.dots < 192 || v.dots > 832 || v.dots % 8)) throw new AppError('Print width (dots) must be a multiple of 8 between 192 and 832, or 0 for automatic.');
  }
  if (section === 'appearance') {
    if (!['royal', 'crimson', 'gold', 'emerald', 'sunset', 'ocean', 'night'].includes(v.theme)) throw new AppError('Unknown theme.');
  }
  if (section === 'token') {
    if (![58, 80].includes(Number(v.paperWidth))) throw new AppError('Token paper width must be 58mm or 80mm.');
    if (v.digits < 1 || v.digits > 6) throw new AppError('Token digits must be between 1 and 6.');
  }
  if (section === 'sales') {
    if (v.taxRate < 0 || v.taxRate > 100) throw new AppError('Tax rate must be between 0 and 100.');
    if (!v.enableDineIn && !v.enableTakeaway && !v.enableDelivery) throw new AppError('At least one sale type must be enabled.');
    if (v.orderDigits < 3 || v.orderDigits > 10) throw new AppError('Order number digits must be between 3 and 10.');
  }
  if (section === 'payment') {
    if (!Array.isArray(v.methods) || !v.methods.some((m) => m.enabled)) throw new AppError('Enable at least one payment method.');
  }
}

function clearCache() {
  cache.clear();
}

module.exports = { DEFAULTS, SECTIONS, get, getAll, set, clearCache };
