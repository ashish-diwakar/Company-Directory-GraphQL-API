import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { databaseUrl } from './src/database-url.js';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/postgresql/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DIRECT_DATABASE_URL || databaseUrl },
});

