# Company Directory

A React workspace for people, teams, and equipment, backed by Apollo Server 4, Prisma 7, SQLite, and live GraphQL subscriptions. The frontend uses Vite, TypeScript, and Apollo Client.

## Start locally

Use Node.js 22.12+ or 24+ and run commands from the project root:

```sh
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
```

Copy `.env.example` to `.env`. Set `JWT_SECRET` to a long, random secret; keep this server-side. The default SQLite database is `prisma/dev.db`. Relative database paths resolve from the working directory. The seed **replaces directory data** with 2 teams, 4 employees, and 4 hardware items, in one transaction. It does not create or delete login accounts, sessions, or the registration lock. Do not seed live directory data.

Run the servers in separate terminals:

```sh
npm run dev
npm run dev:frontend
```

- Website: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- GraphQL / Apollo Sandbox: [http://localhost:4000/graphql](http://localhost:4000/graphql)
- WebSocket: `ws://localhost:4000/graphql`, protocol `graphql-transport-ws`

`PORT` controls the backend port. Copy `frontend/.env.example` to `frontend/.env.local` to override `VITE_GRAPHQL_HTTP_URL` and `VITE_GRAPHQL_WS_URL`; restart Vite after changes. Vite environment values are public. Never put a signing secret in them.

## Accounts and access

Choose **Create an account** on the website. The first successfully registered account becomes `ADMIN`; every later account becomes `EMPLOYEE`. This decision is made inside a database transaction after acquiring SQLite's writer lock using a singleton registration row. Clients cannot request roles. Directory seed records are not login accounts and do not affect the first-user decision.

Passwords must contain 12–128 characters and are stored as asynchronously derived scrypt hashes with individual cryptographically random salts. Email addresses are trimmed, lowercased, and unique. Sign-in uses one generic failure message for incorrect passwords and unknown emails. Registration and sign-in share an in-process limit of 30 attempts per client IP per 15 minutes. Deploy a shared limiter if running multiple API processes. The app does not trust forwarded client IP headers by default.

Signing in or registering creates an eight-hour database session and a signed HS256 JWT containing its identifier. Each HTTP request and WebSocket operation validates the signature, expiry, live session, and current account role in SQLite. Old manually generated demo tokens and bypass flags are no longer accepted by the network API.

- **Directory:** authenticated accounts can browse people and teams and receive live assignment updates.
- **Assignment / employee creation:** admin-only mutations enforced by the server.
- **Accounts:** administrators can view registered users and their roles; the UI does not expose role escalation or account deletion.
- **My account:** edit your name or change your password. Email is a read-only sign-in identifier.
- **Sign out:** revokes the current server session and closes its active WebSockets; the frontend clears the token and Apollo cache.
- **Change password:** verifies the current password and revokes every session for that account, requiring a new sign-in on every device.
- **Session expiry:** the frontend returns to sign-in; the backend rejects expired requests and closes expired WebSockets.

Passwords, tokens, and session identifiers are never exposed in the public user type. Login accounts remain separate from employee directory entries. Email verification and email-based password recovery are not configured; the account-help screen explains this instead of simulating an email workflow. Keep the first administrator's credentials safe.

The frontend stores its JWT under `localStorage.token` and restores the session using `me`. Sign-in/out recreates the WebSocket transport and Apollo client so cached data and subscription identities cannot cross sessions. Tabs synchronize local token changes. Use HTTPS/WSS when deployed and review the localStorage/XSS tradeoff for your environment; this project does not implement an HttpOnly cookie session flow.

## API examples

```graphql
mutation Register($input: RegisterInput!) {
  register(input: $input) {
    token
    expiresAt
    user { id name email role }
  }
}

mutation SignIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) {
    token
    user { id name email role }
  }
}

query CurrentAccount { me { id name email role } }

query Directory {
  employees {
    id name email role
    team { id name department }
    assignedEquipment { id model serialNumber }
  }
}

mutation Assign($employeeId: ID!, $equipmentId: ID!) {
  assignEquipment(employeeId: $employeeId, equipmentId: $equipmentId) {
    id model assignedTo { id name }
  }
}

subscription AssignmentAlerts {
  equipmentAssigned { id model assignedTo { id name } }
}

mutation SignOut { signOut }
```

HTTP requests use `Authorization: Bearer <session token>`. WebSocket clients pass `{ "authToken": "<session token>" }` in connection parameters. The website manages this automatically. Sandbox introspection is public in development, but directory data requires a session. Invalid supplied tokens fail context creation with HTTP 401 and `UNAUTHENTICATED`. Resolver access failures return GraphQL `UNAUTHENTICATED` or `FORBIDDEN`; missing records use `NOT_FOUND`; invalid input uses `BAD_USER_INPUT`.

Equipment choices come from assigned equipment returned by the directory. The admin form also accepts an equipment UUID because the API has no all-equipment query. Reassignment publishes after its transaction commits, refreshes the frontend directory, and invalidates affected loader caches. Every relationship batches through a request/operation-scoped DataLoader; subscription caches clear for each event.

PubSub and session-close notifications are process-local, without replay or guaranteed delivery across process crashes. Use a shared broker/session-revocation channel for multiple replicas, and an outbox if guaranteed assignment-event delivery is required.

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` | Backend with reload |
| `npm run dev:frontend` | Vite website |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate -- --name change_name` | Create/apply a development migration |
| `npm run db:deploy` | Apply committed migrations |
| `npm run db:seed` | Destructively reset directory sample data |
| `npm run codegen` | Generate GraphQL resolver types |
| `npm run typecheck` | Check backend TypeScript |
| `npm run test:types` | Check backend, seed, and test types |
| `npm test` | Run Jest suites sequentially |
| `npm run build` | Generate clients/types and compile backend |
| `npm run build:frontend` | Typecheck and build frontend into `frontend/dist` |
| `npm start` | Run compiled backend |

Tests use temporary SQLite databases, apply committed migrations, and clean up their servers/sessions/files. They do not register accounts in the developer database. Coverage includes simultaneous first-admin registration, invalid credentials, duplicate emails, role escalation attempts, profile updates, password changes, session revocation, WebSocket closure, RBAC, persistence, batching, browser GET handling, and live assignment delivery. Jest's ESM runtime prints Node's experimental VM-modules warning.

The root npm package owns the API and `frontend/` is an npm workspace. `src/accounts.ts` owns credentials/sessions; `src/auth.ts` validates JWTs and resolves database identities; `src/app.ts` wires HTTP/WebSockets; `src/index.ts` manages startup and shutdown. `frontend/src/components/` contains the themed screens. Migrations are additive; generated Prisma code, local database files, `.env` secrets, and build output are ignored.

Before a deployed start, apply migrations and configure persistent writable SQLite storage. Shutdown drains HTTP/WebSockets and disconnects Prisma. `NODE_ENV=production` requires `JWT_SECRET`, disables Sandbox/introspection, and omits error stack traces. Express currently uses permissive CORS; configure deployment-specific origins. Apollo Server 4 is retained from the original project; review support status and dependency audit before deployment.

References: [Prisma SQLite](https://www.prisma.io/docs/v7/prisma-orm/add-to-existing-project/sqlite), [Apollo subscriptions](https://www.apollographql.com/docs/apollo-server/data/subscriptions), [Node crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
