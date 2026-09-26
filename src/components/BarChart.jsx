import { useState } from 'react';

/**
 * Single-series bar chart (SVG). Thin bars with rounded tops, recessive grid,
 * hover tooltip per bar. The title of the card names the series, so no legend.
 */
export default function BarChart({ data, height = 220, format = (v) => v, color = 'var(--primary)', empty = 'No sales yet' }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = height;
  const pad = { l: 8, r: 8, t: 14, b: 28 };
  const max = Math.max(0, ...data.map((d) => d.value));
  const nice = max <= 0 ? 1 : niceMax(max);
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const barW = Math.min(46, bw * 0.62);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const grid = [0, 0.5, 1].map((f) => nice * f);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" style={{ display: 'block', overflow: 'visible' }}>
        {grid.map((g) => (
          <line key={g} x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth="1" strokeDasharray={g === 0 ? '' : '3 4'} vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => {
          const x = pad.l + bw * i + (bw - barW) / 2;
          const top = y(d.value);
          const h = Math.max(0, H - pad.b - top);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + bw * i} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && <path className="chart-bar" d={roundedTop(x, top, barW, h, Math.min(4, h))} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
              <text x={x + barW / 2} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--text-3)">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {max <= 0 && <div className="faint small" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{empty}</div>}
      {hover !== null && data[hover] && (
        <div
          style={{
            position: 'absolute',
            left: `${((pad.l + bw * hover + bw / 2) / W) * 100}%`,
            top: Math.max(0, (y(data[hover].value) / H) * H - 44),
            transform: 'translateX(-50%)',
            background: 'var(--text)',
            color: 'var(--surface)',
            padding: '5px 9px',
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: 'var(--shadow)',
          }}
        >
          <b>{format(data[hover].value)}</b> · {data[hover].tip || data[hover].label}
        </div>
      )}
    </div>
  );
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function roundedTop(x, y, w, h, r) {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
