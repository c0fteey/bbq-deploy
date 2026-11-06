import 'server-only';
import {getSettings} from './db';
import {safeEqual} from './crypto';

export const DEPLOY_KINDS = ['push', 'deploy', 'install'];

/** Ajan isteğini doğrular; geçerliyse ayarları döndürür. */
export async function authAgent(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const settings = await getSettings();
  if (!settings.agent_token || !safeEqual(token, settings.agent_token)) return null;
  return settings;
}

export const unauthorized = () => Response.json({error: 'yetkisiz'}, {status: 401});
