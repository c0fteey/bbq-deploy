import {readLive, readMetrics} from '@/lib/metrics';
import {getUser} from '@/lib/session';

export async function GET(request) {
  if (!(await getUser())) return Response.json({error: 'giriş gerekli'}, {status: 401});
  const range = new URL(request.url).searchParams.get('aralik');
  const data = range === 'canli' ? await readLive() : await readMetrics(range);
  return Response.json(data, {headers: {'Cache-Control': 'no-store'}});
}
