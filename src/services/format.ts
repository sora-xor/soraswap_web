export const shorten = (value: string, head = 8, tail = 6) => {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

export const formatCompactNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
};

export const formatNumber = (value: number | string | null | undefined, digits = 2) => {
  if (value === null || value === undefined) return '--';
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat('en', {
    maximumFractionDigits: digits,
    minimumFractionDigits: numeric < 1 && numeric > 0 ? Math.min(digits, 4) : 0
  }).format(numeric);
};

export const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
};

export const formatRelativeTime = (timestampMs: number | null | undefined) => {
  if (!timestampMs) return '--';
  const deltaMs = timestampMs - Date.now();
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const minutes = Math.round(deltaMs / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(days, 'day');
};

export const formatTimestamp = (timestampMs: number | null | undefined) => {
  if (!timestampMs) return '--';
  return new Date(timestampMs).toLocaleString();
};

