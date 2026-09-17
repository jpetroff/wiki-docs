import { error } from '@sveltejs/kit';
import { requireOrigin, requirePermission } from '$lib/server/auth/http';
import { documentationService } from '$lib/server/documentation';
import { creationResponse, readDocumentJson } from '$lib/server/documentation/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  requireOrigin(event);
  requirePermission(event, 'edit', true);
  const input = await readDocumentJson(event.request);
  if (typeof input.parentPath !== 'string' || input.parentPath.length > 4096 ||
      typeof input.content !== 'string' || input.content.includes('\0') || !input.content.isWellFormed()) error(400, 'Invalid document');
  const { parentPath, content } = input;
  return creationResponse(() => documentationService.createDocument(parentPath, content));
};
