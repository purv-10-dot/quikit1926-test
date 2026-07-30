import { describe, it, expect } from 'vitest';

import { toList } from '@/lib/list-response';

/**
 * THE BUG this pins. `(tenant-admin)/school-courses` unwrapped three list
 * responses in one `Promise.all` with one `catch`, reading batches as
 * `batchesRes.data.data`. `GET /api/batches` returns a BARE ARRAY, so
 * `batchesRes.data` was `undefined` and `.data` on it threw. The throw aborted the
 * loader after the courses had been set but before learners and batches were, so
 * the Assign Course modal showed "0 learners / 0 batches" for a school tenant that
 * had a learner and could see the very course it was assigning.
 *
 * The bare-array case is the one that used to throw. Everything else here is the
 * envelope zoo `toList` exists to flatten.
 */
describe('toList', () => {
  it('accepts a bare array — the shape that used to throw', () => {
    const batches = [{ _id: 'b1' }, { _id: 'b2' }];
    expect(toList(batches)).toEqual(batches);
  });

  it('unwraps the standard { success, data } envelope', () => {
    const users = [{ id: 'u1', role: 'LEARNER' }];
    expect(toList({ success: true, data: users })).toEqual(users);
  });

  it('unwraps a doubly-wrapped { data: { data } } payload', () => {
    const rows = [{ id: 'x' }];
    expect(toList({ data: { data: rows } })).toEqual(rows);
  });

  it.each([null, undefined, {}, { data: null }, { data: {} }, 'nope', 0])(
    'returns [] for %p rather than throwing',
    (input) => {
      expect(toList(input)).toEqual([]);
    },
  );

  it('does not confuse an empty array with a missing one', () => {
    // Both are [], but neither may throw — an empty list is a legitimate answer
    // and must not be mistaken for a failure that needs a fallback.
    expect(toList([])).toEqual([]);
    expect(toList({ success: true, data: [] })).toEqual([]);
  });
});
