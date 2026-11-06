import {db} from '@/lib/db';
import {authAgent, unauthorized} from '@/lib/agent';

const FINAL = ['success', 'failed', 'rolled_back'];

export async function POST(request) {
  if (!(await authAgent(request))) return unauthorized();
  const {id, status, sha} = await request.json();
  if (!Number.isInteger(id) || !FINAL.includes(status)) return Response.json({ok: false}, {status: 400});

  const c = await db();
  await c.execute({
    sql: `UPDATE deploys SET status = ?, finished_at = ?, sha = COALESCE(sha, ?) WHERE id = ? AND status = 'running'`,
    args: [status, Date.now(), typeof sha === 'string' ? sha : null, id],
  });
  return Response.json({ok: true});
}
