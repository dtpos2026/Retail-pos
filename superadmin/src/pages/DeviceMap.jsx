import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Crosshair, XCircle } from 'lucide-react';
import { useAdmin } from '../context';
import { setDeviceLocation, clearDeviceLocation } from '../lib/data';
import { isOnline, ago } from '../lib/devices';
import { PageHead, Loading, Button, Badge, Empty } from '../components/ui';
import { fmtDateTime, initials } from '../lib/format';
import { salesOf, fmtSales } from '../lib/sales';
import { Logo } from '../components/SalesBoard';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Approximate (IP) positions of several restaurants in one city would sit on top of each other: spread them a little.
const spread = (id) => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [((h % 1000) / 1000 - 0.5) * 0.04, (((h >>> 10) % 1000) / 1000 - 0.5) * 0.04];
};

function pinIcon(d) {
  const sale = salesOf(d);
  const c = colorOf(d);
  const inner = d.logoThumb ? `<img src="${esc(d.logoThumb)}" alt="">` : esc(initials(d.businessName));
  const today = sale.reported ? `<span>${esc(fmtSales(sale.today))} today</span><i>${esc(fmtSales(sale.month))} this month</i>` : '';
  return L.divIcon({
    className: 'rpin-wrap',
    html: `<div class="rpin ${d._pos.src === 'ip' ? 'dashed' : ''}" style="--c:${c}"><div class="rpin-badge">${inner}</div><div class="rpin-tip"></div><div class="rpin-label"><b>${esc(d.businessName)}</b>${today}</div></div>`,
    iconSize: [46, 58],
    iconAnchor: [23, 58],
    popupAnchor: [0, -52],
  });
}

const colorOf = (d) => (d.status === 'blocked' ? '#dc2626' : d.status === 'suspended' ? '#d97706' : isOnline(d) ? '#16a34a' : '#64748b');

export default function DeviceMap() {
  const { devices, toast, toastError } = useAdmin();
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const placing = useRef(null);
  const [place, setPlace] = useState(null); // device waiting for a click on the map

  const pos = (d) => (Number.isFinite(d.lat) && Number.isFinite(d.lng) ? { lat: d.lat, lng: d.lng, src: 'pinned' } : Number.isFinite(d.gpsLat) && Number.isFinite(d.gpsLng) ? { lat: d.gpsLat, lng: d.gpsLng, src: 'gps' } : Number.isFinite(d.ipLat) && Number.isFinite(d.ipLng) ? { lat: d.ipLat, lng: d.ipLng, src: 'ip' } : null);
  const located = useMemo(() => (devices || []).map((d) => ({ ...d, _pos: pos(d) })).filter((d) => d._pos), [devices]);
  const unlocated = useMemo(() => (devices || []).filter((d) => !pos(d)), [devices]);
  placing.current = place;

  useEffect(() => {
    if (!el.current || map.current) return undefined;
    map.current = L.map(el.current, { zoomControl: true, zoomAnimation: false, markerZoomAnimation: false, fadeAnimation: false }).setView([30.1575, 71.5249], 6); // Pakistan
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    map.current.on('click', async (e) => {
      const d = placing.current;
      if (!d) return;
      try {
        await setDeviceLocation(d, e.latlng.lat, e.latlng.lng);
        toast(`${d.businessName} placed on the map`);
      } catch (err) {
        toastError(err);
      }
      setPlace(null);
    });
    return () => {
      if (map.current) {
        map.current.stop();
        map.current.off();
        map.current.remove();
      }
      map.current = null;
      layer.current = null;
    };
  }, [toast, toastError]);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    located.forEach((d) => {
      const [dLat, dLng] = d._pos.src === 'ip' ? spread(d.id) : [0, 0];
      const sale = salesOf(d);
      L.marker([d._pos.lat + dLat, d._pos.lng + dLng], { icon: pinIcon(d), riseOnHover: true })
        .bindPopup(`<b>${esc(d.businessName)}</b><br>${esc(d.name || '')}<br>${isOnline(d) ? 'Online now' : `Last seen ${esc(fmtDateTime(d.lastSeen))}`}<br>Status: ${esc(d.status)}${sale.reported ? `<br><b>Sales today ${esc(fmtSales(sale.today))}</b> · this month ${esc(fmtSales(sale.month))}` : ''}${d.publicIp ? `<br>IP ${esc(d.publicIp)}` : ''}${d.city ? `<br>${esc([d.city, d.country].filter(Boolean).join(', '))}` : ''}<br><i>${d._pos.src === 'ip' ? 'Approximate (from IP address)' : d._pos.src === 'gps' ? `Exact (computer location${d.gpsAcc ? `, ±${d.gpsAcc} m` : ''})` : 'Pinned by you'}</i>`)
        .addTo(layer.current);
    });
    if (located.length && map.current) map.current.fitBounds(L.latLngBounds(located.map((d) => [d._pos.lat, d._pos.lng])).pad(0.3), { maxZoom: 12, animate: false });
  }, [located]);

  if (!devices) return <Loading />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Device map" sub="Live positions of your clients' computers with each restaurant's logo, name and today's sales. Exact when the computer shares its location, otherwise approximate (dashed pin) — or pin it yourself (Place → click the map). Updates in real time." />
      {place && <div className="banner info" style={{ borderRadius: 12 }}><Crosshair size={16} /> Click on the map to place <b>{place.businessName}</b> ({place.name}). <Button size="sm" onClick={() => setPlace(null)}>Cancel</Button></div>}
      <div className="grid" style={{ gridTemplateColumns: '1fr 320px', alignItems: 'start' }}>
        <div className="card" style={{ padding: 6 }}><div ref={el} style={{ height: 'calc(100vh - 260px)', minHeight: 380, borderRadius: 12 }} /></div>
        <div className="card">
          <div className="card-head"><MapPin size={17} /><h3>Not on the map ({unlocated.length})</h3></div>
          {unlocated.length === 0 ? <Empty icon={MapPin} title="All devices are placed" /> : unlocated.map((d) => (
            <div key={d.id} className="list-item">
              <span className={`dot ${isOnline(d) ? 'on' : ''}`} />
              <div className="grow" style={{ minWidth: 0 }}><div className="b ellipsis"><bdi>{d.businessName}</bdi></div><div className="small faint ellipsis">{d.name}</div></div>
              <Button size="sm" icon={Crosshair} onClick={() => setPlace(d)}>Place</Button>
            </div>
          ))}
          {located.length > 0 && (
            <>
              <div className="card-head"><h3>On the map ({located.length})</h3></div>
              {located.map((d) => (
                <div key={d.id} className="list-item">
                  <Logo src={d.logoThumb} name={d.businessName} size={32} ring={colorOf(d)} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="b ellipsis"><bdi>{d.businessName}</bdi></div>
                    <div className="small faint ellipsis">{salesOf(d).reported ? <span>Today <b style={{ color: '#16a34a' }}>{fmtSales(salesOf(d).today)}</b> · month {fmtSales(salesOf(d).month)}</span> : d.name}</div>
                  </div>
                  <Badge color={isOnline(d) ? 'green' : undefined}>{isOnline(d) ? 'online' : 'offline'}</Badge>
                  <Button size="sm" variant="ghost" icon={XCircle} title="Remove pin" onClick={() => clearDeviceLocation(d).catch(toastError)} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
