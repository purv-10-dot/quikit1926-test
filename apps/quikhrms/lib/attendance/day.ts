// Attendance day bucketing.
//
// Attendance is an India-first feature, but Vercel runs in UTC — so bucketing by
// server-local midnight put early-morning (00:00–05:30 IST) punches on the wrong
// day and broke overnight check-outs. We bucket by the IST *calendar date*,
// stored as that date's UTC midnight, so the key is stable and identical across
// every server timezone.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Start of the IST calendar day for `d`, as a UTC-midnight Date (stable key). */
export function attendanceDayStart(d: Date = new Date()): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}
