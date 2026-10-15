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
import { authenticate, requireUser } from './auth.js';
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
  type AuthExtra = Extra & Record<PropertyKey, unknown> & { user?: AuthUser | null };
  const cleanup = useServer<Record<string, unknown>, AuthExtra>({
    schema,
    onConnect: ctx => {
      try {
        ctx.extra.user = requireUser(authenticate(ctx.connectionParams?.authToken));
      } catch { return false; }
    },
    context: ctx => {
      // Reverify on each operation, including expiry, rather than trusting a long-lived socket.
      const user = requireUser(authenticate(ctx.connectionParams?.authToken));
      ctx.extra.user = user;
      return createContext(db, user);
    },
  }, wsServer);
  const server = createServer(schema, [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    { async serverWillStart() { return { async drainServer() { await cleanup.dispose(); } }; } },
  ]);
  try {
    await server.start();
    app.use(['/graphql', '/'], cors<cors.CorsRequest>(), express.json(), expressMiddleware(server, {
      context: async ({ req }) => {
        try { return createContext(db, authenticate(req.headers.authorization)); }
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
    await cleanup.dispose();
    throw error;
  }
  return { app, httpServer, wsServer, server };
}
