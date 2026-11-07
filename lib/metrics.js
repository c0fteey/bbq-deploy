import 'server-only';
import {db, getSettings} from './db';

const MINUTE_KEEP = 2 * 1440;
const HOUR_KEEP = 35 * 1440;
const MAX_COUNT_KEYS = 60;

const clean = (n, max) => (Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0);
const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

/** Botun sayaçları: anahtar → sayı. Anahtarları bot belirler (commands, games, cmd.profil, game.Sudoku...). */
function cleanCounts(counts) {
  const out = {};
  if (!counts || typeof counts !== 'object') return out;
  for (const [key, value] of Object.entries(counts).slice(0, MAX_COUNT_KEYS)) {
    if (key.length <= 60 && Number.isFinite(value) && value > 0) out[key] = Math.round(Math.min(value, 1e7));
  }
  return out;
}

function addCounts(target, counts) {
  for (const [key, value] of Object.entries(counts)) target[key] = (target[key] ?? 0) + value;
  return target;
}

/**
 * Sayaçları olmayan eski ölçümler (ajan 1.3'ten önce): o zaman yalnızca kelime zinciri ve Kelime Avı sayılıyordu,
 * ikisi de oyun hamlesi olarak gösterilir.
 */
function countsOf(row) {
  if (row.counts) {
    if (typeof row.counts === 'object') return cleanCounts(row.counts);
    try {
      return cleanCounts(JSON.parse(row.counts));
    } catch {
      return {};
    }
  }
  const out = {};
  const moves = Number(row.moves) || 0;
  const guesses = Number(row.guesses) || 0;
  if (moves) out['game.Kelime Zinciri'] = moves;
  if (guesses) out['game.Kelime Avı'] = guesses;
  if (moves + guesses) out.games = moves + guesses;
  return out;
}

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

  const c = await db();
  await c.batch(
    valid.map((r) => ({
      sql: `INSERT OR REPLACE INTO metrics_minute (minute, cpu, ram, ram_mb, moves, rejected, guesses, counts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        r.minute,
        clean(r.cpu, 100),
        clean(r.ram, 100),
        clean(r.ramMb, 1e6),
        Math.round(clean(r.moves, 1e6)),
        Math.round(clean(r.rejected, 1e6)),
        Math.round(clean(r.guesses, 1e6)),
        r.counts ? JSON.stringify(cleanCounts(r.counts)) : null,
      ],
    })),
    'write',
  );

  // Saatlik özet: CPU/RAM ortalaması, sayaçların toplamı (JSON olduğu için toplama burada yapılır).
  const hours = [...new Set(valid.map((r) => r.minute - (r.minute % 60)))];
  const summaries = [];
  for (const hour of hours) {
    const {rows: minutes} = await c.execute({
      sql: 'SELECT cpu, ram, ram_mb, moves, rejected, guesses, counts FROM metrics_minute WHERE minute >= ? AND minute < ?',
      args: [hour, hour + 60],
    });
    if (!minutes.length) continue;
    const avg = (field) => minutes.reduce((sum, m) => sum + (Number(m[field]) || 0), 0) / minutes.length;
    const sum = (field) => minutes.reduce((total, m) => total + (Number(m[field]) || 0), 0);
    const counts = minutes.reduce((total, m) => addCounts(total, countsOf(m)), {});
    summaries.push({
      sql: `INSERT OR REPLACE INTO metrics_hour (minute, cpu, ram, ram_mb, moves, rejected, guesses, counts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [hour, avg('cpu'), avg('ram'), avg('ram_mb'), sum('moves'), sum('rejected'), sum('guesses'), JSON.stringify(counts)],
    });
  }
  await c.batch(
    [
      ...summaries,
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
      if (Array.isArray(live)) {
        points = live
          .filter((p) => Number.isFinite(p?.t))
          .map((p) => ({t: p.t, cpu: p.cpu, ram: p.ram, ramMb: p.ramMb, counts: countsOf(p)}));
      }
    } catch {}
  }
  return {range: 'canli', per: '5 saniyede', points};
}

/**
 * Seçilen aralık için eşit aralıklı noktalar. Veri olmayan aralıklarda cpu ve counts null döner, çizgi orada kesilir
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
    sql: `SELECT minute, cpu, ram, ram_mb, moves, rejected, guesses, counts FROM ${table} WHERE minute >= ? ORDER BY minute`,
    args: [start],
  });
  const buckets = new Map();
  for (const row of rows) {
    const t = Math.floor(Number(row.minute) / bucket) * bucket;
    const b = buckets.get(t) ?? {n: 0, cpu: 0, ram: 0, ramMb: 0, counts: {}};
    b.n += 1;
    b.cpu += Number(row.cpu) || 0;
    b.ram += Number(row.ram) || 0;
    b.ramMb += Number(row.ram_mb) || 0;
    addCounts(b.counts, countsOf(row));
    buckets.set(t, b);
  }

  const points = [];
  for (let t = start; t <= end; t += bucket) {
    const b = buckets.get(t);
    points.push(
      b
        ? {t: t * 60_000, cpu: round(b.cpu / b.n), ram: round(b.ram / b.n), ramMb: round(b.ramMb / b.n), counts: b.counts}
        : {t: t * 60_000, cpu: null, ram: null, ramMb: null, counts: null},
    );
  }
  return {range: rangeKey in RANGES ? rangeKey : '1s', per: range.per, points};
}
