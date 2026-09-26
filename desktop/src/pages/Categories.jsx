import { useEffect, useState } from 'react';
import { Tags, Plus, ArrowUp, ArrowDown, Pencil, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { PageHead, Button, Loading, Empty, Modal, Field, Input, Switch, Badge } from '../components/ui';
import { CategoryIcon, CATEGORY_ICONS, CATEGORY_COLORS } from '../components/CategoryIcon';

export default function Categories() {
  const { toast, toastError, confirm } = useApp();
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);

  const load = () => api('categories.list').then(setRows).catch(toastError);
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const move = async (i, dir) => {
    const ids = rows.map((r) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setRows(ids.map((id) => rows.find((r) => r.id === id)));
    try {
      await api('categories.reorder', { ids });
    } catch (e) {
      toastError(e);
      load();
    }
  };

  const toggle = async (c, active) => {
    try {
      await api('categories.save', { ...c, active });
      load();
    } catch (e) {
      toastError(e);
    }
  };

  const save = async () => {
    try {
      await api('categories.save', edit);
      toast('Category saved');
      setEdit(null);
      load();
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete "${edit.name}"?`, danger: true, confirmText: 'Delete' }))) return;
    try {
      await api('categories.remove', { id: edit.id });
      toast('Category deleted');
      setEdit(null);
      load();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Categories" sub="Categories appear as tabs on the POS screen in this order.">
        <Button variant="primary" icon={Plus} onClick={() => setEdit({ name: '', color: CATEGORY_COLORS[(rows?.length || 0) % CATEGORY_COLORS.length], icon: 'tag', active: true })}>Add Category</Button>
      </PageHead>
      <div className="card">
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={Tags} title="No categories yet" text="Create categories like Burgers, Biryani, Drinks or Grocery." />
        ) : (
          rows.map((c, i) => (
            <div key={c.id} className="list-item">
              <div className="col" style={{ gap: 2 }}>
                <Button size="sm" variant="ghost" icon={ArrowUp} onClick={() => move(i, -1)} disabled={i === 0} title="Move up" />
                <Button size="sm" variant="ghost" icon={ArrowDown} onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move down" />
              </div>
              <div className="thumb" style={{ background: c.color }}><CategoryIcon name={c.icon} size={20} /></div>
              <div className="grow">
                <div className="b" style={{ fontSize: 15 }}><bdi>{c.name}</bdi></div>
                <div className="small faint">{c.product_count} products</div>
              </div>
              {!c.active && <Badge>Hidden on POS</Badge>}
              <Switch checked={c.active} onChange={(v) => toggle(c, v)} />
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit(c)}>Edit</Button>
            </div>
          ))
        )}
      </div>
      {edit && (
        <Modal
          title={edit.id ? 'Edit Category' : 'Add Category'}
          icon={Tags}
          onClose={() => setEdit(null)}
          footer={
            <>
              {edit.id && <Button variant="danger-ghost" icon={Trash2} onClick={remove} style={{ marginRight: 'auto' }}>Delete</Button>}
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" onClick={save}>Save</Button>
            </>
          }
        >
          <div className="col" style={{ gap: 16 }}>
            <Field label="Category name">
              <Input autoFocus dir="auto" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. Burgers" />
            </Field>
            <Field label="Colour">
              <div className="swatches">
                {CATEGORY_COLORS.map((col) => (
                  <div key={col} className={`swatch ${edit.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => setEdit({ ...edit, color: col })} />
                ))}
              </div>
            </Field>
            <Field label="Icon">
              <div className="icon-pick">
                {Object.keys(CATEGORY_ICONS).map((k) => (
                  <button key={k} className={edit.icon === k ? 'on' : ''} onClick={() => setEdit({ ...edit, icon: k })} title={k}>
                    <CategoryIcon name={k} size={18} />
                  </button>
                ))}
              </div>
            </Field>
            <div className="row">
              <div className="thumb" style={{ background: edit.color }}><CategoryIcon name={edit.icon} size={20} /></div>
              <div className="b"><bdi>{edit.name || 'Preview'}</bdi></div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
