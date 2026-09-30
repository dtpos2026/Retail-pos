import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Printer, FileDown, FileSpreadsheet, FileText, Search, Receipt, ImageDown, Eye } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatMoney, formatNumber, formatDate, today, shiftDate } from '../lib/format';
import { Button, Loading, Empty, Input, Select, SearchBox, Modal, Seg } from '../components/ui';
import ReceiptPreview from '../components/ReceiptPreview';

function startOfWeek(t) {
  const [y, m, d] = t.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const diff = (dt.getDay() + 6) % 7; // Monday
  return shiftDate(t, -diff);
}

const PRESETS = {
  today: () => ({ from: today(), to: today() }),
  yesterday: () => ({ from: shiftDate(today(), -1), to: shiftDate(today(), -1) }),
  week: () => ({ from: startOfWeek(today()), to: today() }),
  month: () => ({ from: today().slice(0, 8) + '01', to: today() }),
  lastMonth: () => {
    const first = today().slice(0, 8) + '01';
    const end = shiftDate(first, -1);
    return { from: end.slice(0, 8) + '01', to: end };
  },
  last30: () => ({ from: shiftDate(today(), -29), to: today() }),
};

export default function Reports() {
  const { settings, toast, toastError } = useApp();
  const [list, setList] = useState([]);
  const [key, setKey] = useState('sales');
  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(PRESETS.today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [width, setWidth] = useState(settings.receipt.paperWidth);
  const [previewHtml, setPreviewHtml] = useState(null);
  const cur = settings.general.currency;

  useEffect(() => {
    api('reports.list').then(setList).catch(toastError);
  }, [toastError]);

  useEffect(() => {
    setLoading(true);
    api('reports.run', { key, ...range })
      .then(setData)
      .catch(toastError)
      .finally(() => setLoading(false));
  }, [key, range, toastError]);

  const choosePreset = (p) => {
    setPreset(p);
    if (PRESETS[p]) setRange(PRESETS[p]());
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    if (!s) return data.rows;
    return data.rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(s)));
  }, [data, q]);

  const cell = (c, v) => (v === null || v === undefined || v === '' ? '—' : c.type === 'money' ? formatMoney(v, cur) : c.type === 'number' ? formatNumber(v) : c.key === 'created_at' || c.key === 'date' ? (String(v).length > 10 ? v.slice(0, 16).replace('T', ' ') : formatDate(v)) : v);

  const doExport = async (format) => {
    setBusy(format);
    try {
      const r = await api('reports.export', { key, ...range, format });
      if (!r.canceled) toast(`Saved: ${r.file}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const thermal = async (kind) => {
    setBusy(kind);
    try {
      const a = { key, ...range, width };
      if (kind === 't-print') {
        const r = await api('reports.thermalPrint', a);
        toast(`Sent to printer (${width}mm)`);
        return r;
      }
      if (kind === 't-png') {
        const r = await api('reports.thermalPng', a);
        if (!r.canceled) toast(`Saved: ${r.file}`);
        return r;
      }
      setPreviewHtml(await api('reports.thermalHtml', a));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const doPrint = async () => {
    setBusy('print');
    try {
      await api('reports.print', { key, ...range });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const groups = [...new Set(list.map((r) => r.group))];

  return (
    <div className="grid" style={{ gridTemplateColumns: '230px 1fr', gap: 18, alignItems: 'start' }}>
      <div className="card" style={{ padding: 8, position: 'sticky', top: 0 }}>
        {groups.map((g) => (
          <div key={g}>
            <div className="label" style={{ padding: '10px 10px 4px', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.05em' }}>{g}</div>
            {list.filter((r) => r.group === g).map((r) => (
              <button
                key={r.key}
                onClick={() => { setKey(r.key); setQ(''); }}
                className="nav-item"
                style={{ width: '100%', border: 0, cursor: 'pointer', color: key === r.key ? 'var(--primary)' : 'var(--text)', background: key === r.key ? 'var(--primary-50)' : 'transparent', padding: '8px 10px' }}
              >
                {r.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="col" style={{ gap: 16, minWidth: 0 }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h2>{data?.title || 'Reports'}</h2>
            <p>{data ? (data.noDate ? 'Current stock position' : data.from === data.to ? formatDate(data.from) : `${formatDate(data.from)} – ${formatDate(data.to)}`) : ''}</p>
          </div>
          <div className="actions">
            <Seg value={width} onChange={setWidth} options={[{ value: 80, label: '80mm' }, { value: 58, label: '58mm' }]} />
            <Button icon={Eye} onClick={() => thermal('t-view')} loading={busy === 't-view'} disabled={!data} title="Preview the small-paper report">Preview</Button>
            <Button variant="primary" icon={Receipt} onClick={() => thermal('t-print')} loading={busy === 't-print'} disabled={!data} title="Print on the thermal receipt printer">Print {width}mm</Button>
            <Button icon={ImageDown} onClick={() => thermal('t-png')} loading={busy === 't-png'} disabled={!data} title="Save as a PNG image (share on WhatsApp)">PNG</Button>
            <Button icon={Printer} onClick={doPrint} loading={busy === 'print'} disabled={!data}>Print A4</Button>
            <Button icon={FileDown} onClick={() => doExport('pdf')} loading={busy === 'pdf'} disabled={!data}>PDF</Button>
            <Button icon={FileText} onClick={() => doExport('csv')} loading={busy === 'csv'} disabled={!data}>CSV</Button>
            <Button icon={FileSpreadsheet} onClick={() => doExport('excel')} loading={busy === 'excel'} disabled={!data}>Excel</Button>
          </div>
        </div>

        {!data?.noDate && (
          <div className="card card-pad row wrap">
            <div className="seg">
              {[['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['lastMonth', 'Last month'], ['last30', '30 days']].map(([k, l]) => (
                <button key={k} className={preset === k ? 'on' : ''} onClick={() => choosePreset(k)}>{l}</button>
              ))}
            </div>
            <Input type="date" value={range.from} onChange={(e) => { setPreset('custom'); setRange({ ...range, from: e.target.value }); }} style={{ width: 160 }} />
            <span className="faint">to</span>
            <Input type="date" value={range.to} onChange={(e) => { setPreset('custom'); setRange({ ...range, to: e.target.value }); }} style={{ width: 160 }} />
          </div>
        )}

        {loading && !data ? (
          <Loading />
        ) : data ? (
          <>
            {data.cards?.length > 0 && (
              <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(5, data.cards.length)}, minmax(0,1fr))` }}>
                {data.cards.map((c, i) => (
                  <div key={i} className="card stat" style={i === 0 ? { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', border: 0 } : undefined}>
                    <div className="grow">
                      <div className="l" style={i === 0 ? { color: 'rgba(255,255,255,.85)' } : undefined}>{c.label}</div>
                      <div className="v">{c.type === 'money' ? formatMoney(c.value, cur) : c.type === 'number' ? formatNumber(c.value) : c.value}</div>
                      {c.hint && <div className="h" style={i === 0 ? { color: 'rgba(255,255,255,.8)' } : undefined}>{c.hint}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="card">
              <div className="card-head">
                <h3>{rows.length} rows</h3>
                <div className="actions"><SearchBox value={q} onChange={setQ} placeholder="Filter rows…" style={{ width: 240 }} /></div>
              </div>
              {rows.length === 0 ? (
                <Empty icon={q ? Search : BarChart3} title="No data" text={q ? 'No rows match your filter.' : 'There is no data for this period.'} />
              ) : (
                <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 430px)' }}>
                  <table className="table">
                    <thead><tr>{data.columns.map((c) => <th key={c.key} className={c.type !== 'text' ? 'num' : ''}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>{data.columns.map((c) => <td key={c.key} className={c.type !== 'text' ? 'num' : ''}><bdi>{cell(c, r[c.key])}</bdi></td>)}</tr>
                      ))}
                    </tbody>
                    {data.totals && !q && (
                      <tfoot><tr>{data.columns.map((c) => <td key={c.key} className={c.type !== 'text' ? 'num' : ''}>{data.totals[c.key] === undefined ? '' : c.type === 'text' ? data.totals[c.key] : cell(c, data.totals[c.key])}</td>)}</tr></tfoot>
                    )}
                  </table>
                </div>
              )}
              {data.note && <div className="card-pad small muted" style={{ borderTop: '1px solid var(--border)' }}>{data.note}</div>}
            </div>
          </>
        ) : null}
      </div>
      {previewHtml && (
        <Modal title={`${data?.title} — ${width}mm`} icon={Receipt} size="sm" onClose={() => setPreviewHtml(null)} footer={<><Button icon={ImageDown} onClick={() => thermal('t-png')}>Save PNG</Button><Button variant="primary" icon={Receipt} onClick={() => thermal('t-print')}>Print {width}mm</Button></>}>
          <ReceiptPreview html={previewHtml} maxHeight="60vh" />
        </Modal>
      )}
    </div>
  );
}
