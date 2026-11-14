import 'server-only';

// Beyaz listedeki ID'lerin adı ve resmi: destek botunun token'ıyla Micup API'sinden (Discord uyumlu, /v10).
const API = 'https://micup.gg/api/v10';
const CDN = 'https://media.micup.gg';

async function get(token, path) {
  const res = await fetch(API + path, {
    headers: {Authorization: `Bot ${token}`},
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/** Görsel alanı: tam adres, "/" ile başlayan yol ya da Discord gibi kısa kod. */
function image(value, kind, id) {
  if (typeof value !== 'string' || !value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return CDN + value;
  return `${CDN}/${kind}/${id}/${value}.png?size=64`;
}

const color = (n) => (Number(n) > 0 ? `#${Number(n).toString(16).padStart(6, '0')}` : null);

/**
 * ID'leri çözer: {id: {type: 'user'|'role'|'channel'|'unknown', name, avatar?, color?}}.
 * Önce kanal, sonra kullanıcı, en son botun sunucularındaki roller denenir.
 */
export async function resolveIds(token, ids) {
  const out = {};
  let roles = null;
  async function allRoles() {
    if (roles) return roles;
    roles = new Map();
    const guilds = (await get(token, '/users/@me/guilds')) ?? [];
    for (const guild of guilds.slice(0, 20)) {
      const list = (await get(token, `/guilds/${guild.id}/roles`)) ?? [];
      for (const role of list) roles.set(String(role.id), {name: role.name, color: color(role.color), guild: guild.name});
    }
    return roles;
  }
  for (const id of ids) {
    const channel = await get(token, `/channels/${id}`);
    if (channel?.id) {
      out[id] = {type: 'channel', name: channel.name ?? id};
      continue;
    }
    const user = await get(token, `/users/${id}`);
    if (user?.id) {
      out[id] = {
        type: 'user',
        name: user.global_name ?? user.globalName ?? user.username ?? id,
        username: user.username ?? null,
        avatar: image(user.avatar ?? user.avatar_url ?? user.avatarUrl, 'avatars', id),
      };
      continue;
    }
    const role = (await allRoles()).get(id);
    out[id] = role ? {type: 'role', name: role.name, color: role.color} : {type: 'unknown', name: null};
  }
  return out;
}
