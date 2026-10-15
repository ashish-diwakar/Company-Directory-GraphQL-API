import { startStandaloneServer } from '@apollo/server/standalone';
import { createContext } from './context.js';
import { db } from './db.js';
import { createServer } from './server.js';
const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const server = createServer();
await db.$connect();
const { url } = await startStandaloneServer(server, {
  listen: { port },
  context: async () => createContext(),
});
console.log(`Company Directory API ready at ${url}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.stop().finally(() => db.$disconnect()).catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}

