'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {addDeploy, db, getDeploy, getSettings, setSettings} from '@/lib/db';
import {randomToken} from '@/lib/crypto';
import {installationRepos} from '@/lib/github';
import {clearSession, requireUser} from '@/lib/session';

const CONTROL = {
  restart: 'Botu yeniden başlat',
  stop: 'Botu durdur',
  start: 'Botu başlat',
};

export async function controlBot(kind) {
  const user = await requireUser();
  if (!CONTROL[kind]) throw new Error('Geçersiz işlem');
  await addDeploy({kind, message: CONTROL[kind], author: user});
  revalidatePath('/');
}

/** Belirli bir commit'i (ya da sha yoksa dalın en son halini) yeniden yükler. */
export async function deployCommit(fromId) {
  const user = await requireUser();
  const source = fromId ? await getDeploy(fromId) : null;
  if (fromId && !source?.sha) throw new Error('Bu kaydın commit bilgisi yok');
  await addDeploy({
    kind: 'deploy',
    sha: source?.sha ?? null,
    message: source ? source.message : 'En son sürümü yeniden yükle',
    author: user,
  });
  revalidatePath('/');
}

/** VDS'te yük testi: sahte kullanıcılar ve geçici bir veritabanı dosyasıyla; canlı veriye dokunmaz. */
export async function runLoadTest() {
  const user = await requireUser();
  await addDeploy({kind: 'loadtest', message: 'Yük testi (1000, 2000, 5000 kişi)', author: user});
  revalidatePath('/');
}

export async function cancelDeploy(id) {
  await requireUser();
  const c = await db();
  await c.execute({
    sql: `UPDATE deploys SET status = 'skipped', finished_at = ?, log = 'Panelden iptal edildi.' WHERE id = ? AND status = 'pending'`,
    args: [Date.now(), id],
  });
  revalidatePath('/');
}

export async function selectRepo(formData) {
  await requireUser();
  const repo = String(formData.get('repo') || '');
  const branch = String(formData.get('branch') || '').trim();
  const repos = await installationRepos(await getSettings());
  const found = repos.find((r) => r.fullName === repo);
  if (!found) throw new Error('Bu repoya erişim yok');
  if (!/^[\w./-]+$/.test(branch || found.defaultBranch)) throw new Error('Geçersiz dal adı');
  await setSettings({repo: found.fullName, branch: branch || found.defaultBranch});
  revalidatePath('/');
}

const CARD_IDS = ['bot', 'repo', 'resources', 'activity', 'deploys', 'botlog', 'token'];

/** Panel kartlarının sırası. Sayfa yeniden çizilmesin diye revalidate yapılmaz; sıra zaten tarayıcıda. */
export async function saveLayout(order) {
  await requireUser();
  const valid = Array.isArray(order) ? order.filter((id) => CARD_IDS.includes(id)) : [];
  const isDefault = valid.length === CARD_IDS.length && valid.every((id, i) => id === CARD_IDS[i]);
  await setSettings({layout: valid.length && !isDefault ? JSON.stringify([...new Set(valid)]) : null});
}

export async function newAgentToken() {
  await requireUser();
  await setSettings({agent_token: randomToken(32)});
  revalidatePath('/');
}

export async function logout() {
  await clearSession();
  redirect('/');
}
