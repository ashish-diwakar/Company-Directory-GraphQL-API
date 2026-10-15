import { copyFile } from 'node:fs/promises';
await copyFile(new URL('../src/schema.graphql', import.meta.url), new URL('../dist/schema.graphql', import.meta.url));
