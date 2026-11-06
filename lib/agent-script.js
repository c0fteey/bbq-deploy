import 'server-only';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// Ajanın güncel sürümü bu repodaki agent/agent.js'tir. VDS'deki ajan sürümü eskiyse bunu indirip kendini günceller.
let script;

export function agentScript() {
  script ??= readFileSync(join(process.cwd(), 'agent', 'agent.js'), 'utf8');
  return script;
}

export function agentVersion() {
  try {
    return agentScript().match(/const VERSION = '([\d.]+)'/)?.[1] ?? null;
  } catch {
    return null;
  }
}
