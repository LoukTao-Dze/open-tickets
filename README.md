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

- [Architecture](docs/architecture.md)
- [Backend README](package/backend/README.md)
- [Frontend README](package/frontend/README.md)

### Database setup

For a new, empty Supabase database, run the SQL files in
[`baseline/`](package/backend/src/supabase/migrations/baseline/) in numerical order.
They describe the current schema and include the existing seed data.

For an existing database, do **not** run the baseline as an upgrade. Continue
with only the unapplied files in
[`legacy/`](package/backend/src/supabase/migrations/legacy/) in numerical order.
These original migrations preserve the data conversion and upgrade steps.
Back up the database before upgrading.

The backend `.gitignore` excludes SQL files by default. The Kanban lane
migrations below have explicit exceptions so they are included in Git.

### Kanban lanes

Lanes are shared across all projects. Users with the existing `admin` or `user`
editor role can **Add lane**, or use a lane's **more** button to open its
management modal and rename it, choose its color, or delete it after confirmation.
Cancel, close, or press Escape to dismiss the modal without saving; dismissal
is disabled while a save or deletion is pending. Names contain 1–80 characters; colors are stored
as six-digit hex values in Supabase. New lanes appear at the end of the board.
The ticket form lists the current lanes, including newly created ones.

A lane can only be deleted when it has no cards across **all** projects.
The database blocks deletion even if a card is hidden by a project filter,
inaccessible to the caller, or added concurrently. An empty board can have new
lanes added before creating tickets. Progress continues to count only the
original `done` lane as completed; renaming it does not change this behavior.

Before deploying, run
[`legacy/024_manage_kanban_lanes.sql`](package/backend/src/supabase/migrations/legacy/024_manage_kanban_lanes.sql)
once for an existing database. New databases use
[`baseline/011_manage_kanban_lanes.sql`](package/backend/src/supabase/migrations/baseline/011_manage_kanban_lanes.sql)
after the earlier baseline files. Do not apply both copies to the same database.
The migration preserves cards and lane IDs, seeds existing lane colors/order,
and removes the fixed-ID restriction.

- `GET /api/kanban/board` includes each lane's `color`.
- `POST /api/kanban/columns` creates a lane with `{ name, color }`.
- `PUT /api/kanban/columns/:id` updates its `{ name, color }`.
- `PUT /api/kanban/columns/order` saves the lane order from `{ columnIds }`, which
  must list every current lane exactly once; a stale list returns `409`. It writes
  each lane's existing `position`, so it needs no migration.
- `DELETE /api/kanban/columns/:id` deletes an empty lane; returns `409` if cards remain.
- Lane mutations require a server-side session with the `admin` or `user` role.
- Ticket create/update/move bodies accept dynamic `columnId` values; the database
  still requires the destination lane to exist.

### In-app user guide

Open **Docs** (`/docs`) after signing in to read the detailed Thai user guide.
It renders GitHub-flavored Markdown in a README-style view, offers read-only
source and `.md` downloads, and lets **admin only** edit, preview and publish.
Other roles cannot edit the guide, regardless of their project `Can edit` setting.

The documentation migration creates an RLS-protected
singleton document and seeds the full guide; re-running it preserves published edits.
The backend must use a Supabase **service-role key** (never expose it to the frontend).

Progress logs are scoped to a project, ordered by date,
and writable only by sessions with edit access to that project.

### Test scenes

Complete the database setup above before deploying the suite-aware backend and
frontend. The backend requires a service-role key.
In **Test scenes** (`/scenes`), select a project, then choose a test suite from
the list to view its scenes and status percentages. Use **All suites** to return
to the list. Each project can have multiple suites, and each suite can have
multiple scenes. Users with project edit access can create, edit (name and
description) and delete suites, and add, edit, or delete scenes; view access
remains read-only. Suites are created and edited in a modal.
Suites can reference multiple Kanban cards from the same project. Add or remove
cards when creating or editing a suite, then open a reference from the suite.
Deleting a card or moving it to another project removes its suite references.
Migration 020 combines the references from each suite's scenes without duplicates.
Migration 021 enables moving a suite and its scenes to another project; replace
or remove Kanban references that do not exist in the destination project.
If an unassigned scene has references, assign it to a suite before running the migration;
the migration stops without changing data otherwise.
The suite list shows the description, status percentages, creation date, and the last scene change.
Scene activity before migration 017 is not available, so its date is shown as
not recorded until a scene is added, changed, moved, or deleted.
New scenes require a suite in the same project. Edit a scene's **Test suite**
field to move it. Existing scenes remain in **Scenes awaiting a suite** until
manually assigned; no default suite is created and no scene details are changed.
Only empty suites can be deleted; the API returns `409` if scenes remain,
including scenes added concurrently. Percentages are rounded to whole numbers
and use only scenes in the selected suite (or the awaiting list) as the denominator.

- `GET /api/projects/:projectId/scenes` returns `{ data: { scenes, suites, canEdit } }`.
- `DELETE /api/projects/:projectId/scenes/:sceneId` deletes a scene.
- `POST /api/projects/:projectId/test-suites` creates a suite with `{ name, description?, kanbanTicketIds? }`.
- `PUT /api/projects/:projectId/test-suites/:suiteId` updates a suite with `{ name, description?, kanbanTicketIds? }`;
  omitted optional fields are left unchanged.
- `DELETE /api/projects/:projectId/test-suites/:suiteId` deletes an empty suite.
- Scene create/update bodies now require `suiteId`; status-only updates are unchanged.

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
