'use strict';

const fs = require('fs');
const path = require('path');

const FONT_FAMILIES = {
  sans: "Arial, 'Segoe UI', Tahoma",
  mono: "Consolas, 'Lucida Console', 'Courier New'",
  condensed: "'Arial Narrow', 'Roboto Condensed', Arial",
  serif: "Georgia, 'Times New Roman'",
};

let fontCss = null;

/**
 * Embedded Noto Naskh Arabic (SIL OFL) so Urdu prints correctly on every PC,
 * even when Windows has no Urdu font installed.
 */
function urduFontCss() {
  if (fontCss !== null) return fontCss;
  try {
    const dir = path.join(__dirname, '..', '..', 'assets', 'fonts');
    const w400 = fs.readFileSync(path.join(dir, 'noto-naskh-arabic-arabic-400-normal.woff2')).toString('base64');
    const w700 = fs.readFileSync(path.join(dir, 'noto-naskh-arabic-arabic-700-normal.woff2')).toString('base64');
    fontCss = `
@font-face{font-family:'RPOS Urdu';font-weight:400;src:url(data:font/woff2;base64,${w400}) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF;}
@font-face{font-family:'RPOS Urdu';font-weight:700;src:url(data:font/woff2;base64,${w700}) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF;}`;
  } catch {
    fontCss = '';
  }
  return fontCss;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Text that may contain Urdu: let the browser pick direction per run. */
function t(s) {
  return `<bdi>${esc(s)}</bdi>`;
}

function baseCss({ paperWidth, marginTop, marginRight, marginBottom, marginLeft, fontSize, fontFamily, compact }) {
  const fam = FONT_FAMILIES[fontFamily] || FONT_FAMILIES.sans;
  const lh = compact ? 1.2 : 1.35;
  return `${urduFontCss()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#000}
body{width:${paperWidth}mm;padding:${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
  font-family:${fam},'RPOS Urdu',sans-serif;font-size:${fontSize}px;line-height:${lh};
  -webkit-print-color-adjust:exact;print-color-adjust:exact;overflow:hidden}
bdi{unicode-bidi:isolate}
table{width:100%;border-collapse:collapse}
td,th{vertical-align:top}
.r{text-align:right}.c{text-align:center}.l{text-align:left}
.b{font-weight:700}
.logo{display:flex;margin-bottom:${compact ? 1 : 2}mm}
.logo img{display:block;max-height:28mm;object-fit:contain;filter:grayscale(100%) contrast(1.2)}
.nowrap{white-space:nowrap}
.note{font-size:.85em;font-style:italic}
`;
}

function logoHtml(d) {
  const c = d.cfg;
  if (!c.showLogo || !d.business.logo) return '';
  const justify = { left: 'flex-start', right: 'flex-end', center: 'center' }[c.logoAlign] || 'center';
  return `<div class="logo" style="justify-content:${justify}"><img src="${d.business.logo}" style="width:${c.logoWidth}%" alt=""></div>`;
}

function wrap(css, body, title = 'Receipt') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}

module.exports = { FONT_FAMILIES, urduFontCss, esc, t, baseCss, logoHtml, wrap };
