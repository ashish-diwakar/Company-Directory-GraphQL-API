import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { databaseUrl, postgresUrl } from './database-url.js';
export function createDatabase(url = databaseUrl) {
  const connectionString = postgresUrl(url);
  const schema = new URL(connectionString).searchParams.get('schema') ?? 'public';
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 10000 }, { schema }) });
}
const globalDb = globalThis as typeof globalThis & { directoryDb?: PrismaClient };
export const db = globalDb.directoryDb ??= createDatabase();

