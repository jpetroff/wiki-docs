import { error, json } from '@sveltejs/kit';
import { requireOrigin, requirePermission } from '$lib/server/auth/http';
import { documentationService } from '$lib/server/documentation';
import type { RequestHandler } from './$types';

const maxBytes = 2 * 1024 * 1024;

export const PUT: RequestHandler = async (event) => {
  requireOrigin(event);
  requirePermission(event, 'edit', true);
  if (event.request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') error(415, 'Expected JSON');
  const reader = event.request.body?.getReader();
  if (!reader) error(400, 'Missing document');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); error(413, 'Document request exceeds 2 MiB'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let input: unknown;
  try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { error(400, 'Invalid JSON'); }
  if (!input || typeof input !== 'object' || !('path' in input) || !('content' in input) || !('originalRevision' in input) ||
      typeof input.path !== 'string' || input.path.length > 4096 ||
      typeof input.content !== 'string' || input.content.includes('\0') || !input.content.isWellFormed() ||
      typeof input.originalRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.originalRevision)) error(400, 'Invalid document');
  let result;
  try { result = await documentationService.save({ path: input.path, content: input.content, originalRevision: input.originalRevision }); }
  catch (cause) { console.error('Document save failed', cause); error(500, 'Unable to save document'); }
  if (result.status === 'conflict') error(409, 'This file changed since you opened it. Your edits are still here; copy them before reloading.');
  if (result.status === 'not-found') error(404, 'Page not found');
  if (result.status === 'unavailable') error(503, 'Documentation unavailable');
  return json(result, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = PUT;
const unsupported: RequestHandler = (event) => {
  requireOrigin(event);
  requirePermission(event, 'edit', true);
  error(405, 'Use PUT to save an existing document');
};
export const PATCH = unsupported;
export const DELETE = unsupported;
