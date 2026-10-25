import { Monitor, MapPin } from 'lucide-react';
import { Modal, Button, Badge } from './ui';
import { fmtDateTime } from '../lib/format';
import { isOnline, ago, DEVICE_STATUS } from '../lib/devices';
import { salesOf, fmtSales, parseDays, parseUsers } from '../lib/sales';
import { money } from '../lib/format';

const rows = (d) => [
  ['Sales today', salesOf(d).reported ? fmtSales(salesOf(d).today) : ''],
  ['Sales this month', salesOf(d).reported ? fmtSales(salesOf(d).month) : ''],
  ['Business', d.businessName],
  ['Owner', d.ownerName],
  ['Owner phone', d.ownerPhone],
  ['Computer name', d.name || d.hostname],
  ['Windows user', d.username],
  ['Manufacturer / model', [d.manufacturer, d.model].filter(Boolean).join(' ')],
  ['Operating system', d.osVersion || d.os],
  ['Processor', d.cpu ? `${d.cpu}${d.cores ? ` · ${d.cores} cores` : ''}` : ''],
  ['Memory (RAM)', d.ramGb ? `${d.ramGb} GB` : ''],
  ['Architecture', d.arch],
  ['Computer ID', d.machineId],
  ['App version', d.appVersion ? `v${d.appVersion}` : ''],
  ['Local IP', d.localIp],
  ['MAC address', d.mac],
  ['Public IP', d.publicIp],
  ['Internet provider', d.isp],
  ['Approx. location (from IP)', [d.city, d.region, d.country].filter(Boolean).join(', ')],
  ['Coordinates', Number.isFinite(d.gpsLat) && !Number.isFinite(d.lat) ? `${d.gpsLat.toFixed(5)}, ${d.gpsLng.toFixed(5)} (exact, from the computer${d.gpsAcc ? `, ±${d.gpsAcc} m` : ''})` : Number.isFinite(d.lat) ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)} (set by you)` : Number.isFinite(d.ipLat) ? `${d.ipLat.toFixed(4)}, ${d.ipLng.toFixed(4)} (from IP)` : ''],
  ['Exact location', Number.isFinite(d.gpsLat) ? '' : GPS_NOTE[d.gpsStatus] || ''],
  ['POS users', parseUsers(d.posUsers).map((u) => `${u.username} (${u.role})`).join(', ')],
  ['Registered', fmtDateTime(d.firstSeen)],
  ['Last seen', fmtDateTime(d.lastSeen)],
];

const GPS_NOTE = {
  off: 'Not shared — Windows Location is OFF on this computer (Settings → Privacy → Location).',
  denied: 'Not shared — desktop apps are not allowed to use Location on this computer.',
  nodata: 'Not found yet — Windows has no GPS/Wi-Fi position for this computer.',
  unsupported: 'Only the approximate position (from IP) is available on this system.',
  pending: 'Looking for the position…',
  error: 'The location service could not be read.',
};

/** Everything the POS reports about one computer. */
export default function DeviceInfoModal({ device: d, onClose }) {
  const st = DEVICE_STATUS[d.status] || DEVICE_STATUS.active;
  const on = isOnline(d);
  return (
    <Modal title={d.businessName || 'Device'} icon={Monitor} size="lg" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      <div className="row" style={{ gap: 10, marginBottom: 10 }}>
        {d.logoThumb && <img src={d.logoThumb} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)' }} />}
        <span className={`dot ${on ? 'on' : ''}`} />
        <b>{on ? 'Online now' : `Offline — last seen ${ago(d.lastSeen)}`}</b>
        <Badge color={st.color}>{st.label}</Badge>
        {(Number.isFinite(d.lat) || Number.isFinite(d.gpsLat) || Number.isFinite(d.ipLat)) && <a href="#/map" className="row small" style={{ gap: 4 }}><MapPin size={14} /> on the map</a>}
      </div>
      {rows(d).filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className="row" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
          <span className="muted" style={{ minWidth: 190 }}>{k}</span>
          <b className="grow mono" style={{ textAlign: 'right', wordBreak: 'break-all', fontFamily: 'inherit' }}>{v}</b>
        </div>
      ))}
      {parseDays(d.salesDays).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="b" style={{ marginBottom: 6 }}>Sales per day (last 14 days{d.salesDate ? `, as of ${d.salesDate}` : ''})</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {parseDays(d.salesDays).map((x) => <span key={x.date} className="badge" style={{ whiteSpace: 'nowrap' }}>{x.date} · <b>{money(x.total)}</b></span>)}
          </div>
        </div>
      )}
      <div className="small faint" style={{ marginTop: 10 }}>Details refresh every few minutes while the computer is online. Location is approximate (internet connection); you can pin the exact place on the Device map.</div>
    </Modal>
  );
}
