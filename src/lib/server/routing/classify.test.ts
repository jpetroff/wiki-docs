import { describe, expect, test } from 'bun:test';
import { classifyRequest } from './classify';

describe('documentation request classification', () => {
  test.each([
    ['/', 'view'],
    ['/guide/intro.md', 'view'],
    ['/guide/?edit', 'edit'],
    ['/guide/intro.md?edit=false', 'edit'],
    ['/guide/?files', 'files'],
    ['/guide/intro.md?files&edit', 'files'],
    ['/?edit&files=', 'files'],
    ['/guide/?q=files', 'view']
  ] as const)('%s selects %s', (path, mode) => {
    const url = new URL(path, 'http://wiki.test');
    expect(classifyRequest(url)).toEqual({ kind: 'documentation', pathname: url.pathname, mode });
  });

  test.each(['/_', '/_/login?edit', '/_/api/documents?files', '/_/app/immutable/main.js', '/_/unknown'])('%s stays in the service namespace', (path) => {
    expect(classifyRequest(new URL(path, 'http://wiki.test')).kind).toBe('service');
  });

  test('does not reserve unrelated names or decode file paths', () => {
    expect(classifyRequest(new URL('/_notes/a%20b.md', 'http://wiki.test'))).toEqual({
      kind: 'documentation', pathname: '/_notes/a%20b.md', mode: 'view'
    });
  });
});
