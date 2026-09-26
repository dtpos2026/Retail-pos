import { useEffect, useRef } from 'react';
import { X, Search, Inbox } from 'lucide-react';
import { formatMoney } from '../lib/format';
import { useApp } from '../context/AppContext';

export function Button({ variant, size, icon: Icon, children, loading, className = '', ...props }) {
  const cls = ['btn', variant, size, !children && Icon ? 'icon' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : Icon ? <Icon size={size === 'sm' ? 15 : 18} /> : null}
      {children}
    </button>
  );
}

// Only the top-most open modal reacts to Escape.
const modalStack = [];

export function Modal({ title, icon: Icon, onClose, children, footer, size, closeOnOverlay = false }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const onKey = (e) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === token) {
        e.stopPropagation();
        closeRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      modalStack.splice(modalStack.indexOf(token), 1);
    };
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => closeOnOverlay && e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size || ''}`} role="dialog">
        <div className="modal-head">
          {Icon && (
            <div className="thumb" style={{ background: 'var(--primary-50)', color: 'var(--primary)', width: 36, height: 36 }}>
              <Icon size={19} />
            </div>
          )}
          <h3>{title}</h3>
          {onClose && <Button variant="ghost" className="x" icon={X} onClick={onClose} title="Close (Esc)" />}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className = '', style }) {
  return (
    <div className={`field ${className}`} style={style}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Input({ autoFocus, selectOnFocus, className = '', ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      if (selectOnFocus) ref.current.select();
    }
  }, [autoFocus, selectOnFocus]);
  return <input ref={ref} className={`input ${className}`} onFocus={selectOnFocus ? (e) => e.target.select() : undefined} {...props} />;
}

export function NumberInput({ value, onChange, ...props }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step="any"
      value={value === null || value === undefined ? '' : value}
      onChange={(e) => onChange(e.target.value)}
      onWheel={(e) => e.target.blur()}
      {...props}
    />
  );
}

export function Select({ options, className = '', ...props }) {
  return (
    <select className={`select ${className}`} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Switch({ checked, onChange, disabled }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function ToggleRow({ title, desc, checked, onChange, disabled }) {
  return (
    <div className="toggle-row">
      <div className="t">
        <div>{title}</div>
        {desc && <div>{desc}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Check({ label, checked, onChange }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Badge({ color, children }) {
  return <span className={`badge ${color || ''}`}>{children}</span>;
}

export function Empty({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="empty">
      <div className="ic">
        <Icon size={30} />
      </div>
      <h4>{title}</h4>
      {text && <p>{text}</p>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', inputRef, onKeyDown, autoFocus, style }) {
  return (
    <div className="input-icon" style={style}>
      <Search size={17} />
      <input ref={inputRef} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} autoFocus={autoFocus} />
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>
          {t.icon && <t.icon size={16} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} title={o.title}>
          {o.icon && <o.icon size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Money({ value, className }) {
  const { settings } = useApp();
  return <span className={className}>{formatMoney(value, settings?.general?.currency || 'Rs.')}</span>;
}

export function Stat({ icon: Icon, label, value, hint, color = '#4f46e5', hero }) {
  return (
    <div className={`card stat ${hero ? 'hero' : ''}`}>
      <div className="ic" style={hero ? undefined : { background: `${color}18`, color }}>
        <Icon size={22} />
      </div>
      <div className="grow">
        <div className="l">{label}</div>
        <div className="v">{value}</div>
        {hint && <div className="h">{hint}</div>}
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  completed: 'green',
  paid: 'green',
  pending: 'amber',
  partial: 'amber',
  unpaid: 'red',
  cancelled: 'red',
  refunded: 'blue',
  preparing: 'amber',
  ready: 'green',
  served: 'blue',
  available: 'green',
  occupied: 'red',
  reserved: 'amber',
};

export function StatusBadge({ status }) {
  return <Badge color={STATUS_COLORS[status]}>{String(status || '').replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}
