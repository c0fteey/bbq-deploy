import {db} from '@/lib/db';
import {authAgent, unauthorized} from '@/lib/agent';

export async function POST(request) {
  if (!(await authAgent(request))) return unauthorized();
  const {id, text} = await request.json();
  if (!Number.isInteger(id) || typeof text !== 'string' || !text) return Response.json({ok: false}, {status: 400});

  const c = await db();
  await c.execute({
    sql: `UPDATE deploys SET log = substr(log || ?, -200000) WHERE id = ?`,
    args: [text.slice(-50_000), id],
  });
  return Response.json({ok: true});
}
