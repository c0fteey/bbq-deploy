import {authAgent, unauthorized} from '@/lib/agent';

// Kurulumun panel adresini ve ajan token'ını denemesi için. Ajanın durumuna dokunmaz (poll'un aksine).
export async function POST(request) {
  if (!(await authAgent(request))) return unauthorized();
  return Response.json({ok: true});
}
