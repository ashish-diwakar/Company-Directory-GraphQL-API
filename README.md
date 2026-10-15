# Company Directory

A React workspace for people, teams, and equipment, backed by Apollo Server 4, Prisma 7, SQLite, and live GraphQL subscriptions. The frontend uses Vite, TypeScript, and Apollo Client.

**POC scope:** one organization running one API instance with a persistent SQLite database. SQLite remains the supported database; the remaining improvements will be delivered one feature at a time for manual verification.

## Latest feature: employee links and personal equipment

An administrator can now open **Accounts**, choose **Link employee** (or **Change link**), and select an employee record. Each employee can be linked to only one account. Links are explicit: matching email addresses never grant access automatically, and linking does not change the account's role or move equipment. Both admin and employee accounts can have links.

Every signed-in account has a **My equipment** page. Linked users see only devices assigned to their linked employee; unlinked users see guidance to contact an admin. Employees still browse basic people/team information, but other employees' equipment lists are empty in the API and displayed as private in the UI. Nested team/member queries follow the same rule. Admins retain full directory and inventory visibility.

Assignment events are now filtered server-side: admins receive all assignment details, while employees receive only events for their linked employee. A separate `myEquipmentChanged` subscription sends only a boolean notification to the affected prior/new owners, allowing their lists to refresh after reassignment without exposing the new owner or another person's device details. Assigned-device metadata edits also refresh the current owner's list.

Changing/removing a link immediately closes that account's active WebSockets. Its sessions remain valid, and every new request reads the latest link from SQLite. Refresh/reconnect the account holder's workspace afterward. The filter rechecks the live session and link on every event.

### Verify this milestone

1. Sign in as admin. Open **Accounts** and link an employee account to a directory employee, for example Asha Patel.
2. Use a separate browser profile/incognito window for that employee account. Tabs in the same profile share localStorage and therefore share sign-in state.
3. Refresh after linking. Open **My equipment** and verify it shows only that employee's devices. In **Directory**, other employees' cards should say their equipment details are private.
4. In the admin window, assign an unassigned device to the linked employee. The employee's My equipment list should update automatically.
5. Reassign that device to a different employee. The first employee's list should update and remove it; their notification must not expose the new owner's name or device details.
6. Try linking a second account to the same employee. The UI disables already-linked choices, and the API rejects a duplicate link. A non-admin cannot perform linking or view the account list.
7. Remove the link using **No employee (unlink)**. Refresh the employee's workspace: My equipment should show the unlinked-account message, and directory equipment must remain private. Equipment ownership and account role should be unchanged.

The SQLite migration adds an optional unique account/employee foreign key and preserves accounts/directory records. It has already been applied in this workspace; other checkouts should run `npm run db:deploy` and `npm run db:generate`. Existing accounts start unlinked. Do not reseed to install this feature: reseeding deletes/recreates directory employees and will clear their links.

## Verified feature: equipment inventory

Administrators now have an **Inventory** screen to list all devices, including unassigned stock, search by type/model/serial number, filter by assignment status, and add or edit device details. Results are paginated (20 per screen; the API allows at most 100 per request). Newly created devices are unassigned. Editing details preserves the current owner. Serial numbers are unique, trimmed, and normalized to uppercase; type, model, and serial number each allow 1–100 characters.

The Directory's assignment form now searches the full inventory and offers unassigned devices directly, with paginated choices. UUID copying is no longer needed. All inventory queries and mutations require an administrator on the backend. No database migration or seed reset is needed for this feature.

### Verify this feature

1. Sign in as the first registered administrator and open **Inventory**.
2. Choose **Add device**. Enter type `Laptop`, model `POC Workstation`, and a unique serial such as `POC-005`. Save and verify it appears as **Unassigned**.
3. Search for its serial, then choose **Unassigned** in the status filter. The device should remain visible.
4. Try adding another device with the same serial (including lowercase or surrounding spaces). Expect a clear duplicate-serial error. Blank fields and values over 100 characters are rejected.
5. Open **Directory**, select an employee, search for `POC-005`, and assign the new device. Verify it appears under that employee and produces a live alert.
6. Return to **Inventory** and filter **Assigned**. Edit the device's model, save, and verify its owner is unchanged. Reload to confirm persistence.
7. Sign in with an employee account. The Inventory navigation should be absent; opening `#inventory` directly should show an access-denied message. Backend inventory requests must return `FORBIDDEN` too.

The inventory milestone has been verified. Returns, retirement, assignment history, invitations, and session-cookie changes remain separate future milestones.

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

- **Directory:** authenticated accounts can browse basic people/team details. Employees see only their linked employee's equipment; admins see all equipment.
- **My equipment:** personal devices and owner-scoped live list updates, based on an explicit account/employee link.
- **Assignment / employee creation:** admin-only mutations enforced by the server.
- **Inventory:** administrators can list/search all devices, filter by assignment status, and add/edit device metadata.
- **Accounts:** administrators can view registered users/roles and link or unlink employee records; the UI does not expose role escalation or account deletion.
- **My account:** edit your name or change your password. Email is a read-only sign-in identifier.
- **Sign out:** revokes the current server session and closes its active WebSockets; the frontend clears the token and Apollo cache.
- **Change password:** verifies the current password and revokes every session for that account, requiring a new sign-in on every device.
- **Session expiry:** the frontend returns to sign-in; the backend rejects expired requests and closes expired WebSockets.

Passwords and session identifiers are never exposed in the public user type. Tokens are returned only when creating a session. Login accounts remain separate from employee directory entries, with optional admin-managed one-to-one links. Email verification and email-based password recovery are not configured; the account-help screen explains this instead of simulating an email workflow. Keep the first administrator's credentials safe.

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

Equipment choices come from the admin-only paginated `equipmentInventory` query. `createEquipment` and `updateEquipment` accept `EquipmentInput` (`type`, `model`, `serialNumber`). Inventory changes and assignment mutations refresh active inventory queries. Metadata edits do not publish assignment events; use Refresh in another browser to see edits. Reassignment publishes after its transaction commits, refreshes the frontend directory, and invalidates affected loader caches. Every relationship batches through a request/operation-scoped DataLoader; subscription caches clear for each event.

PubSub and session-close notifications are process-local, without replay or guaranteed delivery across process crashes. Use a shared broker/session-revocation channel for multiple replicas, and an outbox if guaranteed assignment-event delivery is required.

## Current limitations and future improvements

This is a working internal POC, not yet ready for unrestricted public use. The table distinguishes implemented behavior from future work; those future changes have not been silently enabled.

| Area | Current limitation | How to address it later |
| --- | --- | --- |
| Registration | Anyone who can reach registration may create an employee account. The first successful registration receives admin access. | Complete initial setup privately, then implement admin invitations or approval and close public registration. |
| Browser sessions | JWTs are in localStorage, accessible to scripts on this origin. Sessions are revocable, but XSS could steal a live token. | Move browser authentication to HttpOnly cookies, with Secure/SameSite attributes, CSRF validation, and authenticated WebSocket setup. |
| Origins and transport | Development CORS is permissive; WebSocket origins are not allowlisted. Local development uses HTTP/WS. | Configure explicit trusted origins for HTTP and WebSockets and terminate HTTPS/WSS at the deployment boundary. |
| Data visibility | Equipment is now owner/admin-only and events are filtered. Basic names, business emails, roles, and teams remain workspace-wide; public registration still grants access to those basic fields. | Close registration through invitations/approval; add finer directory-field or team-specific permissions if organizational requirements demand them. |
| Employee/team management | Employee creation exists as an admin API; there is no complete onboarding/edit/deactivation UI. | Add employee/team management screens and soft deactivation while preserving historical references. |
| Equipment lifecycle | Add, edit, search, assignment, and reassignment work. Return, retirement, condition tracking, and audit history are not implemented. | Add explicit return/retirement actions and an append-only audit trail recording actor, time, and prior/new owner. |
| Employee requests | Employees cannot request devices or track approvals. | Add equipment requests, admin approvals, and status notifications after account/employee linking. |
| Account administration | Admins can list accounts but cannot invite, deactivate, or perform account recovery. | Add invitations, deactivation with session revocation, and controlled recovery; protect the last active administrator. |
| Password recovery | No email verification or forgotten-password email flow. | Integrate an email provider and hashed, expiring, single-use verification/reset tokens; do not email passwords. |
| Pagination/query cost | Inventory is bounded; directory/accounts lists and nested GraphQL query depth are not bounded. | Add pagination to remaining lists and query depth/complexity/request limits. |
| Authentication throttling | Limits are in API-process memory and reset on restart; clients behind one address share the limit. | Add persistent/shared throttling and monitoring when deployment warrants it; only trust proxy IP headers from known proxies. |
| SQLite | One file on one host, one writer at a time; no automatic replication or high availability. | Keep a single API instance and persistent local storage, use short transactions and tested backups. Add WAL/busy-timeout tuning after measuring contention. Consider PostgreSQL only if future scale/availability requirements justify changing databases. |
| Live events | PubSub and session-close signals are local to one process; events are not replayed and publishing is separate from the database commit. | Use an outbox for durable event delivery and a shared broker/revocation channel if multiple instances become necessary. |
| Deployment/security maintenance | Apollo Server 4 is retained; dependency findings, headers, operational monitoring, and production hardening still require review. | Upgrade to a supported Apollo version, address dependency vulnerabilities, add security headers/structured logs and deployment checks. |

### SQLite storage and backups

Keep `DATABASE_URL` pointed at a writable **persistent local disk**, not ephemeral container storage or a shared network drive. Do not commit or publish the database: it contains account hashes and active sessions. For the current POC, stop the backend cleanly before copying the SQLite file to a restricted backup location, then restart it. Test recovery using a separate file/environment before trusting a backup; never overwrite a running database. If WAL is enabled later, use a SQLite-aware backup/checkpoint procedure rather than copying only the main file while writes continue. Automate encrypted backups and recovery checks before storing important organizational data.

### Planned milestones

1. **Equipment inventory — implemented and verified.**
2. **Employee/account linking and personal equipment visibility — implemented, ready for verification.**
3. Assignment return/history and audit logging.
4. Invitation-based access and account deactivation.
5. Browser cookie sessions, trusted origins, and remaining security hardening.
6. Employee/team management and equipment request/approval workflows.

The order can be adjusted after each verification. SQLite stays in place throughout these milestones. Do not expose the POC broadly while the registration, origin, and browser-session limitations above remain.

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
