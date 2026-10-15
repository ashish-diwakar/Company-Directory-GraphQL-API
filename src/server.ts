import { readFileSync } from 'node:fs';
import { ApolloServer } from '@apollo/server';
import type { ApolloServerPlugin } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { gql } from 'graphql-tag';
import type { Context } from './context.js';
import { resolvers } from './resolvers/index.js';

export function createSchema() {
  return makeExecutableSchema({
    typeDefs: gql(readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8')),
    resolvers,
  });
}

export function createServer(schema = createSchema(), plugins: ApolloServerPlugin<Context>[] = []) {
  return new ApolloServer<Context>({
    schema,
    csrfPrevention: true,
    introspection: process.env.NODE_ENV !== 'production',
    includeStacktraceInErrorResponses: false,
    plugins: [...plugins, ...(process.env.NODE_ENV === 'production' ? [] : [ApolloServerPluginLandingPageLocalDefault({ embed: true })])],
  });
}
