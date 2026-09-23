import { documentUrl } from '$lib/shared/navigation';
import { error } from '@sveltejs/kit';
import { requirePermission } from '$lib/server/auth/http';
import { documentationService } from '$lib/server/documentation';
import { documentationResponse } from '$lib/server/routing/http';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  requirePermission(event, 'edit');
  const parentPath = event.url.searchParams.get('parent') ?? '';
  if (parentPath.length > 4096) error(400, 'Invalid parent folder');
  const folder = await documentationResponse(() => documentationService.resolveDirectory(documentUrl(parentPath)));
  if (folder.status !== 'ok') error(404, 'Parent folder not found');
  return { parentPath: folder.value.path };
};
