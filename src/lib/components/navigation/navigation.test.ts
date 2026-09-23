import { expect, spyOn, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import type { DirectoryNode } from '../../shared/navigation';

test('full snapshot supports synchronous expansion and reveal without fetching', async () => {
  // Compile the real rune module with Svelte, rather than mocking its state primitives.
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + '/navigation.svelte.ts'], target: 'browser',
    plugins: [{ name: 'navigation-runes', setup(build) {
      build.onLoad({ filter: /navigation\.svelte\.ts$/ }, async ({ path }) => {
        const source = new Bun.Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text() + `
          export { flushSync } from 'svelte';
          export function observeExpansion(state, path, changed) {
            return $effect.root(() => { $effect(() => changed(state.expanded[path])); });
          }
        `);
        return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
      });
    } }]
  });
  expect(bundle.success).toBe(true);
  const { NavigationState, observeExpansion, flushSync } = await import('data:text/javascript;base64,' +
    Buffer.from(await bundle.outputs[0].text()).toString('base64'));
  const root: DirectoryNode = { kind: 'directory', name: '', path: '', hasIndex: true, hasChildren: true,
    children: [{ kind: 'directory', name: 'a', path: 'a', hasIndex: false, hasChildren: true,
      children: [{ kind: 'directory', name: 'b', path: 'a/b', hasIndex: false, hasChildren: false, children: [] }] }] };
  const unexpectedFetch = Object.assign(() => { throw new Error('Unexpected navigation fetch'); },
    { preconnect: globalThis.fetch.preconnect });
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(unexpectedFetch);
  try {
    const state = new NavigationState(root);
    expect(Object.keys(state.folders)).toEqual(['', 'a', 'a/b']);
    expect(state.expanded['']).toBe(true);
    expect(state.expanded.a).toBeUndefined();
    expect(state.expand('a')).toBeUndefined();
    expect(state.expanded.a).toBe(true);
    const changes: (boolean | undefined)[] = [];
    const stop = observeExpansion(state, 'a', (expanded: boolean | undefined) => changes.push(expanded));
    flushSync();
    state.collapse('a');
    flushSync();
    state.expand('a');
    flushSync();
    state.collapse('a');
    flushSync();
    expect(changes).toEqual([true, false, true, false]);
    stop();
    state.reveal('a/b');
    expect(state.expanded.a).toBe(true);
    expect(state.expanded['a/b']).toBe(true);
    state.reveal('new/folder');
    expect(state.folders['new']).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(new NavigationState(null).folders['']).toBeUndefined();
  } finally { fetch.mockRestore(); }
});
