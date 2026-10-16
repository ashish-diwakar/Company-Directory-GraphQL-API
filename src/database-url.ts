import 'dotenv/config';

// Keep provider URLs intact, including TLS and connection-pool parameters.
export function postgresUrl(value: string | undefined): string {
  if (!value || !/^postgres(?:ql)?:\/\//.test(value)) {
    throw new Error('Set DATABASE_URL to a PostgreSQL connection string. SQLite file URLs are no longer supported.');
  }
  try { new URL(value); } catch { throw new Error('DATABASE_URL is not a valid PostgreSQL URL.'); }
  return value;
}
// Validation happens when a connection is created; generation needs no live database.
export const databaseUrl = process.env.DATABASE_URL;
