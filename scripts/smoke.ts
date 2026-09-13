import { strict as assert } from 'node:assert';
import { mkdtemp, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthService } from '../src/lib/server/auth';

// Exercise real HTTP dispatch using an isolated documentation fixture.
const scratch = await mkdtemp(join(tmpdir(), 'wiki-docs-smoke-'));
const modes = ['development', 'production'] as const;
const docs = join(scratch, 'docs');
await mkdir(join(docs, 'guide'), { recursive: true });
await mkdir(join(docs, 'empty'));
await mkdir(join(docs, 'images'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5u8AAAAASUVORK5CYII=', 'base64');
await writeFile(join(docs, 'README.md'), '# Fixture home\n\n[Guide](guide/)\n\n```sh\necho hello\n```');
await writeFile(join(docs, 'guide', 'README.md'), '# Fixture guide\n\n[Home](../README.md#fixture-home)\n\n![Example](../images/example.png)');
await writeFile(join(docs, 'guide', 'intro.md'), '# Fixture intro');
await writeFile(join(docs, 'script.sh'), 'echo "<literal>"\n');
await writeFile(join(docs, 'invalid.txt'), new Uint8Array([0xff, 0x00]));
await writeFile(join(docs, 'images', 'example.png'), png);

try {
  for (const mode of modes) {
    const port = mode === 'development' ? 5197 : 5198;
    const origin = `http://127.0.0.1:${port}`;
    const databasePath = join(scratch, `accounts-${mode}`, 'wiki.sqlite');
    const fetch = (input: string | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (!headers.has('accept')) headers.set('accept', 'text/html');
      if (!headers.has('x-forwarded-proto')) headers.set('x-forwarded-proto', 'http');
      headers.set('x-forwarded-host', new URL(input).host);
      return globalThis.fetch(input, { ...init, headers });
    };
    const command = mode === 'development'
      ? [process.execPath, 'node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
      : [process.execPath, 'build/index.js'];
    const startServer = (database = databasePath) => Bun.spawn(command, {
      env: {
        ...process.env,
        DOCS_DIR: docs,
        DATABASE_PATH: database,
        ORIGIN: mode === 'production' ? '' : origin,
        PROTOCOL_HEADER: 'x-forwarded-proto',
        HOST_HEADER: 'x-forwarded-host',
        HOST: '127.0.0.1',
        PORT: String(port)
      },
      stdout: 'pipe', stderr: 'pipe'
    });
    let server = startServer();
    let logs = Promise.all([new Response(server.stdout).text(), new Response(server.stderr).text()]);
    const restart = async (database = databasePath) => {
      server.kill();
      await server.exited;
      await logs;
      server = startServer(database);
      logs = Promise.all([new Response(server.stdout).text(), new Response(server.stderr).text()]);
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && server.exitCode === null) {
        try { if ((await fetch(origin)).ok) return; } catch { /* Server is starting. */ }
        await Bun.sleep(100);
      }
      throw new Error('Production restart failed');
    };

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
        ['/', 'Fixture home'],
        ['/guide', 'Fixture guide'],
        ['/guide/', 'Fixture guide'],
        ['/guide/README.md', 'Fixture guide'],
        ['/script.sh', 'shiki'],
        ['/script', 'shiki'],
        ['/guide/intro', 'Fixture intro'],
        ['/guide/intro.md', 'Fixture intro'],
        ['/guide/intro.md?files', 'File browser preview'],
        ['/?edit&files', 'File browser preview'],
        ['/_/login?edit', 'Welcome back']
      ]) {
        const response = await fetch(`${origin}${path}`);
        assert.equal(response.status, 200, `${mode} GET ${path}`);
        const html = await response.text();
        assert(html.includes(marker), `${path} should contain server-rendered ${marker}`);
        assert(!html.includes(scratch), 'Private configuration must not reach the client');
      }

      const rootHtml = await (await fetch(origin)).text();
      assert(rootHtml.includes('user-content-fixture-home'));
      assert(rootHtml.includes('shiki'));
      const guideHtml = await (await fetch(`${origin}/guide/`)).text();
      assert(guideHtml.includes('/README.md#user-content-fixture-home'));
      assert(guideHtml.includes('/_/assets/images/example.png'));
      for (const path of ['/missing.md', '/empty', '/invalid.txt', '/images/example.png', '/.private/secret.md', '/_/assets/README.md', '/_/assets/missing.png', '/_/assets/image.svg']) {
        assert.equal((await fetch(`${origin}${path}`)).status, 404, `Missing or disallowed ${path}`);
      }
      // Vite itself intercepts the application's .git path before SvelteKit in dev.
      assert.equal((await fetch(`${origin}/.git/config`)).status, mode === 'development' ? 403 : 404);
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(`${origin}/_/assets/images/example.png`, { method });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'image/png');
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        const bytes = new Uint8Array(await response.arrayBuffer());
        assert.deepEqual(bytes, method === 'HEAD' ? new Uint8Array() : new Uint8Array(png));
      }
      // Temporarily remove only our fixture root to verify the unavailable response.
      const { rename } = await import('node:fs/promises');
      await rename(docs, docs + '-unavailable');
      try {
        const unavailable = await fetch(origin);
        assert.equal(unavailable.status, 503);
        const html = await unavailable.text();
        assert(html.includes('Documentation unavailable'));
        assert(!html.includes(scratch));
      } finally { await rename(docs + '-unavailable', docs); }
      await writeFile(join(docs, 'guide', 'intro.md'), '# Updated fixture intro');
      assert((await (await fetch(`${origin}/guide/intro.md`)).text()).includes('Updated fixture intro'));
      await writeFile(join(docs, 'guide', 'intro.md'), '# Fixture intro');

      for (const path of ['/_', '/_/unknown', '/_/unknown?files']) {
        assert.equal((await fetch(`${origin}${path}`)).status, 404, `Reserved service ${path}`);
      }

      for (const [method, path] of [
        ['POST', '/_/settings'],
        ['POST', '/_/publish'], ['POST', '/_/api/documents'],
        ['PUT', '/_/api/documents'], ['PATCH', '/_/api/documents'], ['DELETE', '/_/api/documents']
      ]) {
        const response = await fetch(`${origin}${path}`, {
          method,
          headers: { origin, 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
          body: ''
        });
        assert.equal(response.status, 401, `${mode} ${method} ${path}`);
        await response.text();
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
        assert(!/bloklabs|blokeditor|shiki|markdown-it/i.test(manifest), 'Blok must remain out of the initial client bundle');
      }

      assert(!(await readdir(scratch)).includes(`accounts-${mode}`), 'Anonymous requests must not initialize account storage');
      const auth = createAuthService({ path: databasePath });
      const password = 'smoke fixture password';
      assert.equal((await auth.create('smoke-admin', password, 'admin', true)).status, 'ok');
      assert.equal((await auth.create('smoke-editor', password, 'editor')).status, 'ok');
      const login = (username: string, value = password, extra: Record<string, string> = {}) => fetch(`${origin}/_/login?returnTo=%2Fguide%2F`, {
        method: 'POST', redirect: 'manual',
        headers: { origin, ...extra }, body: new URLSearchParams({ login: username, password: value })
      });
      try {
        for (const path of ['/guide/?edit', '/_/settings', '/_/publish']) {
          const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
          assert.equal(response.status, 303);
          assert(response.headers.get('location')?.startsWith('/_/login?returnTo='));
        }
        const denied = await login('smoke-admin', 'wrong fixture password');
        assert.equal(denied.status, 400);
        const failureHtml = await denied.text();
        assert(failureHtml.includes('Invalid username or password'));
        assert(!failureHtml.includes('wrong fixture password'));
        const crossOrigin = await login('smoke-admin', password, { origin: 'https://evil.test' });
        assert.equal(crossOrigin.status, 403);
        const signedIn = await login('smoke-admin');
        assert.equal(signedIn.status, 303);
        assert.equal(signedIn.headers.get('location'), '/guide/');
        const setCookie = signedIn.headers.get('set-cookie') ?? '';
        assert(/HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie));
        assert(/Max-Age=2592000/i.test(setCookie) && /Path=\//i.test(setCookie));
        assert(!/; Secure/i.test(setCookie) && !/Domain=/i.test(setCookie));
        const cookie = setCookie.split(';')[0];
        const signedHtml = await (await fetch(origin, { headers: { cookie } })).text();
        assert(signedHtml.includes('smoke-admin') && signedHtml.includes('Log out'));
        assert(!signedHtml.includes(cookie.split('=')[1]));
        for (const [path, marker] of [['/_/settings', 'Service setup'], ['/_/publish', 'Publish changes'], ['/guide/?edit', 'Editor preview']]) {
          const response = await fetch(`${origin}${path}`, { headers: { cookie } });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert((await response.text()).includes(marker));
        }
        for (const path of ['/_/settings', '/_/publish', '/_/api/documents']) {
          const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { origin, cookie }, body: new URLSearchParams() });
          assert.equal(response.status, 501);
        }
        const editor = await login('smoke-editor');
        assert.equal(editor.status, 303);
        const editorCookie = editor.headers.get('set-cookie')!.split(';')[0];
        assert.equal((await fetch(`${origin}/_/settings`, { headers: { cookie: editorCookie } })).status, 403);
        assert.equal((await fetch(`${origin}/_/settings`, { method: 'POST', headers: { origin, cookie: editorCookie }, body: new URLSearchParams() })).status, 403);
        const editorHtml = await (await fetch(origin, { headers: { cookie: editorCookie } })).text();
        assert(!editorHtml.includes('>Settings</a>'));
        const blockedLogout = await fetch(`${origin}/_/logout`, { method: 'POST', redirect: 'manual', headers: { origin: 'https://evil.test', cookie } });
        assert.equal(blockedLogout.status, 403);
        const logout = await fetch(`${origin}/_/logout`, { method: 'POST', redirect: 'manual', headers: { origin, cookie } });
        assert.equal(logout.status, 303);
        assert(/Max-Age=0/i.test(logout.headers.get('set-cookie') ?? ''));
        const loggedOut = await fetch(origin, { headers: { cookie } });
        assert(!(await loggedOut.text()).includes('smoke-admin'));
        assert.equal((await fetch(`${origin}/_/settings`, { redirect: 'manual', headers: { cookie } })).status, 303);
        assert.equal((await fetch(`${origin}/_/logout`)).status, 405);
        assert.equal((await fetch(`${origin}/_/logout`, { method: 'POST', redirect: 'manual', headers: { origin } })).status, 303);
        if (mode === 'production') {
          const secure = await login('smoke-editor', password, { origin: origin.replace('http:', 'https:'), 'x-forwarded-proto': 'https' });
          assert.equal(secure.status, 303);
          assert(/; Secure/i.test(secure.headers.get('set-cookie') ?? ''));
          await restart();
          const restored = await fetch(`${origin}/_/publish`, { headers: { cookie: editorCookie } });
          assert.equal(restored.status, 200);
          assert((await restored.text()).includes('smoke-editor'));
          const blockedStorage = join(scratch, 'not-a-directory');
          await writeFile(blockedStorage, 'fixture');
          await restart(join(blockedStorage, 'accounts.sqlite'));
          const publicRead = await fetch(origin, { headers: { cookie: editorCookie } });
          assert.equal(publicRead.status, 200);
          assert((await publicRead.text()).includes('Fixture home'));
          assert.equal((await fetch(`${origin}/_/assets/images/example.png`, { headers: { cookie: editorCookie } })).status, 200);
          assert.equal((await fetch(`${origin}/_/publish`, { headers: { cookie: editorCookie } })).status, 503);
          assert.equal((await login('smoke-editor')).status, 503);
        }
      } finally { auth.close(); }
      console.log(`${mode}: reader, login/logout, cookies, CSRF, and authorization passed`);
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
