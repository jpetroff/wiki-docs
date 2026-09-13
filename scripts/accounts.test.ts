import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAuthService } from '../src/lib/server/auth';
let scratch: string;
beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), 'wiki-cli-')); });
afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });
const password = 'interactive test password';
async function interactive(script: string, args: string[], answers: Array<[string, string]>, env: Record<string, string>) {
  let output = '';
  let index = 0;
  const child = Bun.spawn([process.execPath, script, ...args], {
    cwd: scratch, env: { ...process.env, DOCS_DIR: '', ...env },
    terminal: {
      data(terminal, bytes) {
        output += Buffer.from(bytes).toString();
        if (index < answers.length && output.includes(answers[index][0])) {
          terminal.write(answers[index][1] + '\r');
          index++;
        }
      }
    }
  });
  const timeout = setTimeout(() => child.kill(), 5000);
  try { return { code: await child.exited, output }; }
  finally { clearTimeout(timeout); child.terminal?.close(); }
}

test('bundled CLI bootstraps, creates and resets accounts without echoing passwords', async () => {
  const deploy = join(scratch, 'deploy');
  mkdirSync(deploy);
  const bundle = join(deploy, 'accounts.js');
  const built = await Bun.build({ entrypoints: [resolve('scripts/accounts.ts')], target: 'bun', outdir: deploy });
  expect(built.success).toBe(true);
  const database = join(scratch, 'private/wiki.sqlite');
  const env = { DATABASE_PATH: database, NODE_ENV: 'production' };
  const boot = await interactive(bundle, ['bootstrap'], [['Administrator username:', 'admin'], ['Password:', password], ['Confirm password:', password]], env);
  expect(boot.code).toBe(0);
  expect(boot.output).toContain('Account created.');
  expect(boot.output).not.toContain(password);
  const create = await interactive(bundle, ['create', 'editor', '--role', 'editor'], [['Password:', password], ['Confirm password:', password]], env);
  expect(create.code).toBe(0);
  expect(create.output).not.toContain(password);
  const auth = createAuthService({ path: database });
  try {
    const login = await auth.login('editor', password);
    expect(login.status).toBe('ok');
    if (login.status !== 'ok') throw new Error('Login failed');
    const replacement = 'new interactive password';
    const reset = await interactive(bundle, ['reset-password', 'editor'], [['Password:', replacement], ['Confirm password:', replacement]], env);
    expect(reset.code).toBe(0);
    expect(reset.output).not.toContain(replacement);
    expect(await auth.lookupSession(login.value.token)).toEqual({ status: 'ok', value: null });
    expect((await auth.login('editor', replacement)).status).toBe('ok');
  } finally { auth.close(); }
  const repeat = await interactive(bundle, ['bootstrap'], [['Administrator username:', 'other-admin'], ['Password:', password], ['Confirm password:', password]], env);
  expect(repeat.code).toBe(1);
  expect(repeat.output).toContain('accounts exist');
}, 15000);

test('CLI refuses piped credentials', async () => {
  const child = Bun.spawn([process.execPath, resolve('scripts/accounts.ts'), 'bootstrap'], {
    cwd: scratch, env: { ...process.env, DOCS_DIR: '', DATABASE_PATH: join(scratch, 'db.sqlite') },
    stdin: 'pipe', stdout: 'pipe', stderr: 'pipe'
  });
  child.stdin.end();
  expect(await child.exited).toBe(1);
  expect(await new Response(child.stderr).text()).toContain('interactive terminal');
});

test('deployment rejects an unsafe database before replacing existing output', async () => {
  const deploy = join(scratch, 'deploy');
  mkdirSync(deploy);
  const sentinel = join(deploy, 'index.js');
  writeFileSync(sentinel, 'existing deployment');
  const child = Bun.spawn(['bash', 'scripts/build.sh', deploy, '18081'], {
    env: { ...process.env, DOCS_DIR: '', DATABASE_PATH: join(deploy, 'data/wiki.sqlite') },
    stdout: 'pipe', stderr: 'pipe'
  });
  expect(await child.exited).toBe(1);
  expect(await new Response(child.stderr).text()).toContain('outside the deployment directory');
  expect(readFileSync(sentinel, 'utf8')).toBe('existing deployment');
});
