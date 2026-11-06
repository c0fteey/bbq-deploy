import {cookies} from 'next/headers';
import {getSettings} from '@/lib/db';
import {randomToken} from '@/lib/crypto';
import {originOf} from '@/lib/origin';

// GitHub App'i tek tıkla oluşturur (manifest akışı). Sadece henüz uygulama yokken çalışır.
export async function GET(request) {
  const origin = originOf(request);
  const settings = await getSettings();
  if (settings.app_id) return Response.redirect(`${origin}/`, 303);

  const state = randomToken(16);
  (await cookies()).set('bbq_manifest_state', state, {httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/'});

  const manifest = {
    name: `bbq-deploy-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`,
    url: origin,
    hook_attributes: {url: `${origin}/api/github/webhook`, active: true},
    redirect_url: `${origin}/api/github/manifest`,
    callback_urls: [`${origin}/api/auth/callback`],
    setup_url: `${origin}/api/github/setup`,
    setup_on_update: true,
    public: false,
    default_permissions: {contents: 'read', metadata: 'read'},
    default_events: ['push'],
  };

  const escaped = JSON.stringify(manifest).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = `<!doctype html><meta charset="utf-8"><title>GitHub'a yönlendiriliyor</title>
<body style="font-family:system-ui;background:#0a0a0a;color:#eee;display:grid;place-items:center;height:100vh">
<form id="f" method="post" action="https://github.com/settings/apps/new?state=${state}">
<input type="hidden" name="manifest" value="${escaped}"><button>GitHub'a devam et</button></form>
<script>document.getElementById('f').submit()</script></body>`;
  return new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8'}});
}
