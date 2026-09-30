import { useEffect, useRef, useState } from 'react';
import { Send, RefreshCw, LifeBuoy } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Button } from './ui';
import { formatDateTime } from '../lib/format';

/** Two-way notes with the provider (Digital Target). Needs internet; everything else in the POS works offline. */
export default function SupportBox({ compact }) {
  const { toast, toastError } = useApp();
  const [msgs, setMsgs] = useState(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  const load = () => {
    setErr('');
    api('support.list').then(setMsgs).catch((e) => { setErr(e.message); setMsgs([]); });
  };
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [msgs]);

  const send = async () => {
    setBusy(true);
    try {
      await api('support.send', { text });
      setText('');
      toast('Message sent');
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row"><LifeBuoy size={18} color="var(--primary)" /><b className="grow">Messages with your provider</b><Button size="sm" icon={RefreshCw} onClick={load}>Refresh</Button></div>
      {err && <div className="badge amber" style={{ whiteSpace: 'normal', padding: '8px 12px', borderRadius: 10 }}>{err}</div>}
      <div className="col" style={{ gap: 8, maxHeight: compact ? 160 : 320, overflow: 'auto', padding: 4 }}>
        {msgs && msgs.length === 0 && !err && <div className="muted small">No messages yet. Write to your provider below.</div>}
        {(msgs || []).map((m) => (
          <div key={m.id} style={{ alignSelf: m.from === 'shop' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{ background: m.from === 'shop' ? 'var(--primary)' : 'var(--surface-3)', color: m.from === 'shop' ? 'var(--on-primary, #fff)' : 'var(--text)', borderRadius: 14, padding: '8px 12px', whiteSpace: 'pre-wrap' }}><bdi>{m.text}</bdi></div>
            <div className="small faint" style={{ textAlign: m.from === 'shop' ? 'right' : 'left' }}>{m.from === 'shop' ? 'You' : 'Provider'} · {m.createdAt ? formatDateTime(m.createdAt.replace('T', ' ').slice(0, 19)) : ''}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="row">
        <textarea className="textarea" rows={2} style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" dir="auto" />
        <Button variant="primary" icon={Send} onClick={send} loading={busy} disabled={!text.trim()}>Send</Button>
      </div>
    </div>
  );
}
