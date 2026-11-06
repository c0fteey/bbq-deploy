import 'server-only';
import {db, getSettings} from './db';

const MINUTE_KEEP = 2 * 1440;
const HOUR_KEEP = 35 * 1440;
const FIELDS = ['cpu', 'ram', 'ramMb', 'moves', 'rejected', 'guesses'];

const clean = (n, max) => (Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0);

/**
 * Ajanın gönderdiği dakikalık ölçümleri kaydeder ve etkilenen saatlerin özetini yeniden hesaplar.
 * Aynı dakika iki kez gelirse üzerine yazılır; özet her seferinde baştan hesaplandığı için çift sayılmaz.
 */
export async function saveMetrics(rows) {
  const nowMinute = Math.floor(Date.now() / 60_000);
  const valid = rows
    .filter((r) => Number.isInteger(r?.minute) && r.minute > nowMinute - MINUTE_KEEP && r.minute <= nowMinute + 1)
    .slice(0, 200);
  if (!valid.length) return;

  const hours = [...new Set(valid.map((r) => r.minute - (r.minute % 60)))];
  const c = await db();
  await c.batch(
    [
      ...valid.map((r) => ({
        sql: `INSERT OR REPLACE INTO metrics_minute (minute, cpu, ram, ram_mb, moves, rejected, guesses)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          r.minute,
          clean(r.cpu, 100),
          clean(r.ram, 100),
          clean(r.ramMb, 1e6),
          Math.round(clean(r.moves, 1e6)),
          Math.round(clean(r.rejected, 1e6)),
          Math.round(clean(r.guesses, 1e6)),
        ],
      })),
      ...hours.map((hour) => ({
        sql: `INSERT OR REPLACE INTO metrics_hour (minute, cpu, ram, ram_mb, moves, rejected, guesses)
              SELECT ?, avg(cpu), avg(ram), avg(ram_mb), sum(moves), sum(rejected), sum(guesses)
              FROM metrics_minute WHERE minute >= ? AND minute < ?`,
        args: [hour, hour, hour + 60],
      })),
      {sql: 'DELETE FROM metrics_minute WHERE minute < ?', args: [nowMinute - MINUTE_KEEP]},
      {sql: 'DELETE FROM metrics_hour WHERE minute < ?', args: [nowMinute - HOUR_KEEP]},
    ],
    'write',
  );
}

export const RANGES = {
  '1s': {table: 'metrics_minute', span: 60, bucket: 1, per: 'dakikada'},
  '24s': {table: 'metrics_minute', span: 1440, bucket: 10, per: '10 dakikada'},
  '7g': {table: 'metrics_hour', span: 7 * 1440, bucket: 60, per: 'saatte'},
  '30g': {table: 'metrics_hour', span: 30 * 1440, bucket: 180, per: '3 saatte'},
};

const LIVE_STALE_MS = 20_000;

/** Canlı görünüm: ajanın son durum bildirimindeki son 5 dakika (5 sn'de bir ölçüm). */
export async function readLive() {
  const settings = await getSettings();
  let points = [];
  if (Date.now() - Number(settings.agent_seen || 0) < LIVE_STALE_MS) {
    try {
      const live = JSON.parse(settings.agent_info || '{}').live;
      if (Array.isArray(live)) points = live.filter((p) => Number.isFinite(p?.t));
    } catch {}
  }
  return {range: 'canli', per: '5 saniyede', points};
}

/**
 * Seçilen aralık için eşit aralıklı noktalar. Veri olmayan aralıklar null döner, çizgi orada kesilir
 * (ajan kapalıyken uydurma bir sıfır çizilmez).
 */
export async function readMetrics(rangeKey) {
  const range = RANGES[rangeKey] ?? RANGES['1s'];
  const {table, span, bucket} = range;
  const now = Math.floor(Date.now() / 60_000);
  const end = now - (now % bucket);
  const start = end - span + bucket;

  const c = await db();
  const {rows} = await c.execute({
    sql: `SELECT (minute / ?) * ? AS t, avg(cpu) AS cpu, avg(ram) AS ram, avg(ram_mb) AS ramMb,
                 sum(moves) AS moves, sum(rejected) AS rejected, sum(guesses) AS guesses
          FROM ${table} WHERE minute >= ? GROUP BY t ORDER BY t`,
    args: [bucket, bucket, start],
  });
  const byTime = new Map(rows.map((r) => [Number(r.t), r]));

  const points = [];
  for (let t = start; t <= end; t += bucket) {
    const r = byTime.get(t);
    const point = {t: t * 60_000};
    for (const f of FIELDS) point[f] = r ? round(Number(r[f])) : null;
    points.push(point);
  }
  return {range: rangeKey in RANGES ? rangeKey : '1s', per: range.per, points};
}

const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
