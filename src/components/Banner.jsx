import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';

/** Promo strip on the POS screen (set text / image in Settings → Appearance). Dismissable per session. */
export function PromoBanner() {
  const { settings } = useApp();
  const a = settings?.appearance;
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('promo-hidden') === '1';
    } catch {
      return false;
    }
  });
  if (!a?.bannerEnabled || !a.bannerOnPos || hidden || (!a.bannerTitle && !a.bannerImage)) return null;
  return (
    <div className="promo">
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="pt"><bdi>{a.bannerTitle}</bdi></div>
        {a.bannerSubtitle && <div className="ps"><bdi>{a.bannerSubtitle}</bdi></div>}
      </div>
      {a.bannerImage && <img src={a.bannerImage} alt="" />}
      <button className="x" title="Hide" onClick={() => { setHidden(true); try { sessionStorage.setItem('promo-hidden', '1'); } catch { /* ignore */ } }}><X size={13} /></button>
    </div>
  );
}

/** Big hero on the dashboard: greeting + optional custom banner image. */
export function HeroBanner({ title, subtitle, children }) {
  const { settings } = useApp();
  const a = settings?.appearance;
  const custom = a?.bannerEnabled && a.bannerOnDashboard;
  return (
    <div className="promo-hero">
      <div>
        <h2><bdi>{custom && a.bannerTitle ? a.bannerTitle : title}</bdi></h2>
        <p><bdi>{custom && a.bannerSubtitle ? a.bannerSubtitle : subtitle}</bdi></p>
      </div>
      {custom && a.bannerImage && <img src={a.bannerImage} alt="" />}
      <div className="row" style={{ marginLeft: custom && a.bannerImage ? 0 : 'auto', gap: 8, flexShrink: 0 }}>{children}</div>
    </div>
  );
}
