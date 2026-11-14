'use server';

import {revalidatePath} from 'next/cache';
import {addDeploy, setSettings} from '@/lib/db';
import {requireUser} from '@/lib/session';

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const ID = /^\d{5,25}$/;

/** Beyaz liste kutusu: virgül, boşluk ya da satırla ayrılmış ID'ler; satırdaki "#" sonrası not olarak atılır. */
function idList(value, label) {
  const ids = String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .join(',')
    .split(/[\s,]+/)
    .map((id) => id.replace(/[<@&!>]/g, '').trim())
    .filter(Boolean);
  const bad = ids.find((id) => !ID.test(id));
  if (bad) throw new Error(`${label}: "${bad}" bir ID değil (yalnızca rakam)`);
  if (ids.length > 200) throw new Error(`${label}: en fazla 200 ID`);
  return [...new Set(ids)].join(',');
}

/** Token boş bırakılırsa eskisi kalır; "Token'ı kaldır" ayrı. Kayıttan sonra ajan birkaç saniye içinde botu yeniden başlatır. */
export async function saveDestek(formData) {
  await requireUser();
  const token = String(formData.get('token') ?? '').trim();
  const logChannel = String(formData.get('logChannel') ?? '').trim();
  const allowed = String(formData.get('allowed') ?? '')
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  if (token && (token.length < 20 || /\s/.test(token))) throw new Error('Token geçersiz görünüyor');
  if (logChannel && !/^\d{5,25}$/.test(logChannel)) throw new Error('Log kanalı ID\'si yalnızca rakam olmalı');
  const bad = allowed.find((d) => !DOMAIN.test(d));
  if (bad) throw new Error(`Geçersiz alan adı: ${bad}`);
  const linkWhitelist = idList(formData.get('linkWhitelist'), 'Link beyaz listesi');
  const kufurWhitelist = idList(formData.get('kufurWhitelist'), 'Küfür beyaz listesi');
  await setSettings({
    ...(token ? {destek_token: token} : {}),
    destek_log_channel: logChannel || null,
    destek_allowed: allowed.length ? allowed.join(',') : 'micup.gg',
    destek_wl_link: linkWhitelist || null,
    destek_wl_kufur: kufurWhitelist || null,
  });
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
