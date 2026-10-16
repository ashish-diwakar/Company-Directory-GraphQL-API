import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Server } from 'node:http';
import { once } from 'node:events';
import request from 'supertest';
import { WebSocket } from 'ws';

describe('Production deployment entrypoint', () => {
  const saved = { env: process.env.NODE_ENV, origins: process.env.ALLOWED_ORIGINS, secret: process.env.JWT_SECRET };
  let entry: typeof import('../src/app.js');
  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://workspace.example.com';
    process.env.JWT_SECRET = 'entrypoint-test-only-secret';
    entry = await import('../src/app.js');
  });
  afterAll(async () => {
    await entry?.application.server.stop();
    for (const [key, value] of Object.entries({ NODE_ENV: saved.env, ALLOWED_ORIGINS: saved.origins, JWT_SECRET: saved.secret })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  it('exports an initialized HTTP server without binding a local port', () => {
    expect(entry.default).toBeInstanceOf(Server);
    expect(entry.default.listening).toBe(false);
    expect(entry.default.listeners('upgrade').length).toBeGreaterThan(0);
  });
  it('serves GraphQL in production and keeps introspection disabled', async () => {
    const response = await request(entry.default).post('/graphql').send({ query: '{ __typename }' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { __typename: 'Query' } });
    const introspection = await request(entry.default).post('/graphql').send({ query: '{ __schema { queryType { name } } }' });
    expect(introspection.body.errors?.[0]?.extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
  });
  it('routes WebSocket upgrades to the authentication guard', async () => {
    await new Promise<void>(resolve => entry.default.listen(0, '127.0.0.1', resolve));
    const address = entry.default.address();
    if (!address || typeof address === 'string') throw new Error('Missing test listener');
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/graphql`, 'graphql-transport-ws', { origin: 'https://workspace.example.com' });
    try {
      await once(socket, 'open');
      const closed = once(socket, 'close');
      socket.send(JSON.stringify({ type: 'connection_init' }));
      expect((await closed)[0]).toBe(4403);
    } finally { socket.terminate(); }
  });
});
