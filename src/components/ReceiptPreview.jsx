import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Loading } from './ui';

/**
 * Renders the exact HTML that will be sent to the printer inside an iframe,
 * scaled to the paper width, so what you see is what prints.
 */
export default function ReceiptPreview({ args, method = 'print.receiptHtml', index = 0, maxHeight, html: fixed }) {
  const [html, setHtml] = useState(fixed || null);
  const [error, setError] = useState('');
  const [height, setHeight] = useState(400);
  const ref = useRef(null);
  const key = JSON.stringify(args);

  useEffect(() => {
    if (fixed) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      api(method, args)
        .then((h) => alive && setHtml(Array.isArray(h) ? h[index] : h))
        .catch((e) => alive && setError(e.message));
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key, method, index, fixed]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLoad = () => {
    const doc = ref.current?.contentDocument;
    if (doc) setHeight(Math.ceil(doc.body.getBoundingClientRect().height) + 4);
  };

  if (error) return <div className="badge red">{error}</div>;
  if (!html) return <Loading />;
  const width = /width:(\d+)mm/.exec(html)?.[1] || 80;
  return (
    <div className="preview-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <iframe ref={ref} title="Receipt preview" className="preview-frame" srcDoc={html} onLoad={onLoad} style={{ width: `${width}mm`, height }} sandbox="allow-same-origin" />
    </div>
  );
}
