'use strict';

/** Pure helpers to recognise the thermal receipt printer among the printers Windows lists. */

const VIRTUAL = /pdf|xps|onenote|fax|anydesk|teamviewer|snagit|document writer|print to file|send to|virtual|cutepdf|foxit|adobe|nitro|primopdf|dopdf|remote desktop|rdp/i;
const THERMAL = /thermal|receipt|pos[-_ ]?\d|\bpos\b|xprinter|x-?printer|\bxp[-_ ]?\d|rongta|\brp\d{3}|epson.*tm|\btm[-_ ]?[a-z]?\d{2}|\btsp\d|star.*(tsp|sp\d)|bixolon|srp[-_ ]?\d|citizen|ct-?s\d|zjiang|\bzj[-_ ]?\d|gprinter|\bgp[-_ ]?\d|sunmi|munbyn|hoin|netum|3nstar|sewoo|snbc|black ?copper|bc[-_ ]?85|\b(58|80) ?mm|escpos|esc\/pos|generic.*text/i;
const OFFLINE = 0x80;
const ERROR_BITS = 0x2 | 0x8 | 0x10 | 0x20 | 0x40 | 0x100 | 0x200 | 0x400 | 0x800 | 0x1000 | 0x2000 | 0x4000; // error, paper jam/out/problem, no toner, ... (spooler bits)

const isVirtual = (p) => VIRTUAL.test(`${p.name} ${p.displayName || ''}`);
const isOffline = (p) => Number(p.status) > 0 && (Number(p.status) & OFFLINE) !== 0;

function score(p) {
  if (isVirtual(p)) return -100;
  const text = `${p.name} ${p.displayName || ''} ${p.description || ''}`;
  let s = 0;
  if (THERMAL.test(text)) s += 10;
  if (p.isDefault) s += 2;
  if (isOffline(p)) s -= 5;
  return s;
}

/** Best guess for the receipt printer: a thermal-looking device, else the Windows default, else any real printer. */
function pickThermal(printers) {
  const real = (printers || []).filter((p) => !isVirtual(p));
  if (!real.length) return null;
  const ranked = [...real].sort((a, b) => score(b) - score(a));
  return ranked[0];
}

module.exports = { isVirtual, isOffline, score, pickThermal, ERROR_BITS };
