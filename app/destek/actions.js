'use server';

import {revalidatePath} from 'next/cache';
import {addDeploy, db, setSettings} from '@/lib/db';
import {WL_LISTS} from '@/lib/destek';
import {requireUser} from '@/lib/session';

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const ID = /^\d{5,25}$/;

/** Token boş bırakılırsa eskisi kalır; "Token'ı kaldır" ayrı. Yalnızca token değişince bot yeniden başlar; diğerleri ajanla çalışan bota iletilir. */
export async function saveDestek(formData) {
  await requireUser();
  const token = String(formData.get('token') ?? '').trim();
  const logChannel = String(formData.get('logChannel') ?? '').trim();
  const joinChannel = String(formData.get('joinChannel') ?? '').trim();
  const leaveChannel = String(formData.get('leaveChannel') ?? '').trim();
  const allowed = String(formData.get('allowed') ?? '')
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  if (token && (token.length < 20 || /\s/.test(token))) throw new Error('Token geçersiz görünüyor');
  if (logChannel && !ID.test(logChannel)) throw new Error('Log kanalı ID\'si yalnızca rakam olmalı');
  if (joinChannel && !ID.test(joinChannel)) throw new Error('Eklendi kanalı ID\'si yalnızca rakam olmalı');
  if (leaveChannel && !ID.test(leaveChannel)) throw new Error('Çıkarıldı kanalı ID\'si yalnızca rakam olmalı');
  const bad = allowed.find((d) => !DOMAIN.test(d));
  if (bad) throw new Error(`Geçersiz alan adı: ${bad}`);
  await setSettings({
    ...(token ? {destek_token: token} : {}),
    destek_log_channel: logChannel || null,
    destek_join_channel: joinChannel || null,
    destek_leave_channel: leaveChannel || null,
    destek_allowed: allowed.length ? allowed.join(',') : 'micup.gg',
  });
  revalidatePath('/destek');
}

/**
 * Beyaz listeye ekler (veritabanı). Birden çok ID virgül/boşlukla yazılabilir; <@123> gibi etiketler de olur.
 * Bot yeniden başlamaz: ajan birkaç saniye içinde yeni listeyi çalışan bota iletir. Eklenen sayısını döndürür.
 */
export async function addWhitelist(list, value) {
  const user = await requireUser();
  if (!WL_LISTS.includes(list)) throw new Error('Geçersiz liste');
  const ids = [
    ...new Set(
      String(value ?? '')
        .split(/[\s,]+/)
        .map((id) => id.replace(/[<@&#!>]/g, '').trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) throw new Error('ID yaz');
  const bad = ids.find((id) => !ID.test(id));
  if (bad) throw new Error(`"${bad}" bir ID değil (yalnızca rakam)`);
  const c = await db();
  const {rows} = await c.execute({sql: 'SELECT COUNT(*) AS n FROM destek_whitelist WHERE list = ?', args: [list]});
  if (Number(rows[0].n) + ids.length > 500) throw new Error('Bir listede en fazla 500 ID olabilir');
  const now = Date.now();
  const result = await c.batch(
    ids.map((id) => ({sql: 'INSERT OR IGNORE INTO destek_whitelist (list, target_id, author, created_at) VALUES (?, ?, ?, ?)', args: [list, id, user, now]})),
    'write',
  );
  revalidatePath('/destek');
  return result.reduce((sum, r) => sum + Number(r.rowsAffected || 0), 0);
}

export async function removeWhitelist(list, id) {
  await requireUser();
  if (!WL_LISTS.includes(list) || !ID.test(String(id))) throw new Error('Geçersiz');
  const c = await db();
  await c.execute({sql: 'DELETE FROM destek_whitelist WHERE list = ? AND target_id = ?', args: [list, String(id)]});
  revalidatePath('/destek');
}

export async function removeDestekToken() {
  await requireUser();
  await setSettings({destek_token: null});
  revalidatePath('/destek');
}

export async function updateDestek() {
  const user = await requireUser();
  await addDeploy({kind: 'destek', message: 'Destek botu: en son sürümü yükle', author: user});
  revalidatePath('/');
  revalidatePath('/destek');
}

export async function restartDestekBot() {
  const user = await requireUser();
  await addDeploy({kind: 'destek-restart', message: 'Destek botunu yeniden başlat', author: user});
  revalidatePath('/');
  revalidatePath('/destek');
}
