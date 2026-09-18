import { strict as assert } from 'node:assert';
import { mkdtemp, readdir, rm, mkdir, writeFile, unlink } from 'node:fs/promises';
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
        ['/guide/intro.md?files', 'data-documentation-mode="files"'],
        ['/?edit&files', 'data-documentation-mode="files"'],
        ['/empty', 'This folder has no documents or folders to display.'],
        ['/_/login?edit', 'Welcome back']
      ]) {
        const response = await fetch(`${origin}${path}`);
        assert.equal(response.status, 200, `${mode} GET ${path}`);
        const html = await response.text();
        assert(html.includes(marker), `${path} should contain server-rendered ${marker}`);
        assert(!html.includes(scratch), 'Private configuration must not reach the client');
      }

      const rootHtml = await (await fetch(origin)).text();
      assert(!rootHtml.includes('data-edit-page'), 'Anonymous SSR must omit the Edit button');
      assert(rootHtml.includes('user-content-fixture-home'));
      assert(rootHtml.includes('shiki'));
      assert(rootHtml.includes('aria-label="Documentation tree"'));
      assert(!rootHtml.includes('aria-label="Create in '), 'Anonymous navigation omits creation controls');
      const tree = await (await fetch(`${origin}/_/api/folders?path=guide&depth=1`)).json();
      assert.equal(tree.value.hasIndex, true);
      assert.deepEqual(tree.value.children.map((entry: { name: string }) => entry.name), ['intro.md']);
      const metadata = await (await fetch(`${origin}/_/api/folders?path=guide&depth=0`)).json();
      assert.equal(metadata.value.hasChildren, true);
      assert.equal(metadata.value.children, undefined);
      for (const depth of ['-1', '11', '1.5', 'all', '']) {
        assert.equal((await fetch(`${origin}/_/api/folders?depth=${depth}`)).status, 400);
      }
      for (const path of ['../outside', '.private', '_', 'missing', 'script.sh']) {
        assert.equal((await fetch(`${origin}/_/api/folders?${new URLSearchParams({ path })}`)).status, 404);
      }
      // The root also falls back to a real listing when its index is absent.
      const homeSource = await Bun.file(join(docs, 'README.md')).text();
      await unlink(join(docs, 'README.md'));
      try {
        const fallback = await fetch(origin);
        assert.equal(fallback.status, 200);
        assert((await fallback.text()).includes('data-documentation-mode="files"'));
      } finally { await writeFile(join(docs, 'README.md'), homeSource); }
      const guideHtml = await (await fetch(`${origin}/guide/`)).text();
      assert(guideHtml.includes('/README.md#user-content-fixture-home'));
      assert(guideHtml.includes('/_/assets/images/example.png'));
      for (const path of ['/missing.md', '/invalid.txt', '/images/example.png', '/.private/secret.md', '/_/assets/README.md', '/_/assets/missing.png', '/_/assets/image.svg']) {
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
        ['POST', '/_/settings'], ['POST', '/_/api/folders'], ['POST', '/_/api/documents/create'],
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
        const vendorRoot = 'build/client/_/app/immutable/vendor';
        const blokDirectory = (await readdir(vendorRoot)).find((name) => name.startsWith('blok-'));
        assert(blokDirectory, 'Production build must include the Blok browser modules');
        const chunk = (await readdir(join(vendorRoot, blokDirectory, 'chunks'))).find((name) => name.endsWith('.mjs'));
        assert(chunk, 'Blok browser modules must include their dependencies');
        for (const file of ['blok.mjs', 'tools.mjs', 'markdown.mjs', `chunks/${chunk}`]) {
          const response = await fetch(`${origin}/_/app/immutable/vendor/${blokDirectory}/${file}`);
          assert.equal(response.status, 200, `Blok asset ${file}`);
          assert(response.headers.get('content-type')?.includes('javascript'), 'ESM assets need a JavaScript MIME type');
          assert.equal(await response.text(), await Bun.file(join(vendorRoot, blokDirectory, file)).text());
        }
        const manifest = JSON.parse(await Bun.file('.svelte-kit/output/client/.vite/manifest.json').text());
        const initial = new Set<string>();
        function visit(key: string) {
          if (initial.has(key)) return;
          initial.add(key);
          for (const dependency of manifest[key]?.imports ?? []) visit(dependency);
        }
        for (const key of Object.keys(manifest).filter((key) => key.includes('nodes/'))) visit(key);
        assert(!/bloklabs|blokeditor|monaco|shiki|markdown-it/i.test([...initial].join(' ')), 'Editor engines must remain out of static page dependencies');
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
        assert(signedHtml.includes('data-edit-page'), 'Authorized SSR must render the Edit button');
        assert(signedHtml.includes('smoke-admin') && signedHtml.includes('Log out'));
        assert(!signedHtml.includes(cookie.split('=')[1]));
        assert(signedHtml.includes('aria-label="Create in '));
        for (const [path, marker] of [['/_/settings', 'Service setup'], ['/_/publish', 'Publish changes'], ['/guide/?edit', 'Edit page'], ['/script?edit', 'Edit page']]) {
          const response = await fetch(`${origin}${path}`, { headers: { cookie } });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert((await response.text()).includes(marker));
        }
        for (const path of ['/_/settings', '/_/publish']) {
          const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { origin, cookie }, body: new URLSearchParams() });
          assert.equal(response.status, 501);
        }
        const editor = await login('smoke-editor');
        assert.equal(editor.status, 303);
        const editorCookie = editor.headers.get('set-cookie')!.split(';')[0];
        const source = 'echo "<literal>"\n';
        const originalRevision = new Bun.CryptoHasher('sha256').update(source).digest('hex');
        const save = (content: string, extra: Record<string, string> = {}) => fetch(`${origin}/_/api/documents`, {
          method: 'PUT', headers: { origin, cookie: editorCookie, 'content-type': 'application/json', ...extra },
          body: JSON.stringify({ path: 'script.sh', content, originalRevision })
        });
        assert.equal((await save('blocked', { origin: 'https://evil.test' })).status, 403);
        assert.equal((await save('blocked', { cookie: '' })).status, 401);
        assert.equal((await save('echo saved\n')).status, 200);
        assert((await (await fetch(`${origin}/script.sh`)).text()).includes('saved'));
        assert.equal((await save('stale edit')).status, 409);
        await writeFile(join(docs, 'script.sh'), source);
        const create = (endpoint: string, input: unknown, extra: Record<string, string> = {}) => fetch(`${origin}${endpoint}`, {
          method: 'POST', headers: { origin, cookie: editorCookie, 'content-type': 'application/json', ...extra }, body: JSON.stringify(input)
        });
        const folderInput = { parentPath: 'guide', name: 'New #é% folder' };
        assert.equal((await create('/_/api/folders', folderInput, { origin: 'https://evil.test' })).status, 403);
        assert.equal((await create('/_/api/documents/create', { parentPath: '', content: '# Blocked' }, { origin: 'https://evil.test' })).status, 403);
        const createdFolder = await create('/_/api/folders', folderInput);
        assert.equal(createdFolder.status, 201);
        const folderPath = (await createdFolder.json()).value.path;
        assert.equal(await Bun.file(join(docs, folderPath, 'README.md')).text(), '');
        assert.equal((await create('/_/api/folders', folderInput)).status, 409);
        assert.equal((await create('/_/api/folders', { parentPath: '', name: '../bad' })).status, 400);
        const beforeDraft = await readdir(join(docs, folderPath));
        const draft = await fetch(`${origin}/_/new?${new URLSearchParams({ parent: folderPath })}`, { headers: { cookie: editorCookie } });
        assert.equal(draft.status, 200);
        assert((await draft.text()).includes('New document'));
        assert.deepEqual(await readdir(join(docs, folderPath)), beforeDraft, 'Opening a draft never writes files');
        const documentInput = { parentPath: folderPath, content: '# New **Document**\n\nSaved body\n' };
        assert.equal((await create('/_/api/documents/create', { ...documentInput, content: 'No H1' })).status, 400);
        assert.deepEqual(await readdir(join(docs, folderPath)), beforeDraft);
        assert.equal((await create('/_/api/documents/create', { ...documentInput, parentPath: 'missing' })).status, 404);
        const createdDocument = await create('/_/api/documents/create', documentInput);
        assert.equal(createdDocument.status, 201);
        const createdValue = (await createdDocument.json()).value;
        assert.equal(createdValue.path, `${folderPath}/new-document.md`);
        assert.equal(await Bun.file(join(docs, createdValue.path)).text(), documentInput.content);
        const numbered = await create('/_/api/documents/create', documentInput);
        assert.equal(numbered.status, 201);
        assert.equal((await numbered.json()).value.path, `${folderPath}/new-document-2.md`);
        const legacySave = await create('/_/api/documents', { path: createdValue.path, content: '# Edited heading', originalRevision: createdValue.revision });
        assert.equal(legacySave.status, 200, 'POST remains an alias for existing-document saves');
        const refreshed = await (await fetch(`${origin}/_/api/folders?${new URLSearchParams({ path: folderPath })}`)).json();
        assert.deepEqual(refreshed.value.children.map((entry: { name: string }) => entry.name), ['new-document-2.md', 'new-document.md']);
        await rm(join(docs, folderPath), { recursive: true });
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
      console.log(`${mode}: reader, navigation/listings, creation, saves, login/logout, cookies, CSRF, and authorization passed`);
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
