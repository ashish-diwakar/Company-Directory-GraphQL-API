import 'dotenv/config';
import { resolve } from 'node:path';

// Resolve file paths once so the CLI and runtime target the same SQLite file.
export const databaseUrl = `file:${resolve((process.env.DATABASE_URL ?? 'file:./prisma/dev.db').replace(/^file:/, '')).replaceAll('\\', '/')}`;
