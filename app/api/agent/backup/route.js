import {setSettings} from '@/lib/db';
import {authAgent, unauthorized} from '@/lib/agent';
import {isBackupPath, prune, uploadTarget} from '@/lib/backups';

// Ajanın yedek akışı:
//   {step: 'start', reason, size}            → {pathname, url, headers}: ajan dosyayı bu adrese PUT ile yükler
//   {step: 'done', pathname, size, rawSize}  → kayıt + saklama planı dışındaki eski yedekler silinir
//   {step: 'error', error}                   → panelde son hata gösterilir
export async function POST(request) {
  if (!(await authAgent(request))) return unauthorized();
  const body = await request.json().catch(() => ({}));
  try {
    if (body.step === 'start') {
      return Response.json(await uploadTarget({reason: body.reason, size: body.size}));
    }
    if (body.step === 'done') {
      if (!isBackupPath(body.pathname)) return Response.json({error: 'Geçersiz yedek'}, {status: 400});
      await setSettings({
        backup_last_at: Date.now(),
        backup_last_size: Number(body.size) || 0,
        backup_last_raw: Number(body.rawSize) || 0,
        backup_error: null,
        backup_error_at: null,
      });
      const removed = await prune().catch(() => 0);
      return Response.json({ok: true, removed});
    }
    if (body.step === 'error') {
      await setSettings({backup_error: String(body.error ?? 'Bilinmeyen hata').slice(0, 500), backup_error_at: Date.now()});
      return Response.json({ok: true});
    }
    return Response.json({error: 'Geçersiz adım'}, {status: 400});
  } catch (error) {
    return Response.json({error: error.message}, {status: 500});
  }
}
