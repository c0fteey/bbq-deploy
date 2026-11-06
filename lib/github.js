import 'server-only';
import {sign} from 'node:crypto';
import {hmac, safeEqual} from './crypto';

const API = 'https://api.github.com';

export async function gh(path, {token, method = 'GET', body, auth = 'Bearer'} = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bbq-deploy',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? {Authorization: `${auth} ${token}`} : {}),
      ...(body ? {'Content-Type': 'application/json'} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

/** GitHub App adına kısa ömürlü JWT (RS256). */
function appJwt(appId, privateKey) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64({alg: 'RS256', typ: 'JWT'})}.${b64({iat: now - 60, exp: now + 540, iss: String(appId)})}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
}

/** Repoyu okumak için 1 saat geçerli kurulum token'ı. */
export async function installationToken(settings) {
  if (!settings.app_id || !settings.private_key || !settings.installation_id) {
    throw new Error('GitHub App veya kurulum eksik.');
  }
  const jwt = appJwt(settings.app_id, settings.private_key);
  const data = await gh(`/app/installations/${settings.installation_id}/access_tokens`, {
    token: jwt,
    method: 'POST',
  });
  return {token: data.token, expiresAt: data.expires_at};
}

export async function installationRepos(settings) {
  const {token} = await installationToken(settings);
  const data = await gh('/installation/repositories?per_page=100', {token});
  return data.repositories.map((r) => ({fullName: r.full_name, defaultBranch: r.default_branch, private: r.private}));
}

export function verifyWebhook(secret, body, header) {
  if (!secret || !header?.startsWith('sha256=')) return false;
  return safeEqual(header.slice(7), hmac(secret, body, 'hex'));
}
