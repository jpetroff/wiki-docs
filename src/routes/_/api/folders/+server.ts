import { error, json } from '@sveltejs/kit';
import { requireOrigin, requirePermission } from '$lib/server/auth/http';
import { documentationService } from '$lib/server/documentation';
import { creationResponse, readDocumentJson } from '$lib/server/documentation/http';
import { documentationResponse } from '$lib/server/routing/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const path = url.searchParams.get('path') ?? '';
  const depth = url.searchParams.get('depth') ?? '1';
  if (path.length > 4096 || !/^(?:[0-9]|10)$/.test(depth)) error(400, 'Depth must be an integer from 0 to 10');
  return json(await documentationResponse(() => documentationService.list(path, Number(depth))), {
    headers: { 'cache-control': 'no-store' }
  });
};

export const POST: RequestHandler = async (event) => {
  requireOrigin(event);
  requirePermission(event, 'edit', true);
  const input = await readDocumentJson(event.request);
  if (typeof input.parentPath !== 'string' || input.parentPath.length > 4096 || typeof input.name !== 'string') error(400, 'Invalid folder');
  const { parentPath, name } = input;
  return creationResponse(() => documentationService.createFolder(parentPath, name));
};
