import 'server-only';
import {addDeploy, db, setSettings} from './db';
import {resolveIds} from './micup';

// Barbeque destek sunucusunun botu (guard). Ayrı repo; VDS'te ajan ayrı klasörde ayrı süreç olarak çalıştırır.
export const DEFAULT_DESTEK_REPO = 'c0fteey/barbeque-destek';
export const DESTEK_KINDS = ['destek', 'destek-restart'];
export const WL_LISTS = ['link', 'kufur'];

const WL_FRESH_MS = 6 * 3600_000;
// Bulunamayan ID 30 dk sonra yeniden denenir (geçici bir Micup hatası olabilir).
const WL_RETRY_MS = 30 * 60_000;

export function destekRepo(settings) {
  return {repo: settings.destek_repo || DEFAULT_DESTEK_REPO, branch: settings.destek_branch || 'main'};
}

/**
 * Ajana her yanıtta giden ayarlar; token yoksa null (ajan botu durdurur). Bunlar değişince bot yeniden başlar.
 * Beyaz liste burada değil: ayrı gider (whitelistPayload), değişince çalışan bota iletilir, bot yeniden başlamaz.
 */
export function destekConfig(settings) {
  if (!settings.destek_token) return null;
  return {
    token: settings.destek_token,
    logChannel: settings.destek_log_channel || '',
    allowed: settings.destek_allowed || 'micup.gg',
    // Barbeque bir sunucuya eklenince/çıkarılınca Lucia'nın (destek botu) yazacağı kanallar (ajan 1.8.0+).
    joinChannel: settings.destek_join_channel || '',
    leaveChannel: settings.destek_leave_channel || '',
  };
}

/** Eski ayarlardaki (virgüllü) beyaz listeyi bir kez tabloya taşır. */
async function migrateOldWhitelist(c, settings) {
  const old = {link: settings.destek_wl_link, kufur: settings.destek_wl_kufur};
  if (!old.link && !old.kufur) return;
  const now = Date.now();
  const stmts = [];
  for (const list of WL_LISTS) {
    for (const id of String(old[list] ?? '').split(',').filter((x) => /^\d{5,25}$/.test(x))) {
      stmts.push({sql: 'INSERT OR IGNORE INTO destek_whitelist (list, target_id, author, created_at) VALUES (?, ?, ?, ?)', args: [list, id, null, now]});
    }
  }
  if (stmts.length) await c.batch(stmts, 'write');
  await setSettings({destek_wl_link: null, destek_wl_kufur: null});
}

/** Beyaz liste: {link: [{id, author, createdAt}], kufur: [...]}. */
export async function getWhitelist(settings) {
  const c = await db();
  if (settings) await migrateOldWhitelist(c, settings);
  const {rows} = await c.execute('SELECT list, target_id, author, created_at FROM destek_whitelist ORDER BY created_at, target_id');
  const out = {link: [], kufur: []};
  for (const row of rows) out[row.list]?.push({id: String(row.target_id), author: row.author, createdAt: Number(row.created_at)});
  return out;
}

/** Ajana giden beyaz liste: {version, link: [ids], kufur: [ids]}. version değişince ajan bota iletir. */
export async function whitelistPayload(settings) {
  const list = await getWhitelist(settings);
  const link = list.link.map((x) => x.id);
  const kufur = list.kufur.map((x) => x.id);
  return {version: `${link.join(',')}|${kufur.join(',')}`, link, kufur};
}

/**
 * Beyaz listedeki ID'lerin adı/resmi (badge'ler için). settings.destek_wl_cache'te tutulur; eksik ya da 6 saatten eski
 * olanlar destek botunun token'ıyla Micup'tan çözülür. Hata olursa eldeki önbellek döner.
 */
export async function whitelistInfo(settings, ids) {
  let cache = {};
  try {
    cache = JSON.parse(settings.destek_wl_cache || '{}');
  } catch {}
  if (!settings.destek_token || !ids.length) return cache;
  const now = Date.now();
  const stale = ids.filter((id) => !cache[id] || now - cache[id].at > (cache[id].type === 'unknown' ? WL_RETRY_MS : WL_FRESH_MS)).slice(0, 30);
  if (!stale.length) return cache;
  try {
    const fresh = await resolveIds(settings.destek_token, stale);
    const next = {};
    for (const id of ids) next[id] = fresh[id] ? {...fresh[id], at: now} : cache[id];
    await setSettings({destek_wl_cache: JSON.stringify(next)});
    return next;
  } catch {
    return cache;
  }
}

/** Token girilmiş ama VDS'te kurulu değilse kurulum işi açılır (son başarısız denemeden 5 dk sonra tekrar). */
export async function ensureDestekInstall(settings, info) {
  if (!settings.destek_token || info?.destek?.installed !== false) return;
  const c = await db();
  const {rows} = await c.execute({
    sql: `SELECT id FROM deploys WHERE kind = 'destek' AND (status IN ('pending', 'running') OR (status = 'failed' AND finished_at > ?)) LIMIT 1`,
    args: [Date.now() - 5 * 60_000],
  });
  if (!rows.length) await addDeploy({kind: 'destek', message: 'Destek botu ilk kurulum'});
}
