import 'server-only';
import {del, issueSignedToken, list, parseStoreIdFromDelegationToken, presignUrl} from '@vercel/blob';

// Veritabanı yedekleri Vercel Blob'da (gizli depo) durur; VDS gitse de kalır.
// Ajan saatte bir yedek alır, sıkıştırır ve panelin verdiği imzalı adrese doğrudan yükler (panelden geçmez,
// Vercel'in 4.5 MB istek sınırına takılmaz). Saklama: son 24 saat saatlik, son 7 gün günlük, son 4 hafta haftalık.

export const PREFIX = 'backups/';
export const REASONS = {saatlik: 'Saatlik', elle: 'Elle alındı', 'geri-yukleme-oncesi': 'Geri yükleme öncesi'};
const MAX_BYTES = 500 * 1024 * 1024;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
// Türkiye'de yaz saati yok; gün ve hafta sınırları İstanbul saatine göre.
const TR_OFFSET = 3 * HOUR;
// Blob API sürümü (@vercel/blob içindeki BLOB_API_VERSION); ajan isteği SDK'nın yaptığı gibi gönderir.
const BLOB_API_VERSION = '13';

export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** "backups/2026-11-14T12-00-00Z_saatlik.db.gz" → {time, reason} */
export function parseName(pathname) {
  const m = /^backups\/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z_([a-z-]+)\.db\.gz$/.exec(pathname);
  if (!m) return null;
  return {time: Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`), reason: m[5]};
}

export function isBackupPath(pathname) {
  return typeof pathname === 'string' && parseName(pathname) !== null;
}

function newName(reason, now = Date.now()) {
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/:/g, '-');
  return `${PREFIX}${stamp}Z_${reason}.db.gz`;
}

/** Ajanın dosyayı yükleyeceği imzalı adres (15 dk geçerli) ve göndereceği başlıklar. */
export async function uploadTarget({reason, size}) {
  if (!REASONS[reason]) throw new Error('Geçersiz yedek türü');
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) throw new Error('Yedek boyutu geçersiz');
  const pathname = newName(reason);
  const validUntil = Date.now() + 15 * 60_000;
  const options = {
    pathname,
    validUntil,
    allowedContentTypes: ['application/gzip'],
    maximumSizeInBytes: MAX_BYTES,
  };
  const token = await issueSignedToken({...options, operations: ['put']});
  const {presignedUrl} = await presignUrl(token, {
    ...options,
    operation: 'put',
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  return {
    pathname,
    url: presignedUrl,
    headers: {
      'x-api-version': BLOB_API_VERSION,
      'x-vercel-blob-store-id': parseStoreIdFromDelegationToken(token.delegationToken),
      'x-vercel-blob-access': 'private',
      'x-content-type': 'application/gzip',
      'x-add-random-suffix': '0',
      'content-type': 'application/gzip',
    },
  };
}

/** Yedeği indirmek için kısa ömürlü imzalı adres (panelden indirme ve ajanın geri yüklemesi). */
export async function downloadUrl(pathname, minutes = 10) {
  if (!isBackupPath(pathname)) throw new Error('Geçersiz yedek');
  const validUntil = Date.now() + minutes * 60_000;
  const token = await issueSignedToken({pathname, operations: ['get'], validUntil});
  const {presignedUrl} = await presignUrl(token, {operation: 'get', pathname, access: 'private', validUntil, useCache: false});
  return presignedUrl;
}

/** Bütün yedekler, en yeni önce. */
export async function listBackups() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({prefix: PREFIX, limit: 1000, cursor});
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs
    .map((b) => ({pathname: b.pathname, url: b.url, size: b.size, ...parseName(b.pathname)}))
    .filter((b) => b.time)
    .sort((a, b) => b.time - a.time);
}

const dayKey = (time) => Math.floor((time + TR_OFFSET) / DAY);
// 1970-01-01 perşembeydi; +3 gün kaydırınca hafta pazartesi başlar.
const weekKey = (time) => Math.floor((dayKey(time) + 3) / 7);

/**
 * Saklanacak yedekleri seçer: son 24 saattekilerin hepsi, son 7 günde her günün ilk yedeği, son 4 haftada her
 * haftanın ilk yedeği. Geri yükleme öncesi alınanlar 7 gün durur. En yeni yedek her zaman kalır.
 * Dönen: {keep: Map(pathname → etiket), remove: [yedek]}
 */
export function plan(backups, now = Date.now()) {
  const keep = new Map();
  const oldestFirst = [...backups].sort((a, b) => a.time - b.time);
  const days = new Set();
  const weeks = new Set();
  for (const b of oldestFirst) {
    const age = now - b.time;
    if (age < DAY) keep.set(b.pathname, 'Saatlik');
    if (age < 7 * DAY && !days.has(dayKey(b.time))) {
      days.add(dayKey(b.time));
      if (!keep.has(b.pathname)) keep.set(b.pathname, 'Günlük');
    }
    if (age < 28 * DAY && !weeks.has(weekKey(b.time))) {
      weeks.add(weekKey(b.time));
      if (!keep.has(b.pathname)) keep.set(b.pathname, 'Haftalık');
    }
    if (b.reason === 'geri-yukleme-oncesi' && age < 7 * DAY && !keep.has(b.pathname)) keep.set(b.pathname, 'Geri yükleme öncesi');
  }
  const newest = backups[0];
  if (newest && !keep.has(newest.pathname)) keep.set(newest.pathname, 'En yeni');
  return {keep, remove: backups.filter((b) => !keep.has(b.pathname))};
}

/** Saklama planı dışında kalan yedekleri siler. */
export async function prune() {
  const {remove} = plan(await listBackups());
  if (remove.length) await del(remove.map((b) => b.url));
  return remove.length;
}
