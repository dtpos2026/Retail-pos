import { Mail, Phone, MessageCircle, Globe, ThumbsUp, Camera } from 'lucide-react';
import { BRAND, brandLinks } from '@shared/brand.mjs';
import lockupWhite from '../assets/brand/dt-lockup-white.png';
import lockupPurple from '../assets/brand/dt-lockup-purple.png';

export const DT_LOCKUP_WHITE = lockupWhite;
export const DT_LOCKUP_PURPLE = lockupPurple;

/** The Digital Target mark (four triangles) as inline SVG — takes the current text colour. */
export function DtMark({ size = 28, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 340 340" fill="currentColor" style={style} aria-hidden="true">
      <path d="M0 0H168.5V168.5Z" />
      <path d="M171 0H340V168.5Z" />
      <path d="M0 171.5H168.5V340Z" />
      <path d="M171 171.5H340V340Z" />
    </svg>
  );
}

const ICONS = { whatsapp: MessageCircle, phone: Phone, email: Mail, website: Globe, facebook: ThumbsUp, instagram: Camera };

export function openLink(url) {
  window.open(url, '_blank');
}

/** "Powered by Digital Target · v1.1.0" strip for the sidebar. */
export function DevFooter({ version }) {
  return (
    <button className="dt-foot" onClick={() => openLink(`mailto:${BRAND.email}`)} title={`${BRAND.developer} — ${BRAND.email}`}>
      <img src={lockupWhite} alt={BRAND.developer} />
      <span className="mk"><DtMark size={26} /></span>
      <div className="txt">
        <div className="t">Powered by</div>
        <div className="n">{BRAND.developer}</div>
        <div className="v">v{version}</div>
      </div>
    </button>
  );
}

export function ContactButtons() {
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      {brandLinks().map((l) => {
        const Icon = ICONS[l.key] || Globe;
        return (
          <button key={l.key} className="contact-btn" onClick={() => openLink(l.url)}>
            <Icon size={16} /> {l.label}
          </button>
        );
      })}
    </div>
  );
}
