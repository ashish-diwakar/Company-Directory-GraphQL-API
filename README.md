# Company Directory GraphQL API

A TypeScript API using Apollo Server, Prisma 7, SQLite, and request-scoped DataLoaders. Records persist across restarts.

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

The seed **deletes all equipment, employees, and teams** before creating 2 teams, 4 employees, and 4 hardware items. It runs in one transaction, in foreign-key-safe order. IDs are generated UUIDs and change on reseeding. Seeding is explicit and never runs at server startup or during deployment.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with reload |
| `npm run db:generate` | Generate Prisma client after schema changes |
| `npm run db:migrate -- --name change_name` | Create and apply a development migration |
| `npm run db:deploy` | Apply committed migrations without creating new ones |
| `npm run db:seed` | Destructively replace data with sample records |
| `npm run codegen` | Regenerate GraphQL resolver types |
| `npm run typecheck` | Check application TypeScript |
| `npm test` | Integration tests in an isolated temporary SQLite database |
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

## Data and behavior

- Teams have employees; every employee requires a valid team. Team deletion is restricted while members exist.
- Equipment optionally belongs to one employee. Deleting that employee sets the assignment to null. Email and serial number have unique constraints; relation keys and employee role are indexed.
- Role filtering is exact and case-sensitive. Names and roles are trimmed; emails are trimmed and lowercased before creation.
- Missing records return GraphQL `NOT_FOUND`. Blank names/roles, malformed or duplicate emails, and foreign-key violations return `BAD_USER_INPUT`.
- Equipment reassignment is transactional and idempotent. Mutations invalidate affected request caches so later mutation fields see updated relations.
- All relationship fields batch through DataLoader. `Employee.team` batches team IDs; `Employee.assignedEquipment` groups equipment by employee ID, returning an empty list when needed. Reverse fields use batched employee/member loaders.
- Each network request receives new loaders, sharing one global Prisma client. Loader results preserve input key order, and caches never cross requests.

## Structure

- `prisma/schema.prisma`, `prisma/migrations/`: relational schema and baseline migration.
- `prisma/seed.ts`: transactional sample-data reset.
- `prisma.config.ts`: migration URL and seed command.
- `src/db.ts`: SQLite adapter and shared Prisma client.
- `src/context.ts`: request factory, database access, and loaders.
- `src/resolvers/`, `src/errors.ts`: Prisma operations, relational fields, and classified errors.
- `src/schema.graphql`, `codegen.ts`: API contract and resolver type generation, mapped to Prisma record types.
- `tests/api.test.ts`: migration, seed, persistence, relationship, validation, batching, and cache tests.

The server disconnects Prisma on shutdown. `NODE_ENV=production` disables Sandbox and introspection; GraphQL errors omit stack traces. Authentication and authorization are not implemented. Configure deployment-specific CORS through an HTTP framework integration. Apollo Server 4 remains from the existing app; review its support status and dependency audit before public deployment.

Prisma 7 SQLite setup follows the [official Prisma guide](https://www.prisma.io/docs/v7/prisma-orm/add-to-existing-project/sqlite).

