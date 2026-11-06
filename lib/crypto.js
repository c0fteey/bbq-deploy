import 'server-only';
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function hmac(secret, data, encoding = 'base64url') {
  return createHmac('sha256', secret).update(data).digest(encoding);
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
