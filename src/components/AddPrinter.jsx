import { useEffect, useState } from 'react';
import { Bluetooth, Usb, Cable, Search, Link2, Unlink, Printer, ReceiptText, ChefHat, Settings2, CheckCircle2, AlertTriangle, RefreshCw, Download, Info } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Modal, Button, Field, Input, Select, Seg, Badge } from './ui';

const fmtAddr = (a) => String(a || '').replace(/(..)(?!$)/g, '$1:');
const KIND = { bluetooth: { label: 'Bluetooth', icon: Bluetooth }, usb: { label: 'USB-serial', icon: Usb }, serial: { label: 'Serial', icon: Cable } };

/** Test print + "use for receipts / kitchen" buttons for one printer. */
function UseButtons({ name, onUse, current }) {
  const { toast, toastError } = useApp();
  const [busy, setBusy] = useState('');
  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <Button size="sm" icon={Printer} loading={busy === 'text'} onClick={() => run('text', async () => { const r = await api('print.textTest', { printerName: name }); toast(`Text test sent in ${(r.ms / 1000).toFixed(1)} s — check the paper`); })} title="A few plain lines, no picture: the quickest check that the printer takes data">Text test</Button>
      <Button size="sm" icon={Printer} loading={busy === 'test'} onClick={() => run('test', async () => { const r = await api('print.test', { kind: 'receipt', printerName: name }); toast(`Test page printed on ${r.printer || name}`); })}>Test print</Button>
      <Button size="sm" variant={current.receipt === name ? 'primary' : undefined} icon={ReceiptText} loading={busy === 'r'} onClick={() => run('r', () => onUse('receiptPrinter', name))}>{current.receipt === name ? 'Receipt printer ✓' : 'Use for receipts'}</Button>
      <Button size="sm" variant={current.kitchen === name ? 'primary' : undefined} icon={ChefHat} loading={busy === 'k'} onClick={() => run('k', () => onUse('tokenPrinter', name))}>{current.kitchen === name ? 'Kitchen printer ✓' : 'Use for kitchen / tokens'}</Button>
    </div>
  );
}

function BluetoothPane({ onUse, current, onChanged }) {
  const { toast, toastError } = useApp();
  const [devices, setDevices] = useState(null);
  const [ports, setPorts] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState('');
  const [pin, setPin] = useState('');
  const [result, setResult] = useState(null);
  const loadPorts = () => api('printers.ports', { fresh: true }).then(setPorts).catch(() => setPorts([]));
  useEffect(() => {
    loadPorts();
  }, []);
  const scan = async () => {
    setScanning(true);
    setResult(null);
    try {
      setDevices(await api('printers.btScan', { seconds: 10 }));
      loadPorts();
    } catch (e) {
      toastError(e);
      setDevices([]);
    } finally {
      setScanning(false);
    }
  };
  const pair = async (d) => {
    setBusy(d.address);
    setResult(null);
    try {
      const r = await api('printers.btPair', { address: d.address, pin: pin.trim() || undefined });
      setResult({ ...r, address: d.address, deviceName: d.name });
      toast(r.port ? `${d.name} paired on ${r.port}` : `${d.name} paired`);
      await loadPorts();
      setDevices((list) => (list || []).map((x) => (x.address === d.address ? { ...x, paired: true } : x)));
      onChanged?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };
  const forget = async (d) => {
    if (!window.confirm(`Remove "${d.name}" from this computer? You can pair it again later.`)) return;
    setBusy(d.address);
    try {
      await api('printers.btForget', { address: d.address });
      toast(`${d.name} removed`);
      setResult(null);
      setDevices((list) => (list || []).map((x) => (x.address === d.address ? { ...x, paired: false } : x)));
      await loadPorts();
      onChanged?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };
  const portOf = (address) => ports.find((p) => p.kind === 'bluetooth' && p.address === address);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="add-printer-steps">
        <div><span>1</span>Switch the printer on and keep it near the computer.</div>
        <div><span>2</span>Press <b>Search</b> and choose the printer (often “BlueTooth Printer”, “MPT-II”, “XP-P300”, “RPP02”…).</div>
        <div><span>3</span>Press <b>Pair</b> — the PIN is usually <b>0000</b> or <b>1234</b> (tried automatically).</div>
        <div><span>4</span><b>Test print</b>, then <b>Use for receipts</b>. No driver is needed.</div>
      </div>
      <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
        <Button variant="primary" icon={Search} loading={scanning} onClick={scan}>{scanning ? 'Searching… (about 10 s)' : devices ? 'Search again' : 'Search for Bluetooth printers'}</Button>
        <Field label="PIN (optional)" style={{ width: 150, marginBottom: 0 }}>
          <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="0000 / 1234" />
        </Field>
        <div className="grow" />
        <Button size="sm" variant="ghost" icon={Settings2} onClick={() => api('printers.openBtSettings').catch(toastError)}>Windows Bluetooth settings</Button>
      </div>
      {result && (
        <div className={`add-printer-result ${result.port ? 'ok' : 'warn'}`}>
          {result.port ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <div className="grow col" style={{ gap: 8 }}>
            {result.port ? (
              <>
                <div><b>{result.deviceName}</b> is paired and ready on <b>{result.port}</b>.</div>
                <UseButtons name={result.printer} onUse={onUse} current={current} />
              </>
            ) : (
              <div>
                <b>{result.deviceName}</b> is paired, but Windows has not made its printing port yet. Wait a few seconds and open the <b>COM port</b> tab. If it is still missing: Windows Bluetooth settings → More Bluetooth settings → <b>COM Ports</b> → Add → <b>Outgoing</b> → choose the printer.
              </div>
            )}
          </div>
        </div>
      )}
      {devices && !devices.length && !scanning && (
        <div className="add-printer-empty">
          <Bluetooth size={26} />
          <div>No Bluetooth device found. Check that the printer is on (blue light blinking), that Bluetooth is on in Windows, and that the printer is not connected to a phone.</div>
        </div>
      )}
      {!!devices?.length && (
        <div className="add-printer-list">
          {devices.map((d) => {
            const p = portOf(d.address);
            return (
              <div key={d.address} className={`add-printer-row ${d.likelyPrinter ? 'printer' : ''}`}>
                <div className="ap-ic">{d.likelyPrinter ? <Printer size={18} /> : <Bluetooth size={18} />}</div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="b ellipsis">{d.name}</div>
                  <div className="tiny muted">{fmtAddr(d.address)}{p ? ` · ${p.port}` : ''}</div>
                </div>
                {d.likelyPrinter && <Badge color="blue">Printer</Badge>}
                {d.paired && <Badge color="green">Paired</Badge>}
                {p && !result ? <UseButtons name={p.name} onUse={onUse} current={current} /> : null}
                {!p ? (
                  <Button size="sm" variant={d.likelyPrinter ? 'primary' : undefined} icon={Link2} loading={busy === d.address} disabled={!!busy && busy !== d.address} onClick={() => pair(d)}>Pair</Button>
                ) : null}
                {(d.paired || p) && <Button size="sm" variant="ghost" icon={Unlink} title="Forget (unpair)" disabled={!!busy} onClick={() => forget(d)} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComPane({ s, onUse, current }) {
  const { toastError } = useApp();
  const [ports, setPorts] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      setPorts(await api('printers.ports', { fresh: true }));
    } catch (e) {
      toastError(e);
      setPorts([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="small muted">Bluetooth printers paired in Windows, USB-to-serial and old serial printers all appear here as a <b>COM port</b>. The software prints straight to the port — no Windows driver needed.</div>
      <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
        <Field label="Speed (baud) — serial cable only" style={{ marginBottom: 0 }}>
          <Select value={String(s.v.serialBaud)} onChange={(e) => s.set('serialBaud')(Number(e.target.value))} options={[9600, 19200, 38400, 57600, 115200].map((b) => ({ value: String(b), label: String(b) }))} />
        </Field>
        <Field label="Sending speed" style={{ marginBottom: 0 }}>
          <Select value={s.v.serialSpeed === 'normal' ? 'auto' : s.v.serialSpeed} onChange={(e) => s.set('serialSpeed')(e.target.value)} options={[{ value: 'auto', label: 'Auto (recommended)' }, { value: 'safe', label: 'Safe — slowest, for cheap Bluetooth printers' }, { value: 'fast', label: 'Fast — cables only' }]} />
        </Field>
        {s.dirty && <Button size="sm" variant="primary" onClick={() => s.save()} loading={s.saving}>Save speed</Button>}
        <div className="grow" />
        <Button size="sm" icon={RefreshCw} loading={loading} onClick={load}>Detect again</Button>
      </div>
      {ports && !ports.length && (
        <div className="add-printer-empty">
          <Cable size={26} />
          <div>No COM port on this computer. Pair a Bluetooth printer in the <b>Bluetooth</b> tab, or plug in the USB-serial cable and press Detect again.</div>
        </div>
      )}
      {!!ports?.length && (
        <div className="add-printer-list">
          {ports.map((p) => {
            const K = KIND[p.kind] || KIND.serial;
            return (
              <div key={p.port} className="add-printer-row">
                <div className="ap-ic"><K.icon size={18} /></div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="b ellipsis">{p.port}{p.deviceName ? ` · ${p.deviceName}` : ''}</div>
                  <div className="tiny muted">{K.label}{p.address ? ` · ${fmtAddr(p.address)}` : ''}</div>
                </div>
                <UseButtons name={p.name} onUse={onUse} current={current} />
              </div>
            );
          })}
        </div>
      )}
      <div className="small muted row" style={{ alignItems: 'flex-start', gap: 8 }}><Info size={16} style={{ flex: 'none', marginTop: 2 }} /><span>Bluetooth printer prints half a bill or garbage? Choose <b>Safe</b> sending speed. A serial-cable printer prints garbage? Try another baud (most use 9600 or 115200).</span></div>
    </div>
  );
}

function UsbPane({ onUse, current, onChanged }) {
  const { toast, toastError } = useApp();
  const [ports, setPorts] = useState(null);
  const [names, setNames] = useState({});
  const [busy, setBusy] = useState('');
  const [installed, setInstalled] = useState(null);
  const load = () => api('printers.usbPorts').then(setPorts).catch((e) => { toastError(e); setPorts([]); });
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const install = async (p) => {
    setBusy(p.port);
    try {
      const r = await api('printers.installUsb', { port: p.port, name: names[p.port] || `Thermal Printer (${p.port})` });
      setInstalled(r.printer);
      toast(`"${r.printer}" installed`);
      await load();
      onChanged?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };
  const free = (ports || []).filter((p) => !p.hasPrinter);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="small muted">Most USB thermal printers (Xprinter, SpeedX, MediaLink, POS-58/80, BlackCopper…) work best with the driver from their CD or website. <b>No driver?</b> Plug the printer in, switch it on, and install the built-in Windows driver here — the software sends its own print commands, so the generic driver is enough.</div>
      {installed && (
        <div className="add-printer-result ok">
          <CheckCircle2 size={20} />
          <div className="grow col" style={{ gap: 8 }}>
            <div><b>{installed}</b> is installed.</div>
            <UseButtons name={installed} onUse={onUse} current={current} />
          </div>
        </div>
      )}
      {ports && !free.length && (
        <div className="add-printer-empty">
          <Usb size={26} />
          <div>{ports.length ? 'Every USB printer port already has a printer installed — choose it in the printer list.' : 'No USB printer port found.'} Plug the printer in with its USB cable, switch it on, wait 10 seconds and press Detect again.</div>
        </div>
      )}
      {!!free.length && (
        <div className="add-printer-list">
          {free.map((p) => (
            <div key={p.port} className="add-printer-row">
              <div className="ap-ic"><Usb size={18} /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="b">{p.port}</div>
                <div className="tiny muted ellipsis">{p.description || 'USB printer port'} · no printer installed</div>
              </div>
              <Input style={{ width: 200 }} value={names[p.port] ?? ''} placeholder={`Thermal Printer (${p.port})`} onChange={(e) => setNames((n) => ({ ...n, [p.port]: e.target.value }))} />
              <Button size="sm" variant="primary" icon={Download} loading={busy === p.port} disabled={!!busy} onClick={() => install(p)}>Install</Button>
            </div>
          ))}
        </div>
      )}
      <div className="row"><div className="tiny muted grow">Windows asks for permission (“Yes”) during the install.</div><Button size="sm" icon={RefreshCw} onClick={load}>Detect again</Button></div>
    </div>
  );
}

/** Settings → Printers → "Add a printer": Bluetooth pairing, COM ports and USB driver install. */
export default function AddPrinterModal({ s, onClose, onChanged }) {
  const [tab, setTab] = useState('bluetooth');
  const current = { receipt: s.v.receiptPrinter, kitchen: s.v.tokenPrinter || s.v.receiptPrinter };
  const onUse = async (key, name) => {
    await s.save({ ...s.v, [key]: name });
    onChanged?.();
  };
  return (
    <Modal title="Add a printer" icon={Printer} onClose={onClose} size="lg">
      <div className="col" style={{ gap: 16 }}>
        <Seg value={tab} onChange={setTab} options={[{ value: 'bluetooth', label: 'Bluetooth', icon: Bluetooth }, { value: 'com', label: 'COM port', icon: Cable }, { value: 'usb', label: 'USB (no driver)', icon: Usb }]} />
        {tab === 'bluetooth' && <BluetoothPane onUse={onUse} current={current} onChanged={onChanged} />}
        {tab === 'com' && <ComPane s={s} onUse={onUse} current={current} />}
        {tab === 'usb' && <UsbPane onUse={onUse} current={current} onChanged={onChanged} />}
      </div>
    </Modal>
  );
}
