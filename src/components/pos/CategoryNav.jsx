import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Ellipsis } from 'lucide-react';
import { CategoryIcon } from '../CategoryIcon';

const GAP = 8;
const MORE_W = 76; // room kept for the "⋯ +n" button

function Chip({ c, active, onClick }) {
  if (c.all) {
    return (
      <button type="button" className={`cat-chip ${active ? 'on' : ''}`} style={active ? { background: 'var(--text)' } : undefined} onClick={onClick}>
        <LayoutGrid size={16} /> All
      </button>
    );
  }
  return (
    <button type="button" className={`cat-chip ${active ? 'on' : ''}`} style={active ? { background: c.color } : undefined} onClick={onClick}>
      {active ? <CategoryIcon name={c.icon} size={16} /> : <span className="dot" style={{ background: c.color }} />}
      <bdi>{c.name}</bdi>
    </button>
  );
}

/**
 * One-line category bar. Chips that do not fit are not scrolled: they sit behind a "⋯" button that opens
 * a list with every category that did not fit. The selected category is always kept on the line.
 */
export function CategoryBar({ cats, cat, setCat }) {
  const wrap = useRef(null);
  const ruler = useRef(null);
  const pop = useRef(null);
  const [fit, setFit] = useState(Infinity);
  const [open, setOpen] = useState(false);
  const items = useMemo(() => [{ id: null, name: 'All', all: true }, ...cats], [cats]);

  useLayoutEffect(() => {
    const calc = () => {
      const w = wrap.current ? wrap.current.clientWidth : 0;
      const kids = ruler.current ? [...ruler.current.children] : [];
      if (!w || !kids.length) return;
      const widths = kids.map((k) => k.offsetWidth + 6); // +6: the selected chip is a little wider
      if (widths.reduce((a, b) => a + b + GAP, -GAP) <= w) {
        setFit(Infinity);
        return;
      }
      let used = MORE_W;
      let n = 0;
      for (const x of widths) {
        if (used + x + GAP > w) break;
        used += x + GAP;
        n += 1;
      }
      setFit(Math.max(1, n));
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (wrap.current) ro.observe(wrap.current);
    return () => {
      ro.disconnect();
    };
  }, [items]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (pop.current && !pop.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  const n = Math.min(fit, items.length);
  let visible = items.slice(0, n);
  let hidden = items.slice(n);
  const sel = items.find((c) => (c.all ? !cat : c.id === cat));
  if (sel && hidden.includes(sel) && visible.length) {
    // keep the chosen category on the line: it takes the last slot, the displaced one moves into the list
    const displaced = visible[visible.length - 1];
    visible = [...visible.slice(0, -1), sel];
    hidden = [displaced, ...hidden.filter((c) => c !== sel)];
  }

  return (
    <div className="cats-wrap" ref={wrap}>
      <div className="cats-ruler" ref={ruler} aria-hidden="true">
        {items.map((c) => <Chip key={c.all ? 'all' : c.id} c={c} active={false} onClick={() => {}} />)}
      </div>
      <div className="cats">
        {visible.map((c) => {
          const active = c.all ? !cat : cat === c.id;
          return <Chip key={c.all ? 'all' : c.id} c={c} active={active} onClick={() => setCat(c.all ? null : c.id)} />;
        })}
        {hidden.length > 0 && (
          <div className="cats-more" ref={pop}>
            <button type="button" className={`cat-chip more ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)} title="More categories" aria-expanded={open}>
              <Ellipsis size={18} /> <span className="count">+{hidden.length}</span>
            </button>
            {open && (
              <div className="cats-pop" role="menu">
                {hidden.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className="cats-pop-item"
                    onClick={() => {
                      setCat(c.id);
                      setOpen(false);
                    }}
                  >
                    <span className="dot" style={{ background: c.color }} />
                    <bdi>{c.name}</bdi>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Vertical category list that sits on the left of the product grid. */
export function CategoryRail({ cats, cat, setCat }) {
  return (
    <div className="cat-rail" role="tablist" aria-label="Categories">
      <button type="button" className={`rail-item ${!cat ? 'on' : ''}`} style={!cat ? { background: 'var(--text)' } : undefined} onClick={() => setCat(null)}>
        <LayoutGrid size={17} /> <span>All</span>
      </button>
      {cats.map((c) => {
        const active = cat === c.id;
        return (
          <button type="button" key={c.id} className={`rail-item ${active ? 'on' : ''}`} style={active ? { background: c.color } : { '--c': c.color }} onClick={() => setCat(c.id)}>
            {active ? <CategoryIcon name={c.icon} size={17} /> : <span className="dot" style={{ background: c.color }} />}
            <span><bdi>{c.name}</bdi></span>
          </button>
        );
      })}
    </div>
  );
}
