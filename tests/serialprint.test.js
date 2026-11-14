'use strict';

// COM / Bluetooth printers (no driver), Bluetooth pairing + USB driver install — parsing and the simulated flow.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const serial = require('../electron/printing/serial');
const pairing = require('../electron/printing/pairing');

test('Windows device list -> COM ports: Bluetooth outgoing port kept, incoming skipped, names joined', () => {
  const rows = [
    { Name: 'XP-P300', DeviceID: 'BTHENUM\\DEV_DC0D30A1B2C3\\7&1C4D&0&BLUETOOTHDEVICE_DC0D30A1B2C3', Status: 'OK' },
    { Name: 'Standard Serial over Bluetooth link (COM6)', DeviceID: 'BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}_LOCALMFG&0002\\7&2A1B&0&DC0D30A1B2C3_C00000000', Status: 'OK' },
    { Name: 'Standard Serial over Bluetooth link (COM5)', DeviceID: 'BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}_LOCALMFG&0000\\7&2A1B&0&000000000000_00000000', Status: 'OK' },
    { Name: 'USB-SERIAL CH340 (COM3)', DeviceID: 'USB\\VID_1A86&PID_7523\\5&1234', Status: 'OK' },
    { Name: 'Communications Port (COM1)', DeviceID: 'ACPI\\PNP0501\\0', Status: 'OK' },
  ];
  const ports = serial.parsePorts(JSON.stringify(rows));
  assert.deepEqual(ports.map((p) => p.port), ['COM6', 'COM3', 'COM1']);
  assert.equal(ports[0].kind, 'bluetooth'); assert.equal(ports[0].address, 'DC0D30A1B2C3'); assert.equal(ports[0].deviceName, 'XP-P300'); assert.equal(ports[0].name, 'serial:COM6');
  assert.equal(ports[1].kind, 'usb'); assert.equal(ports[1].deviceName, 'USB-SERIAL CH340');
  assert.equal(ports[2].kind, 'serial');
  assert.deepEqual(serial.parsePorts(JSON.stringify(rows[3])).map((p) => p.port), ['COM3'], 'a single object (not an array) is fine');
  assert.deepEqual(serial.parsePorts('not json'), []);
  assert.equal(serial.portOf('serial:com12'), 'COM12'); assert.equal(serial.portOf('EPSON TM'), null);
  assert.equal(serial.isSerialName('serial:COM5'), true); assert.equal(serial.isSerialName('POS-80'), false);
});

test('simulated Bluetooth printer: search, wrong PIN, pair with 1234 -> COM port appears, print bytes land in it, forget', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-bt-'));
  fs.writeFileSync(path.join(dir, 'bt.json'), JSON.stringify([
    { address: 'AA:BB:CC:00:11:22', name: 'Speaker', cod: 0x240404 },
    { address: 'DC0D30A1B2C3', name: 'BlueTooth Printer', cod: 0x1f00, pin: '1234' },
  ]));
  fs.writeFileSync(path.join(dir, 'ports.json'), '[]');
  fs.writeFileSync(path.join(dir, 'usb.json'), JSON.stringify([{ port: 'USB001', description: 'Virtual printer port for USB', hasPrinter: false }]));
  serial.setFake(dir);
  pairing.setFake(dir);
  const found = await pairing.btScan();
  assert.equal(found[0].name, 'BlueTooth Printer', 'printers first'); assert.equal(found[0].likelyPrinter, true); assert.equal(found[1].likelyPrinter, false);
  await assert.rejects(() => pairing.btPair({ address: 'DC0D30A1B2C3', pin: '0000' }), /Wrong PIN/);
  const r = await pairing.btPair({ address: 'DC0D30A1B2C3' }); // tries 0000 then 1234
  assert.equal(r.paired, true); assert.match(r.port, /^COM\d+$/); assert.equal(r.printer, `serial:${r.port}`);
  const ports = await serial.listPorts({ fresh: true });
  assert.equal(ports[0].kind, 'bluetooth'); assert.equal(ports[0].deviceName, 'BlueTooth Printer');
  const job = Buffer.alloc(5000, 0x1b);
  await serial.send(r.port, job, { speed: 'safe' });
  assert.equal(fs.readFileSync(path.join(dir, `${r.port}.bin`)).length, 5000, 'all bytes in order, chunked');
  assert.equal((await serial.probe(r.port)).ok, true);
  await pairing.btForget({ address: 'DC0D30A1B2C3' });
  assert.equal((await serial.listPorts({ fresh: true })).length, 0);
  await assert.rejects(() => serial.send(r.port, job), /does not exist/);
  // USB driver install
  assert.equal((await pairing.usbPorts())[0].hasPrinter, false);
  await assert.rejects(() => pairing.installGeneric({ port: 'LPT1' }), /USB port/);
  const u = await pairing.installGeneric({ port: 'USB001', name: 'Counter 58mm' });
  assert.equal(u.printer, 'Counter 58mm');
  assert.equal((await pairing.usbPorts())[0].hasPrinter, true);
  serial.setFake(null);
  pairing.setFake(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('COM helper errors become messages a cashier can act on (busy / missing / not answering / not connected)', () => {
  const m = (r) => serial.explainHelper(r, 'COM4').message;
  assert.match(m({ type: 'UnauthorizedAccessException', error: 'Access to the port COM4 is denied.' }), /being used by another program/);
  assert.match(m({ type: 'FileNotFoundException', error: 'x' }), /does not exist/);
  assert.match(m({ type: 'TimeoutException', error: 'The write timed out.' }), /did not answer/);
  assert.match(m({ type: 'IOException', error: 'The semaphore timeout period has expired.' }), /did not answer|not connected/);
  assert.match(m({ type: 'IOException', error: 'The device is not ready.' }), /not connected/);
  assert.match(m({ type: 'Weird', error: 'boom' }), /Printing on COM4 failed \(boom\)/);
});

test('jobs on one COM port run one at a time (no "port busy" between Test print and Verify)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-q-'));
  fs.writeFileSync(path.join(dir, 'ports.json'), JSON.stringify([{ port: 'COM4', kind: 'bluetooth', address: 'AABBCCDDEEFF', deviceName: 'PT-210' }]));
  serial.setFake(dir);
  const order = [];
  const a = serial.send('COM4', Buffer.alloc(3000, 1), { speed: 'safe' }).then(() => order.push('a'));
  const b = serial.send('COM4', Buffer.alloc(10, 2)).then(() => order.push('b'));
  const c = serial.probe('COM4').then(() => order.push('c'));
  await Promise.all([a, b, c]);
  assert.deepEqual(order, ['a', 'b', 'c']);
  const bin = fs.readFileSync(path.join(dir, 'COM4.bin'));
  assert.equal(bin.length, 3010); assert.equal(bin[0], 1); assert.equal(bin[3009], 2, 'the two jobs are not interleaved');
  serial.setFake(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Bluetooth pacing is slow and steady by default; a stalled printer gives a specific, no-retry message', () => {
  assert.deepEqual(serial.pace('auto', 'bluetooth'), serial.pace('medium', 'bluetooth'));
  assert.deepEqual(serial.pace('normal', 'bluetooth'), serial.pace('auto', 'bluetooth'), 'old saved "normal" is treated as auto');
  const rate = (s, k) => { const p = serial.pace(s, k); return p.chunk / (p.gap + 5); };
  assert.ok(rate('safe', 'bluetooth') < rate('auto', 'bluetooth') && rate('auto', 'bluetooth') < rate('fast', 'bluetooth'), 'safe < auto < fast');
  let e = serial.describeStall('opening', 'COM4');
  assert.match(e.message, /could not connect/); assert.equal(e.noRetry, true);
  e = serial.describeStall('sent:2560/30000', 'COM4');
  assert.match(e.message, /2560 of 30000 bytes/); assert.match(e.message, /Safe/);
  assert.match(serial.describeStall('opened:900', 'COM4').message, /did not accept/);
  const job = serial.textTestJob();
  assert.equal(job[0], 0x1b); assert.equal(job[1], 0x40); assert.match(job.toString('latin1'), /Printer test OK/);
});

test('text test goes through the COM path in one small job', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-tt-'));
  fs.writeFileSync(path.join(dir, 'ports.json'), JSON.stringify([{ port: 'COM4', kind: 'bluetooth', address: 'AABBCCDDEEFF', deviceName: 'PT-210' }]));
  serial.setFake(dir);
  await serial.send('COM4', serial.textTestJob(), { kind: 'bluetooth' });
  const bin = fs.readFileSync(path.join(dir, 'COM4.bin'));
  assert.ok(bin.length < 200); assert.match(bin.toString('latin1'), /DT Retail POS/);
  serial.setFake(null);
  fs.rmSync(dir, { recursive: true, force: true });
});
