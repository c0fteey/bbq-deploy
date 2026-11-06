import {cookies} from 'next/headers';
import {getSettings} from '@/lib/db';
import {randomToken} from '@/lib/crypto';
import {originOf} from '@/lib/origin';

export async function GET(request) {
  const origin = originOf(request);
  const {client_id} = await getSettings();
  if (!client_id) return Response.redirect(`${origin}/`, 303);

  const state = randomToken(16);
  (await cookies()).set('bbq_oauth_state', state, {httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/'});

  const params = new URLSearchParams({
    client_id,
    redirect_uri: `${origin}/api/auth/callback`,
    state,
  });
  return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 303);
}
