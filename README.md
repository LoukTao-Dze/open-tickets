# Open Ticket

Open Ticket is a support/ticketing platform that bridges **Discord** conversations with a **Kanban-style ticket board** and a collaborative **workspace board** (sticky notes, code snippets, links, images, etc.), synced in real time over WebSockets.

## Monorepo structure

This project is an npm workspaces monorepo with two apps:

```
package/
  backend/    NestJS API — Discord bot integration, WebSocket gateway, message persistence
  frontend/   Angular app — dashboard, kanban board, collaborative workspace
```

| Package  | Stack                          | Dev port |
| -------- | ------------------------------ | -------- |
| backend  | NestJS, discord.js, Socket.IO  | 3000     |
| frontend | Angular, Angular Material, CDK | 4200     |

## Prerequisites

- Node.js (LTS) and npm
- A Discord bot token (for the backend to connect to Discord)
- A Supabase project (URL + key) for data storage

## Setup

Install dependencies for all workspaces from the repo root:

```bash
npm install
```

Create an environment file for the backend:

```bash
cp package/backend/.env.example package/backend/.env
```

Then fill in the required values in `package/backend/.env`:

```
PORT=3000
DISCORD_TOKEN=
SUPABASE_URL=
SUPABASE_KEY=
```

> Never commit `.env` files or real secrets — they are already excluded via `.gitignore`.

## Running locally

Run both apps concurrently from the root:

```bash
npm start
```

Or run each app individually:

```bash
npm run start:backend    # NestJS API on http://localhost:3000
npm run start:frontend   # Angular dev server on http://localhost:4200
```

## Build & test

```bash
npm run build   # builds backend and frontend
npm test        # runs backend and frontend test suites
```

## Running with Docker

```bash
docker compose up --build
```

This builds and starts:

- `backend` on [http://localhost:3000](http://localhost:3000)
- `frontend` on [http://localhost:4200](http://localhost:4200)

## Project docs

- [Backend README](package/backend/README.md)
- [Frontend README](package/frontend/README.md)

### In-app user guide

Open **Docs** (`/docs`) after signing in to read the detailed Thai user guide.
It renders GitHub-flavored Markdown in a README-style view, offers read-only
source and `.md` downloads, and lets **admin only** edit, preview and publish.
Other roles cannot edit the guide, regardless of their project `Can edit` setting.

Before using this page, run
[`012_create_documentation.sql`](package/backend/src/supabase/migrations/012_create_documentation.sql)
in the Supabase SQL editor after existing migrations. It creates an RLS-protected
singleton document and seeds the full guide; re-running it preserves published edits.
The backend must use a Supabase **service-role key** (never expose it to the frontend).

For project status counts and persistent daily notes, also run
[`013_create_project_progress_logs.sql`](package/backend/src/supabase/migrations/013_create_project_progress_logs.sql)
in the Supabase SQL editor. Progress logs are scoped to a project, ordered by date,
and writable only by sessions with edit access to that project.

- `GET /api/docs`: requires a valid server-side session.
- `PUT /api/docs`: requires an admin server-side session; body is
  `{ "content": "<Markdown>", "updatedAt": "<timestamp from GET>" }`.
- Empty/whitespace content and content over 100,000 characters are rejected.
- Docs JSON requests are limited to 1 MiB; other routes retain Nest's default
  100 KiB JSON body limit.
- Stale updates return `409` instead of overwriting another admin's changes.
  Download the draft, cancel editing, reload and merge it with the latest guide.
- Failed saves preserve the draft; leaving with unsaved changes requires confirmation.
- Saving updates Supabase, not Git. Downloads are local `.md` snapshots;
  there is no autosave or revision history.

The current token login accepts signed JWTs with `auth_provider: "bypass"` and
copies the verified `role` claim into the server-side session. An admin token
must be issued by trusted administration; editing an unsigned token or sending
a role in the Docs request body does not grant access. This feature adds no
token-issuing or role-promotion endpoint.
