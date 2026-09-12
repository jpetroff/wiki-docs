import { strict as assert } from 'node:assert';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Exercise real HTTP dispatch in both runtimes, without a documentation checkout.
const scratch = await mkdtemp(join(tmpdir(), 'wiki-docs-smoke-'));
const modes = ['development', 'production'] as const;

try {
  for (const mode of modes) {
    const port = mode === 'development' ? 5197 : 5198;
    const origin = `http://127.0.0.1:${port}`;
    const command = mode === 'development'
      ? [process.execPath, 'node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
      : [process.execPath, 'build/index.js'];
    const server = Bun.spawn(command, {
      env: {
        ...process.env,
        DOCS_DIR: '',
        DATABASE_PATH: join(scratch, 'wiki.sqlite'),
        ORIGIN: origin,
        HOST: '127.0.0.1',
        PORT: String(port)
      },
      stdout: 'pipe', stderr: 'pipe'
    });
    const logs = Promise.all([new Response(server.stdout).text(), new Response(server.stderr).text()]);

    try {
      const deadline = Date.now() + 30_000;
      let ready = false;
      while (Date.now() < deadline && server.exitCode === null) {
        try {
          const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
          await response.text();
          if (response.ok) { ready = true; break; }
        } catch { /* Wait for the server to bind and compile its initial page. */ }
        await Bun.sleep(200);
      }
      assert(ready, `${mode} server did not become ready`);

      for (const [path, marker] of [
        ['/', 'Documentation preview'],
        ['/guide/intro.md', 'Documentation preview'],
        ['/guide/?edit', 'Editor preview'],
        ['/guide/intro.md?files', 'File browser preview'],
        ['/?edit&files', 'File browser preview'],
        ['/_/login?edit', 'Accounts are coming later'],
        ['/_/settings', 'Service setup'],
        ['/_/publish', 'Publish changes']
      ]) {
        const response = await fetch(`${origin}${path}`);
        assert.equal(response.status, 200, `${mode} GET ${path}`);
        const html = await response.text();
        assert(html.includes(marker), `${path} should contain server-rendered ${marker}`);
        assert(!html.includes(scratch), 'Private configuration must not reach the client');
      }

      const rootHtml = await (await fetch(origin)).text();
      assert(rootHtml.includes('No documentation folder is configured'));

      for (const path of ['/_', '/_/unknown', '/_/unknown?files']) {
        assert.equal((await fetch(`${origin}${path}`)).status, 404, `Reserved service ${path}`);
      }

      for (const [method, path] of [
        ['POST', '/_/login'], ['POST', '/_/logout'], ['POST', '/_/settings'],
        ['POST', '/_/publish'], ['POST', '/_/api/documents'],
        ['PUT', '/_/api/documents'], ['PATCH', '/_/api/documents'], ['DELETE', '/_/api/documents']
      ]) {
        const response = await fetch(`${origin}${path}`, {
          method,
          headers: { origin, 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
          body: ''
        });
        assert.equal(response.status, 501, `${mode} ${method} ${path}`);
        assert((await response.text()).includes('not-implemented'), `${path} must expose its stub state`);
        assert.equal(response.headers.get('set-cookie'), null, 'Stubs must not create sessions');
      }

      if (mode === 'production') {
        const assetUrls = [...rootHtml.matchAll(/(?:href|src)="([^"]+\.(?:css|js))"/g)]
          .map((match) => new URL(match[1], origin));
        assert(assetUrls.length > 0, 'Production HTML should reference compiled assets');
        for (const url of assetUrls) {
          assert(url.pathname.startsWith('/_/app/'), `Asset outside reserved namespace: ${url.pathname}`);
          const response = await fetch(url);
          assert.equal(response.status, 200, `Production asset ${url.pathname}`);
          assert(!response.headers.get('content-type')?.includes('text/html'), 'Asset must not resolve to a page');
          await response.arrayBuffer();
        }
        const manifest = await Bun.file('.svelte-kit/output/client/.vite/manifest.json').text();
        assert(!/bloklabs|blokeditor/i.test(manifest), 'Blok must remain out of the initial client bundle');
      }

      assert.deepEqual(await readdir(scratch), [], 'Requests must not initialize application data');
      console.log(`${mode}: SSR placeholders, route precedence, 501 mutations, and no database/session writes passed`);
    } catch (error) {
      server.kill();
      await server.exited;
      console.error((await logs).join('\n'));
      throw error;
    } finally {
      if (server.exitCode === null) server.kill();
      await server.exited;
      await logs;
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
