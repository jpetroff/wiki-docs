import { error, json } from '@sveltejs/kit';
import type { CreateResult } from './filesystem';

export async function readDocumentJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') error(415, 'Expected JSON');
  const reader = request.body?.getReader();
  if (!reader) error(400, 'Missing request body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); error(413, 'Document request exceeds 2 MiB'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let input: unknown;
  try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { error(400, 'Invalid JSON'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) error(400, 'Invalid request');
  return input as Record<string, unknown>;
}

export async function creationResponse<T>(operation: () => Promise<CreateResult<T>>) {
  let result;
  try { result = await operation(); }
  catch (cause) { console.error('Documentation creation failed', cause); error(500, 'Unable to create item'); }
  if (result.status === 'invalid') error(400, result.message);
  if (result.status === 'conflict') error(409, 'An item with this name already exists. Choose another folder name.');
  if (result.status === 'not-found') error(404, 'Parent folder not found');
  if (result.status === 'unavailable') error(503, 'Documentation unavailable');
  return json(result, { status: 201, headers: { 'cache-control': 'no-store' } });
}
