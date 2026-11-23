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
    marginSide: 1, // equal left and right margin (mm)
    marginLeft: 1, // kept equal to marginSide (older versions stored them separately)
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
    printArea: 'standard', // full | standard | narrow — blank strip at both edges (0 / 2 / 4 mm) so nothing is clipped; used with automatic width
    shift: 0, // horizontal balance in dots (+ moves the print to the right, - to the left)
    autoDetect: true, // pick the thermal printer automatically when none is chosen
    compatCut: false, // older printers without "feed and cut"
    openDrawer: false, // kick the cash drawer (connected to the receipt printer) when a receipt prints
    fallbackAny: true, // chosen printer missing / not working: print on another available printer instead of failing
    quality: 'high', // high = drawn at 2x and averaged down (sharper text) | standard = 1x
    serialBaud: 9600, // COM printers on a cable (USB-serial / RS-232); Bluetooth ignores it
    serialSpeed: 'auto', // auto | safe | medium | fast — how quickly a job is pushed into a COM / Bluetooth printer
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
    // Token items (roti, naan…): tapping one asks the quantity and sells it at once with a priced token — no bill, no KOT
    quickEnabled: false,
    quickCategoryIds: [],
    quickProductIds: [],
    quickOrderTypes: ['takeaway'], // POS modes in which tapping such an item makes the instant token sale
    kotWhenOff: true, // token system switched off: print a kitchen ticket (KOT) after each paid takeaway / delivery order
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
    perHeadEnabled: false, // dine-in: charge per person (cover / "per head"); the cashier types how many persons
    perHeadRate: 0,
    perHeadLabel: 'Per head',
    serviceEnabled: false, // dine-in: manual service charge (% of the bill or a fixed amount); these are the suggested values
    serviceMode: 'percent', // percent | amount
    serviceValue: 0,
    serviceLabel: 'Service charge',
    roundTotal: true,
    allowCredit: true,
    requireRider: false, // delivery orders must have a rider (chosen from the list or typed by hand)
    orderPrefix: 'ORD-',
    orderDigits: 6,
  },
  inventory: {
    enabled: false,
    allowNegative: true,
    mode: '', // '' = not chosen yet | retail (products are the stock) | restaurant (raw items + recipes)
    modeLocked: false, // set once by inventory.setMode; only a factory reset clears it
  },
  payment: {
    methods: [
      { key: 'cash', label: 'Cash', enabled: true },
      { key: 'card', label: 'Card', enabled: true },
      { key: 'bank', label: 'Bank Transfer', enabled: true },
      { key: 'other', label: 'Other', enabled: true },
    ],
    quickCash: [100, 500, 1000, 5000],
    bankAccounts: [], // [{ id, bankName, title, accountNo, iban, branch, enabled }]
    showBankOnReceipt: false, // print the account details at the bottom of receipts
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
    categoryLayout: 'top', // top (one line + ⋯ for the rest) | left (vertical list beside the products)
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
  if (section === 'receipt' && stored) migrateMargins(stored);
  const value = merge(DEFAULTS[section], stored);
  if (section === 'receipt') value.marginLeft = value.marginRight = value.marginSide;
  cache.set(section, value);
  return value;
}

/**
 * Older versions had separate left / right margins, which people used to compensate for a printer that is not
 * centred. Convert once: equal side margin = the smaller one, and the difference moves to the printer's
 * "Side balance" so the printed result stays exactly the same.
 */
function migrateMargins(stored) {
  if (stored.marginSide !== undefined) return;
  const l = Number(stored.marginLeft);
  const r = Number(stored.marginRight);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return;
  stored.marginSide = Math.min(l, r);
  if (Math.abs(l - r) > 0.01) {
    const row = ctx.db.get("SELECT value FROM settings WHERE key = 'printer'");
    let pr = {};
    try {
      pr = row ? JSON.parse(row.value) : {};
    } catch {
      pr = {};
    }
    if (!Number(pr.shift)) {
      pr.shift = Math.max(-96, Math.min(96, Math.round((l - r) * 8)));
      ctx.db.run("INSERT INTO settings (key, value) VALUES ('printer', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify(pr)]);
      cache.delete('printer');
    }
  }
  ctx.db.run("INSERT INTO settings (key, value) VALUES ('receipt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify({ ...stored, marginLeft: stored.marginSide, marginRight: stored.marginSide })]);
}

function getAll() {
  const out = {};
  for (const s of SECTIONS) out[s] = get(s);
  return out;
}

function set(section, patch, { internal = false } = {}) {
  if (!DEFAULTS[section]) throw new AppError('Unknown settings section.');
  const current = get(section);
  if (section === 'inventory' && !internal) {
    // The Retail / Restaurant choice is permanent: only inventory.setMode (and a factory reset) may write it.
    patch = { ...(patch || {}), mode: current.mode, modeLocked: current.modeLocked };
  }
  const value = merge(DEFAULTS[section], { ...current, ...(patch || {}) });
  if (section === 'receipt') value.marginLeft = value.marginRight = value.marginSide;
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
    for (const k of ['marginTop', 'marginBottom', 'marginSide']) {
      if (v[k] < 0 || v[k] > 20) throw new AppError('Margins must be between 0 and 20 mm.');
    }
    if (v.fontSize < 8 || v.fontSize > 20) throw new AppError('Font size must be between 8 and 20.');
    if (v.logoWidth < 10 || v.logoWidth > 100) throw new AppError('Logo size must be between 10% and 100%.');
    if (v.copies < 1 || v.copies > 5) throw new AppError('Copies must be between 1 and 5.');
  }
  if (section === 'printer') {
    if (!['full', 'standard', 'narrow'].includes(v.printArea)) v.printArea = 'standard';
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
    if (!(Number(v.perHeadRate) >= 0) || v.perHeadRate > 100000) throw new AppError('Per head rate is invalid.');
    if (!['percent', 'amount'].includes(v.serviceMode)) throw new AppError('Service charge must be a percent or an amount.');
    if (!(Number(v.serviceValue) >= 0) || (v.serviceMode === 'percent' && v.serviceValue > 100)) throw new AppError('Service charge value is invalid (a percent must be 0–100).');
    v.perHeadLabel = String(v.perHeadLabel || 'Per head').trim().slice(0, 30) || 'Per head';
    v.serviceLabel = String(v.serviceLabel || 'Service charge').trim().slice(0, 30) || 'Service charge';
  }
  if (section === 'payment') {
    if (!Array.isArray(v.methods) || !v.methods.some((m) => m.enabled)) throw new AppError('Enable at least one payment method.');
    if (!Array.isArray(v.bankAccounts)) throw new AppError('Bank accounts are invalid.');
    v.bankAccounts = v.bankAccounts.map((a, i) => {
      const bankName = String(a.bankName || '').trim().slice(0, 60);
      const accountNo = String(a.accountNo || '').trim().slice(0, 40);
      const iban = String(a.iban || '').trim().slice(0, 40);
      if (!bankName) throw new AppError(`Bank account ${i + 1}: enter the bank name.`);
      if (!accountNo && !iban) throw new AppError(`${bankName}: enter an account number or IBAN.`);
      return { id: String(a.id || `acc${Date.now()}${i}`), bankName, title: String(a.title || '').trim().slice(0, 80), accountNo, iban, branch: String(a.branch || '').trim().slice(0, 60), enabled: a.enabled !== false };
    });
  }
}

function clearCache() {
  cache.clear();
}

module.exports = { DEFAULTS, SECTIONS, get, getAll, set, clearCache };
