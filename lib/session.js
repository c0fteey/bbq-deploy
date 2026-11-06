import 'server-only';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {getSettings, setSettings} from './db';
import {hmac, randomToken, safeEqual} from './crypto';

const COOKIE = 'bbq_session';
const MAX_AGE = 60 * 60 * 24 * 14; // 14 gün

export function allowedUser() {
  return (process.env.ALLOWED_GITHUB_USER || '').trim().toLowerCase();
}

async function sessionSecret() {
  const settings = await getSettings();
  if (settings.session_secret) return settings.session_secret;
  const secret = randomToken();
  await setSettings({session_secret: secret});
  return secret;
}

export async function createSession(login) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${login}.${exp}`;
  const value = `${payload}.${hmac(await sessionSecret(), payload)}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** Giriş yapmış ve izinli kullanıcının GitHub adı, yoksa null. */
export async function getUser() {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [login, exp, sig] = value.split('.');
  if (!login || !exp || !sig) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  if (!safeEqual(sig, hmac(await sessionSecret(), `${login}.${exp}`))) return null;
  if (login.toLowerCase() !== allowedUser()) return null;
  return login;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/');
  return user;
}
