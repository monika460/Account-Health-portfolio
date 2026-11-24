// Indian money formats: lakh (L) below 1 crore, crore (Cr) from 100 L up.
export const money = (lakh) => {
  if (lakh == null || Number.isNaN(lakh)) return '—';
  return Math.abs(lakh) >= 100
    ? `₹${(lakh / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`
    : `₹${lakh.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
};

// One account's ARR, always in lakh with 2 decimals.
export const moneyAcct = (lakh) => (lakh == null ? '—' : `₹${lakh.toFixed(2)} L`);

export const date = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const dateTime = (s) => {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
};

export const healthClass = (h) => (h === 'At risk' ? 'bad' : h === 'Watch' ? 'warn' : 'ok');
export const healthColor = (h) => (h === 'At risk' ? 'var(--bad)' : h === 'Watch' ? 'var(--warn)' : 'var(--ok)');
