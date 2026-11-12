import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, ShoppingCart, Armchair, Bike, PauseCircle, Banknote, Ticket, Wallet, Package, ChefHat, Boxes, Users2, Printer, ReceiptText,
  BarChart3, UserCog, DatabaseBackup, KeyRound, Keyboard, Wrench, CircleHelp, MapPin, Lightbulb, ArrowUpRight, Search, BookOpen, ChevronDown,
} from 'lucide-react';
import '@fontsource/noto-nastaliq-urdu/arabic-400.css';
import '@fontsource/noto-nastaliq-urdu/arabic-700.css';
import { useApp } from '../context/AppContext';
import { TOPICS, FAQ, GROUPS, UI } from '../lib/helpContent';
import { Button, Seg } from './ui';

const ICONS = { Rocket, ShoppingCart, Armchair, Bike, PauseCircle, Banknote, Ticket, Wallet, Package, ChefHat, Boxes, Users2, Printer, ReceiptText, BarChart3, UserCog, DatabaseBackup, KeyRound, Keyboard, Wrench };
const LANG_KEY = 'rpos-help-lang';

const norm = (s) => String(s || '').toLowerCase();
const topicText = (t) => norm([t.title.en, t.title.ur, t.where.en, t.where.ur, ...(t.steps.en || []), ...(t.steps.ur || []), ...(t.tips?.en || []), ...(t.tips?.ur || [])].join(' '));
const faqText = (f) => norm([f.q.en, f.q.ur, f.a.en, f.a.ur].join(' '));

/** Bilingual (English / Urdu Nastaliq) help guide: searchable topics with "where to find it", steps and tips, plus FAQ. */
export default function HelpGuide() {
  const { can } = useApp();
  const navigate = useNavigate();
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(LANG_KEY) === 'ur' ? 'ur' : 'en'; } catch { return 'en'; }
  });
  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  };
  const [q, setQ] = useState('');
  const [active, setActive] = useState('start');
  const [openFaq, setOpenFaq] = useState(0);
  const ur = lang === 'ur';
  const L = (o) => o[lang];

  const needle = norm(q.trim());
  const topics = useMemo(() => TOPICS.filter((t) => !needle || topicText(t).includes(needle)), [needle]);
  const faqs = useMemo(() => FAQ.map((f, i) => ({ ...f, i })).filter((f) => !needle || faqText(f).includes(needle)), [needle]);
  const showFaqEntry = !needle || faqs.length > 0;

  // keep the selected topic valid while searching
  useEffect(() => {
    if (active === 'faq' && showFaqEntry) return;
    if (topics.some((t) => t.id === active)) return;
    setActive(topics[0] ? topics[0].id : showFaqEntry ? 'faq' : '');
  }, [topics, showFaqEntry, active]);

  const topic = TOPICS.find((t) => t.id === active);
  const grouped = Object.keys(GROUPS).map((g) => ({ key: g, items: topics.filter((t) => t.group === g) })).filter((g) => g.items.length);

  return (
    <div className={`help ${ur ? 'ur' : ''}`} dir={ur ? 'rtl' : 'ltr'}>
      <div className="help-head">
        <div className="help-badge"><BookOpen size={22} /></div>
        <div className="grow">
          <h2 className={ur ? 'urdu' : ''}>{L(UI.title)}</h2>
          <div className={`help-sub ${ur ? 'urdu' : ''}`}>{L(UI.sub)}</div>
        </div>
        <div dir="ltr"><Seg value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'ur', label: 'اردو' }]} /></div>
      </div>

      <div className="help-search">
        <Search size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(UI.search)} className={ur ? 'urdu' : ''} dir="auto" />
        <span className="help-count">{topics.length} / {TOPICS.length}</span>
      </div>

      <div className="help-body">
        <nav className="help-index">
          {grouped.map((g) => (
            <div key={g.key} className="help-group">
              <div className={`help-group-title ${ur ? 'urdu' : ''}`}>{L(GROUPS[g.key])}</div>
              {g.items.map((t) => {
                const Icon = ICONS[t.icon] || CircleHelp;
                return (
                  <button key={t.id} className={active === t.id ? 'on' : ''} onClick={() => setActive(t.id)}>
                    <Icon size={17} />
                    <span className={ur ? 'urdu' : ''}>{L(t.title)}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {showFaqEntry && (
            <div className="help-group">
              <div className={`help-group-title ${ur ? 'urdu' : ''}`}>{ur ? 'سوال جواب' : 'Questions'}</div>
              <button className={active === 'faq' ? 'on' : ''} onClick={() => setActive('faq')}>
                <CircleHelp size={17} />
                <span className={ur ? 'urdu' : ''}>{L(UI.faq)}</span>
              </button>
            </div>
          )}
          {!grouped.length && !showFaqEntry && <div className={`help-none ${ur ? 'urdu' : ''}`}>{L(UI.none)}</div>}
        </nav>

        <article className="help-article">
          {active === 'faq' && showFaqEntry && (
            <>
              <div className="help-title"><div className="help-ic"><CircleHelp size={22} /></div><h3 className={ur ? 'urdu' : ''}>{L(UI.faq)}</h3></div>
              <div className="help-faq">
                {faqs.map((f) => {
                  const on = needle ? true : openFaq === f.i;
                  return (
                    <div key={f.i} className={`help-faq-item ${on ? 'on' : ''}`}>
                      <button onClick={() => setOpenFaq(on && !needle ? -1 : f.i)}>
                        <span className={ur ? 'urdu' : ''}>{L(f.q)}</span>
                        <ChevronDown size={18} />
                      </button>
                      {on && <div className={`help-faq-a ${ur ? 'urdu' : ''}`}>{L(f.a)}</div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {topic && active !== 'faq' && (() => {
            const Icon = ICONS[topic.icon] || CircleHelp;
            const canOpen = topic.to && (!topic.perm || can(topic.perm));
            const tips = (topic.tips && topic.tips[lang]) || [];
            const isKeys = topic.id === 'keys';
            return (
              <>
                <div className="help-title">
                  <div className="help-ic"><Icon size={22} /></div>
                  <h3 className={ur ? 'urdu' : ''}>{L(topic.title)}</h3>
                  {canOpen && <Button size="sm" icon={ArrowUpRight} onClick={() => navigate(topic.to)}><span className={ur ? 'urdu' : ''}>{L(UI.open)}</span></Button>}
                </div>
                <div className="help-where">
                  <MapPin size={16} />
                  <div><b className={ur ? 'urdu' : ''}>{L(UI.where)}:</b> <span className={ur ? 'urdu' : ''}>{L(topic.where)}</span></div>
                </div>
                <div className={`help-section-title ${ur ? 'urdu' : ''}`}>{L(UI.steps)}</div>
                {isKeys ? (
                  <div className="help-keys" dir="ltr">
                    {topic.steps.en.map((line, i) => {
                      const [k, ...rest] = line.split(' — ');
                      return <div key={k}><kbd>{k}</kbd><span className={ur ? 'urdu' : ''} dir={ur ? 'rtl' : 'ltr'}>{ur ? topic.steps.ur[i].split(' — ').slice(1).join(' — ') : rest.join(' — ')}</span></div>;
                    })}
                  </div>
                ) : (
                  <ol className="help-steps">
                    {topic.steps[lang].map((s, i) => (
                      <li key={i}><span className="n">{ur ? new Intl.NumberFormat('ur-PK').format(i + 1) : i + 1}</span><span className={ur ? 'urdu' : ''}>{s}</span></li>
                    ))}
                  </ol>
                )}
                {tips.length > 0 && (
                  <div className="help-tips">
                    <div className={`help-tips-title ${ur ? 'urdu' : ''}`}><Lightbulb size={16} /> {L(UI.tips)}</div>
                    <ul>{tips.map((s, i) => <li key={i} className={ur ? 'urdu' : ''}>{s}</li>)}</ul>
                  </div>
                )}
              </>
            );
          })()}
        </article>
      </div>
    </div>
  );
}
