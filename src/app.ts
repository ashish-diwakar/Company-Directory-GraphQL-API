import { createApplication } from './application.js';

// Vercel owns listening and routes HTTP and WebSocket upgrades to this server.
// Local startup uses index.ts, and tests import the factory in application.ts.
export const application = await createApplication();
export default application.httpServer;
