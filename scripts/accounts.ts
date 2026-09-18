import { createInterface } from 'node:readline/promises';
import { createAuthService, type AuthResult } from '../src/lib/server/auth';
import { validateDatabasePath } from '../src/lib/server/database';

function secret(question: string): Promise<string> {
  const input = process.stdin;
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();
    function finish(error?: Error) {
      input.off('data', onData);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    }
    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === '\u0003' || char === '\u0004') { finish(new Error('Cancelled.')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u007f' || char === '\b') value = [...value].slice(0, -1).join('');
        else if (char >= ' ' && value.length < 1024) value += char;
      }
    }
    input.on('data', onData);
    process.stdout.write(question);
  });
}
function assertSuccess<T>(result: AuthResult<T>): void {
  if (result.status === 'ok') return;
  if (result.status === 'validation-error') throw new Error(result.message);
  const messages: Record<string, string> = {
    conflict: 'Username already exists, or bootstrap is unavailable because accounts exist.',
    'not-found': 'Account not found.', unavailable: 'Account storage unavailable. Check database configuration and permissions.'
  };
  throw new Error(messages[result.status] ?? 'Account operation failed.');
}
async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const [command, username, flag, role] = args;
  const valid = (command === 'bootstrap' && args.length === 1)
    || (command === 'create' && args.length === 4 && flag === '--role' && ['admin', 'editor'].includes(role))
    || (command === 'reset-password' && args.length === 2);
  if (!valid) throw new Error('Usage: accounts bootstrap | create <username> --role admin|editor | reset-password <username>');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Account commands require an interactive terminal.');
  const options = {
    path: process.env.DATABASE_PATH?.trim() || './data/wiki.sqlite',
    docsDir: process.env.DOCS_DIR?.trim() || undefined,
    production: import.meta.file === 'accounts.js' || process.env.NODE_ENV === 'production',
    deploymentDir: import.meta.file === 'accounts.js' ? import.meta.dir : process.cwd()
  };
  console.log(`Database path: ${options.path}`)
  validateDatabasePath(options);
  let login = username;
  if (command === 'bootstrap') {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try { login = await readline.question('Administrator username: '); }
    finally { readline.close(); }
  }
  const password = await secret('Password: ');
  const confirmation = await secret('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  const service = createAuthService(options);
  try {
    const result = command === 'reset-password'
      ? await service.resetPassword(login, password)
      : await service.create(login, password, command === 'bootstrap' ? 'admin' : role as 'admin' | 'editor', command === 'bootstrap');
    assertSuccess(result);
    console.log(command === 'reset-password' ? 'Password reset. All sessions revoked.' : 'Account created.');
  } finally { service.close(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Account command failed.'); process.exitCode = 1; });
