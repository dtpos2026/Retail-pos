import { useEffect, useRef, useState } from 'react';
import {
  Store, ReceiptText, Printer, Ticket, Percent, Wallet, Boxes, DatabaseBackup, KeyRound, SlidersHorizontal, Save, Upload, X, RefreshCw,
  FolderOpen, HardDriveDownload, RotateCcw, CheckCircle2, AlertTriangle, Usb, Bluetooth, Database, Trash2, FlaskConical, FileText, Lock, Palette, ChefHat, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { readImage } from '../lib/image';
import { formatDateTime, fileSize, formatDate } from '../lib/format';
import { Button, Field, Input, NumberInput, Select, ToggleRow, Seg, Tabs, Loading, Check, Badge, Empty, Switch } from '../components/ui';
import ReceiptPreview from '../components/ReceiptPreview';
import { LicenseActivateForm } from './Activation';
import { applyAppearance } from '../context/AppContext';
import { BRAND } from '@shared/brand.mjs';
import { DT_LOCKUP_WHITE, ContactButtons } from '../components/Brand';

const TABS = [
  { key: 'business', label: 'Business', icon: Store },
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'receipt', label: 'Receipt', icon: ReceiptText },
  { key: 'printer', label: 'Printers', icon: Printer },
  { key: 'token', label: 'Tokens', icon: Ticket },
  { key: 'sales', label: 'Sales & Tax', icon: Percent },
  { key: 'payment', label: 'Payments', icon: Wallet },
  { key: 'inventory', label: 'Inventory', icon: Boxes },
  { key: 'backup', label: 'Backup & Restore', icon: DatabaseBackup },
  { key: 'license', label: 'License', icon: KeyRound },
  { key: 'general', label: 'General', icon: SlidersHorizontal },
];

/** Local editable copy of one settings section. */
function useSection(section) {
  const { settings, reloadSettings, toast, toastError } = useApp();
  const [v, setV] = useState(settings[section]);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(settings[section]);
  const set = (k) => (val) => setV((x) => ({ ...x, [k]: val }));
  const save = async (values = v) => {
    setSaving(true);
    try {
      await api('settings.set', { section, values });
      const s = await reloadSettings();
      setV(s[section]);
      toast('Settings saved');
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { v, setV, set, save, saving, dirty };
}

function SaveBar({ s }) {
  return (
    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
      {s.dirty && <span className="small faint">Unsaved changes</span>}
      <Button variant="primary" icon={Save} onClick={() => s.save()} loading={s.saving} disabled={!s.dirty}>Save changes</Button>
    </div>
  );
}

// ------------------------------------------------------------------ Business
function BusinessTab() {
  const s = useSection('business');
  const { toastError } = useApp();
  const fileRef = useRef(null);
  const pickLogo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const png = f.type === 'image/png';
      s.set('logo')(await readImage(f, { maxSize: 600, type: png ? 'image/png' : 'image/jpeg', quality: 0.92 }));
    } catch (err) {
      toastError(err);
    }
  };
  return (
    <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
      <div className="card card-pad">
        <div className="form-grid">
          <Field label="Business name" className="full" hint="Urdu names are supported, e.g. کراچی بریانی ہاؤس"><Input dir="auto" value={s.v.name} onChange={(e) => s.set('name')(e.target.value)} /></Field>
          <Field label="Tagline (optional)" className="full"><Input dir="auto" value={s.v.tagline} onChange={(e) => s.set('tagline')(e.target.value)} placeholder="e.g. Taste of Lahore" /></Field>
          <Field label="Address" className="full"><textarea className="textarea" dir="auto" rows={2} value={s.v.address} onChange={(e) => s.set('address')(e.target.value)} /></Field>
          <Field label="Phone"><Input value={s.v.phone} onChange={(e) => s.set('phone')(e.target.value)} placeholder="0300-1234567" /></Field>
          <Field label="Email"><Input value={s.v.email} onChange={(e) => s.set('email')(e.target.value)} /></Field>
          <Field label="NTN / STRN (optional)"><Input value={s.v.ntn} onChange={(e) => s.set('ntn')(e.target.value)} /></Field>
          <Field label="Business type">
            <Select value={s.v.businessType} onChange={(e) => s.set('businessType')(e.target.value)} options={[
              { value: 'restaurant', label: 'Restaurant / Dhaba' }, { value: 'fastfood', label: 'Fast Food / Burger Point' }, { value: 'cafe', label: 'Café / Bakery' },
              { value: 'kiryana', label: 'Kiryana / General Store' }, { value: 'retail', label: 'Retail Shop' }, { value: 'other', label: 'Other' },
            ]} />
          </Field>
          <Field label="Extra receipt line (optional)" className="full" hint="e.g. Home delivery: 0300-7654321"><Input dir="auto" value={s.v.extraInfo} onChange={(e) => s.set('extraInfo')(e.target.value)} /></Field>
        </div>
        <SaveBar s={s} />
      </div>
      <div className="card card-pad col">
        <div className="b">Business logo</div>
        <div className="small faint">PNG recommended (transparent background). Shown on receipts, tokens and the sidebar.</div>
        <div className="dropzone">
          {s.v.logo ? <img src={s.v.logo} alt="Logo" /> : <div className="thumb" style={{ width: 90, height: 70, background: 'var(--surface-3)', color: 'var(--text-3)' }}><Store /></div>}
          <div className="col" style={{ gap: 8 }}>
            <Button icon={Upload} onClick={() => fileRef.current?.click()}>{s.v.logo ? 'Change logo' : 'Upload logo'}</Button>
            {s.v.logo && <Button variant="danger-ghost" size="sm" icon={X} onClick={() => s.set('logo')(null)}>Remove</Button>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={pickLogo} />
        <div className="small faint">Logo size and alignment on receipts are set in the Receipt tab.</div>
      </div>
    </div>
  );
}


// ------------------------------------------------------------------ Appearance
const THEMES = [
  { key: 'royal', name: 'Royal Purple', desc: 'Digital Target signature — deep purple luxury', colors: ['#2a0a55', '#6d28d9', '#f4f2f9', '#f5b301'] },
  { key: 'crimson', name: 'Crimson Red & White', desc: 'Bold red with clean white cards', colors: ['#2b0b0d', '#dc2626', '#faf6f5', '#ffffff'] },
  { key: 'gold', name: 'Black & Gold', desc: 'Dark luxury with gold accents', colors: ['#050505', '#d4a017', '#17150f', '#f6efdc'] },
  { key: 'emerald', name: 'Emerald', desc: 'Fresh green — food & grocery', colors: ['#063a2b', '#059669', '#f2f8f5', '#ffffff'] },
  { key: 'sunset', name: 'Sunset Orange', desc: 'Warm, energetic and friendly', colors: ['#34160a', '#ea580c', '#faf6f2', '#facc15'] },
  { key: 'ocean', name: 'Ocean Blue', desc: 'Calm, corporate and clear', colors: ['#07304a', '#0284c7', '#f1f6fa', '#ffffff'] },
  { key: 'night', name: 'Night', desc: 'Dark mode for dim shops', colors: ['#070c17', '#8b5cf6', '#121a2b', '#e6ebf5'] },
];

function AppearanceTab() {
  const s = useSection('appearance');
  const { settings, toastError } = useApp();
  const fileRef = useRef(null);
  const v = s.v;
  useEffect(() => () => applyAppearance(settings.appearance), []); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = (patch) => {
    s.setV({ ...v, ...patch });
    applyAppearance({ ...v, ...patch });
  };
  const pickBanner = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      s.set('bannerImage')(await readImage(f, { maxSize: 700, type: f.type === 'image/png' ? 'image/png' : 'image/webp', quality: 0.9 }));
    } catch (err) {
      toastError(err);
    }
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card card-pad col">
        <div className="b" style={{ fontSize: 16 }}>Theme</div>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button key={t.key} className={`theme-card ${v.theme === t.key ? 'on' : ''}`} onClick={() => preview({ theme: t.key })}>
              <div className="sw">{t.colors.map((c, i) => <i key={i} style={{ background: c, flex: i === 0 ? 1.2 : 1 }} />)}</div>
              <div className="nm">{t.name}{v.theme === t.key && <CheckCircle2 size={15} color="var(--primary)" />}</div>
              <div className="ds">{t.desc}</div>
            </button>
          ))}
        </div>
        <ToggleRow title="Smooth animations" desc="Screen transitions and effects. Turn off on slow computers." checked={v.animations} onChange={(x) => preview({ animations: x })} />
      </div>
      <div className="card card-pad col">
        <div className="row"><div className="b grow" style={{ fontSize: 16 }}>Banner</div><Switch checked={v.bannerEnabled} onChange={s.set('bannerEnabled')} /></div>
        <div className="small muted">A promo strip on the POS screen and a hero on the dashboard — e.g. “Discount up to 20% on Zinger Burger”.</div>
        {v.bannerEnabled && (
          <>
            <div className="form-grid">
              <Field label="Banner title"><Input dir="auto" value={v.bannerTitle} onChange={(e) => s.set('bannerTitle')(e.target.value)} placeholder="e.g. Today's Special" /></Field>
              <Field label="Banner text"><Input dir="auto" value={v.bannerSubtitle} onChange={(e) => s.set('bannerSubtitle')(e.target.value)} placeholder="e.g. Buy 2 burgers, get a free drink" /></Field>
            </div>
            <div className="dropzone">
              {v.bannerImage ? <img src={v.bannerImage} alt="Banner" /> : <div className="small muted">Optional image (PNG with transparent background looks best)</div>}
              <div className="col" style={{ gap: 8 }}>
                <Button icon={Upload} onClick={() => fileRef.current?.click()}>{v.bannerImage ? 'Change image' : 'Upload image'}</Button>
                {v.bannerImage && <Button variant="danger-ghost" size="sm" icon={X} onClick={() => s.set('bannerImage')(null)}>Remove</Button>}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickBanner} />
            <div className="row wrap"><Check label="Show on POS screen" checked={v.bannerOnPos} onChange={s.set('bannerOnPos')} /><Check label="Show on dashboard" checked={v.bannerOnDashboard} onChange={s.set('bannerOnDashboard')} /></div>
            <div className="promo" style={{ margin: 0 }}>
              <div style={{ position: 'relative', zIndex: 1 }}><div className="pt"><bdi>{v.bannerTitle || 'Your banner title'}</bdi></div><div className="ps"><bdi>{v.bannerSubtitle || 'Your banner text'}</bdi></div></div>
              {v.bannerImage && <img src={v.bannerImage} alt="" />}
            </div>
          </>
        )}
      </div>
      <SaveBar s={s} />
    </div>
  );
}

function AboutCard({ info }) {
  return (
    <div className="about-card">
      <img src={DT_LOCKUP_WHITE} alt={BRAND.developer} />
      <div className="grow">
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.75 }}>Developed by</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{BRAND.developer}</div>
        <div style={{ opacity: 0.85, margin: '2px 0 10px' }}>{BRAND.product} v{info?.version} · {BRAND.tagline}</div>
        <ContactButtons />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Receipt
function ReceiptTab() {
  const s = useSection('receipt');
  const [templates, setTemplates] = useState([]);
  const { toastError, toast } = useApp();
  useEffect(() => {
    api('print.templates').then(setTemplates).catch(toastError);
  }, [toastError]);
  const v = s.v;
  const setWidth = (w) => s.setV({ ...v, paperWidth: w, marginLeft: 1, marginRight: 1, fontSize: w === 58 ? 11 : 12 });
  const test = async () => {
    if (s.dirty && !(await s.save())) return;
    api('print.test', { kind: 'receipt' }).then((r) => toast(`Test receipt sent to ${r.printer}`)).catch(toastError);
  };
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <div className="card card-pad col">
          <div className="row"><div className="b grow">Paper size</div><Seg value={v.paperWidth} onChange={setWidth} options={[{ value: 58, label: '58 mm' }, { value: 80, label: '80 mm' }]} /></div>
          <div className="b" style={{ marginTop: 6 }}>Receipt design</div>
          <div className="grid grid-3" style={{ gap: 10 }}>
            {templates.map((t) => (
              <button key={t.key} className={`method ${v.template === t.key ? 'on' : ''}`} style={{ alignItems: 'flex-start', textAlign: 'left', padding: 12 }} onClick={() => s.set('template')(t.key)}>
                <span className="row" style={{ width: '100%' }}>{t.label}{v.template === t.key && <CheckCircle2 size={16} style={{ marginLeft: 'auto' }} />}</span>
                <span className="small faint" style={{ fontWeight: 400 }}>{t.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <Field label="Top margin (mm)"><NumberInput value={v.marginTop} onChange={(x) => s.set('marginTop')(Number(x))} /></Field>
            <Field label="Bottom margin"><NumberInput value={v.marginBottom} onChange={(x) => s.set('marginBottom')(Number(x))} /></Field>
            <Field label="Left margin"><NumberInput value={v.marginLeft} onChange={(x) => s.set('marginLeft')(Number(x))} /></Field>
            <Field label="Right margin"><NumberInput value={v.marginRight} onChange={(x) => s.set('marginRight')(Number(x))} /></Field>
            <Field label="Font size (px)"><NumberInput value={v.fontSize} onChange={(x) => s.set('fontSize')(Number(x))} /></Field>
            <Field label="Font">
              <Select value={v.fontFamily} onChange={(e) => s.set('fontFamily')(e.target.value)} options={[{ value: 'sans', label: 'Arial (clear)' }, { value: 'mono', label: 'Monospace' }, { value: 'condensed', label: 'Condensed' }, { value: 'serif', label: 'Serif' }]} />
            </Field>
            <Field label="Business name align">
              <Select value={v.nameAlign} onChange={(e) => s.set('nameAlign')(e.target.value)} options={['left', 'center', 'right'].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))} />
            </Field>
            <Field label="Copies"><NumberInput value={v.copies} onChange={(x) => s.set('copies')(Number(x))} /></Field>
            <Field label="Logo size (% width)"><NumberInput value={v.logoWidth} onChange={(x) => s.set('logoWidth')(Number(x))} /></Field>
            <Field label="Logo align">
              <Select value={v.logoAlign} onChange={(e) => s.set('logoAlign')(e.target.value)} options={['left', 'center', 'right'].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))} />
            </Field>
            <Field label="Footer message" className="full" style={{ gridColumn: 'span 2' }}>
              <textarea className="textarea" dir="auto" rows={2} value={v.footerText} onChange={(e) => s.set('footerText')(e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="card card-pad grid grid-2" style={{ gap: 0, columnGap: 24 }}>
          <ToggleRow title="Show logo" checked={v.showLogo} onChange={s.set('showLogo')} />
          <ToggleRow title="Show order number" checked={v.showOrderNo} onChange={s.set('showOrderNo')} />
          <ToggleRow title="Show cashier" checked={v.showCashier} onChange={s.set('showCashier')} />
          <ToggleRow title="Show customer" checked={v.showCustomer} onChange={s.set('showCustomer')} />
          <ToggleRow title="Show table" checked={v.showTable} onChange={s.set('showTable')} />
          <ToggleRow title="Show payment details" desc="Method, paid, change" checked={v.showPayment} onChange={s.set('showPayment')} />
          <ToggleRow title="Show discount breakdown" checked={v.showDiscount} onChange={s.set('showDiscount')} />
          <ToggleRow title="Show NTN" checked={v.showNtn} onChange={s.set('showNtn')} />
          <ToggleRow title="Show item notes" checked={v.showItemNotes} onChange={s.set('showItemNotes')} />
          <ToggleRow title="Compact mode" desc="Tighter lines, saves paper" checked={v.compact} onChange={s.set('compact')} />
          <ToggleRow title="Amount in words" desc="Rupees One Thousand Fifty Only" checked={v.amountInWords} onChange={s.set('amountInWords')} />
          <ToggleRow title="“Powered by Digital Target” line" checked={v.showPoweredBy} onChange={s.set('showPoweredBy')} />
        </div>
        <div className="card card-pad col">
          <div className="row"><div className="b grow">QR code on receipt</div>
            <Seg value={v.qrMode} onChange={s.set('qrMode')} options={[{ value: 'off', label: 'Off' }, { value: 'order', label: 'Order info' }, { value: 'custom', label: 'My link / number' }]} />
          </div>
          {v.qrMode === 'custom' && (
            <div className="form-grid">
              <Field label="QR content" hint="e.g. your website, Google review link, Instagram, JazzCash / EasyPaisa number"><Input value={v.qrText} onChange={(e) => s.set('qrText')(e.target.value)} placeholder="https://…" /></Field>
              <Field label="Text next to the QR"><Input dir="auto" value={v.qrLabel} onChange={(e) => s.set('qrLabel')(e.target.value)} /></Field>
            </div>
          )}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button icon={Printer} onClick={test}>Save &amp; test print</Button>
          <Button variant="primary" icon={Save} onClick={() => s.save()} loading={s.saving} disabled={!s.dirty}>Save changes</Button>
        </div>
      </div>
      <div className="card card-pad" style={{ position: 'sticky', top: 0 }}>
        <div className="row" style={{ marginBottom: 10 }}><div className="b grow">Live preview</div><Badge color="indigo">{v.paperWidth}mm</Badge></div>
        <ReceiptPreview args={{ sample: true, overrides: { receipt: v } }} maxHeight="calc(100vh - 260px)" />
        <div className="small faint" style={{ marginTop: 8 }}>This is exactly what will be printed.</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Printers
function PrinterTab() {
  const s = useSection('printer');
  const { toast, toastError } = useApp();
  const [printers, setPrinters] = useState(null);
  const [testing, setTesting] = useState('');
  const load = () => api('print.printers').then(setPrinters).catch((e) => { toastError(e); setPrinters([]); });
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const opts = [{ value: '', label: '— Windows default printer —' }, ...(printers || []).map((p) => ({ value: p.name, label: `${p.displayName}${p.isDefault ? ' (default)' : ''}` }))];
  const test = async (kind) => {
    if (s.dirty && !(await s.save())) return;
    setTesting(kind);
    try {
      const r = await api('print.test', { kind });
      toast(`Test ${kind} printed on ${r.printer}`);
    } catch (e) {
      toastError(e);
    } finally {
      setTesting('');
    }
  };
  return (
    <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' }}>
      <div className="card card-pad col" style={{ gap: 16 }}>
        <div className="row">
          <div className="b grow">Installed printers ({printers ? printers.length : '…'})</div>
          <Button size="sm" icon={RefreshCw} onClick={load}>Refresh</Button>
        </div>
        <Field label="Receipt printer" hint="Used for bills and receipts.">
          <Select value={s.v.receiptPrinter} onChange={(e) => s.set('receiptPrinter')(e.target.value)} options={opts} />
        </Field>
        <Field label="Token / kitchen printer" hint="Leave on default to use the receipt printer.">
          <Select value={s.v.tokenPrinter} onChange={(e) => s.set('tokenPrinter')(e.target.value)} options={[{ value: '', label: '— Same as receipt printer —' }, ...opts.slice(1)]} />
        </Field>
        <div className="card card-pad col" style={{ background: 'var(--primary-50)', borderColor: 'transparent', gap: 12 }}>
          <div className="row"><Zap size={18} color="var(--primary)" /><div className="b grow">Print method</div>
            <Seg value={s.v.method} onChange={s.set('method')} options={[{ value: 'thermal', label: 'Thermal — fast (recommended)' }, { value: 'driver', label: 'Windows driver' }]} />
          </div>
          <div className="small muted">
            {s.v.method === 'thermal'
              ? 'Sends the receipt straight to the thermal printer as an image: exact length (no blank paper at the top), instant printing and a precise cut. Works with any ESC/POS thermal printer (XPrinter, Rongta, POS-80, Epson TM…).'
              : 'Prints through the Windows printer driver. Use this only for non-thermal or special printers. Thermal drivers often feed extra blank paper.'}
          </div>
          {s.v.method === 'thermal' && (
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <Field label="Paper cut"><Select value={s.v.cut} onChange={(e) => s.set('cut')(e.target.value)} options={[{ value: 'partial', label: 'Partial cut' }, { value: 'full', label: 'Full cut' }, { value: 'none', label: 'No cut (tear)' }]} /></Field>
              <Field label="Extra feed (mm)" hint="Blank space after the receipt"><NumberInput value={s.v.feedMm} onChange={(x) => s.set('feedMm')(Number(x))} /></Field>
              <Field label="Print darkness"><Select value={s.v.darkness} onChange={(e) => s.set('darkness')(e.target.value)} options={[{ value: 'light', label: 'Light' }, { value: 'normal', label: 'Normal' }, { value: 'dark', label: 'Dark / bold' }]} /></Field>
              <Field label="Print width (dots)" hint="Auto: 384 (58mm) / 576 (80mm)"><Select value={String(s.v.dots)} onChange={(e) => s.set('dots')(Number(e.target.value))} options={[{ value: '0', label: 'Auto' }, { value: '384', label: '384 (48 mm)' }, { value: '448', label: '448 (56 mm)' }, { value: '512', label: '512 (64 mm)' }, { value: '576', label: '576 (72 mm)' }, { value: '640', label: '640 (80 mm)' }]} /></Field>
              <div className="full" style={{ gridColumn: '1 / -1' }}><Check label="Compatibility cut for older printers (feed, then cut)" checked={s.v.compatCut} onChange={s.set('compatCut')} /></div>
            </div>
          )}
        </div>
        <div>
          <ToggleRow title="Print receipt automatically after payment" checked={s.v.autoPrintReceipt} onChange={s.set('autoPrintReceipt')} />
          <ToggleRow title="Print tokens automatically after payment" checked={s.v.autoPrintToken} onChange={s.set('autoPrintToken')} />
        </div>
        <div className="row">
          <Button icon={Printer} loading={testing === 'receipt'} onClick={() => test('receipt')}>Test receipt</Button>
          <Button icon={Ticket} loading={testing === 'token'} onClick={() => test('token')}>Test token</Button>
          <Button icon={ChefHat} loading={testing === 'kot'} onClick={() => test('kot')}>Test kitchen slip</Button>
          <div className="grow" />
          <Button variant="primary" icon={Save} onClick={() => s.save()} loading={s.saving} disabled={!s.dirty}>Save</Button>
        </div>
      </div>
      <div className="card card-pad col small" style={{ gap: 12 }}>
        <div className="b" style={{ fontSize: 15 }}>Printer setup help</div>
        <div className="row" style={{ alignItems: 'flex-start' }}><Usb size={18} className="faint" /><div><b>USB thermal printer:</b> install the driver from the printer CD/website. It then appears in the list above (e.g. "POS-80", "XP-58", "BlackCopper").</div></div>
        <div className="row" style={{ alignItems: 'flex-start' }}><Bluetooth size={18} className="faint" /><div><b>Bluetooth printer:</b> pair it in Windows Settings → Bluetooth &amp; devices, then install its driver so Windows lists it as a printer. It will then appear above.</div></div>
        <div className="row" style={{ alignItems: 'flex-start' }}><ReceiptText size={18} className="faint" /><div><b>Paper size:</b> choose 58mm or 80mm in the Receipt tab (and Tokens tab). In thermal mode DT Retail POS controls the length itself, so the Windows paper setting does not matter.</div></div>
        <div className="row" style={{ alignItems: 'flex-start' }}><Zap size={18} className="faint" /><div><b>Blank paper at the top?</b> Use the <b>Thermal — fast</b> method. If your printer prints strange characters, switch to <b>Windows driver</b>.</div></div>
        <div className="row" style={{ alignItems: 'flex-start' }}><AlertTriangle size={18} className="faint" /><div><b>Cut position:</b> adjust <b>Extra feed</b> so the cut lands right after the last line. Choose <b>Compatibility cut</b> for older printers.</div></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Tokens
function TokenTab() {
  const s = useSection('token');
  const { toast, toastError, confirm } = useApp();
  const [info, setInfo] = useState(null);
  const [designs, setDesigns] = useState([]);
  const v = s.v;
  useEffect(() => {
    api('tokens.info').then(setInfo).catch(() => {});
    api('print.tokenDesigns').then(setDesigns).catch(() => {});
  }, []);
  const toggleType = (t, on) => s.set('orderTypes')(on ? [...new Set([...v.orderTypes, t])] : v.orderTypes.filter((x) => x !== t));
  const reset = async () => {
    if (!(await confirm({ title: 'Reset token counter?', message: 'The next token will be number 1.', danger: true, confirmText: 'Reset' }))) return;
    api('tokens.resetCounter').then((i) => { setInfo(i); toast('Token counter reset'); }).catch(toastError);
  };
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <div className="card card-pad">
          <ToggleRow title="Enable token system" desc="Print a token number for customers / kitchen." checked={v.enabled} onChange={s.set('enabled')} />
          <div className="toggle-row">
            <div className="t"><div>Default token mode</div><div>Can be changed on each payment.</div></div>
            <Seg value={v.mode} onChange={s.set('mode')} options={[{ value: 'combined', label: 'Combined' }, { value: 'item', label: 'Per item' }, { value: 'none', label: 'Normal bill only' }]} />
          </div>
          <div className="toggle-row">
            <div className="t"><div>Numbering</div><div>{info ? `Next token #${info.nextToken} · ${info.todayCount} today` : ''}</div></div>
            <Seg value={v.reset} onChange={s.set('reset')} options={[{ value: 'daily', label: 'Reset daily' }, { value: 'continuous', label: 'Continuous' }]} />
            <Button size="sm" onClick={reset}>Reset now</Button>
          </div>
          <div className="toggle-row">
            <div className="t"><div>Generate tokens for</div></div>
            {[['dine_in', 'Dine-In'], ['takeaway', 'Takeaway'], ['delivery', 'Delivery']].map(([k, l]) => <Check key={k} label={l} checked={v.orderTypes.includes(k)} onChange={(on) => toggleType(k, on)} />)}
          </div>
        </div>
        <div className="card card-pad col">
          <div className="b">Token design</div>
          <div className="grid grid-3" style={{ gap: 10 }}>
            {designs.map((d) => (
              <button key={d.key} className={`method ${v.design === d.key ? 'on' : ''}`} style={{ alignItems: 'flex-start', textAlign: 'left', padding: 12 }} onClick={() => s.set('design')(d.key)}>
                <span className="row" style={{ width: '100%' }}>{d.label}{v.design === d.key && <CheckCircle2 size={16} style={{ marginLeft: 'auto' }} />}</span>
                <span className="small faint" style={{ fontWeight: 400 }}>{d.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Field label="Token title"><Input value={v.title} onChange={(e) => s.set('title')(e.target.value)} /></Field>
            <Field label="Prefix (optional)"><Input value={v.prefix} onChange={(e) => s.set('prefix')(e.target.value)} placeholder="e.g. T-" /></Field>
            <Field label="Digits"><NumberInput value={v.digits} onChange={(x) => s.set('digits')(Number(x))} /></Field>
            <Field label="Paper width"><Seg value={v.paperWidth} onChange={s.set('paperWidth')} options={[{ value: 58, label: '58mm' }, { value: 80, label: '80mm' }]} /></Field>
            <Field label="Number size (px)"><NumberInput value={v.numberSize} onChange={(x) => s.set('numberSize')(Number(x))} /></Field>
            <Field label="Footer" className="full" style={{ gridColumn: '1 / -1' }}><Input dir="auto" value={v.footer} onChange={(e) => s.set('footer')(e.target.value)} /></Field>
          </div>
          <div className="grid grid-2" style={{ gap: 0, columnGap: 24, marginTop: 8 }}>
            <ToggleRow title="Show business name" checked={v.showBusinessName} onChange={s.set('showBusinessName')} />
            <ToggleRow title="Show logo" checked={v.showLogo} onChange={s.set('showLogo')} />
            <ToggleRow title="Show items" checked={v.showItems} onChange={s.set('showItems')} />
            <ToggleRow title="Show item prices" checked={v.showPrices} onChange={s.set('showPrices')} />
            <ToggleRow title="Show total" checked={v.showTotal} onChange={s.set('showTotal')} />
          </div>
          <SaveBar s={s} />
        </div>
      </div>
      <div className="card card-pad" style={{ position: 'sticky', top: 0 }}>
        <div className="b" style={{ marginBottom: 10 }}>Token preview</div>
        <ReceiptPreview method="print.tokenHtml" args={{ sample: true, overrides: { token: v } }} maxHeight="calc(100vh - 260px)" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Sales
function SalesTab() {
  const s = useSection('sales');
  const v = s.v;
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card card-pad">
        <div className="b" style={{ marginBottom: 4 }}>Sale types</div>
        <ToggleRow title="Dine-In" desc="Table service with running bills" checked={v.enableDineIn} onChange={s.set('enableDineIn')} />
        <ToggleRow title="Takeaway" desc="Counter sales / parcels" checked={v.enableTakeaway} onChange={s.set('enableTakeaway')} />
        <ToggleRow title="Delivery" desc="Customer name, mobile & address" checked={v.enableDelivery} onChange={s.set('enableDelivery')} />
        <div className="form-grid mt">
          <Field label="Default sale type">
            <Select value={v.defaultOrderType} onChange={(e) => s.set('defaultOrderType')(e.target.value)} options={[{ value: 'dine_in', label: 'Dine-In' }, { value: 'takeaway', label: 'Takeaway' }, { value: 'delivery', label: 'Delivery' }]} />
          </Field>
          <Field label="Default delivery charges"><NumberInput value={v.defaultDeliveryCharges} onChange={(x) => s.set('defaultDeliveryCharges')(Number(x))} /></Field>
          <Field label="Order number prefix"><Input value={v.orderPrefix} onChange={(e) => s.set('orderPrefix')(e.target.value)} /></Field>
          <Field label="Order number digits" hint={`Example: ${v.orderPrefix}${'1'.padStart(v.orderDigits, '0')}`}><NumberInput value={v.orderDigits} onChange={(x) => s.set('orderDigits')(Number(x))} /></Field>
        </div>
      </div>
      <div className="card card-pad">
        <div className="b" style={{ marginBottom: 4 }}>Tax &amp; totals</div>
        <ToggleRow title="Charge tax" desc="Added on the bill after discounts" checked={v.taxEnabled} onChange={s.set('taxEnabled')} />
        {v.taxEnabled && (
          <div className="form-grid" style={{ margin: '10px 0' }}>
            <Field label="Tax label"><Input value={v.taxLabel} onChange={(e) => s.set('taxLabel')(e.target.value)} placeholder="GST" /></Field>
            <Field label="Tax rate (%)"><NumberInput value={v.taxRate} onChange={(x) => s.set('taxRate')(Number(x))} /></Field>
          </div>
        )}
        <ToggleRow title="Round total to whole rupees" checked={v.roundTotal} onChange={s.set('roundTotal')} />
        <ToggleRow title="Allow credit (unpaid) sales" desc="Customer pays later — tracked as Due" checked={v.allowCredit} onChange={s.set('allowCredit')} />
        <SaveBar s={s} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Payments
function PaymentTab() {
  const s = useSection('payment');
  const v = s.v;
  const upd = (i, patch) => s.set('methods')(v.methods.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <div className="card card-pad" style={{ maxWidth: 720 }}>
      <div className="b" style={{ marginBottom: 8 }}>Payment methods</div>
      {v.methods.map((m, i) => (
        <div key={m.key} className="toggle-row">
          <div style={{ width: 90 }} className="faint small">{m.key}</div>
          <Input value={m.label} onChange={(e) => upd(i, { label: e.target.value })} style={{ maxWidth: 260 }} />
          <div className="grow" />
          <Switch checked={m.enabled} onChange={(on) => upd(i, { enabled: on })} />
        </div>
      ))}
      <Field label="Quick cash buttons (comma separated)" hint="Shown on the payment screen." className="mt">
        <Input value={v.quickCash.join(', ')} onChange={(e) => s.set('quickCash')(e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => x > 0))} />
      </Field>
      <SaveBar s={s} />
    </div>
  );
}

// ------------------------------------------------------------------ Inventory
function InventoryTab() {
  const s = useSection('inventory');
  return (
    <div className="card card-pad" style={{ maxWidth: 720 }}>
      <ToggleRow title="Enable inventory tracking" desc="Sales reduce stock; stock in/out and low stock alerts. When off, the POS works normally without stock." checked={s.v.enabled} onChange={s.set('enabled')} />
      <ToggleRow title="Allow selling when out of stock" desc="Recommended for restaurants. Turn off to block sales that exceed stock." checked={s.v.allowNegative} onChange={s.set('allowNegative')} />
      <SaveBar s={s} />
    </div>
  );
}

// ------------------------------------------------------------------ Backup
function BackupTab() {
  const s = useSection('backup');
  const { toast, toastError, confirm, can } = useApp();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');
  const load = () => api('backup.list').then(setList).catch(toastError);
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const backupNow = () => act('now', async () => {
    const r = await api('backup.create');
    toast(`Backup saved (${fileSize(r.size)})`);
    await load();
  });
  const backupTo = () => act('to', async () => {
    const r = await api('backup.createTo');
    if (!r.canceled) toast(`Backup saved to ${r.file}`);
  });
  const restore = async (file) => {
    let info = { file };
    if (!file) {
      info = await api('backup.pickFile').catch((e) => (toastError(e), { canceled: true }));
      if (info.canceled) return;
    }
    const ok = await confirm({
      title: 'Restore this backup?',
      message: `All current data will be replaced by the backup${info.counts ? ` (${info.counts.orders} orders, ${info.counts.products} products)` : ''}.\n\nA safety copy of your current data is saved first. The app will restart.`,
      confirmText: 'Restore & restart',
      danger: true,
    });
    if (!ok) return;
    act('restore', async () => {
      await api('backup.restore', { file: info.file });
      toast('Backup restored. Restarting…');
      setTimeout(() => api('app.relaunch'), 800);
    });
  };

  const last = s.v.lastBackupAt;
  const stale = !last || Date.now() - new Date(last.replace(' ', 'T')).getTime() > 3 * 86400000;

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1.2fr', gap: 20, alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <div className="card card-pad col">
          <div className="row">
            {stale ? <AlertTriangle color="var(--warning)" /> : <CheckCircle2 color="var(--success)" />}
            <div className="grow">
              <div className="b">Last backup</div>
              <div className="muted">{last ? formatDateTime(last) : 'Never — please create a backup now.'}</div>
            </div>
          </div>
          <div className="row wrap">
            <Button variant="primary" icon={DatabaseBackup} onClick={backupNow} loading={busy === 'now'}>Backup now</Button>
            <Button icon={HardDriveDownload} onClick={backupTo} loading={busy === 'to'}>Backup to USB / folder…</Button>
          </div>
          <div className="small faint">Tip: keep a copy on a USB drive or Google Drive folder in case the computer is damaged.</div>
        </div>
        <div className="card card-pad">
          <ToggleRow title="Automatic daily backup" desc="Created in the background once a day while the app is open." checked={s.v.autoBackup} onChange={s.set('autoBackup')} />
          <div className="toggle-row">
            <div className="t"><div>Backup folder</div><div className="ellipsis" style={{ maxWidth: 320 }}>{list?.folder}</div></div>
            <Button size="sm" icon={FolderOpen} onClick={() => act('folder', async () => { const r = await api('backup.chooseFolder'); if (!r.canceled) { s.setV({ ...s.v, folder: r.folder }); load(); } })}>Change</Button>
            <Button size="sm" variant="ghost" onClick={() => api('backup.openFolder')}>Open</Button>
          </div>
          <div className="toggle-row">
            <div className="t"><div>Keep automatic backups</div><div>Older automatic backups are deleted.</div></div>
            <NumberInput value={s.v.keep} onChange={(x) => s.set('keep')(Number(x))} style={{ width: 90 }} />
          </div>
          <SaveBar s={s} />
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Backups</h3>
          <div className="actions">{can('backup') && <Button size="sm" icon={RotateCcw} onClick={() => restore(null)} loading={busy === 'restore'}>Restore from file…</Button>}</div>
        </div>
        {!list ? (
          <Loading />
        ) : list.files.length === 0 ? (
          <Empty icon={Database} title="No backups yet" text="Create your first backup now." />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 460 }}>
            <table className="table">
              <thead><tr><th>File</th><th>Date</th><th className="num">Size</th><th /></tr></thead>
              <tbody>
                {list.files.map((f) => (
                  <tr key={f.file}>
                    <td className="small">{f.name}</td>
                    <td className="muted small nowrap">{formatDateTime(f.modified)}</td>
                    <td className="num small">{fileSize(f.size)}</td>
                    <td className="right"><Button size="sm" icon={RotateCcw} onClick={() => restore(f.file)}>Restore</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ License
function LicenseTab() {
  const { license, setLicense, confirm, toastError } = useApp();
  if (!license) return <Loading />;
  const STATE = { active: ['green', 'Active'], trial: ['amber', 'Trial'], unconfigured: ['blue', 'Developer build'], expired: ['red', 'Expired'], revoked: ['red', 'Deactivated'], invalid: ['red', 'Invalid'], trial_expired: ['red', 'Trial ended'], blocked: ['red', 'Device blocked'], suspended: ['amber', 'Device suspended'], unregistered: ['amber', 'Not registered'] };
  const [color, label] = STATE[license.state] || ['', license.state];
  const remove = async () => {
    if (await confirm({ title: 'Remove license from this computer?', danger: true, confirmText: 'Remove' })) api('license.remove').then(setLicense).catch(toastError);
  };
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card card-pad col">
        <div className="row"><KeyRound /><div className="b grow" style={{ fontSize: 16 }}>License status</div><Badge color={color}>{label}</Badge></div>
        <div className="kv">
          {license.businessName && (<><div>Licensed to</div><div className="b"><bdi>{license.businessName}</bdi></div></>)}
          {license.plan && (<><div>Plan</div><div style={{ textTransform: 'capitalize' }}>{license.plan}</div></>)}
          {license.state === 'active' && (<><div>Expires</div><div>{license.expiresAt ? `${formatDate(license.expiresAt)} (${license.daysLeft} days left)` : 'Never (lifetime)'}</div></>)}
          {license.maxUsers > 0 && (<><div>Max users</div><div>{license.maxUsers}</div></>)}
          {license.licenseId && (<><div>This device</div><div>{license.device?.registered ? <span><Badge color={license.device.status === 'active' ? 'green' : 'red'}>{license.device.status}</Badge> {license.device.name}</span> : <Badge color="amber">Not registered</Badge>}</div></>)}
          {license.maxDevices > 0 && license.licenseId && (<><div>Devices allowed</div><div>{license.maxDevices}</div></>)}
          {license.state === 'trial' && (<><div>Trial</div><div>{license.trialDaysLeft} day(s) left</div></>)}
          <div>Computer ID</div><div className="mono b">{license.machineId}</div>
          {license.licenseId && (<><div>License ID</div><div className="mono small">{license.licenseId}</div></>)}
          {license.lastOnlineCheck && (<><div>Last online check</div><div>{formatDateTime(license.lastOnlineCheck)}</div></>)}
        </div>
        {license.message && <div className="small muted">{license.message}</div>}
        <div className="small faint">Support: {license.vendor?.name} · {license.vendor?.email}</div>
        {license.licenseId && <Button variant="danger-ghost" size="sm" onClick={remove} style={{ alignSelf: 'flex-start' }}>Remove license</Button>}
      </div>
      {license.configured && (
        <div className="card card-pad">
          <div className="b" style={{ marginBottom: 12, fontSize: 16 }}>{license.state === 'active' ? 'Update / renew license' : 'Activate license'}</div>
          <LicenseActivateForm />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ General
function GeneralTab() {
  const s = useSection('general');
  const { info, setInfo, toast, toastError, confirm, reloadSettings } = useApp();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const act = async (title, message, method, done) => {
    if (!(await confirm({ title, message, danger: method !== 'data.loadDemo', confirmText: 'Continue' }))) return;
    try {
      await api(method);
      await reloadSettings();
      toast(done);
    } catch (e) {
      toastError(e);
    }
  };
  const changePw = async () => {
    try {
      await api('auth.changePassword', pw);
      setPw({ currentPassword: '', newPassword: '' });
      toast('Password changed');
      api('app.info').then(setInfo).catch(() => {});
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <div className="card card-pad">
          <ToggleRow title="Show product images on POS" desc="Turn off on slow computers" checked={s.v.showImagesOnPos} onChange={s.set('showImagesOnPos')} />
          <div className="toggle-row">
            <div className="t"><div>POS product size</div></div>
            <Seg value={s.v.posGridSize} onChange={s.set('posGridSize')} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
          </div>
          <div className="toggle-row">
            <div className="t"><div>Currency symbol</div></div>
            <Input value={s.v.currency} onChange={(e) => s.set('currency')(e.target.value)} style={{ width: 100 }} />
          </div>
          <SaveBar s={s} />
        </div>
        <div className="card card-pad col">
          <div className="row"><Lock size={18} /><div className="b">Change my password</div></div>
          <div className="form-grid">
            <Field label="Current password"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password"><Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          </div>
          <Button onClick={changePw} disabled={!pw.currentPassword || !pw.newPassword} style={{ alignSelf: 'flex-start' }}>Change password</Button>
        </div>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <AboutCard info={info} />
        <div className="card card-pad col">
          <div className="b">Data</div>
          <div className="row"><FlaskConical size={18} className="faint" /><div className="grow small">Load a sample restaurant menu, tables, customers and a cashier (PIN 1111) to try the software.</div>
            <Button size="sm" onClick={() => act('Load demo data?', 'Sample categories, products, tables and customers will be added.', 'data.loadDemo', 'Demo data loaded')}>Load demo data</Button></div>
          <div className="row"><Trash2 size={18} className="faint" /><div className="grow small">Delete all orders, tokens and stock history. Products, users and settings stay. Make a backup first!</div>
            <Button size="sm" variant="danger-ghost" onClick={() => act('Clear all sales data?', 'All orders, payments, tokens and stock history will be permanently deleted. Create a backup first.', 'data.clearSales', 'Sales data cleared')}>Clear sales</Button></div>
          <div className="row"><AlertTriangle size={18} className="faint" /><div className="grow small">Factory reset: remove everything except your admin account and settings.</div>
            <Button size="sm" variant="danger-ghost" onClick={() => act('Factory reset?', 'ALL products, categories, customers, tables, orders and other users will be deleted. This cannot be undone without a backup.', 'data.factoryReset', 'Data reset')}>Factory reset</Button></div>
        </div>
        <div className="card card-pad col small">
          <div className="b" style={{ fontSize: 14 }}>About</div>
          <div className="kv">
            <div>Software</div><div>DT Retail POS v{info?.version}</div>
            <div>Data folder</div><div className="ellipsis">{info?.dataFolder}</div>
          </div>
          <div className="row">
            <Button size="sm" icon={FolderOpen} onClick={() => api('app.openDataFolder')}>Open data folder</Button>
            <Button size="sm" icon={FileText} onClick={() => api('app.openLogs')}>Open logs</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('business');
  const { settings } = useApp();
  if (!settings) return <Loading />;
  const C = { business: BusinessTab, appearance: AppearanceTab, receipt: ReceiptTab, printer: PrinterTab, token: TokenTab, sales: SalesTab, payment: PaymentTab, inventory: InventoryTab, backup: BackupTab, license: LicenseTab, general: GeneralTab }[tab];
  return (
    <div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <C key={tab} />
    </div>
  );
}
