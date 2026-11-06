const rtf = new Intl.RelativeTimeFormat('tr', {numeric: 'auto'});
const dtf = new Intl.DateTimeFormat('tr-TR', {dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Istanbul'});

export function timeAgo(ms) {
  if (!ms) return '—';
  const s = Math.round((Number(ms) - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export function dateTime(ms) {
  return ms ? dtf.format(new Date(Number(ms))) : '—';
}

export function duration(from, to) {
  if (!from) return '—';
  const s = Math.max(0, Math.round(((to ? Number(to) : Date.now()) - Number(from)) / 1000));
  if (s < 60) return `${s} sn`;
  if (s < 3600) return `${Math.floor(s / 60)} dk ${s % 60} sn`;
  const h = Math.floor(s / 3600);
  return h < 24 ? `${h} sa ${Math.floor((s % 3600) / 60)} dk` : `${Math.floor(h / 24)} gün ${h % 24} sa`;
}

export const shortSha = (sha) => (sha ? String(sha).slice(0, 7) : '—');
export const firstLine = (text) => (text ? String(text).split('\n')[0] : '');

export const isRecent = (ms, within) => Date.now() - Number(ms || 0) < within;
