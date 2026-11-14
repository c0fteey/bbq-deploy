import 'server-only';
import {addDeploy, db, setSettings} from './db';
import {resolveIds} from './micup';

const WL_FRESH_MS = 6 * 3600_000;
// Bulunamayan ID 30 dk sonra yeniden denenir (geçici bir Micup hatası olabilir).
const WL_RETRY_MS = 30 * 60_000;

const listOf = (text) => String(text ?? '').split(',').filter(Boolean);

/**
 * Beyaz listedeki ID'lerin adı/resmi (badge'ler için). settings.destek_wl_cache'te tutulur; eksik ya da 6 saatten eski
 * olanlar destek botunun token'ıyla Micup'tan çözülür. Hata olursa eldeki önbellek döner.
 */
export async function whitelistInfo(settings) {
  let cache = {};
  try {
    cache = JSON.parse(settings.destek_wl_cache || '{}');
  } catch {}
  const ids = [...new Set([...listOf(settings.destek_wl_link), ...listOf(settings.destek_wl_kufur)])];
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

// Barbeque destek sunucusunun botu (guard). Ayrı repo; VDS'te ajan ayrı klasörde ayrı süreç olarak çalıştırır.
export const DEFAULT_DESTEK_REPO = 'c0fteey/barbeque-destek';
export const DESTEK_KINDS = ['destek', 'destek-restart'];

export function destekRepo(settings) {
  return {repo: settings.destek_repo || DEFAULT_DESTEK_REPO, branch: settings.destek_branch || 'main'};
}

/** Ajana her yanıtta giden ayarlar; token yoksa null (ajan botu durdurur). */
export function destekConfig(settings) {
  if (!settings.destek_token) return null;
  return {
    token: settings.destek_token,
    logChannel: settings.destek_log_channel || '',
    allowed: settings.destek_allowed || 'micup.gg',
    // Beyaz liste: kullanıcı, rol ya da kanal ID'leri (virgülle). Link ve küfür için ayrı.
    linkWhitelist: settings.destek_wl_link || '',
    kufurWhitelist: settings.destek_wl_kufur || '',
  };
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
