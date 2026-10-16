// Development-only real PostgreSQL runtime; never contacts a hosted database.
import EmbeddedPostgres from 'embedded-postgres';
import { createServer } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const probe = createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const databaseDir = join(await mkdtemp(join(tmpdir(), 'directory-postgres-')), 'data');
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({ databaseDir, port, user: 'postgres', password,
  authMethod: 'scram-sha-256', persistent: false, postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {}, onError: message => console.error(message),
});
function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Verification command exited with ${code}.`)));
  });
}
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('company_directory_test');
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/company_directory_test`;
  const env = { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url, TEST_DATABASE_URL: url };
  // Exercise the production migration command as well as schema-isolated tests.
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], env);
  await run(['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--runInBand', ...process.argv.slice(2)], env);
} catch (error) {
  console.error(error); process.exitCode = 1;
} finally { await postgres.stop(); }
