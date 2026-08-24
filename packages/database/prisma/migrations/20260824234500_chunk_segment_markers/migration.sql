-- Chunk-scoped agenda-boundary markers.
--
-- A START marker seen in chunk 3 is meaningless until paired with the END that
-- chunk 5 saw, so markers cannot become MeetingSegmentFact rows at chunk time
-- (that table is one row per segment per meeting). They are parked on the chunk
-- that produced them and reconciled globally during consolidation.
--
-- Parking them on the chunk rather than in a side table also means a COMPLETED
-- chunk carries its markers through a resume, so consolidation after a partial
-- failure never needs a chunk re-extracted just to recover a boundary.
ALTER TABLE "app_quikscale"."MeetingChunk"
  ADD COLUMN IF NOT EXISTS "segmentMarkers" JSONB;
