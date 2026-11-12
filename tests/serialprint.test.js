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
