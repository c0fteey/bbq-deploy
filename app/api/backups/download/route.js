import {downloadUrl, isBackupPath} from '@/lib/backups';
import {getUser} from '@/lib/session';

// Paneldeki "İndir": giriş yapmış kullanıcıyı yedeğin 10 dk geçerli imzalı adresine yönlendirir.
export async function GET(request) {
  if (!(await getUser())) return new Response('Giriş gerekli', {status: 401});
  const pathname = new URL(request.url).searchParams.get('path');
  if (!isBackupPath(pathname)) return new Response('Geçersiz yedek', {status: 400});
  return Response.redirect(await downloadUrl(pathname), 302);
}
