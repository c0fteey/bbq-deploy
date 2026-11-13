'use server';

import {db} from '@/lib/db';
import {requireUser} from '@/lib/session';

// Bot tarafındaki işlemlerle aynı liste (Barbeque src/admin.js). Bilinmeyen işlem sıraya hiç girmez.
const ACTIONS = ['lookup', 'setMoney', 'addMoney', 'setXp', 'setShards', 'setItem', 'setAnimal', 'addWeapon', 'deleteWeapon', 'deletePlayer'];
const USER_ID = /^\d{5,25}$/;

/** Oyuncu işini sıraya koyar, iş numarasını döndürür. Ajan birkaç saniye içinde alıp bota iletir. */
export async function queueAdmin(action, userId, params = {}) {
  const user = await requireUser();
  const id = String(userId ?? '').trim();
  if (!ACTIONS.includes(action)) throw new Error('Geçersiz işlem');
  if (!USER_ID.test(id)) throw new Error('Kullanıcı ID\'si yalnızca rakamlardan oluşmalı');
  const text = JSON.stringify(params ?? {});
  if (text.length > 2_000) throw new Error('Parametreler çok uzun');
  const c = await db();
  const r = await c.execute({
    sql: 'INSERT INTO admin_jobs (action, user_id, params, author, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [action, id, text, user, Date.now()],
  });
  return Number(r.lastInsertRowid);
}

/** İşin durumu: {status: 'pending' | 'running' | 'done' | 'failed', result}. */
export async function adminJob(jobId) {
  await requireUser();
  const c = await db();
  const {rows} = await c.execute({sql: 'SELECT status, result FROM admin_jobs WHERE id = ?', args: [Number(jobId)]});
  if (!rows[0]) return {status: 'failed', result: {ok: false, error: 'İş bulunamadı'}};
  let result = null;
  try {
    result = rows[0].result ? JSON.parse(rows[0].result) : null;
  } catch {}
  return {status: rows[0].status, result};
}
