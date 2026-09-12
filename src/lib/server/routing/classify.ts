import type { WikiRequest } from '../../shared/request';

/** Classification is independent of authentication, configuration, and disk I/O. */
export function classifyRequest(url: URL): WikiRequest {
  if (url.pathname === '/_' || url.pathname.startsWith('/_/')) {
    return { kind: 'service', pathname: url.pathname };
  }

  return {
    kind: 'documentation',
    pathname: url.pathname,
    mode: url.searchParams.has('files')
      ? 'files'
      : url.searchParams.has('edit')
        ? 'edit'
        : 'view'
  };
}
