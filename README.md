# Company Directory

A React workspace for people, teams, and equipment, backed by Apollo Server 4, Prisma 7, SQLite, and live GraphQL subscriptions. The frontend uses Vite, TypeScript, and Apollo Client.

**POC scope:** one organization running one API instance with a persistent SQLite database. SQLite remains the supported database; the remaining improvements will be delivered one feature at a time for manual verification.

## Latest feature: browser session protection

The website now signs in using an **HttpOnly session cookie**. It no longer requests or stores JWTs in localStorage; old localStorage tokens are removed on startup. Sign in again after this upgrade. Sessions still expire after eight hours, support immediate revocation, and use the existing SQLite session table. No migration or reseeding is required.

Vite proxies `/graphql` (HTTP and WebSockets) and `/auth` to port 4000, so the website uses its own origin for all browser traffic. Cookie-authenticated POST requests require a session-bound CSRF header; WebSockets require both a trusted Origin and a session-bound CSRF connection parameter. The frontend obtains that non-credential value from `/auth/csrf` automatically. HTTP and WebSocket origins are explicitly allowlisted. Sign-out/password changes clear the cookie, close sockets, and reset Apollo state; tabs share cookies and synchronize session changes using a non-secret storage notification.

### Verify this milestone

1. Reload the website at `http://127.0.0.1:5173`, sign in, navigate between Directory/Accounts/My equipment, and reload. Your session should persist.
2. In browser developer tools, check Storage/Application: `localStorage.token` should be absent. The `directory_session` cookie should have HttpOnly, SameSite=Lax, and Path=/ attributes. Local HTTP uses a non-Secure cookie; production HTTPS uses a Secure `__Host-directory_session` cookie.
3. Assign a device as admin while its owner watches My equipment in a separate browser profile. Live updates should continue working through the proxy.
4. Open another tab in the same profile. Sign out in one tab: both should return to sign-in. Reload and confirm the old session cannot restore access. Different accounts require separate browser profiles.
5. Automated security tests also verify missing/wrong CSRF rejection, untrusted HTTP/WebSocket origins, cookie replay after logout, and production cookie configuration. Run `npm test -- tests/browser-security.test.ts`.

Deployment requires HTTPS and an explicit comma-separated `ALLOWED_ORIGINS` list of exact HTTPS origins (no paths or trailing slash). Prefer one public origin with a reverse proxy forwarding `/graphql` including WebSocket upgrades and `/auth` to the API. Cross-site cookie deployments are not supported by the current SameSite=Lax policy. The local Vite proxy targets backend port 4000; update its target if changing the backend port.

## Verified feature: employee management and account onboarding

Administrators now have an **Employees** screen to add/edit employees, search by name/work email/job title, filter by team, and browse paginated results. Employee job titles are directory labels, not login permission roles. Edits preserve the employee ID, account link, assigned equipment, and historical audit snapshots. Changing a directory work email or name does not change the linked login email/profile.

For a new account with no suitable employee record, open **Accounts → Create employee**. The form starts with the account name/email; choose a job title and team, then **Create and link employee**. Both operations commit together. Duplicate work emails, accounts that are already linked/inactive, missing teams, or failed links leave no stray employee record. If an employee with that email already exists, use **Link employee** instead of creating a duplicate.

The employee form includes **Add a team** so a fresh workspace can onboard without seeded teams. Team editing/merging/deletion, employee offboarding/deletion, and role delegation remain separate future work. No automatic email-based employee linking has been introduced.

### Verify this milestone

1. As admin, open **Employees → Add employee**. Fill name, work email, job title, and team; save and find the new person in Directory and the assignment dropdown.
2. If no appropriate team exists, choose **Add a team**, enter its name/department, and save it. The new team should be selected automatically in the employee form.
3. Open **Accounts** for an active, unlinked account. Choose **Create employee**, complete the prefilled form, and save. Verify its employee link appears immediately. Refresh that account's workspace to enable My equipment.
4. In Employees, edit a linked employee's name, job title, or team. Verify the linked account and equipment assignments remain intact, while Directory reflects the changes. Login email and ADMIN/EMPLOYEE permissions must not change.
5. Try an existing work email or invalid/blank fields. Expect a clear error and no partial employee/link changes. Creating for an account that is already linked or inactive is rejected.
6. Sign in as an employee account. Employees management navigation should be absent, and directly opening `#employees` should deny access. Create/edit/manage APIs are admin-only too.

No SQLite schema migration or seed reset is required for this milestone. New APIs are `employeeManagement`, `updateEmployee`, `createEmployeeForAccount`, and basic `createTeam`; the existing `createEmployee` API uses the same validation. Employee changes invalidate cached directory choices, and Accounts loads fresh employee choices when opened, so newly created employees appear without a page refresh.

## Verified feature: invitations and account deactivation

After the first administrator registers, public registration closes. Admins now create invitations in **Accounts → Invite a colleague**. Each invitation is bound to one normalized email address, expires after seven days, and can be used once. Only a SHA-256 hash of its random secret is stored. The administrator sees the link only when creating it; share it privately with the intended colleague. Email sending is not configured.

The link opens the registration form with the invitation/email filled in. Invited users always become employees and still need an explicit employee-record link for personal equipment access. Expired, revoked, reused, missing, or wrong-email invitations are rejected. Losing a link requires revoking the pending invitation and creating a new one; existing links cannot be retrieved. Invitation status/history is admin-only and paginated.

Admins can **Deactivate** or **Reactivate** employee accounts in Accounts. Deactivation ends every session, closes live sockets, and blocks sign-in; employee records, links, equipment assignments, and audit history are preserved. Return company devices separately if appropriate. Reactivation permits a fresh sign-in with the existing password but does not restore revoked sessions. Self-deactivation and removing the last active administrator are blocked. The UI keeps the bootstrap admin protected; no role-promotion workflow has been added.

### Verify this milestone

1. As admin, open **Accounts**, enter a new colleague email, and create an invitation. Copy the link while it is shown.
2. Open the link in a separate browser profile/incognito window. Verify the email/code are filled, complete registration, and confirm the account has employee access.
3. Reopen the same link, or try another email with its code. Registration should fail. Opening registration without an invitation should fail after setup, too.
4. Create another invitation and revoke it. Its link must stop working. After revocation, you can create a replacement for that email. The list also shows Accepted/Expired states.
5. Deactivate the invited employee account. Its live connections should close, its next API request should be rejected, and sign-in should fail. Directory/equipment/history records must remain unchanged.
6. Reactivate it and sign in again. The old token must remain invalid. Link the account to an employee as usual if it needs personal equipment access.

The SQLite migration has been applied here. Existing accounts remain active, and existing passwords/sessions are preserved until deactivated or otherwise revoked. Other checkouts should run `npm run db:deploy` and `npm run db:generate`. No seed reset is required. Initial administrator setup should still take place privately: the first account is trusted to initialize the workspace.

## Verified feature: device returns and assignment history

Administrators can now return a received device to unassigned stock from **Inventory → Return**. The confirmation shows the device/serial and current owner, accepts optional notes (up to 500 characters), and checks that the owner has not changed since the screen was opened. If another admin has reassigned the device, the API returns `CONFLICT` instead of clearing the newer assignment. Returning an already-unassigned device is a harmless no-op.

Every actual assignment, reassignment, or return now creates a history entry **in the same SQLite transaction** as the ownership change. A failed history write rolls back the ownership change. Entries snapshot the device model/serial, acting admin's name/email/ID, prior/new employee names/IDs, action, timestamp, and optional return notes. Repeating an assignment to the same owner or returning an already-returned device creates no duplicate history or event.

Choose a device's **History** button or **All assignment history** to view the paginated admin-only audit trail. There is no API to edit/delete entries. Snapshots survive later profile/device edits and directory reseeding; they intentionally do not depend on live employee/equipment foreign keys. This is an application-level append-only assignment log, not a tamper-proof ledger against someone who controls the SQLite file. Inventory metadata edits, login activity, and account-link changes are not yet audited.

Returns publish an admin-only detailed return event and a private boolean list-change notification to the former owner. The former owner's **My equipment** list refreshes and removes the device. Admin directory live alerts distinguish assignments from returns. Other employees cannot read history or receive return details.

### Verify this milestone

1. As admin, assign an unassigned device to an employee. Open **Inventory → History** for that device: expect **ASSIGNED**, your name/email, timestamp, and the new owner.
2. Reassign it to another employee. History should show **REASSIGNED** with both names. Repeating the same assignment should not add another row.
3. Choose **Return**, verify the serial and owner, and add a note such as `Charger received; good condition.` Confirm only once the device is physically received.
4. Verify the device is **Unassigned**, disappears from its former owner's personal list, and history has **RETURNED** with the note and admin identity. Use a separate browser profile to watch the owner's page update live.
5. Assign the returned device again. It should be selectable in the directory and gain a new **ASSIGNED** entry; earlier rows must remain unchanged.
6. For the stale-confirmation check, open a return form in one admin window, reassign that device in another, then submit the old form. Expect a clear conflict message. Cancel/refresh before trying again.
7. As an employee, verify Inventory/history actions are unavailable and direct history/return API requests return `FORBIDDEN`.

The new history table migration has already been applied here. Other checkouts should run `npm run db:deploy` and `npm run db:generate`. Existing assignments are not retroactively reconstructed; the log starts when this milestone is installed. No seed reset is required. History persists after `db:seed`, so sample-data reseeding is not a history-erasure mechanism.

## Verified feature: employee links and personal equipment

An administrator can now open **Accounts**, choose **Link employee** (or **Change link**), and select an employee record. Each employee can be linked to only one account. Links are explicit: matching email addresses never grant access automatically, and linking does not change the account's role or move equipment. Both admin and employee accounts can have links.

Every signed-in account has a **My equipment** page. Linked users see only devices assigned to their linked employee; unlinked users see guidance to contact an admin. Employees still browse basic people/team information, but other employees' equipment lists are empty in the API and displayed as private in the UI. Nested team/member queries follow the same rule. Admins retain full directory and inventory visibility.

Assignment events are now filtered server-side: admins receive all assignment details, while employees receive only events for their linked employee. A separate `myEquipmentChanged` subscription sends only a boolean notification to the affected prior/new owners, allowing their lists to refresh after reassignment without exposing the new owner or another person's device details. Assigned-device metadata edits also refresh the current owner's list.

Changing/removing a link immediately closes that account's active WebSockets. Its sessions remain valid, and every new request reads the latest link from SQLite. Refresh/reconnect the account holder's workspace afterward. The filter rechecks the live session and link on every event.

### Verify this milestone

1. Sign in as admin. Open **Accounts** and link an employee account to a directory employee, for example Asha Patel.
2. Use a separate browser profile/incognito window for that employee account. Tabs in the same profile share session cookies and therefore share sign-in state.
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

Inventory, personal equipment, returns/history, invitations/deactivation, and employee management have been verified. Browser session protection is the current milestone; retirement remains future work.

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

`PORT` controls the backend port. The website defaults to same-origin `/graphql` and `/auth` through Vite's proxy. Optional `VITE_GRAPHQL_HTTP_URL` and `VITE_GRAPHQL_WS_URL` overrides must preserve a compatible cookie deployment and trusted origins; restart Vite after changes. Vite environment values are public. Never put a signing secret in them. `ALLOWED_ORIGINS` defaults to localhost/127.0.0.1 on ports 5173 and 4000 in development; production requires an explicit HTTPS list.

## Accounts and access

Choose **Create an account** for initial setup. The first successfully registered account becomes `ADMIN`; registration then requires a valid invitation for that email and creates `EMPLOYEE` accounts. The first-user decision and invitation consumption happen inside a transaction after acquiring SQLite's writer lock. Clients cannot request roles. Directory seed records are not login accounts and do not affect setup. `registrationOpen` reports only whether initial setup is still available.

Passwords must contain 12–128 characters and are stored as asynchronously derived scrypt hashes with individual cryptographically random salts. Email addresses are trimmed, lowercased, and unique. Sign-in uses one generic failure message for incorrect passwords and unknown emails. Registration and sign-in share an in-process limit of 30 attempts per client IP per 15 minutes. Deploy a shared limiter if running multiple API processes. The app does not trust forwarded client IP headers by default.

Signing in or registering creates an eight-hour database session and a signed HS256 JWT containing its identifier. Each HTTP request and WebSocket operation validates the signature, expiry, live session, and current account role in SQLite. Old manually generated demo tokens and bypass flags are no longer accepted by the network API.

- **Directory:** authenticated accounts can browse basic people/team details. Employees see only their linked employee's equipment; admins see all equipment.
- **My equipment:** personal devices and owner-scoped live list updates, based on an explicit account/employee link.
- **Assignment / employee creation:** admin-only mutations enforced by the server.
- **Inventory:** administrators can list/search all devices, filter by assignment status, and add/edit device metadata.
- **Employees:** administrators can create/edit/search employees, select/create teams, and create-and-link employee records from Accounts. No employee deletion is performed.
- **Returns/history:** administrators can return received equipment and review the append-only assignment audit trail. Employees receive only personal list-change notifications.
- **Accounts:** administrators can view registered users/roles and link or unlink employee records; the UI does not expose role escalation or account deletion.
- **Invitations/account status:** administrators create/revoke invitations and deactivate/reactivate employee accounts. Inactive accounts cannot sign in or use existing sessions. Reactivation requires a fresh sign-in.
- **My account:** edit your name or change your password. Email is a read-only sign-in identifier.
- **Sign out:** revokes the current server session and closes its active WebSockets; the server clears the browser cookie and the frontend clears Apollo state.
- **Change password:** verifies the current password and revokes every session for that account, requiring a new sign-in on every device.
- **Session expiry:** the frontend returns to sign-in; the backend rejects expired requests and closes expired WebSockets.

Passwords and session identifiers are never exposed in the public user type. Tokens are returned only when creating a session. Login accounts remain separate from employee directory entries, with optional admin-managed one-to-one links. Email verification and email-based password recovery are not configured; the account-help screen explains this instead of simulating an email workflow. Keep the first administrator's credentials safe.

The frontend restores the HttpOnly cookie session using `me` and `sessionExpiresAt`. Sign-in/out recreates the WebSocket transport and Apollo client so cached data and subscription identities cannot cross sessions. Only a non-secret session-change notification is stored in localStorage. HttpOnly reduces token theft by scripts but does not prevent injected scripts from making authorized requests; secure rendering, dependency maintenance, and deployment hardening remain necessary.

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

API clients can request `token` in the sign-in result, use `Authorization: Bearer <session token>` for HTTP, and pass `{ "authToken": "<session token>" }` in WebSocket connection parameters. The website instead uses cookies, credentials-included requests, an `X-CSRF-Token` header, and `{ "csrfToken": "..." }` for WebSockets. Bearer-only clients do not require CSRF tokens; supplied origins must still be trusted. Cookie WebSockets without an Origin are rejected. Development introspection is enabled, but the embedded Apollo Sandbox's external origin is not in the default allowlist; use a local API client or explicitly allow its origin for local development only. Invalid sessions produce `UNAUTHENTICATED`; invalid CSRF/origins produce `FORBIDDEN`. Missing records use `NOT_FOUND`; invalid input uses `BAD_USER_INPUT`.

Equipment choices come from the admin-only paginated `equipmentInventory` query. `createEquipment` and `updateEquipment` accept `EquipmentInput` (`type`, `model`, `serialNumber`). `returnEquipment` requires `equipmentId` and `expectedEmployeeId`, and accepts optional `notes`. `equipmentHistory(equipmentId, offset, limit)` returns all/device-specific paginated history. `equipmentReturned` is the detailed admin-only return subscription; owners receive private `myEquipmentChanged` notifications. Inventory/assignment/return mutations refresh active inventory and history queries. Metadata edits do not publish assignment events; use Refresh in another admin browser to see edits. Ownership events publish after their transaction commits and invalidate affected loader caches. Every relationship batches through a request/operation-scoped DataLoader; subscription caches clear for each event.

PubSub and session-close notifications are process-local, without replay or guaranteed delivery across process crashes. Use a shared broker/session-revocation channel for multiple replicas, and an outbox if guaranteed assignment-event delivery is required.

## Current limitations and future improvements

This is a working internal POC, not yet ready for unrestricted public use. The table distinguishes implemented behavior from future work; those future changes have not been silently enabled.

| Area | Current limitation | How to address it later |
| --- | --- | --- |
| Registration | Invitation-only after initial setup. The first reachable account is still trusted to become admin. Invitations are shared manually rather than emailed. | Perform bootstrap privately; integrate email delivery/verification or an explicit deployment setup key if the bootstrap endpoint must be reachable publicly. |
| Browser sessions | HttpOnly cookies, session-bound CSRF checks, and session revocation work. SameSite=Lax assumes a same-site deployment; XSS can still act with the user's permissions. | Prefer one HTTPS public origin with a reverse proxy; maintain secure rendering and consider a deployment-specific CSP. Review CSRF/cookie policy before supporting cross-site hosting. |
| Origins and transport | HTTP/WebSocket origins are allowlisted. Local development uses HTTP/WS; production requires explicit HTTPS origins and Secure cookies. | Terminate HTTPS/WSS at the deployment boundary, configure exact trusted origins, and test proxy WebSocket upgrades. |
| Data visibility | Equipment is owner/admin-only and events are filtered. Invited active accounts can read basic names, business emails, roles, and teams workspace-wide. | Add finer directory-field or team-specific permissions if organizational requirements demand them. |
| Employee/team management | Employee creation/editing/search and account-onboarding screens now work, with basic team creation. Employee offboarding/deactivation/deletion, team editing/merging, and comprehensive organization management are not implemented. | Add an offboarding workflow that handles account access and device return explicitly, and team lifecycle management while preserving history. |
| Equipment lifecycle/audit | Add/edit/search, assignment/reassignment, returns, and assignment history work. Retirement, structured condition tracking, and general account/security auditing remain absent. Existing pre-milestone assignments have no historical reconstruction. | Add retirement/condition workflows and broader audit events. Define retention/access rules and off-host immutable audit export if stronger tamper resistance is needed. |
| Employee requests | Employees cannot request devices or track approvals. | Add equipment requests, admin approvals, and status notifications after account/employee linking. |
| Account administration | Invitations, linking, deactivation/reactivation, and session revocation work. There is no role-promotion, account deletion, or account-recovery workflow. Deactivation does not return equipment automatically. | Add controlled recovery, role delegation with last-admin protection, and an explicit offboarding checklist if required. |
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
2. **Employee/account linking and personal equipment visibility — implemented and verified.**
3. **Assignment returns and assignment audit history — implemented and verified.**
4. **Invitation-based access and account deactivation — implemented and verified.**
5. **Employee creation/editing and account onboarding — implemented and verified.** (Prioritized to unblock new-account linking.)
6. **Browser cookie sessions and trusted origins — implemented, ready for verification.** Remaining dependency/deployment hardening is separate work.
7. Employee offboarding/team lifecycle and equipment request/approval workflows.

The order can be adjusted after each verification. SQLite stays in place throughout these milestones. Before broad exposure, verify this session milestone and address private administrator bootstrap, dependency maintenance, and deployment hardening.

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

Before a deployed start, apply migrations and configure persistent writable SQLite storage. Shutdown drains HTTP/WebSockets and disconnects Prisma. `NODE_ENV=production` requires `JWT_SECRET` and explicit HTTPS `ALLOWED_ORIGINS`, enables Secure cookies, disables Sandbox/introspection, and omits error stack traces. API responses use no-store, nosniff, and no-referrer headers. Apollo Server 4 is retained from the original project; review support status and dependency audit before deployment.

References: [Prisma SQLite](https://www.prisma.io/docs/v7/prisma-orm/add-to-existing-project/sqlite), [Apollo subscriptions](https://www.apollographql.com/docs/apollo-server/data/subscriptions), [Node crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
