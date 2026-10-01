import { useEffect, useMemo, useState } from 'react';
import { History, Trash2, Download } from 'lucide-react';
import { watch, orderBy, limit, pruneActivity, countActivity } from '../lib/data';
import { useAdmin } from '../context';
import { fmtDateTime, tsToDate } from '../lib/format';
import { PageHead, Loading, Empty, Badge, Button, SearchBox } from '../components/ui';

const COLORS = { create: 'green', renew: 'indigo', revoked: 'red', suspended: 'amber', active: 'green', delete: 'red', update: 'blue', signing: 'indigo', save: 'blue', remove: 'red' };

export default function Activity() {
  const { toastError, toast, confirm, isHead } = useAdmin();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => watch('activity', setRows, toastError, orderBy('at', 'desc'), limit(500)), [toastError]);
  const refreshCount = () => countActivity().then(setTotal).catch(() => {});
  useEffect(() => {
    refreshCount();
    // automatic retention: entries older than a year are removed quietly so the database never fills up
    if (isHead) pruneActivity(365).then((n) => n && refreshCount()).catch(() => {});
  }, [isHead]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter((r) => !s || [r.action, r.detail, r.by].some((v) => String(v || '').toLowerCase().includes(s)));
  }, [rows, q]);

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [['When', 'Action', 'Detail', 'By'], ...shown.map((r) => [tsToDate(r.at)?.toISOString() || '', r.action, r.detail, r.by])].map((r) => r.map(esc).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const clear = async (days) => {
    const what = days ? `older than ${days} days` : 'ALL entries';
    if (!(await confirm({ title: `Delete ${what}?`, message: 'This removes audit-log entries permanently. Export the CSV first if you need a copy.', danger: true, confirmText: 'Delete' }))) return;
    setBusy(true);
    try {
      const n = await pruneActivity(days);
      toast(`${n} log entries deleted`);
      refreshCount();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!rows) return <Loading />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Activity log" sub={`Every change made in the Super Admin panel — ${total ?? '…'} entries stored, latest 500 shown. Entries older than a year are removed automatically.`}>
        <Button icon={Download} onClick={exportCsv}>Export CSV</Button>
        {isHead && <Button icon={Trash2} onClick={() => clear(30)} loading={busy}>Delete &gt; 30 days</Button>}
        {isHead && <Button icon={Trash2} onClick={() => clear(90)} loading={busy}>Delete &gt; 90 days</Button>}
        {isHead && <Button variant="danger" icon={Trash2} onClick={() => clear(0)} loading={busy}>Clear all</Button>}
      </PageHead>
      <div className="card card-pad"><SearchBox value={q} onChange={setQ} placeholder="Search action, detail or admin…" /></div>
      <div className="card">
        {shown.length === 0 ? (
          <Empty icon={History} title="No activity" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Action</th><th>Detail</th><th className="hide-sm">By</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap muted">{fmtDateTime(r.at)}</td>
                    <td><Badge color={COLORS[String(r.action).split('.')[1]]}>{r.action}</Badge></td>
                    <td>{r.detail}</td>
                    <td className="hide-sm muted">{r.by}</td>
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
