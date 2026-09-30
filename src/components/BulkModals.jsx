import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Download, Upload, Images, FolderOpen, CheckCircle2, AlertTriangle, Gift, Plus, Minus, Trash2, ImagePlus, X, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { readImage } from '../lib/image';
import { Modal, Button, Field, Input, NumberInput, Select, Check, Badge, Money } from './ui';

const toB64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.readAsDataURL(file);
  });

// ------------------------------------------------------------------ Excel / CSV menu import
export function ImportMenuModal({ onClose, onDone }) {
  const { toast, toastError } = useApp();
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [update, setUpdate] = useState(true);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const ref = useRef(null);

  const pick = async (file) => {
    if (!file) return;
    setBusy('parse');
    setResult(null);
    try {
      const data = await toB64(file);
      setParsed(await api('products.importParse', { name: file.name, data }));
      setFileName(file.name);
    } catch (e) {
      toastError(e);
      setParsed(null);
    } finally {
      setBusy('');
    }
  };
  const download = async (kind) => {
    try {
      const r = await api('products.template', { kind });
      if (!r.canceled) toast('Excel file saved');
    } catch (e) {
      toastError(e);
    }
  };
  const apply = async () => {
    setBusy('apply');
    try {
      const r = await api('products.importApply', { rows: parsed.rows, updateExisting: update });
      setResult(r);
      toast(`${r.created} added, ${r.updated} updated`);
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const c = parsed?.counts;
  return (
    <Modal
      title="Import menu from Excel / CSV"
      icon={FileSpreadsheet}
      size="lg"
      onClose={onClose}
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={Upload} onClick={apply} loading={busy === 'apply'} disabled={!parsed || c.new + (update ? c.update : 0) === 0}>
              Import {parsed ? c.new + (update ? c.update : 0) : ''} items
            </Button>
          </>
        )
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="row wrap">
          <Button icon={Download} onClick={() => download('template')}>Download Excel template</Button>
          <Button icon={Download} onClick={() => download('menu')}>Export current menu</Button>
          <div className="small muted">Columns: <b>Name, Category, Price</b> (required) · Cost, Discount, Code, Barcode, Unit, Stock (optional). New categories are created automatically.</div>
        </div>
        <div className="bulk-drop" onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
          <FileSpreadsheet size={34} color="var(--primary)" />
          <div className="b" style={{ marginTop: 6 }}>{fileName || 'Click to choose your menu file (.xlsx or .csv)'}</div>
          <div className="small muted">{busy === 'parse' ? 'Reading…' : 'or drag and drop it here'}</div>
          <input ref={ref} type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {parsed && !result && (
          <>
            <div className="row wrap">
              <Badge color="green">{c.new} new</Badge>
              <Badge color="blue">{c.update} existing</Badge>
              {c.error > 0 && <Badge color="red">{c.error} with problems (skipped)</Badge>}
              <div className="grow" />
              <Check label="Update price / details of items that already exist" checked={update} onChange={setUpdate} />
            </div>
            <div className="table-wrap" style={{ maxHeight: 280 }}>
              <table className="table">
                <thead><tr><th>#</th><th>Name</th><th>Category</th><th className="num">Price</th><th>Result</th></tr></thead>
                <tbody>
                  {parsed.rows.slice(0, 300).map((r) => (
                    <tr key={r.line}>
                      <td className="muted">{r.line}</td>
                      <td><bdi>{r.name || '—'}</bdi></td>
                      <td><bdi>{r.category || '—'}</bdi></td>
                      <td className="num">{Number.isNaN(r.sale_price) ? '—' : <Money value={r.sale_price} />}</td>
                      <td>{r.status === 'error' ? <span className="badge red">{r.error}</span> : r.status === 'update' ? <span className="badge blue">Update</span> : <span className="badge green">New</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 300 && <div className="small muted">Showing the first 300 of {parsed.rows.length} rows — all valid rows are imported.</div>}
          </>
        )}
        {result && (
          <div className="col" style={{ gap: 8 }}>
            <div className="row"><CheckCircle2 color="var(--success)" /><b>{result.created} added · {result.updated} updated{result.categoriesCreated ? ` · ${result.categoriesCreated} new categories` : ''}{result.skipped ? ` · ${result.skipped} skipped` : ''}</b></div>
            {result.errors.map((e) => <div key={e} className="badge red" style={{ whiteSpace: 'normal' }}>{e}</div>)}
            <div className="small muted">Next: use <b>Bulk pictures</b> to add photos — they are matched to these items by file name.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ bulk pictures
const normName = (s) => String(s || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[\s_\-.()\[\]]+/g, ' ').replace(/[^a-z0-9؀-ۿ ]/g, '').replace(/\s+/g, ' ').trim();
const squash = (s) => normName(s).replace(/ /g, '');

/** Best menu item for a picture's file name (exact name, code/barcode, then closest containing name). */
export function matchProduct(fileName, products) {
  const f = squash(fileName);
  if (!f) return null;
  const base = String(fileName).replace(/\.[a-z0-9]+$/i, '').trim().toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const p of products) {
    const n = squash(p.name);
    let score = 0;
    if (n === f) score = 100;
    else if ((p.sku && p.sku.toLowerCase() === base) || (p.barcode && p.barcode === base)) score = 95;
    else if (f.length >= 4 && n.length >= 4 && (n.includes(f) || f.includes(n))) score = 50 + Math.round((Math.min(n.length, f.length) / Math.max(n.length, f.length)) * 40);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore >= 60 ? { product: best, score: bestScore } : null;
}

export function BulkPicturesModal({ products, onClose, onDone }) {
  const { toast, toastError } = useApp();
  const [items, setItems] = useState(null); // [{ key, file name, preview, productId }]
  const [overwrite, setOverwrite] = useState(true);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const filesRef = useRef(null);
  const dirRef = useRef(null);
  const list = useMemo(() => products.filter((p) => !p.is_deal || true), [products]);

  const load = async (fileList) => {
    const files = [...fileList].filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type));
    if (!files.length) return toastError(new Error('No PNG / JPG pictures found.'));
    setBusy('read');
    setProgress(0);
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const image = await readImage(f, { maxSize: 480, type: 'image/webp' });
        const m = matchProduct(f.name, list);
        out.push({ key: `${f.name}-${i}`, name: f.name, image, productId: m ? m.product.id : '' });
      } catch {
        out.push({ key: `${f.name}-${i}`, name: f.name, image: null, productId: '', bad: true });
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }
    setItems(out);
    setBusy('');
  };

  const setMatch = (key, productId) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, productId } : x)));
  const byId = useMemo(() => new Map(list.map((p) => [String(p.id), p])), [list]);
  const ready = (items || []).filter((x) => x.image && x.productId && (overwrite || !byId.get(String(x.productId))?.has_image));
  const unmatched = (items || []).filter((x) => !x.productId || x.bad).length;

  const apply = async () => {
    setBusy('save');
    try {
      // last picture wins when several files point to one item
      const latest = new Map();
      ready.forEach((x) => latest.set(String(x.productId), x));
      const payload = [...latest.values()].map((x) => ({ id: Number(x.productId), name: x.name, image: x.image }));
      let saved = 0;
      const errors = [];
      for (let i = 0; i < payload.length; i += 15) {
        const r = await api('products.setImages', { items: payload.slice(i, i + 15) });
        saved += r.saved;
        errors.push(...r.errors);
        setProgress(Math.round(((i + 15) / payload.length) * 100));
      }
      toast(`${saved} pictures added to the menu`);
      if (errors.length) toastError(new Error(errors.slice(0, 3).join('\n')));
      onDone();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal
      title="Bulk pictures — match by name"
      icon={Images}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={CheckCircle2} onClick={apply} loading={busy === 'save'} disabled={!ready.length}>Add {ready.length} pictures</Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="small muted">Name each picture like the menu item (e.g. <b>Zinger Burger.jpg</b>, <b>chicken-biryani.png</b>). The app matches the file name to the item name automatically — you can fix any match below.</div>
        <div className="row wrap">
          <Button icon={Images} onClick={() => filesRef.current?.click()}>Choose pictures…</Button>
          <Button icon={FolderOpen} onClick={() => dirRef.current?.click()}>Choose a whole folder…</Button>
          <input ref={filesRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { load(e.target.files); e.target.value = ''; }} />
          <input ref={dirRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={(e) => { load(e.target.files); e.target.value = ''; }} />
          {busy === 'read' && <span className="small muted">Preparing pictures… {progress}%</span>}
        </div>
        {items && (
          <>
            <div className="row wrap">
              <Badge color="green">{items.length - unmatched} matched</Badge>
              {unmatched > 0 && <Badge color="amber">{unmatched} not matched — choose an item or skip</Badge>}
              <div className="grow" />
              <Check label="Replace pictures that items already have" checked={overwrite} onChange={setOverwrite} />
            </div>
            <div className="match-grid" style={{ maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
              {items.map((x) => (
                <div key={x.key} className={`match-card ${!x.productId ? 'unmatched' : ''}`}>
                  {x.image ? <img src={x.image} alt="" /> : <div className="thumb" style={{ width: 54, height: 54 }}><AlertTriangle size={20} /></div>}
                  <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
                    <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.name}>{x.name}</div>
                    <select className="select" style={{ height: 32, fontSize: 13 }} value={x.productId} disabled={x.bad} onChange={(e) => setMatch(x.key, e.target.value)}>
                      <option value="">— skip —</option>
                      {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {busy === 'save' && <div className="small muted">Saving… {Math.min(100, progress)}%</div>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ deals
export function DealForm({ deal, categories, products, onClose, onSaved }) {
  const { toast, toastError } = useApp();
  const pool = useMemo(() => products.filter((p) => !p.is_deal && p.active), [products]);
  const [f, setF] = useState(() => ({ name: '', category_id: '', sale_price: '', active: true, image: undefined, ...deal, is_deal: undefined }));
  const [items, setItems] = useState(() => (deal?.deal_items || []).map((d) => ({ productId: d.productId, qty: d.qty })));
  const [preview, setPreview] = useState(deal?.image_url || null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const regular = items.reduce((s, it) => s + (byId.get(it.productId)?.sale_price || 0) * it.qty, 0);
  const cost = items.reduce((s, it) => s + (byId.get(it.productId)?.cost_price || 0) * it.qty, 0);
  const price = Number(f.sale_price) || 0;
  const add = (p) => setItems((xs) => (xs.some((x) => x.productId === p.id) ? xs.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x)) : [...xs, { productId: p.id, qty: 1 }]));
  const step = (pid, d) => setItems((xs) => xs.map((x) => (x.productId === pid ? { ...x, qty: Math.max(1, x.qty + d) } : x)));
  const results = q.trim() ? pool.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await readImage(file, { maxSize: 480, type: 'image/webp' });
      setF((x) => ({ ...x, image: data }));
      setPreview(data);
    } catch (err) {
      toastError(err);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api('products.save', { ...f, isDeal: true, dealItems: items, track_stock: false, cost_price: 0, discount: 0 });
      toast(deal?.id ? 'Deal updated' : 'Deal created');
      onSaved();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={deal?.id ? 'Edit Deal' : 'Create Deal'}
      icon={Gift}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!f.name.trim() || !items.length || !(price >= 0)}>Save Deal</Button>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 22 }}>
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
            <div className="thumb" style={{ width: 120, height: 100, borderRadius: 14, cursor: 'pointer', flexShrink: 0, border: '2px dashed var(--border-strong)', background: 'var(--surface-3)' }} onClick={() => fileRef.current?.click()}>
              {preview ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="col" style={{ alignItems: 'center', gap: 4, color: 'var(--text-3)' }}><ImagePlus size={24} /><span className="small">Picture</span></div>}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickImage} />
            <div className="col grow" style={{ gap: 10 }}>
              <Field label="Deal name *"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Family Deal / Student Combo" dir="auto" /></Field>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Category"><Select value={f.category_id || ''} onChange={(e) => setF({ ...f, category_id: e.target.value ? Number(e.target.value) : null })} options={[{ value: '', label: '— No category —' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} /></Field>
            <Field label="Deal price *" hint={regular > 0 ? `Regular price Rs. ${regular.toLocaleString('en-PK')}` : ''}><NumberInput value={f.sale_price} onChange={(v) => setF({ ...f, sale_price: v })} placeholder="0" /></Field>
          </div>
          {regular > 0 && (
            <div className="card card-pad row wrap" style={{ background: 'var(--primary-50)', borderColor: 'transparent', gap: 18 }}>
              <div><div className="small muted">Regular total</div><b><Money value={regular} /></b></div>
              <div><div className="small muted">Customer saves</div><b style={{ color: regular - price >= 0 ? 'var(--success)' : 'var(--danger)' }}><Money value={regular - price} /></b></div>
              <div><div className="small muted">Your cost</div><b><Money value={cost} /></b></div>
              <div><div className="small muted">Profit</div><b style={{ color: price - cost >= 0 ? 'var(--success)' : 'var(--danger)' }}><Money value={price - cost} /></b></div>
            </div>
          )}
          <Check label="Show this deal on the POS" checked={f.active !== false} onChange={(v) => setF({ ...f, active: v })} />
          <div className="small faint">When a deal is sold, the stock of each item inside it is reduced automatically, and the receipt / token lists what the deal includes.</div>
        </div>

        <div className="col" style={{ gap: 10 }}>
          <div className="label">What is inside the deal</div>
          <div className="input-icon"><Search size={16} /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search menu items to add…" /></div>
          {results.length > 0 && (
            <div className="col" style={{ gap: 4, border: '1px solid var(--border)', borderRadius: 12, padding: 6 }}>
              {results.map((p) => (
                <button key={p.id} type="button" className="row" style={{ gap: 8, padding: '6px 8px', borderRadius: 8, background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => { add(p); setQ(''); }}>
                  <Plus size={15} color="var(--primary)" /> <b className="grow"><bdi>{p.name}</bdi></b> <span className="muted small"><Money value={p.sale_price} /></span>
                </button>
              ))}
            </div>
          )}
          {items.length === 0 ? (
            <div className="muted small center" style={{ padding: 20, border: '1px dashed var(--border-strong)', borderRadius: 12 }}>Search and add the items that make up this deal.</div>
          ) : (
            items.map((it) => {
              const p = byId.get(it.productId);
              return (
                <div key={it.productId} className="row" style={{ gap: 8, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div className="grow"><b><bdi>{p?.name || 'Removed item'}</bdi></b><div className="small muted"><Money value={p?.sale_price || 0} /> each</div></div>
                  <Button size="sm" icon={Minus} onClick={() => step(it.productId, -1)} />
                  <b style={{ minWidth: 24, textAlign: 'center' }}>{it.qty}</b>
                  <Button size="sm" icon={Plus} onClick={() => step(it.productId, 1)} />
                  <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setItems((xs) => xs.filter((x) => x.productId !== it.productId))} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
