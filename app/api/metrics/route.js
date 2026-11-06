import {readMetrics} from '@/lib/metrics';
import {getUser} from '@/lib/session';

export async function GET(request) {
  if (!(await getUser())) return Response.json({error: 'giriş gerekli'}, {status: 401});
  const range = new URL(request.url).searchParams.get('aralik');
  return Response.json(await readMetrics(range), {headers: {'Cache-Control': 'no-store'}});
}
