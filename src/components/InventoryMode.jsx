import { useState } from 'react';
import { ShoppingBag, ChefHat, Lock, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Button, Badge } from './ui';

const RESTAURANT_TYPES = ['restaurant', 'fastfood', 'cafe'];

export const MODE_INFO = {
  retail: {
    icon: ShoppingBag,
    title: 'Retail / Store',
    urdu: 'دکان / ریٹیل',
    text: 'Items are sold as they are (kiryana, mart, bakery goods, cold drinks). Every product is its own stock: buying adds to it, selling takes from it.',
  },
  restaurant: {
    icon: ChefHat,
    title: 'Restaurant / Kitchen',
    urdu: 'ریسٹورنٹ / کچن',
    text: 'Food is cooked. Inventory is your raw items (ghee, chicken, mutton, daal, rice…). Menu dishes have no stock of their own: their recipe takes the raw items out of inventory with every sale.',
  },
};

/**
 * One-time choice of how stock works. After it is saved it is locked (the server refuses changes);
 * inventory tracking itself can still be switched on and off.
 */
export default function InventoryModeCard({ onSaved }) {
  const { settings, reloadSettings, confirm, toast, toastError, can } = useApp();
  const inv = settings.inventory;
  const suggested = RESTAURANT_TYPES.includes(settings.business?.businessType) ? 'restaurant' : 'retail';
  const [pick, setPick] = useState(inv.mode || suggested);
  const [busy, setBusy] = useState(false);

  if (inv.modeLocked && inv.mode) {
    const m = MODE_INFO[inv.mode];
    const Icon = m.icon;
    return (
      <div className="card card-pad row inv-mode-locked" style={{ gap: 14, alignItems: 'flex-start' }}>
        <div className="inv-mode-ic"><Icon size={22} /></div>
        <div className="grow">
          <div className="row" style={{ gap: 8 }}><b style={{ fontSize: 15 }}>Inventory type: {m.title}</b><Badge color="indigo"><Lock size={11} /> Locked</Badge></div>
          <div className="small muted" style={{ marginTop: 4 }}>{m.text}</div>
          <div className="small faint" style={{ marginTop: 4 }}>This was chosen once and cannot be changed (only Settings → General → Factory reset clears it). Inventory tracking itself can still be switched on or off below.</div>
        </div>
      </div>
    );
  }

  const save = async () => {
    const m = MODE_INFO[pick];
    const ok = await confirm({
      title: `Use "${m.title}" inventory?`,
      message: `${m.text}\n\nThis choice is permanent — it cannot be changed later (only a factory reset clears it).${pick === 'restaurant' ? '\n\nMenu items will stop carrying their own stock. Add your raw items in Inventory and link them to dishes through Recipe management.' : ''}`,
      confirmText: 'Save & lock',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api('inventory.setMode', { mode: pick });
      await reloadSettings();
      toast(`Inventory type set to ${m.title}`);
      onSaved?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad col" style={{ gap: 14 }}>
      <div>
        <div className="b" style={{ fontSize: 16 }}>What kind of business is the inventory for?</div>
        <div className="small muted">Choose once. It decides what "stock" means in this software.</div>
      </div>
      <div className="inv-mode-grid">
        {Object.entries(MODE_INFO).map(([key, m]) => {
          const Icon = m.icon;
          return (
            <button type="button" key={key} className={`inv-mode-opt ${pick === key ? 'on' : ''}`} onClick={() => setPick(key)}>
              <div className="row" style={{ gap: 10 }}>
                <div className="inv-mode-ic"><Icon size={22} /></div>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b>{m.title}</b>
                  <div className="urdu small" dir="rtl">{m.urdu}</div>
                </div>
                {pick === key && <CheckCircle2 size={20} color="var(--primary)" />}
              </div>
              <div className="small muted" style={{ textAlign: 'left', marginTop: 8 }}>{m.text}</div>
              {key === suggested && <div className="small" style={{ marginTop: 6, color: 'var(--primary)', textAlign: 'left' }}>Suggested for your business type</div>}
            </button>
          );
        })}
      </div>
      {can('settings') ? (
        <Button variant="primary" icon={Lock} onClick={save} loading={busy} style={{ alignSelf: 'flex-start' }}>Save &amp; lock this choice</Button>
      ) : (
        <div className="small muted">Ask the admin to choose this in Settings → Inventory.</div>
      )}
    </div>
  );
}
