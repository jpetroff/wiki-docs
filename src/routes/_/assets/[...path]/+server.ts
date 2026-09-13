import { documentationFiles } from '$lib/server/documentation';
import { documentationResponse } from '$lib/server/routing/http';
import { extensionOf, imageExtensions } from '$lib/shared/highlighting';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, request }) => {
  const result = await documentationResponse(async () => {
    const resource = await documentationFiles.resolve(url.pathname.slice('/_/assets'.length), true);
    if (resource.status !== 'ok') return resource;
    const bytes = await documentationFiles.read(resource.value.path, true);
    if (bytes.status !== 'ok') return bytes;
    return { status: 'ok' as const, value: { bytes: bytes.value, path: resource.value.path } };
  });
  if (result.status !== 'ok') throw new Error('Unexpected asset result');
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(result.value.bytes), {
    headers: {
      'content-type': imageExtensions[extensionOf(result.value.path) as keyof typeof imageExtensions],
      'content-length': String(result.value.bytes.byteLength),
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store'
    }
  });
};
export const HEAD = GET;
