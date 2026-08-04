-- Rename Work_order_lines."uomId" -> "uomCode".
--
-- The column never held a CnUOM id. Both write paths resolved
-- `it.uomCode ?? it.uomId`, so rows store the UOM *code* — real data shows
-- 'cum.', 'sqm.', 'DAY', 'BAG', plus empty strings on labour lines.
--
-- Because the column was NAMED uomId, readers reasonably treated it as a
-- foreign key and joined `CnUOM.id IN (...)`. That lookup can never match a
-- code, so the UOM cell came out blank. It happened twice, independently:
-- the Work Order preview PDF and the Work Order Excel export. Renaming the
-- column removes the trap rather than papering over each consumer.
--
-- This is a pure rename: PostgreSQL rewrites only the catalog entry, so every
-- value is preserved and the operation is instant. It is NOT a normalisation —
-- values stay as-is, mixed case and trailing dots included ('cum.' vs 'CUM').
-- Converting codes to real ids remains a separate, larger task (writers +
-- readers + backfill must land together or the UI regresses to showing cuids).
--
-- Readers keep matching on code OR id, so a stray id-bearing legacy row still
-- resolves after this rename.
--
-- Deliberately hand-written: `prisma migrate` cannot distinguish a rename from
-- a drop-and-add, and the generated DROP COLUMN + ADD COLUMN would silently
-- discard every UOM value.

ALTER TABLE app_quikinfra."Work_order_lines"
  RENAME COLUMN "uomId" TO "uomCode";
