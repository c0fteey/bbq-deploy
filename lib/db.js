import 'server-only';
import {createClient} from '@libsql/client';

// Turso (libSQL). Ajan birkaç saniyede bir sorduğu için saat bazlı kotası olan bir veritabanı uygun değil.
let client;
let ready;

// Vercel'in Turso entegrasyonu değişkenleri bağlantı adına göre önekle ekleyebilir (ör. STORAGE_TURSO_...).
function env(name) {
  if (process.env[name]) return process.env[name];
  const key = Object.keys(process.env).find((k) => k.endsWith('_' + name) && process.env[k]);
  return key ? process.env[key] : undefined;
}

function getClient() {
  const url = env('TURSO_DATABASE_URL');
  if (!url) throw new Error('TURSO_DATABASE_URL ayarlanmamış.');
  client ??= createClient({url, authToken: env('TURSO_AUTH_TOKEN')});
  return client;
}

async function migrate(db) {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS deploys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        sha TEXT,
        message TEXT,
        author TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        log TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS deploys_status ON deploys (status)`,
      // Kullanım ölçümleri: dakikalık (2 gün saklanır) ve saatlik özet (35 gün saklanır). Zaman: Unix dakikası.
      `CREATE TABLE IF NOT EXISTS metrics_minute (
        minute INTEGER PRIMARY KEY, cpu REAL, ram REAL, ram_mb REAL, moves INTEGER, rejected INTEGER, guesses INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS metrics_hour (
        minute INTEGER PRIMARY KEY, cpu REAL, ram REAL, ram_mb REAL, moves INTEGER, rejected INTEGER, guesses INTEGER
      )`,
    ],
    'write',
  );
  // Botun sayaçları (komut, oyun hamlesi, mesaj...) JSON olarak; anahtarlar bottan gelir. Sonradan eklendi.
  for (const table of ['metrics_minute', 'metrics_hour']) {
    const {rows} = await db.execute(`PRAGMA table_info(${table})`);
    if (!rows.some((row) => row.name === 'counts')) await db.execute(`ALTER TABLE ${table} ADD COLUMN counts TEXT`);
  }
}

export async function db() {
  const c = getClient();
  ready ??= migrate(c).catch((error) => {
    ready = undefined;
    throw error;
  });
  await ready;
  return c;
}

export function isConfigured() {
  return Boolean(env('TURSO_DATABASE_URL'));
}

export async function getSettings() {
  const c = await db();
  const {rows} = await c.execute('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSettings(values) {
  const c = await db();
  const stmts = Object.entries(values).map(([key, value]) =>
    value == null
      ? {sql: 'DELETE FROM settings WHERE key = ?', args: [key]}
      : {
          sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          args: [key, String(value)],
        },
  );
  if (stmts.length) await c.batch(stmts, 'write');
}

export async function addDeploy({kind, sha = null, message = null, author = null}) {
  const c = await db();
  const r = await c.execute({
    sql: 'INSERT INTO deploys (kind, sha, message, author, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [kind, sha, message, author, Date.now()],
  });
  return Number(r.lastInsertRowid);
}

export async function listDeploys(limit = 40) {
  const c = await db();
  const {rows} = await c.execute({
    sql: `SELECT id, kind, sha, message, author, status, created_at, started_at, finished_at
          FROM deploys ORDER BY id DESC LIMIT ?`,
    args: [limit],
  });
  return rows.map((r) => ({...r}));
}

export async function getDeploy(id) {
  const c = await db();
  const {rows} = await c.execute({sql: 'SELECT * FROM deploys WHERE id = ?', args: [id]});
  return rows[0] ? {...rows[0]} : null;
}
