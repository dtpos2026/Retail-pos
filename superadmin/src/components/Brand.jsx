import lockupWhite from '../assets/brand/dt-lockup-white.png';
import lockupPurple from '../assets/brand/dt-lockup-purple.png';

export const BRAND = { developer: 'Digital Target', product: 'Retail POS', panel: 'Super Admin', email: 'digitaltarget.digital@gmail.com', version: '1.1.0' };
export const DT_LOCKUP_WHITE = lockupWhite;
export const DT_LOCKUP_PURPLE = lockupPurple;

export function DtMark({ size = 28, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 340 340" fill="currentColor" style={style} aria-hidden="true">
      <path d="M0 0H168.5V168.5Z" /><path d="M171 0H340V168.5Z" /><path d="M0 171.5H168.5V340Z" /><path d="M171 171.5H340V340Z" />
    </svg>
  );
}

export function Floaters() {
  const spots = [[8, 18, 90, -8, 0], [70, 8, 60, 12, 2], [82, 62, 120, 20, 4], [22, 72, 70, -14, 1], [50, 40, 46, 30, 3]];
  return (
    <div className="floaters">
      {spots.map(([x, y, size, r, d], i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 340 340" fill="currentColor" style={{ left: `${x}%`, top: `${y}%`, '--r': `${r}deg`, animationDelay: `-${d * 2.3}s`, animationDuration: `${10 + i * 2}s` }}>
          <path d="M0 0H168.5V168.5Z" /><path d="M171 0H340V168.5Z" /><path d="M0 171.5H168.5V340Z" /><path d="M171 171.5H340V340Z" />
        </svg>
      ))}
    </div>
  );
}

export function DevFooter() {
  return (
    <a className="dt-foot" href={`mailto:${BRAND.email}`} style={{ textDecoration: 'none' }}>
      <img src={lockupWhite} alt={BRAND.developer} />
      <span className="mk"><DtMark size={26} /></span>
      <div className="txt">
        <div className="t">Powered by</div>
        <div className="n">{BRAND.developer}</div>
        <div className="v">Super Admin v{BRAND.version}</div>
      </div>
    </a>
  );
}
