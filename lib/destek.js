import 'server-only';
import {addDeploy, db} from './db';

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
