import {authAgent, unauthorized} from '@/lib/agent';
import {agentScript} from '@/lib/agent-script';

export async function GET(request) {
  if (!(await authAgent(request))) return unauthorized();
  return new Response(agentScript(), {headers: {'Content-Type': 'text/javascript; charset=utf-8'}});
}
