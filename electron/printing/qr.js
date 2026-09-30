'use strict';

const QRCode = require('qrcode');

/** Inline SVG QR code (sync, crisp at any size, prints perfectly on thermal paper). */
function qrSvg(text, { margin = 0 } = {}) {
  const qr = QRCode.create(String(text), { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const size = n + margin * 2;
  let path = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (qr.modules.get(y, x)) {
        let run = 1;
        while (x + run < n && qr.modules.get(y, x + run)) run++;
        path += `M${x + margin} ${y + margin}h${run}v1h-${run}z`;
        x += run;
      } else x++;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" style="display:block;width:100%;height:100%"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

module.exports = { qrSvg };
