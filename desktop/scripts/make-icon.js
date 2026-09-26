// Renders build/icon.svg to build/icon.png (512px) and build/icon.ico (multi-size).
// Run with: npx electron scripts/make-icon.js
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html,<html><body style="margin:0;background:transparent">${encodeURIComponent(svg.replace('<svg ', '<svg width="512" height="512" '))}</body></html>`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const out = path.join(__dirname, '..', 'build');
  fs.writeFileSync(path.join(out, 'icon.png'), img.toPNG());
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngs = sizes.map((s) => nativeImage.createFromBuffer(img.toPNG()).resize({ width: s, height: s, quality: 'best' }).toPNG());
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const dir = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0);
    e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([header, ...dir, ...pngs]));
  console.log('icons written');
  app.quit();
});
