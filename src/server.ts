import { readFileSync } from 'node:fs';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { gql } from 'graphql-tag';
import type { Context } from './context.js';
import { resolvers } from './resolvers/index.js';

export function createServer() {
  return new ApolloServer<Context>({
    typeDefs: gql(readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8')),
    resolvers,
    csrfPrevention: true,
    introspection: process.env.NODE_ENV !== 'production',
    includeStacktraceInErrorResponses: false,
    plugins: process.env.NODE_ENV === 'production' ? [] : [ApolloServerPluginLandingPageLocalDefault({ embed: true })],
  });
}
