# CRM document folders — migration

## Schema

Adds `CrmDocumentFolder` and optional `CrmDocument.folderId` in `app_quikcrm`.

## Apply migration (required — fixes `folderId does not exist`)

Prisma schema was updated but your **Postgres database** still needs the column.  
Do **not** use `prisma db push --accept-data-loss` on a shared dev DB (it can drop unrelated tables).

### Recommended: CRM-only SQL

1. Stop quikcrm dev server (`Ctrl+C`).
2. Run this file in pgAdmin / DBeaver / `psql` against `quikit_dev`:

   `scripts/apply-crm-document-folders.sql`

3. Regenerate client (dev server stopped):

```bash
npm run db:generate
```

4. Restart: `npm run dev:quikcrm`

### Alternative: Prisma migrate (if your DB is baselined)

Copy `DATABASE_URL` + `DATABASE_URL_DIRECT` into `packages/database/.env`, then:

```bash
npm run db:migrate:crm-document-folders
npm run db:generate
```

Migration: `packages/database/prisma/migrations/20260525130000_crm_document_folders/migration.sql`

## Backward compatibility

- Existing `CrmDocument` rows keep `folderId = null` (shown under **All files** / uncategorized).
- Existing S3 keys under `crm-documents/{refId}/...` remain valid; new uploads use `crm-documents/{folderId}/...` when a folder is selected, otherwise `{refId}`.
- Entity attachment APIs unchanged; optional `folderId` query/body added.
- Global `GET /api/documents` still works; folder UI uses `GET /api/document-folders`.

## Architecture

- **Folders**: self-referential `parentFolderId`, scoped by `tenantId` + optional `refType`/`refId`.
- **Breadcrumbs**: walk `parentFolderId` chain to root.
- **Move validation**: cannot move a folder into itself or any descendant (`move-folder.ts`).
- **Delete**: empty folder only, or `DELETE ?recursive=true` for subtree soft-delete.

## APIs

| Method | Path |
|--------|------|
| GET/POST | `/api/document-folders` |
| GET/PATCH/DELETE | `/api/document-folders/:id` |
| POST | `/api/document-folders/:id/move` |
| POST | `/api/document-folders/:id/files` |
| POST | `/api/documents/:id/move` |

Query `tree=1` on list returns lazy tree children. Without `tree`, returns folder contents (subfolders + files + breadcrumbs).

### Global `/documents` aggregate mode

Add `aggregate=1` with no `refType`/`refId`:

- `GET ?aggregate=1&tree=1&parentId=` — virtual module roots (`v:module:lead`, …)
- `GET ?aggregate=1&tree=1&parentId=v:module:lead` — entity nodes for that module
- `GET ?aggregate=1&tree=1&parentId=v:entity:lead:{id}` — real folders at entity root
- `GET ?aggregate=1&location=module:lead` — entity list in main panel
- `GET ?aggregate=1&location=entity:lead:{id}` — folders + files for that record

Entity detail panels do **not** pass `aggregate=1` (scoped tree unchanged).

## Document links (attach without re-upload)

Requires table `app_quikcrm.CrmDocumentLink`. Prisma model lives in the monorepo schema:

`packages/database/prisma/schema.prisma`

### Apply migration (fixes `CrmDocumentLink does not exist`)

**Always run Prisma from the repo root with `--schema=packages/database/prisma/schema.prisma`** (or use the npm scripts below). Running `npx prisma` inside `apps/quikcrm` will fail with “Could not find Prisma Schema”.

1. Stop quikcrm dev server.
2. Optional — clear stale generated client (Windows):

   ```powershell
   Remove-Item -Recurse -Force node_modules\.prisma -ErrorAction SilentlyContinue
   ```

3. Copy `DATABASE_URL` and `DATABASE_URL_DIRECT` into `packages/database/.env` (same values as quikcrm `.env`).

4. Apply pending migrations:

   ```bash
   npm run db:migrate:crm-document-links
   ```

   Migration file: `packages/database/prisma/migrations/20260525140000_crm_document_links/migration.sql`

   **Alternative (non-baselined DB, P3005):** apply SQL without migrate history:

   ```bash
   npm run db:sql:crm-document-links
   ```

   Or run `scripts/apply-crm-document-links.sql` in pgAdmin/psql.

5. Regenerate client:

   ```bash
   npm run db:generate
   ```

6. Restart: `npm run dev:quikcrm`

### Monorepo Prisma commands (reference)

| Command | Purpose |
|---------|---------|
| `npm run db:generate` | Generate client (`--schema=packages/database/prisma/schema.prisma`) |
| `npm run db:generate:clean` | Delete `node_modules/.prisma` then generate |
| `npm run db:migrate` | `migrate dev` (interactive, all pending) |
| `npm run db:migrate:crm-document-links` | `migrate deploy` (applies links migration) |

APIs:

- `GET /api/document-picker` — browse/search tenant files (returns 200 even if links table missing; exclusion by link is skipped until migrated)
- `POST /api/document-links` — attach existing file to folder (503 until table exists)
- `DELETE /api/document-links/:id` — remove link only
- `DELETE /api/documents/:id` — soft-delete source file
