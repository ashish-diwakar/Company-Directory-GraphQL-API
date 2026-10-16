# Company Directory

An internal company directory and equipment-management POC built with React, Vite, Apollo Client, Express, Apollo Server 4, Prisma 7, and **PostgreSQL**. GraphQL subscriptions provide live equipment updates.

## Database change: SQLite → PostgreSQL

The runtime now requires PostgreSQL. Setting `DATABASE_URL` to a PostgreSQL URL is supported by the schema and `@prisma/adapter-pg` driver. The connection pool allows at most five connections per API process, with a ten-second connection timeout. A database must already exist: an environment variable does not provision one.

- Active schema: `prisma/schema.prisma` (`provider = "postgresql"`).
- Active migrations: `prisma/postgresql/migrations` (new PostgreSQL baseline).
- Historical SQLite migrations: `prisma/migrations`; preserved for reference, never applied to PostgreSQL.
- Existing `prisma/dev.db` is preserved. Its accounts, equipment, sessions, and history are **not automatically transferred**. Pointing at a new database starts an empty workspace; old login credentials will not exist there.
- No hosted database has been provisioned, and no existing database has been reset.

To retain old data, keep a backup of the SQLite file and plan an explicit, validated import preserving IDs, password hashes, links, and audit history. Do not copy SQLite SQL migrations into PostgreSQL or mark them applied. Revoke old sessions during a future data migration. There is no automatic import command in this release.

## Quick start

Use Node.js 22.12+ or 24+. Run commands from the repository root.

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` on a fresh checkout. On an existing checkout, update the existing file; preserve your signing secret. Replace the old `file:` DATABASE_URL.
3. Supply a PostgreSQL database using either option below.

### Option A: local PostgreSQL with Docker

Docker Desktop must be running. Set these values in `.env`, using your own password:

```dotenv
DATABASE_URL="postgresql://directory:change-me@localhost:5432/company_directory"
POSTGRES_PASSWORD="change-me"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=4000
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4000,http://localhost:4000
```

`POSTGRES_PASSWORD` is only used by the local Docker service. Match it in the connection URL; URL-encode special characters in the URL's username/password.

```sh
docker compose up -d --wait
npm run db:generate
npm run db:deploy
```

The database lives in the named Docker volume `directory_postgres`. `docker compose down` stops it without removing that volume. Changing POSTGRES_PASSWORD does not reset the password in an existing volume; use PostgreSQL password-management commands instead. Never delete a volume holding important data.

### Option B: an existing or hosted PostgreSQL database

Create a database with your chosen provider and copy its actual connection URL into your private `.env` or hosting environment:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
# Optional direct endpoint for migration commands, when the runtime URL uses a pooler:
DIRECT_DATABASE_URL="postgresql://USER:PASSWORD@DIRECT_HOST:5432/DATABASE?sslmode=require"
```

Follow the provider's TLS/certificate and pooling instructions. Do not disable certificate verification to bypass connection errors. `DIRECT_DATABASE_URL`, when set, is used only by Prisma CLI migrations; runtime traffic uses DATABASE_URL. Keep both pointed at the same intended database/schema. Never put either credential in a VITE variable, browser code, Git, or chat.

```sh
npm run db:generate
npm run db:deploy
```

The PostgreSQL baseline is for an empty database/schema. Do not apply it to an unrelated populated schema. Run deployment migrations as a controlled deployment step, not on every request or every scaled API startup.

### Start the application

Optional sample data for an empty/demo directory:

```sh
npm run db:seed
```

**Seeding deletes and replaces directory employees, teams, and equipment.** It creates 2 teams, 4 employees, and 4 devices, but does not create login accounts. It preserves accounts, sessions, invitations, and assignment history; deleting employees clears their account links. Do not seed live organizational data.

Run in two terminals:

```sh
npm run dev
npm run dev:frontend
```

- Website: http://127.0.0.1:5173
- GraphQL Explorer: http://localhost:4000/graphql (development only)
- API WebSocket: ws://localhost:4000/graphql, protocol `graphql-transport-ws`

The frontend uses same-origin `/graphql` and `/auth` through Vite's proxy, including WebSocket upgrades. The proxy targets port 4000; update `frontend/vite.config.ts` if changing the backend port. Optional VITE_GRAPHQL_HTTP_URL / VITE_GRAPHQL_WS_URL overrides must preserve compatible cookie/domain routing. Vite's proxy is for development and is not included in the production build.

## What you can do

| Screen | Function |
| --- | --- |
| Directory | Browse employees and teams. Admins assign/reassign equipment; employees see other people's device details as private. Equipment search/pagination covers all stock. |
| My equipment | See devices belonging to the employee explicitly linked to your account; receive private live refresh notifications. |
| Employees — admin | Add/edit/search employees, filter by team, and create teams. Directory job titles do not grant login permissions. |
| Inventory — admin | Add/edit/search devices, filter assignments, return received devices, and inspect assignment history. Serial numbers are normalized and unique. |
| Accounts — admin | Invite colleagues, link/unlink employee records, create-and-link a missing employee, and deactivate/reactivate accounts. Newly created employees appear without reloading the page. |
| My account | Edit your name, change your password, and sign out. Login email is read-only. |

Employee creation and account linking commit together. Duplicate work emails or invalid links leave no partial employee. Directory profile changes do not silently change login email or access roles. Each employee can link to only one account.

**Return** means the device has physically been received back into stock; it clears ownership. Confirmation checks the expected owner and rejects stale requests with CONFLICT. Each actual assignment/reassignment/return writes an audit snapshot in the same transaction; a failed audit write rolls back ownership. Repeated identical operations do not create duplicate history. Historical snapshots survive later metadata changes; there is no API to edit/delete them. A database administrator can still modify the database, so this is not a tamper-proof ledger.

## Accounts and security

The first successful registration becomes ADMIN. Subsequent registrations require a one-use, email-bound invitation and always become EMPLOYEE. The first-admin decision is serialized through a PostgreSQL row lock inside the registration transaction. Complete initial setup privately before exposing a new database publicly.

Invitations expire after seven days. Only hashes of their random secrets are stored; admins must copy/share links privately when created. Lost links must be revoked and replaced. Email delivery, email verification, and forgotten-password recovery are not configured.

Passwords use asynchronous scrypt with individual random salts and must be 12–128 characters. Sign-in returns a generic failure message. Authentication is limited to 30 attempts per client IP per 15 minutes in process memory; forwarded client IP headers are not trusted by default.

Signing in creates an eight-hour database session and a signed HS256 JWT. Every HTTP request, WebSocket operation, and delivered subscription event checks the live session and account access. Roles and employee links come from the database. There are no demo-token bypasses.

- The website uses an **HttpOnly, SameSite=Lax** cookie. JWTs are not stored in localStorage. Old localStorage tokens are removed on startup.
- Cookie POST requests and cookie-authenticated WebSockets require a session-bound CSRF value obtained automatically from `/auth/csrf`.
- HTTP and WebSocket origins are allowlisted. Cookie WebSockets require an Origin. Bearer-only API clients do not require CSRF values.
- Sign-out revokes the current session, clears its cookie, closes its sockets, and resets Apollo state. Tabs share cookie sign-in state and synchronize through a non-secret storage notification. Use separate browser profiles to test different accounts.
- Password changes revoke all account sessions. Deactivation revokes sessions and blocks sign-in; reactivation requires a fresh sign-in. Equipment and employee records remain intact.
- Employee links are explicit. Matching emails never grant device access automatically. Changing a link closes existing sockets; refresh/reconnect to load the new identity.
- Production requires JWT_SECRET and explicit HTTPS ALLOWED_ORIGINS. Cookies become Secure with the `__Host-directory_session` name. Development uses `directory_session` over local HTTP. Responses use no-store, nosniff, and no-referrer headers.

HttpOnly reduces script-based token theft, but injected scripts can still act with a user's permissions. Secure rendering, dependency updates, and deployment hardening remain necessary.

## Testing through API Explorer

For local embedded Apollo Explorer, explicitly add `https://sandbox.embed.apollographql.com` to the development ALLOWED_ORIGINS list and restart the backend. Introspection is enabled only outside production. Keep Explorer's cookie inclusion disabled when testing with bearer tokens.

Run this operation without an old Authorization header, supplying your existing account credentials as variables:

```graphql
mutation SignIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) {
    token
    expiresAt
    user { id name role }
  }
}
```

Copy the returned token into the shared header `Authorization: Bearer YOUR_TOKEN`. Then run:

```graphql
query {
  me { id name email role }
  employees { id name team { name } }
}
```

API WebSocket clients pass `{ "authToken": "YOUR_TOKEN" }` as connection parameters. Tokens expire after eight hours and are secrets. Admin-only APIs return FORBIDDEN for employee accounts. Missing/invalid sessions use UNAUTHENTICATED, missing records NOT_FOUND, invalid input BAD_USER_INPUT, and stale assignment confirmations CONFLICT.

## Automated verification

With no database installed, run:

```sh
npm run db:generate
npm run test:local
```

`test:local` starts a real, temporary PostgreSQL server using the development-only embedded-postgres package, validates `prisma migrate deploy`, runs Jest, then stops/removes that temporary cluster. It does not use your .env database or transfer SQLite data. Native binaries must support your OS/architecture and npm install scripts must be enabled. On Linux, PostgreSQL cannot run as root; run this command as a normal user. No system users are created by the script.

Alternatively, set TEST_DATABASE_URL to a **separate disposable PostgreSQL database** and run `npm test`. Tests create random schemas, apply the committed PostgreSQL migration, and drop only those schemas afterward. The test user needs CREATE SCHEMA privileges. For local Docker, create a separate database once with `docker compose exec postgres createdb -U directory company_directory_test`, then set TEST_DATABASE_URL accordingly. Never use production database credentials for tests. Test setup overrides the shared application's database URL before importing modules.

Coverage includes first-admin concurrency, invitations, authentication/RBAC, cookie/CSRF/origin checks, session revocation, employee/account linking and cache invalidation, foreign keys, persistence, batched relationships, audit rollback, searches, and live events. Jest prints Node's experimental VM-modules warning.

| Command | Purpose |
| --- | --- |
| `npm run db:generate` | Generate the PostgreSQL Prisma client |
| `npm run db:deploy` | Apply committed PostgreSQL migrations |
| `npm run db:migrate -- --name change_name` | Create/apply development migrations; needs shadow-database permissions |
| `npm run db:seed` | Replace sample directory data; destructive |
| `npm run dev` / `npm run dev:frontend` | Start API / website development servers |
| `npm run test:local` | All tests with temporary local PostgreSQL |
| `npm test` | Tests against TEST_DATABASE_URL with isolated schemas |
| `npm run test:types` | Check API, seed, and test TypeScript |
| `npm run build` | Generate Prisma/GraphQL types and compile API |
| `npm run build:frontend` | Typecheck/build React into frontend/dist |
| `npm start` | Run compiled API |

## Deployment and current limitations

### Vercel backend deployment

`src/app.ts` is the deployment entrypoint: it imports Express directly, creates the Express app, and default-exports the initialized Node HTTP server with the WebSocket upgrade handler. The direct import is required by Vercel's Express entrypoint scanner; a wrapper that only imports the factory is not detected. It does not call listen; Vercel owns that lifecycle. `src/application.ts` configures the supplied app (or creates one for local use/tests), while `src/index.ts` retains local listening and graceful shutdown. This addresses both `No entrypoint found which imports express` and `Invalid export found in module ... src/app.js`.

The root `vercel.json` selects the Express backend, runs `npm run build` (including Prisma/codegen), and includes the GraphQL SDL in the function. Import the repository root as a **backend-only** project; this configuration does not deploy the frontend workspace. Remove conflicting dashboard build/output overrides and keep the Express framework selected. Do not set the output directory to frontend/dist for this backend project.

Configure DATABASE_URL with Neon's pooled URL, DIRECT_DATABASE_URL with the direct URL for migrations, a long random JWT_SECRET, and exact HTTPS ALLOWED_ORIGINS in Vercel's environment settings. Local .env values are not uploaded. When only the backend is deployed, its own HTTPS origin can be the initial allowed origin. Add the frontend's exact origin when available. Do not use localhost HTTP origins in production.

Apply `npm run db:deploy` once against the intended database through a controlled migration step, then deploy/redeploy the backend. Do not seed a populated database. Verify POST `https://YOUR_BACKEND/graphql` with JSON `{ "query": "{ __typename }" }` returns `{ "data": { "__typename": "Query" } }`. Production Sandbox and introspection remain disabled. The server export and HTTP/WebSocket behavior are tested locally; verify the actual deployed function and its logs after rollout. Vercel WebSocket availability/lifetime limits and the process-local event limitations below still apply.

Prefer one public HTTPS origin serving the frontend and forwarding `/graphql` (HTTP + WebSocket upgrades) and `/auth` to the API. Set NODE_ENV=production, JWT_SECRET, DATABASE_URL, and exact ALLOWED_ORIGINS with no trailing slash or path. Set DIRECT_DATABASE_URL if migrations need a different endpoint. Keep preview and production databases separate. SameSite=Lax does not support arbitrary cross-site frontend/API deployments.

| Area | Current limitation | Future remedy |
| --- | --- | --- |
| Hosting and live events | PubSub and socket-revocation signals live in one API process, with no replay or guaranteed delivery. A shared database does not share these events across replicas. | Keep one API process for this POC, or add a shared broker/revocation channel and transactional outbox before scaling. |
| PostgreSQL operations | Requires provisioning, TLS, connection limits, backups, and recovery planning. Five connections per process can multiply across replicas. | Configure provider pooling and total connection budgets; automate restricted backups/PITR and test restores. |
| Account setup/recovery | First reachable account becomes admin; invitations are manually shared. No email verification/reset, role delegation, or account deletion. | Private bootstrap/setup key, email provider, expiring hashed reset tokens, and controlled recovery/delegation. |
| Employee/team lifecycle | Creation/editing and linking work. No complete offboarding, employee deletion, or team editing/merging. Deactivation does not return devices. | Explicit offboarding and team lifecycle workflows preserving history. |
| Equipment workflows | Inventory, returns, and assignment history work. No retirement, condition lifecycle, or employee request/approval workflow. | Add these as separately verified milestones. |
| Audit | Assignment snapshots only; no comprehensive security/account audit. Existing pre-history assignments have no reconstruction. | Broader audit events, retention rules, and immutable off-host exports if required. |
| Query cost | Management lists are bounded; directory/accounts and nested GraphQL query cost remain unbounded. Contains searches may need indexing at scale. | Paginate remaining lists, enforce depth/complexity limits, measure PostgreSQL query plans and add appropriate indexes. |
| Auth throttling | In-memory limits reset on restart and are per process. | Shared/persistent rate limits and monitoring; trust only known proxy IP headers. |
| Dependencies and headers | Apollo Server 4 is retained; dependency vulnerabilities and production CSP/monitoring still need remediation. | Upgrade supported dependencies, audit, add deployment checks and structured operational logs. |
| Browser security | Cookie/CSRF/origin checks work; XSS can still perform authenticated actions. | Maintain secure rendering, apply a deployment-specific CSP, and verify HTTPS/cookie behavior. |

The root npm package owns the API; frontend is an npm workspace. `src/db.ts` owns the shared PostgreSQL client, `src/context.ts` creates request-scoped loaders, `src/application.ts` wires transports, `src/app.ts` exports the deployed server, and `src/index.ts` drains local HTTP/WebSockets and disconnects Prisma. Generated clients, build output, database files, and private environment files are ignored.

References: [Prisma PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [Prisma migrations](https://www.prisma.io/docs/orm/prisma-migrate), [PostgreSQL backup](https://www.postgresql.org/docs/current/backup.html).
