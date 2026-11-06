import {cookies} from 'next/headers';
import {getSettings, setSettings} from '@/lib/db';
import {gh} from '@/lib/github';
import {safeEqual} from '@/lib/crypto';
import {originOf} from '@/lib/origin';
import {allowedUser} from '@/lib/session';

// GitHub, App oluşturulunca buraya döner; kodu App bilgileriyle değiştirip kaydederiz.
export async function GET(request) {
  const origin = originOf(request);
  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get('bbq_manifest_state')?.value;
  store.delete('bbq_manifest_state');

  if (!safeEqual(url.searchParams.get('state') || '', expected || '')) {
    return new Response('Geçersiz istek (state uyuşmuyor). Baştan dene.', {status: 400});
  }
  if ((await getSettings()).app_id) return Response.redirect(`${origin}/`, 303);

  const app = await gh(`/app-manifests/${encodeURIComponent(url.searchParams.get('code') || '')}/conversions`, {
    method: 'POST',
  });

  // Uygulamayı izinli kullanıcıdan başkası oluşturduysa kabul etme.
  if (app.owner?.login?.toLowerCase() !== allowedUser()) {
    return new Response(
      `Bu uygulama ${app.owner?.login} hesabıyla oluşturuldu, ALLOWED_GITHUB_USER ise "${allowedUser()}". ` +
        `GitHub'da bu uygulamayı silip doğru hesapla tekrar dene.`,
      {status: 403},
    );
  }

  await setSettings({
    app_id: app.id,
    app_slug: app.slug,
    client_id: app.client_id,
    client_secret: app.client_secret,
    webhook_secret: app.webhook_secret,
    private_key: app.pem,
  });
  return Response.redirect(`${origin}/api/auth/login`, 303);
}
