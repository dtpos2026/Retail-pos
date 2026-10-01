import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Crosshair, XCircle } from 'lucide-react';
import { useAdmin } from '../context';
import { setDeviceLocation, clearDeviceLocation } from '../lib/data';
import { isOnline } from '../lib/devices';
import { PageHead, Loading, Button, Badge, Empty } from '../components/ui';
import { fmtDateTime } from '../lib/format';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colorOf = (d) => (d.status === 'blocked' ? '#dc2626' : d.status === 'suspended' ? '#d97706' : isOnline(d) ? '#16a34a' : '#64748b');

export default function DeviceMap() {
  const { devices, toast, toastError } = useAdmin();
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const placing = useRef(null);
  const [place, setPlace] = useState(null); // device waiting for a click on the map

  const pos = (d) => (Number.isFinite(d.lat) && Number.isFinite(d.lng) ? { lat: d.lat, lng: d.lng, src: 'pinned' } : Number.isFinite(d.ipLat) && Number.isFinite(d.ipLng) ? { lat: d.ipLat, lng: d.ipLng, src: 'ip' } : null);
  const located = useMemo(() => (devices || []).map((d) => ({ ...d, _pos: pos(d) })).filter((d) => d._pos), [devices]);
  const unlocated = useMemo(() => (devices || []).filter((d) => !pos(d)), [devices]);
  placing.current = place;

  useEffect(() => {
    if (!el.current || map.current) return undefined;
    map.current = L.map(el.current, { zoomControl: true }).setView([30.1575, 71.5249], 6); // Pakistan
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
      map.current?.remove();
      map.current = null;
    };
  }, [toast, toastError]);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    located.forEach((d) => {
      L.circleMarker([d._pos.lat, d._pos.lng], { radius: 9, dashArray: d._pos.src === 'ip' ? '3 3' : undefined, color: '#fff', weight: 2, fillColor: colorOf(d), fillOpacity: 0.95 })
        .bindPopup(`<b>${esc(d.businessName)}</b><br>${esc(d.name || '')}<br>${isOnline(d) ? 'Online now' : `Last seen ${esc(fmtDateTime(d.lastSeen))}`}<br>Status: ${esc(d.status)}${d.publicIp ? `<br>IP ${esc(d.publicIp)}` : ''}${d.city ? `<br>${esc([d.city, d.country].filter(Boolean).join(', '))}` : ''}<br><i>${d._pos.src === 'ip' ? 'Approximate (from IP)' : 'Pinned by you'}</i>`)
        .addTo(layer.current);
    });
    if (located.length && map.current) map.current.fitBounds(L.latLngBounds(located.map((d) => [d._pos.lat, d._pos.lng])).pad(0.3), { maxZoom: 12 });
  }, [located]);

  if (!devices) return <Loading />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Device map" sub="Live positions of your clients' computers: approximate from their internet connection, or pinned exactly by you (Place → click the map). Updates in real time." />
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
                  <span className="dot" style={{ background: colorOf(d) }} />
                  <div className="grow" style={{ minWidth: 0 }}><div className="b ellipsis"><bdi>{d.businessName}</bdi></div><div className="small faint ellipsis">{d.name}</div></div>
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
