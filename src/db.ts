import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma/client.js';
import { databaseUrl } from './database-url.js';
export function createDatabase(url = databaseUrl) {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}
const globalDb = globalThis as typeof globalThis & { directoryDb?: PrismaClient };
export const db = globalDb.directoryDb ??= createDatabase();

