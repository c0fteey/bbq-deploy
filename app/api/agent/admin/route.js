import {db} from '@/lib/db';
import {authAgent, unauthorized} from '@/lib/agent';

// Ajan, bota ilettiği oyuncu yönetimi işinin sonucunu buraya yazar.
export async function POST(request) {
  if (!(await authAgent(request))) return unauthorized();
  const {id, ...result} = await request.json().catch(() => ({}));
  if (!Number.isInteger(id)) return Response.json({ok: false}, {status: 400});
  const c = await db();
  await c.execute({
    sql: `UPDATE admin_jobs SET status = ?, result = ?, finished_at = ? WHERE id = ? AND status = 'running'`,
    args: [result.ok ? 'done' : 'failed', JSON.stringify(result).slice(0, 500_000), Date.now(), id],
  });
  return Response.json({ok: true});
}
