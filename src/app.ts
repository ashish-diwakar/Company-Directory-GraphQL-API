import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
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
import { securityConfiguration, readCookie, csrfToken, validCsrf } from './browser-security.js';

export async function createApplication(db: PrismaClient = sharedDb) {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured in production.');
  }
  const app = express();
  const security = securityConfiguration();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.headers.origin && !security.origins.has(req.headers.origin)) {
      res.status(403).json({ errors: [{ message: 'This origin is not permitted.', extensions: { code: 'FORBIDDEN' } }] }); return;
    }
    next();
  });
  app.use(cors<cors.CorsRequest>({ origin: (origin, callback) => callback(null, Boolean(origin && security.origins.has(origin))), credentials: true }));
  app.get('/auth/csrf', async (req, res) => {
    try {
      const identity = await resolveIdentity(readCookie(req.headers.cookie, security.cookieName), db);
      res.json({ csrfToken: identity?.sessionId ? csrfToken(identity.sessionId) : null, expiresAt: identity?.expiresAt ?? null });
    } catch (error) {
      if (error instanceof GraphQLError && error.extensions.code === 'UNAUTHENTICATED') {
        res.clearCookie(security.cookieName, security.cookieOptions);
        res.json({ csrfToken: null, expiresAt: null });
      } else { res.status(500).json({ error: 'Unable to initialize session protection.' }); }
    }
  });
  const httpServer = createHttpServer(app);
  const schema = createSchema();
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql', verifyClient: ({ req }: { req: IncomingMessage }) => {
    const origin = req.headers.origin;
    return origin ? security.origins.has(origin) : !readCookie(req.headers.cookie, security.cookieName);
  } });
  const identities = new Map<WebSocket, AuthUser>();
  const expiryTimers = new Map<WebSocket, ReturnType<typeof setTimeout>>();
  const onRevoked = (ids: string[]) => {
    for (const [socket, user] of identities) if (user.sessionId && ids.includes(user.sessionId)) socket.close(4401, 'Session ended');
  };
  sessionEvents.on('revoked', onRevoked);
  type AuthExtra = Extra & Record<PropertyKey, unknown> & { user?: AuthUser | null };
  async function socketIdentity(ctx: { connectionParams?: Record<string, unknown> | undefined; extra: Extra }) {
    const cookie = readCookie(ctx.extra.request.headers.cookie, security.cookieName);
    const identity = requireUser(await resolveIdentity(cookie ?? ctx.connectionParams?.authToken, db));
    if (cookie && (!identity.sessionId || !validCsrf(ctx.connectionParams?.csrfToken, identity.sessionId))) throw new GraphQLError('CSRF validation failed.', { extensions: { code: 'FORBIDDEN' } });
    return identity;
  }
  const cleanup = useServer<Record<string, unknown>, AuthExtra>({
    schema,
    onConnect: async ctx => {
      try {
        ctx.extra.user = await socketIdentity(ctx);
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
      const user = await socketIdentity(ctx);
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
    app.use(['/graphql', '/'], express.json({ limit: '100kb' }), expressMiddleware(server, {
      context: async ({ req, res }) => {
        const cookie = req.headers.authorization ? undefined : readCookie(req.headers.cookie, security.cookieName);
        try {
          const user = await resolveIdentity(req.headers.authorization || cookie, db);
          if (cookie && req.method !== 'GET' && (!user?.sessionId || !validCsrf(req.headers['x-csrf-token'], user.sessionId))) {
            throw new GraphQLError('Session protection validation failed. Refresh and try again.', { extensions: { code: 'FORBIDDEN', http: { status: 403 } } });
          }
          return { ...createContext(db, user), clientAddress: req.socket.remoteAddress ?? 'unknown',
            setBrowserSession: (session: { token: string; expiresAt: string }) => { res.cookie(security.cookieName, session.token, { ...security.cookieOptions, expires: new Date(session.expiresAt) }); },
            clearBrowserSession: () => { res.clearCookie(security.cookieName, security.cookieOptions); },
          };
        }
        catch (error) {
          if (error instanceof GraphQLError && error.extensions.code === 'UNAUTHENTICATED') {
            if (cookie) res.clearCookie(security.cookieName, security.cookieOptions);
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
