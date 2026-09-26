import { useEffect, useState } from 'react';
import { Users2, Plus, Pencil, Trash2, Phone, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatDate, formatDateTime, orderTypeLabel } from '../lib/format';
import { PageHead, Button, SearchBox, Loading, Empty, Money, Modal, Field, Input, StatusBadge } from '../components/ui';
import OrderDetail from '../components/OrderDetail';

function CustomerView({ id, onClose, onEdit }) {
  const { toastError } = useApp();
  const [c, setC] = useState(null);
  const [order, setOrder] = useState(null);
  const load = () => api('customers.get', { id }).then(setC).catch(toastError);
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return null;
  return (
    <Modal title={c.name} icon={Users2} size="lg" onClose={onClose} footer={<Button icon={Pencil} onClick={() => onEdit(c)}>Edit customer</Button>}>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card card-pad"><div className="small faint">Orders</div><div className="b" style={{ fontSize: 20 }}>{c.stats.orders}</div></div>
        <div className="card card-pad"><div className="small faint">Total spent</div><div className="b" style={{ fontSize: 20 }}><Money value={c.stats.spent} /></div></div>
        <div className="card card-pad"><div className="small faint">Outstanding due</div><div className="b" style={{ fontSize: 20, color: c.stats.due > 0 ? 'var(--danger)' : undefined }}><Money value={c.stats.due} /></div></div>
      </div>
      <div className="kv small" style={{ marginBottom: 14 }}>
        <div>Mobile</div><div>{c.mobile || '—'}</div>
        <div>Address</div><div><bdi>{c.address || '—'}</bdi></div>
        <div>Notes</div><div><bdi>{c.notes || '—'}</bdi></div>
        <div>Customer since</div><div>{formatDate(c.created_at)}</div>
      </div>
      <div className="label" style={{ marginBottom: 6 }}>Purchase history</div>
      {c.orders.length === 0 ? (
        <div className="muted small">No orders yet.</div>
      ) : (
        <div className="card table-wrap" style={{ maxHeight: 280 }}>
          <table className="table">
            <thead><tr><th>Order</th><th>Date</th><th>Type</th><th>Status</th><th className="num">Total</th><th className="num">Due</th></tr></thead>
            <tbody>
              {c.orders.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => setOrder(o.id)}>
                  <td className="b">{o.order_no}</td>
                  <td className="muted">{formatDateTime(o.created_at)}</td>
                  <td>{orderTypeLabel(o.order_type)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="num"><Money value={o.total} /></td>
                  <td className="num">{o.due > 0 ? <span style={{ color: 'var(--danger)' }}><Money value={o.due} /></span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {order && <OrderDetail id={order} onClose={() => setOrder(null)} onChanged={load} />}
    </Modal>
  );
}

export default function Customers() {
  const { toast, toastError, confirm } = useApp();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);

  const load = () => api('customers.list', { search }).then(setRows).catch(toastError);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      await api('customers.save', edit);
      toast('Customer saved');
      setEdit(null);
      load();
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${edit.name}?`, message: 'Past orders keep the customer name.', danger: true, confirmText: 'Delete' }))) return;
    try {
      await api('customers.remove', { id: edit.id });
      setEdit(null);
      setView(null);
      load();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Customers" sub="Customers are saved automatically from delivery and credit orders.">
        <Button variant="primary" icon={Plus} onClick={() => setEdit({ name: '', mobile: '', address: '', notes: '' })}>Add Customer</Button>
      </PageHead>
      <div className="card card-pad"><SearchBox value={search} onChange={setSearch} placeholder="Search by name or mobile…" /></div>
      <div className="card">
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={Users2} title="No customers" text={search ? 'No match for your search.' : 'Customers you add or who order delivery will appear here.'} />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 290px)' }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Mobile</th><th>Address</th><th className="num">Orders</th><th className="num">Total spent</th><th className="num">Due</th><th>Last order</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setView(c.id)}>
                    <td className="b"><bdi>{c.name}</bdi></td>
                    <td>{c.mobile ? <span className="row" style={{ gap: 6 }}><Phone size={13} className="faint" />{c.mobile}</span> : '—'}</td>
                    <td className="muted ellipsis" style={{ maxWidth: 260 }}>{c.address ? <span><MapPin size={13} /> <bdi>{c.address}</bdi></span> : '—'}</td>
                    <td className="num">{c.order_count}</td>
                    <td className="num"><Money value={c.total_spent} /></td>
                    <td className="num">{c.total_due > 0 ? <span className="badge red"><Money value={c.total_due} /></span> : '—'}</td>
                    <td className="muted">{c.last_order ? formatDate(c.last_order) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {view && !edit && <CustomerView id={view} onClose={() => setView(null)} onEdit={(c) => setEdit(c)} />}
      {edit && (
        <Modal
          title={edit.id ? 'Edit Customer' : 'Add Customer'}
          icon={Users2}
          onClose={() => setEdit(null)}
          footer={
            <>
              {edit.id && <Button variant="danger-ghost" icon={Trash2} onClick={remove} style={{ marginRight: 'auto' }}>Delete</Button>}
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" onClick={save}>Save</Button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Name *"><Input autoFocus dir="auto" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Mobile"><Input value={edit.mobile || ''} onChange={(e) => setEdit({ ...edit, mobile: e.target.value })} placeholder="03XX-XXXXXXX" /></Field>
            <Field label="Address" className="full"><textarea className="textarea" dir="auto" rows={2} value={edit.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            <Field label="Notes" className="full"><Input dir="auto" value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="e.g. Regular customer, prefers less spicy" /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
