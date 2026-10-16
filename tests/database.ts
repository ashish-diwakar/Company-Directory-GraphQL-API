import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createDatabase } from '../src/db.js';

function testUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value || !/^postgres(?:ql)?:\/\//.test(value)) throw new Error('Set TEST_DATABASE_URL to a separate disposable PostgreSQL database before running integration tests.');
  return value;
}
export async function createTestSchema() {
  const url = new URL(testUrl());
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: url.href, connectionTimeoutMillis: 10000 });
  try { await pool.query(`CREATE SCHEMA "${schema}"`); }
  finally { await pool.end(); }
  url.searchParams.set('schema', schema);
  return url.href;
}
export async function applyTestMigrations(db: ReturnType<typeof createDatabase>, value: string) {
  const schema = new URL(value).searchParams.get('schema');
  if (!schema || !/^test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid test schema.');
  const root = 'prisma/postgresql/migrations';
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    for (const migration of (await readdir(root)).filter(name => /^\d/.test(name)).sort()) {
      const sql = await readFile(`${root}/${migration}/migration.sql`, 'utf8');
      for (const statement of sql.split(';').filter(part => part.trim())) await tx.$executeRawUnsafe(statement);
    }
  });
}
export async function dropTestSchema(value: string) {
  const url = new URL(value);
  const schema = url.searchParams.get('schema');
  if (!schema || !/^test_[a-f0-9]{32}$/.test(schema)) throw new Error('Refusing to drop a schema not created by the test harness.');
  const pool = new Pool({ connectionString: testUrl(), connectionTimeoutMillis: 10000 });
  try { await pool.query(`DROP SCHEMA "${schema}" CASCADE`); }
  finally { await pool.end(); }
}
