import { useEffect, useMemo, useRef, useState } from 'react';
import { LifeBuoy, Send, Trash2, MessageCircle } from 'lucide-react';
import { useAdmin } from '../context';
import { watch } from '../lib/data';
import { watchThreads, watchMessages, sendAdminMessage, markThreadRead, deleteThread, deleteMessage } from '../lib/support';
import { PageHead, Button, SearchBox, Loading, Empty } from '../components/ui';
import { fmtDateTime, initials, tsToDate } from '../lib/format';

export default function Support() {
  const { toastError, toast, confirm } = useAdmin();
  const [threads, setThreads] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [active, setActive] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    const a = watchThreads(setThreads, (e) => { toastError(e); setThreads([]); });
    const b = watch('licenses', setLicenses, () => {});
    return () => { a(); b(); };
  }, [toastError]);

  // One row per license: threads with messages first, then licenses that have never written.
  const list = useMemo(() => {
    const by = new Map((threads || []).map((t) => [t.id, t]));
    const all = licenses.map((l) => ({ id: l.id, businessName: l.businessName, ...(by.get(l.id) || {}) }));
    const s = q.trim().toLowerCase();
    return all
      .filter((t) => !s || String(t.businessName).toLowerCase().includes(s))
      .sort((a, b) => (b.unreadAdmin ? 1 : 0) - (a.unreadAdmin ? 1 : 0) || (tsToDate(b.lastAt) || 0) - (tsToDate(a.lastAt) || 0) || String(a.businessName).localeCompare(b.businessName));
  }, [threads, licenses, q]);

  useEffect(() => {
    if (!active) return undefined;
    setMsgs([]);
    const off = watchMessages(active, setMsgs, toastError);
    markThreadRead(active).catch(() => {});
    return off;
  }, [active, toastError]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [msgs]);

  if (!threads) return <Loading />;
  const cur = list.find((t) => t.id === active);

  const send = async () => {
    setBusy(true);
    try {
      await sendAdminMessage(active, cur?.businessName, text);
      setText('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (!(await confirm({ title: `Delete the whole conversation with ${cur.businessName}?`, danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteThread(active);
      setActive('');
      toast('Conversation deleted');
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Support" sub="Messages between you and your clients' POS. Clients write from Retail POS → Settings → Support." />
      <div className="grid" style={{ gridTemplateColumns: '320px 1fr', alignItems: 'stretch', minHeight: 'calc(100vh - 230px)' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-pad"><SearchBox value={q} onChange={setQ} placeholder="Search client…" /></div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {list.length === 0 ? <Empty icon={LifeBuoy} title="No clients yet" text="Issue a license to start a conversation." /> : list.map((t) => (
              <div key={t.id} className="list-item" style={{ cursor: 'pointer', background: active === t.id ? 'var(--primary-50)' : undefined }} onClick={() => setActive(t.id)}>
                <div className="thumb" style={{ width: 36, height: 36, fontSize: 13, background: 'var(--primary-50)', color: 'var(--primary)' }}>{initials(t.businessName)}</div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="b ellipsis"><bdi>{t.businessName}</bdi></div>
                  <div className="small faint ellipsis">{t.lastText || 'No messages yet'}</div>
                </div>
                {t.unreadAdmin && <span className="badge-dot">new</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          {!cur ? (
            <Empty icon={MessageCircle} title="Select a client" text="Pick a client on the left to read and answer their messages." />
          ) : (
            <>
              <div className="card-head"><b><bdi>{cur.businessName}</bdi></b><div className="actions"><Button size="sm" variant="danger-ghost" icon={Trash2} onClick={clear}>Delete chat</Button></div></div>
              <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 280 }}>
                {msgs.length === 0 && <div className="muted small center" style={{ margin: 'auto' }}>No messages yet. Write the first one below.</div>}
                {msgs.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.from === 'admin' ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                    <div style={{ background: m.from === 'admin' ? 'var(--primary)' : 'var(--surface-3)', color: m.from === 'admin' ? 'var(--on-primary, #fff)' : 'var(--text)', borderRadius: 14, padding: '9px 13px', whiteSpace: 'pre-wrap' }}><bdi>{m.text}</bdi></div>
                    <div className="small faint" style={{ textAlign: m.from === 'admin' ? 'right' : 'left', marginTop: 2 }}>
                      {m.from === 'admin' ? 'You' : 'Shop'} · {fmtDateTime(m.createdAt)} · <a href="#/support" onClick={(e) => { e.preventDefault(); deleteMessage(active, m.id).catch(toastError); }}>delete</a>
                    </div>
                  </div>
                ))}
                <div ref={end} />
              </div>
              <div className="card-pad row" style={{ borderTop: '1px solid var(--border)' }}>
                <textarea className="textarea" rows={2} style={{ flex: 1 }} placeholder="Write a message…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) send(); }} dir="auto" />
                <Button variant="primary" icon={Send} onClick={send} loading={busy} disabled={!text.trim()}>Send</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
