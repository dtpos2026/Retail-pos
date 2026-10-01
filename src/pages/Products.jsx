import { useEffect, useMemo, useRef, useState } from 'react';
import { Package, Plus, Pencil, Trash2, ImagePlus, X, Barcode, Gift, FileSpreadsheet, Images } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { readImage } from '../lib/image';
import { initials, formatQty } from '../lib/format';
import { ImportMenuModal, BulkPicturesModal, DealForm } from '../components/BulkModals';
import { PageHead, Button, SearchBox, Select, Loading, Empty, Money, Modal, Field, Input, NumberInput, Switch, Badge } from '../components/ui';

const UNITS = ['pcs', 'plate', 'kg', 'g', 'litre', 'ml', 'dozen', 'pack', 'bottle', 'box', 'cup', 'glass', 'serving'];

function ProductForm({ product, categories, allProducts = [], onClose, onSaved }) {
  const { toast, toastError, settings, confirm } = useApp();
  const [f, setF] = useState(() => ({
    name: '', sku: '', barcode: '', category_id: categories[0]?.id || '', sale_price: '', cost_price: '', discount: 0,
    stock_qty: 0, low_stock: 5, unit: 'pcs', track_stock: true, active: true, weighed: false, is_ingredient: false, variants: [], recipe: [], ...product, image: undefined,
  }));
  const [ingQ, setIngQ] = useState('');
  const [preview, setPreview] = useState(product?.image_url || null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

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

  const save = async (addAnother) => {
    setBusy(true);
    try {
      await api('products.save', f);
      toast(product?.id ? 'Product updated' : 'Product added');
      onSaved();
      if (addAnother) {
        setF((x) => ({ ...x, id: undefined, name: '', sku: '', barcode: '', sale_price: '', cost_price: '', discount: 0, stock_qty: 0, image: undefined }));
        setPreview(null);
      } else onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete "${product.name}"?`, message: 'Products that were already sold are deactivated instead of deleted, so your reports stay correct.', danger: true, confirmText: 'Delete' }))) return;
    try {
      const r = await api('products.remove', { id: product.id });
      toast(r.deactivated ? 'Product deactivated (it has sales history)' : 'Product deleted');
      onSaved();
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  const margin = Number(f.sale_price) > 0 && Number(f.cost_price) > 0 ? Math.round(((f.sale_price - f.discount - f.cost_price) / (f.sale_price - f.discount)) * 100) : null;

  return (
    <Modal
      title={product?.id ? 'Edit Product' : 'Add Product'}
      icon={Package}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {product?.id && <Button variant="danger-ghost" icon={Trash2} onClick={remove} style={{ marginRight: 'auto' }}>Delete</Button>}
          <Button onClick={onClose}>Cancel</Button>
          {!product?.id && <Button onClick={() => save(true)} loading={busy}>Save &amp; add another</Button>}
          <Button variant="primary" onClick={() => save(false)} loading={busy}>Save Product</Button>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: '180px 1fr', gap: 20 }}>
        <div className="col">
          <div
            className="thumb"
            style={{ width: 180, height: 150, borderRadius: 14, cursor: 'pointer', background: preview ? '#fff' : 'var(--surface-3)', border: '2px dashed var(--border-strong)', color: 'var(--text-3)' }}
            onClick={() => fileRef.current?.click()}
          >
            {preview ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="col" style={{ alignItems: 'center', gap: 6 }}><ImagePlus size={28} /><span className="small">Add image</span></div>}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickImage} />
          {preview && <Button size="sm" variant="danger-ghost" icon={X} onClick={() => { setF((x) => ({ ...x, image: null })); setPreview(null); }}>Remove image</Button>}
          <div className="small faint">Optional. PNG/JPG — resized automatically.</div>
          <div className="toggle-row" style={{ borderBottom: 0 }}>
            <div className="t"><div>Active</div><div>Show on POS</div></div>
            <Switch checked={f.active} onChange={set('active')} />
          </div>
        </div>
        <div className="form-grid">
          <Field label="Product name *" className="full">
            <Input autoFocus value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g. Zinger Burger / زنگر برگر" dir="auto" />
          </Field>
          <Field label="Category">
            <Select value={f.category_id || ''} onChange={(e) => set('category_id')(e.target.value ? Number(e.target.value) : null)} options={[{ value: '', label: '— No category —' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          </Field>
          <Field label="Unit">
            <Select value={f.unit} onChange={(e) => set('unit')(e.target.value)} options={[...new Set([...UNITS, f.unit])].map((u) => ({ value: u, label: u }))} />
          </Field>
          <Field label="Sale price *"><NumberInput value={f.sale_price} onChange={set('sale_price')} placeholder="0" /></Field>
          <Field label="Cost price" hint={margin !== null ? `Margin ${margin}%` : 'Used for profit reports'}><NumberInput value={f.cost_price} onChange={set('cost_price')} placeholder="0" /></Field>
          <Field label="Discount per unit" hint="Applied automatically on POS"><NumberInput value={f.discount} onChange={set('discount')} /></Field>
          <Field label="Code / SKU"><Input value={f.sku || ''} onChange={(e) => set('sku')(e.target.value)} placeholder="e.g. BRG-01" /></Field>
          <Field label="Barcode" className="full">
            <div className="input-icon"><Barcode size={17} /><Input value={f.barcode || ''} onChange={(e) => set('barcode')(e.target.value)} placeholder="Scan or type barcode" /></div>
          </Field>
          <div className="full card card-pad col" style={{ background: 'var(--surface-2)', gap: 10 }}>
            <div className="row">
              <div className="grow"><div className="b">Sold by weight / measure</div><div className="small faint">Tap the item on the POS and type the quantity on a number pad (e.g. 1.5 kg). Price = quantity × price per {f.unit}.</div></div>
              <Switch checked={!!f.weighed} onChange={(on) => setF((x) => ({ ...x, weighed: on, unit: on && !['kg', 'g', 'litre', 'ml'].includes(x.unit) ? 'kg' : x.unit }))} />
            </div>
            <div className="row">
              <div className="grow"><div className="b">Ingredient / raw material</div><div className="small faint">Hidden from the POS screen. Use it inside recipes (flour, cheese, beef…). Buy it with Inventory → Stock In.</div></div>
              <Switch checked={!!f.is_ingredient} onChange={set('is_ingredient')} />
            </div>
          </div>
          <div className="full card card-pad col" style={{ background: 'var(--surface-2)', gap: 8 }}>
            <div className="row"><div className="grow"><div className="b">Variants (sizes)</div><div className="small faint">e.g. Small / Medium / Large — each with its own price. The cashier picks one when tapping the item.</div></div>
              <Button size="sm" icon={Plus} onClick={() => setF((x) => ({ ...x, variants: [...(x.variants || []), { name: '', price: '', recipe_factor: 1 }] }))}>Add size</Button></div>
            {(f.variants || []).map((v, i) => (
              <div key={v.id || i} className="row" style={{ gap: 8 }}>
                <Input placeholder="Size name (Small)" value={v.name} onChange={(e) => setF((x) => ({ ...x, variants: x.variants.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))} />
                <NumberInput style={{ maxWidth: 130 }} placeholder="Price" value={v.price} onChange={(val) => setF((x) => ({ ...x, variants: x.variants.map((y, j) => (j === i ? { ...y, price: val } : y)) }))} />
                {(f.recipe || []).length > 0 && <NumberInput style={{ maxWidth: 110 }} title="Recipe size factor (Small 0.7, Large 1.5)" placeholder="× recipe" value={v.recipe_factor} onChange={(val) => setF((x) => ({ ...x, variants: x.variants.map((y, j) => (j === i ? { ...y, recipe_factor: val } : y)) }))} />}
                <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setF((x) => ({ ...x, variants: x.variants.filter((_, j) => j !== i) }))} />
              </div>
            ))}
          </div>
          <div className="full card card-pad col" style={{ background: 'var(--surface-2)', gap: 8 }}>
            <div className="row"><div className="grow"><div className="b">Recipe management</div><div className="small faint">Ingredients used for ONE sale. Stock of each ingredient is reduced automatically and the cost price is calculated from them.</div></div></div>
            {(f.recipe || []).map((r, i) => {
              const ing = allProducts.find((p) => p.id === r.ingredientId) || r;
              return (
                <div key={r.ingredientId || i} className="row" style={{ gap: 8 }}>
                  <b className="grow"><bdi>{ing.name}</bdi></b>
                  <NumberInput style={{ maxWidth: 110 }} value={r.qty} onChange={(val) => setF((x) => ({ ...x, recipe: x.recipe.map((y, j) => (j === i ? { ...y, qty: val } : y)) }))} />
                  <span className="muted small" style={{ minWidth: 40 }}>{ing.unit}</span>
                  <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setF((x) => ({ ...x, recipe: x.recipe.filter((_, j) => j !== i) }))} />
                </div>
              );
            })}
            <div className="input-icon"><Input placeholder="Search an ingredient to add…" value={ingQ} onChange={(e) => setIngQ(e.target.value)} /></div>
            {ingQ.trim() && (
              <div className="col" style={{ gap: 4, border: '1px solid var(--border)', borderRadius: 10, padding: 6 }}>
                {allProducts.filter((p) => !p.is_deal && p.id !== f.id && p.name.toLowerCase().includes(ingQ.trim().toLowerCase()) && !(f.recipe || []).some((r) => r.ingredientId === p.id)).slice(0, 6).map((p) => (
                  <button key={p.id} type="button" className="row" style={{ gap: 8, padding: '6px 8px', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => { setF((x) => ({ ...x, recipe: [...(x.recipe || []), { ingredientId: p.id, qty: 1 }] })); setIngQ(''); }}>
                    <Plus size={14} color="var(--primary)" /><b className="grow"><bdi>{p.name}</bdi></b><span className="muted small">{p.unit}{p.is_ingredient ? ' · ingredient' : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {(f.recipe || []).length > 0 && <div className="small muted">Cost per sale: <b>Rs. {Math.round((f.recipe || []).reduce((s, r) => s + (Number(r.qty) || 0) * ((allProducts.find((p) => p.id === r.ingredientId) || r).cost_price || 0), 0) * 100) / 100}</b></div>}
          </div>
          <div className="full card card-pad" style={{ background: 'var(--surface-2)' }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <div className="grow"><div className="b">Track stock</div><div className="small faint">{settings.inventory.enabled ? 'Sales reduce stock automatically.' : 'Inventory is disabled in Settings — stock will not change.'}</div></div>
              <Switch checked={f.track_stock} onChange={set('track_stock')} />
            </div>
            {f.track_stock && (
              <div className="form-grid">
                {!product?.id ? (
                  <Field label="Opening stock"><NumberInput value={f.stock_qty} onChange={set('stock_qty')} /></Field>
                ) : (
                  <Field label="Current stock" hint="Change from Inventory → Stock In/Adjust"><Input value={`${formatQty(product.stock_qty)} ${product.unit}`} disabled /></Field>
                )}
                <Field label="Low stock alert at"><NumberInput value={f.low_stock} onChange={set('low_stock')} /></Field>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function Products() {
  const { toastError, settings } = useApp();
  const [rows, setRows] = useState(null);
  const [cats, setCats] = useState([]);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState(null);
  const [tool, setTool] = useState(null); // 'import' | 'pictures' | 'deal'
  const [deal, setDeal] = useState(null);

  const openRow = async (p) => {
    if (!p.is_deal) {
      try {
        return setEdit(await api('products.get', { id: p.id }));
      } catch (e) {
        return toastError(e);
      }
    }
    try {
      setDeal(await api('products.get', { id: p.id }));
    } catch (e) {
      toastError(e);
    }
  };

  const load = () => api('products.list', {}).then(setRows).catch(toastError);
  useEffect(() => {
    load();
    api('categories.list').then(setCats).catch(toastError);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = search.trim().toLowerCase();
    return rows.filter(
      (p) =>
        (!cat || String(p.category_id) === cat) &&
        (!status || (status === 'active' ? p.active : status === 'inactive' ? !p.active : p.track_stock && p.stock_qty <= p.low_stock)) &&
        (!s || p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s) || (p.barcode || '').includes(s))
    );
  }, [rows, search, cat, status]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Products" sub={rows ? `${rows.length} products` : ''}>
        <Button icon={FileSpreadsheet} onClick={() => setTool('import')}>Import Excel</Button>
        <Button icon={Images} onClick={() => setTool('pictures')} disabled={!rows?.length}>Bulk pictures</Button>
        <Button icon={Gift} onClick={() => setDeal({})}>Create Deal</Button>
        <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>Add Product</Button>
      </PageHead>
      <div className="card card-pad row wrap">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name, code or barcode…" style={{ flex: 1, minWidth: 260 }} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 200 }} options={[{ value: '', label: 'All categories' }, ...cats.map((c) => ({ value: String(c.id), label: c.name }))]} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 160 }} options={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'low', label: 'Low stock' }]} />
      </div>
      <div className="card">
        {!rows ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty icon={Package} title={rows.length ? 'No products match' : 'No products yet'} text={rows.length ? 'Try a different search.' : 'Add your first product, or load demo data from Settings → General.'} action={!rows.length && <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>Add Product</Button>} />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 290px)' }}>
            <table className="table">
              <thead>
                <tr><th>Product</th><th>Category</th><th>Code</th><th className="num">Price</th><th className="num">Cost</th>{settings.inventory.enabled && <th className="num">Stock</th>}<th>Status</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => openRow(p)}>
                    <td>
                      <div className="row">
                        {p.image_url ? <img className="thumb" src={p.image_url} alt="" /> : <div className="thumb" style={{ background: p.category_color || '#6366f1' }}>{initials(p.name)}</div>}
                        <div><div className="b"><bdi>{p.name}</bdi> {p.is_deal && <span className="badge amber" style={{ marginLeft: 4 }}>DEAL</span>}</div><div className="small faint">{p.is_deal ? p.deal_text : p.unit}</div></div>
                      </div>
                    </td>
                    <td>{p.category_name ? <span className="row" style={{ gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 5, background: p.category_color }} /><bdi>{p.category_name}</bdi></span> : <span className="faint">—</span>}</td>
                    <td className="muted">{p.sku || p.barcode || '—'}</td>
                    <td className="num b"><Money value={p.sale_price} />{p.discount > 0 && <div className="small" style={{ color: 'var(--success)' }}>−<Money value={p.discount} /></div>}</td>
                    <td className="num muted">{p.cost_price ? <Money value={p.cost_price} /> : '—'}</td>
                    {settings.inventory.enabled && (
                      <td className="num">{p.track_stock ? <Badge color={p.stock_qty <= 0 ? 'red' : p.stock_qty <= p.low_stock ? 'amber' : 'green'}>{formatQty(p.stock_qty)}</Badge> : <span className="faint">—</span>}</td>
                    )}
                    <td>{p.active ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    <td className="right"><Button size="sm" variant="ghost" icon={Pencil} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {tool === 'import' && <ImportMenuModal onClose={() => setTool(null)} onDone={() => { load(); api('categories.list').then(setCats).catch(() => {}); }} />}
      {tool === 'pictures' && rows && <BulkPicturesModal products={rows} onClose={() => setTool(null)} onDone={load} />}
      {deal && rows && <DealForm deal={deal.id ? deal : null} categories={cats} products={rows} onClose={() => setDeal(null)} onSaved={load} />}
      {edit && <ProductForm product={edit.id ? edit : null} categories={cats} allProducts={rows || []} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}
