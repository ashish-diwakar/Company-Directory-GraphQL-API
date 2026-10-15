# Company Directory GraphQL API

A TypeScript API using Apollo Server 4, Express 4, Prisma 7, SQLite, JWT authentication, and WebSocket subscriptions. Records persist across restarts.

## Setup

Use Node.js 22.12+ (or 24+) and npm. Run commands from the project root.

```sh
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run codegen
npm run dev
```

Open [Apollo Sandbox](http://localhost:4000). The default database is `prisma/dev.db`; no environment file is required. Copy `.env.example` to `.env` to override `DATABASE_URL` or `PORT`. Relative SQLite URLs resolve from the working directory; use an absolute file URL for deployments.

The canonical HTTP endpoint is `http://localhost:4000/graphql`; `/` remains available for existing clients. Subscriptions use `ws://localhost:4000/graphql` and the `graphql-transport-ws` subprotocol provided by `graphql-ws`.

The seed **deletes all equipment, employees, and teams** before creating 2 teams, 4 employees, and 4 hardware items. It runs in one transaction, in foreign-key-safe order. IDs are generated UUIDs and change on reseeding. Seeding is explicit and never runs at server startup or during deployment.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with reload |
| `npm run db:generate` | Generate Prisma client after schema changes |
| `npm run db:migrate -- --name change_name` | Create and apply a development migration |
| `npm run db:deploy` | Apply committed migrations without creating new ones |
| `npm run db:seed` | Destructively replace data with sample records |
| `npm run auth:token -- ADMIN` | Generate a one-hour demo JWT using your configured secret |
| `npm run codegen` | Regenerate GraphQL resolver types |
| `npm run typecheck` | Check application TypeScript |
| `npm test` | Run all Jest suites sequentially against temporary SQLite databases |
| `npm run test:types` | Typecheck application, seed, and test code |
| `npm run build` | Generate clients/types, compile, and copy GraphQL schema |
| `npm start` | Run the compiled server |

Before starting a deployed build, apply migrations with `npm run db:deploy`. Keep the SQLite file on persistent writable storage and back it up. Do not run the development seed against live data.

## Example operations

```graphql
query Directory {
  employees(role: "Engineer") {
    id
    name
    email
    team { id name members { id name } }
    assignedEquipment { id model assignedTo { id name } }
  }
  teams { id name department members { id name } }
}

mutation CreateEmployee($input: PublicEmployeeInput!) {
  createEmployee(input: $input) {
    id
    name
    team { name }
  }
}

mutation AssignEquipment($employeeId: ID!, $equipmentId: ID!) {
  assignEquipment(employeeId: $employeeId, equipmentId: $equipmentId) {
    id
    assignedTo { id name }
  }
}
```

Example creation variables; replace the team ID with a UUID returned by `teams`:

```json
{
  "input": {
    "name": "Alex Morgan",
    "email": "alex@example.com",
    "role": "Engineer",
    "teamId": "REPLACE_WITH_TEAM_UUID"
  }
}
```

For assignment, use employee and equipment UUIDs returned by the directory query.

## Authentication and roles

Copy `.env.example` to `.env` and set `JWT_SECRET` to a long random secret. Generate a local demonstration token:

```sh
npm run auth:token -- ADMIN
npm run auth:token -- EMPLOYEE
```

HTTP clients send `Authorization: Bearer <token>`. Tokens must use HS256 and contain a nonempty `sub` (or `id`), `email`, and `role` (`ADMIN` or `EMPLOYEE`). Invalid signatures, expired tokens, unsupported algorithms, and malformed claims return `UNAUTHENTICATED`; supplied invalid tokens never fall back to demo access.

Invalid supplied tokens fail HTTP context creation with status 401. Anonymous or employee requests that reach the assignment resolver return GraphQL errors in an HTTP 200 response, with `UNAUTHENTICATED` or `FORBIDDEN` respectively.

`assignEquipment` requires an authenticated `ADMIN`: anonymous callers receive `UNAUTHENTICATED`, and employees receive `FORBIDDEN`. Queries and `createEmployee` retain their existing public access. Subscription access requires either authenticated role. These JWT identities do not require matching employee database records. Token issuance and user login are external to this API; the token command is a local development aid.

For a no-token local demo, explicitly set `AUTH_DEMO_MODE=true`. This supplies a demo administrator for missing tokens and accepts the literal `demo-admin` token. It is disabled by default and ignored in production. Production startup requires `JWT_SECRET`.

## Real-time equipment assignments

Start a subscription in a WebSocket-capable GraphQL client, using `graphql-ws` and connection parameters `{ "authToken": "<token>" }` (a `Bearer ` prefix is also accepted):

```graphql
subscription AssignmentUpdates {
  equipmentAssigned {
    id
    model
    assignedTo { id name assignedEquipment { id model } }
  }
}
```

Run `assignEquipment` with an admin HTTP token in another client. Every successful assignment publishes the committed equipment record to connected subscribers, including repeated assignments. Rejected mutations publish nothing. Invalid or anonymous WebSocket handshakes close with code `4403`. Tokens are verified at connection and again for each new operation; reconnect with a refreshed token after expiry. An already-running subscription is not automatically terminated when its token expires.

PubSub is shared within one process and delivers live events only: it has no replay, durable queue, or cross-process delivery. Use a shared broker for multiple replicas. The current publish happens after the transaction commits; guaranteed delivery across process failures would require an outbox. Subscription loaders are scoped to each operation and cleared for each event so relationship data stays fresh.

## Data and behavior

- Teams have employees; every employee requires a valid team. Team deletion is restricted while members exist.
- Equipment optionally belongs to one employee. Deleting that employee sets the assignment to null. Email and serial number have unique constraints; relation keys and employee role are indexed.
- Role filtering is exact and case-sensitive. Names and roles are trimmed; emails are trimmed and lowercased before creation.
- Missing records return GraphQL `NOT_FOUND`. Blank names/roles, malformed or duplicate emails, and foreign-key violations return `BAD_USER_INPUT`.
- Equipment reassignment is transactional and idempotent. Mutations invalidate affected request caches so later mutation fields see updated relations.
- All relationship fields batch through DataLoader. `Employee.team` batches team IDs; `Employee.assignedEquipment` groups equipment by employee ID, returning an empty list when needed. Reverse fields use batched employee/member loaders.
- Each network request receives new loaders, sharing one global Prisma client. Loader results preserve input key order, and caches never cross requests.

## Testing

```sh
npm test
npm run test:types
```

Jest runs sequentially with ts-jest in ESM mode. Supertest targets the application returned by `createApplication(db)` and starts temporary HTTP listeners; no server on port 4000 is needed. Each integration suite creates its own temporary SQLite database, applies committed migrations, seeds real UUID records, and disposes its servers, subscriptions, and database afterward. The developer database is untouched.

- `tests/auth.test.ts`: HTTP anonymous/employee rejection, invalid and expired JWTs, successful admin assignment, missing records, and event/write assertions.
- `tests/auth-unit.test.ts`: JWT claims, algorithms, role guards, and local-only demo fallback.
- `tests/api.test.ts`: persistence, seeding, batching, cache invalidation, and real WebSocket delivery.

The admin success test requires an error-free response, a persisted assignment, and exactly one matching event. Missing data is a test failure for that case. Jest uses Node's `--experimental-vm-modules` flag as described in its [ESM documentation](https://jestjs.io/docs/ecmascript-modules); Node may print an experimental-feature warning.

## Structure

- `prisma/schema.prisma`, `prisma/migrations/`: relational schema and baseline migration.
- `prisma/seed.ts`: transactional sample-data reset.
- `prisma.config.ts`: migration URL and seed command.
- `src/db.ts`: SQLite adapter and shared Prisma client.
- `src/context.ts`: request factory, database access, and loaders.
- `src/auth.ts`, `src/pubsub.ts`: JWT verification, role guards, and shared assignment events.
- `src/app.ts`, `src/index.ts`: Express/HTTP/WebSocket wiring and shutdown.
- `src/resolvers/`, `src/errors.ts`: Prisma operations, relational fields, and classified errors.
- `src/schema.graphql`, `codegen.ts`: API contract and resolver type generation, mapped to Prisma record types.

Shutdown drains HTTP requests, disposes WebSocket subscriptions, and disconnects Prisma. `NODE_ENV=production` disables Sandbox and introspection; GraphQL errors omit stack traces. Express currently uses permissive CORS; configure allowed origins for your deployment. Apollo Server 4 remains from the existing app; review its support status and dependency audit before public deployment.

The transport follows [Apollo's subscription integration](https://www.apollographql.com/docs/apollo-server/data/subscriptions) and the [graphql-ws recipes](https://the-guild.dev/graphql/ws/guides/recipes). The installed `graphql-subscriptions` version calls its iterator method `asyncIterableIterator` (the current equivalent of `asyncIterator`).

Prisma 7 SQLite setup follows the [official Prisma guide](https://www.prisma.io/docs/v7/prisma-orm/add-to-existing-project/sqlite).

