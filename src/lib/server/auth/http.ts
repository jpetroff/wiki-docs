import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { authorize, type Permission } from './index';
export const SESSION_COOKIE = 'wiki_session';
export function safeReturnTo(value: string | null): string {
  if (!value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return '/';
  // Check decoded representations too, including nested encodings.
  let decoded = value;
  for (let i = 0; i < 5; i++) {
    if (/[\\\x00-\x1f\x7f]/.test(decoded) || !decoded.startsWith('/') || decoded.startsWith('//')) return '/';
    try {
      const url = new URL(decoded, 'https://wiki.invalid');
      if (url.origin !== 'https://wiki.invalid' || /^\/_\/(login|logout)(\/|$)/.test(url.pathname)) return '/';
      const next = decodeURIComponent(decoded);
      if (next === decoded) return value;
      decoded = next;
    } catch { return '/'; }
  }
  return '/';
}
export function requireOrigin(event: Pick<RequestEvent, 'request' | 'url'>) {
  if (event.request.headers.get('origin') !== event.url.origin) error(403, 'Cross-origin request forbidden');
}
export function requirePermission(event: RequestEvent, permission: Permission, mutation = false) {
  if (event.locals.authUnavailable) error(503, 'Authentication unavailable');
  const result = authorize(permission, event.locals.session);
  if (result.status === 'unauthorized') {
    if (mutation) error(401, 'Login required');
    redirect(303, `/_/login?returnTo=${encodeURIComponent(event.url.pathname + event.url.search)}`);
  }
  if (result.status !== 'ok') error(403, 'Access forbidden');
  return result.value;
}
export async function readLoginForm(request: Request): Promise<URLSearchParams> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') error(415, 'Unsupported form encoding');
  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); error(413, 'Login form too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
