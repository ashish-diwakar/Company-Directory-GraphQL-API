import { createServer as createHttpServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { GraphQLError } from 'graphql';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import type { Extra } from 'graphql-ws/use/ws';
import { createSchema, createServer } from './server.js';
import { createContext } from './context.js';
import { resolveIdentity, requireUser } from './auth.js';
import { sessionEvents } from './accounts.js';
import type { WebSocket } from 'ws';
import type { AuthUser } from './auth.js';
import { db as sharedDb } from './db.js';
import type { PrismaClient } from './generated/prisma/client.js';

export async function createApplication(db: PrismaClient = sharedDb) {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured in production.');
  }
  const app = express();
  const httpServer = createHttpServer(app);
  const schema = createSchema();
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const identities = new Map<WebSocket, AuthUser>();
  const expiryTimers = new Map<WebSocket, ReturnType<typeof setTimeout>>();
  const onRevoked = (ids: string[]) => {
    for (const [socket, user] of identities) if (user.sessionId && ids.includes(user.sessionId)) socket.close(4401, 'Session ended');
  };
  sessionEvents.on('revoked', onRevoked);
  type AuthExtra = Extra & Record<PropertyKey, unknown> & { user?: AuthUser | null };
  const cleanup = useServer<Record<string, unknown>, AuthExtra>({
    schema,
    onConnect: async ctx => {
      try {
        ctx.extra.user = requireUser(await resolveIdentity(ctx.connectionParams?.authToken, db));
        identities.set(ctx.extra.socket, ctx.extra.user);
        if (ctx.extra.user.expiresAt) expiryTimers.set(ctx.extra.socket,
          setTimeout(() => ctx.extra.socket.close(4401, 'Session expired'), Math.max(0, ctx.extra.user.expiresAt - Date.now())));
      } catch { return false; }
    },
    onClose: ctx => {
      identities.delete(ctx.extra.socket);
      clearTimeout(expiryTimers.get(ctx.extra.socket));
      expiryTimers.delete(ctx.extra.socket);
    },
    context: async ctx => {
      // Reverify on each operation, including expiry, rather than trusting a long-lived socket.
      const user = requireUser(await resolveIdentity(ctx.connectionParams?.authToken, db));
      ctx.extra.user = user;
      return createContext(db, user);
    },
  }, wsServer);
  const server = createServer(schema, [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    { async serverWillStart() { return { async drainServer() { sessionEvents.off('revoked', onRevoked); await cleanup.dispose(); } }; } },
  ]);
  try {
    await server.start();
    app.use(['/graphql', '/'], cors<cors.CorsRequest>(), express.json(), expressMiddleware(server, {
      context: async ({ req }) => {
        try { return { ...createContext(db, await resolveIdentity(req.headers.authorization, db)), clientAddress: req.socket.remoteAddress ?? 'unknown' }; }
        catch (error) {
          if (error instanceof GraphQLError && error.extensions.code === 'UNAUTHENTICATED') {
            throw new GraphQLError(error.message, {
              extensions: { ...error.extensions, http: { status: 401 } },
            });
          }
          throw error;
        }
      },
    }));
  } catch (error) {
    sessionEvents.off('revoked', onRevoked);
    await cleanup.dispose();
    throw error;
  }
  return { app, httpServer, wsServer, server };
}
