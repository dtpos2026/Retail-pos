// Order total calculation shared by the POS screen (live preview) and the
// main process (authoritative totals saved to the database).

export function round2(n) {
  const v = Number(n) || 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * @param {object} p
 * @param {{qty:number, unitPrice:number, unitDiscount?:number}[]} p.items
 * @param {number} [p.orderDiscount]   flat amount off the order
 * @param {number} [p.deliveryCharges]
 * @param {boolean} [p.taxEnabled]
 * @param {number} [p.taxRate]         percent
 * @param {boolean} [p.roundTotal]     round grand total to whole rupees
 */
export function calcOrder({ items = [], orderDiscount = 0, deliveryCharges = 0, taxEnabled = false, taxRate = 0, roundTotal = false }) {
  let subtotal = 0;
  let itemDiscount = 0;
  const lines = items.map((it) => {
    const qty = Math.max(0, Number(it.qty) || 0);
    const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
    const unitDiscount = Math.min(unitPrice, Math.max(0, Number(it.unitDiscount) || 0));
    const gross = round2(qty * unitPrice);
    const discount = round2(qty * unitDiscount);
    subtotal += gross;
    itemDiscount += discount;
    return { gross, discount, total: round2(gross - discount) };
  });
  subtotal = round2(subtotal);
  itemDiscount = round2(itemDiscount);
  const net = round2(subtotal - itemDiscount);
  const ordDisc = round2(Math.min(net, Math.max(0, Number(orderDiscount) || 0)));
  const taxable = round2(net - ordDisc);
  const tax = taxEnabled ? round2((taxable * (Number(taxRate) || 0)) / 100) : 0;
  const delivery = round2(Math.max(0, Number(deliveryCharges) || 0));
  let total = round2(taxable + tax + delivery);
  let roundOff = 0;
  if (roundTotal) {
    const rounded = Math.round(total);
    roundOff = round2(rounded - total);
    total = rounded;
  }
  return {
    lines,
    subtotal,
    itemDiscount,
    orderDiscount: ordDisc,
    totalDiscount: round2(itemDiscount + ordDisc),
    taxable,
    tax,
    deliveryCharges: delivery,
    roundOff,
    total,
  };
}

/** Split a tendered amount against a total. */
export function calcPayment(total, tendered) {
  const t = round2(Math.max(0, Number(tendered) || 0));
  const applied = round2(Math.min(t, total));
  return {
    tendered: t,
    paid: applied,
    change: round2(Math.max(0, t - total)),
    due: round2(Math.max(0, total - t)),
  };
}
