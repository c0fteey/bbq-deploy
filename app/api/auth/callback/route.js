import {cookies} from 'next/headers';
import {getSettings} from '@/lib/db';
import {gh} from '@/lib/github';
import {safeEqual} from '@/lib/crypto';
import {originOf} from '@/lib/origin';
import {allowedUser, createSession} from '@/lib/session';

export async function GET(request) {
  const origin = originOf(request);
  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get('bbq_oauth_state')?.value;
  store.delete('bbq_oauth_state');

  if (!safeEqual(url.searchParams.get('state') || '', expected || '')) {
    return Response.redirect(`${origin}/?hata=state`, 303);
  }

  const {client_id, client_secret} = await getSettings();
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
    body: JSON.stringify({
      client_id,
      client_secret,
      code: url.searchParams.get('code'),
      redirect_uri: `${origin}/api/auth/callback`,
    }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (!data.access_token) return Response.redirect(`${origin}/?hata=giris`, 303);

  const user = await gh('/user', {token: data.access_token});
  if (user.login.toLowerCase() !== allowedUser()) {
    return Response.redirect(`${origin}/?hata=yetki`, 303);
  }

  await createSession(user.login);
  return Response.redirect(`${origin}/`, 303);
}
