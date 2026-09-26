// Single entry point to the main process. Every call returns data or throws
// an Error whose message is safe to show to the cashier.
const listeners = new Set();

export function onApiError(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function api(method, args) {
  if (!window.pos) throw new Error('Retail POS must be started from the desktop application.');
  let res;
  try {
    res = await window.pos.invoke(method, args);
  } catch {
    throw new Error('Something went wrong. Please try again.');
  }
  if (!res || !res.ok) {
    const err = new Error(res?.error?.message || 'Something went wrong. Please try again.');
    err.code = res?.error?.code;
    listeners.forEach((fn) => fn(err));
    throw err;
  }
  return res.data;
}
