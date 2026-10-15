import { ApolloClient, ApolloLink, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

export const HTTP_URL = new URL(import.meta.env.VITE_GRAPHQL_HTTP_URL ?? '/graphql', location.origin).href;
const defaultWs = new URL('/graphql', location.origin); defaultWs.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
export const WS_URL = import.meta.env.VITE_GRAPHQL_WS_URL ? new URL(import.meta.env.VITE_GRAPHQL_WS_URL, defaultWs).href : defaultWs.href;
const csrfUrl = new URL('./auth/csrf', HTTP_URL).href;
// Remove pre-cookie-migration credentials; the browser never reads the session cookie.
try { localStorage.removeItem('token'); } catch { /* Storage is not required for sign-in. */ }
let protection: Promise<{ csrfToken: string | null }> | undefined;
async function getCsrfToken() {
  protection ??= fetch(csrfUrl, { credentials: 'include', cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('Unable to initialize session protection.');
    return response.json() as Promise<{ csrfToken: string | null }>;
  }).catch(error => { protection = undefined; throw error; });
  return (await protection).csrfToken;
}
const httpLink = createHttpLink({ uri: HTTP_URL, credentials: 'include' });
const authLink = new SetContextLink(async previous => {
  const csrf = await getCsrfToken();
  return { headers: { ...previous.headers, 'Apollo-Require-Preflight': 'true', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } };
});
function createTransport() {
  return createClient({ url: WS_URL, lazy: true, retryAttempts: 3,
    connectionParams: async () => ({ csrfToken: await getCsrfToken() }),
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
export async function refreshSession(broadcast = true) {
  protection = undefined;
  await transport.dispose();
  transport = createTransport();
  await client.clearStore(); client.stop();
  client = createApolloClient();
  window.dispatchEvent(new Event('apollo-session-changed'));
  if (broadcast) {
    try { localStorage.setItem('session-version', crypto.randomUUID()); } catch { /* Optional cross-tab signal, never a credential. */ }
  }
}
if (import.meta.hot) import.meta.hot.dispose(() => { void transport.dispose(); });
