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
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=
```

File storage requires the Google Drive API enabled in Google Cloud. Create a service account, put its downloaded key JSON in `GOOGLE_SERVICE_ACCOUNT_JSON`, and share the Drive folder identified by `GOOGLE_DRIVE_ROOT_FOLDER_ID` with the service account's `client_email`. Apply the Supabase migrations in `package/backend/src/supabase/migrations/` in numeric order (`001` through `007`).

If Drive reports `File not found` for an existing folder, the service account may not have access, even when the folder opens in your browser:

1. Verify `GOOGLE_DRIVE_ROOT_FOLDER_ID` identifies the intended folder. A folder ID or full `https://drive.google.com/drive/folders/...` URL is accepted.
2. In Drive, open the folder's **Share** dialog and add the `client_email` from the configured service account JSON as **Editor**. Your browser's Google account is not the backend's service account; do not make the folder public as a workaround.
3. For file uploads with a service account, use a folder in a Google Workspace **Shared Drive** and give the service account **Content manager** access. Service accounts have no personal Drive storage quota; sharing a regular My Drive folder does not provide that quota.
4. Restart the backend if you changed its environment variables, then retry creating the folder or uploading the file.

The file-storage API is project-scoped: `GET /api/file-storage/projects/:projectId/items`, `POST .../:projectId/folders`, `POST .../:projectId/files` (multipart field `file`), `PATCH .../:projectId/files/:fileId` (`folderId`, or `null` for project root), `DELETE .../:projectId/files/:fileId`, and `GET .../:projectId/files/:fileId/download`. Uploads are limited to 50 MiB locally/Docker and 4 MiB on Vercel to stay below its request-body limit. The API follows the backend's existing authentication model; it currently has no per-user authentication or project-membership authorization, so configure access controls before storing private files.

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
