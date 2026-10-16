import express from 'express';
import { createApplication } from './application.js';
import { db } from './db.js';

// Vercel owns listening and routes HTTP and WebSocket upgrades to this server.
// Local startup uses index.ts, and tests import the factory in application.ts.
// Keep the Express import here: Vercel's framework scanner inspects this file.
const app = express();
export const application = await createApplication(db, app);
export default application.httpServer;
