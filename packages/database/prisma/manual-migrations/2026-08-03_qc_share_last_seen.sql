-- QcUserPresence.shareLastSeen — mutual last-seen visibility (WhatsApp-style).
--
-- Additive only: one column, NOT NULL with a default, so existing rows adopt
-- `true` (default-on) with no backfill step. Nothing dropped, renamed, indexed
-- or constrained.
--
-- Applied by hand rather than via `prisma migrate` because `app_quikchat` has NO
-- tracked migration history at all (the schema is created by `prisma db push` —
-- see the comment above `model QcUserPresence`). Running `prisma migrate dev`
-- here would try to diff the entire untracked schema, not just this column.
--
-- Dev:  npm run db:push -w @quikit/database
-- Prod: psql "$DATABASE_URL" -f this file   (idempotent, safe to re-run)

ALTER TABLE app_quikchat."QcUserPresence"
  ADD COLUMN IF NOT EXISTS "shareLastSeen" BOOLEAN NOT NULL DEFAULT true;
