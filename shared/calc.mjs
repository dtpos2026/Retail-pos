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
 * @param {number} [p.covers]          dine-in persons ("per head") and the rate per person
 * @param {number} [p.coverRate]
 * @param {'percent'|'amount'} [p.serviceMode]  manual service charge: % of the bill after discount, or a fixed amount
 * @param {number} [p.serviceValue]
 */
export function calcOrder({ items = [], orderDiscount = 0, deliveryCharges = 0, taxEnabled = false, taxRate = 0, roundTotal = false, covers = 0, coverRate = 0, serviceMode = 'percent', serviceValue = 0 }) {
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
  const persons = Math.max(0, Math.floor(Number(covers) || 0));
  const coverCharge = round2(persons * Math.max(0, Number(coverRate) || 0));
  const sv = Math.max(0, Number(serviceValue) || 0);
  const serviceCharge = round2(serviceMode === 'amount' ? sv : (taxable * Math.min(100, sv)) / 100);
  let total = round2(taxable + tax + delivery + coverCharge + serviceCharge);
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
    coverCharge,
    serviceCharge,
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
