import { createApplication } from './application.js';
import { db } from './db.js';

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
let application: Awaited<ReturnType<typeof createApplication>> | undefined;
let shutdownPromise: Promise<void> | undefined;
function shutdown(): Promise<void> {
  return shutdownPromise ??= (async () => {
    try { await application?.server.stop(); }
    finally { await db.$disconnect(); }
  })();
}

try {
  await db.$connect();
  application = await createApplication();
  const { httpServer } = application;
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, () => { httpServer.removeListener('error', reject); resolve(); });
  });
} catch (error) {
  await shutdown();
  throw error;
}
console.log(`Company Directory API ready at http://localhost:${port}/graphql`);
console.log(`Subscriptions ready at ws://localhost:${port}/graphql`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
