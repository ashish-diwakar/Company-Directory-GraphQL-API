import { ApolloClient, ApolloLink, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

export const HTTP_URL = import.meta.env.VITE_GRAPHQL_HTTP_URL ?? 'http://localhost:4000/graphql';
export const WS_URL = import.meta.env.VITE_GRAPHQL_WS_URL ?? 'ws://localhost:4000/graphql';
export const readToken = () => localStorage.getItem('token') ?? '';
const httpLink = createHttpLink({ uri: HTTP_URL });
const authLink = new SetContextLink(previous => {
  const token = readToken();
  return { headers: { ...previous.headers, authorization: token ? `Bearer ${token}` : '' } };
});
// A new transport is created on sign-in/out, so active sockets cannot retain an old identity.
function createTransport() {
  return createClient({ url: WS_URL, lazy: true, retryAttempts: 3,
    connectionParams: () => ({ authToken: readToken() }),
  });
}
let transport = createTransport();
const wsLink = new ApolloLink(operation => new GraphQLWsLink(transport).request(operation));
function createApolloClient() { return new ApolloClient({
  cache: new InMemoryCache(),
  link: split(operation => {
    const definition = getMainDefinition(operation.query);
    return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
  }, wsLink, authLink.concat(httpLink)),
}); }
export let client = createApolloClient();
export async function changeToken(token: string) {
  const cleaned = token.trim().replace(/^Bearer\s+/i, '');
  if (cleaned) localStorage.setItem('token', cleaned); else localStorage.removeItem('token');
  await transport.dispose();
  transport = createTransport();
  await client.clearStore();
  client.stop();
  client = createApolloClient();
  window.dispatchEvent(new Event('apollo-session-changed'));
}
if (import.meta.hot) import.meta.hot.dispose(() => { void transport.dispose(); });
