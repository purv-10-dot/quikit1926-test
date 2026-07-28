/**
 * The `_id` alias, applied at the single response choke point.
 *
 * The client was written against Mongo and addresses every record by `_id`
 * (~40 call sites build API paths from it). Postgres rows carry `id`, so any
 * service returning a bare Prisma row handed the UI `undefined` and the request
 * went to `/undefined` — a 404 reported as "not found" against a record that
 * plainly existed.
 *
 * That shipped three times (certificate approvals, the tenant→super-admin course
 * workflow, batches) because it kept being fixed per-service while every new
 * query reintroduced it. `json()` is the one path every route returns through,
 * so aliasing there makes it structural rather than a discipline problem.
 */
import { describe, it, expect } from 'vitest';
import { json } from '@/lib/http';

const body = async (r: Response) => r.json();

describe('_id is aliased onto anything carrying an id', () => {
  it('aliases a top-level record', async () => {
    const out = await body(json({ success: true, data: { id: 'c1', name: 'Fire Safety' } }));
    expect(out.data._id).toBe('c1');
    expect(out.data.id).toBe('c1');
  });

  it('aliases every element of a list', async () => {
    const out = await body(json({ data: [{ id: 'a' }, { id: 'b' }] }));
    expect(out.data.map((x: { _id: string }) => x._id)).toEqual(['a', 'b']);
  });

  it('reaches nested relations — the populated-actor shapes the UI reads', async () => {
    const out = await body(
      json({ data: { id: 'course-1', submittedBy: { id: 'u1', firstName: 'Ada' } } }),
    );
    expect(out.data._id).toBe('course-1');
    expect(out.data.submittedBy._id).toBe('u1');
  });

  it('reaches through arrays nested in objects', async () => {
    const out = await body(json({ data: { id: 'b1', students: [{ id: 's1' }, { id: 's2' }] } }));
    expect(out.data.students[1]._id).toBe('s2');
  });
});

describe('it never overwrites or invents', () => {
  it('leaves an explicit _id from a shaping helper alone', async () => {
    const out = await body(json({ data: { _id: 'explicit', id: 'raw' } }));
    expect(out.data._id).toBe('explicit');
  });

  it('ignores records with no id', async () => {
    const out = await body(json({ data: { name: 'no id here' } }));
    expect(out.data._id).toBeUndefined();
  });

  it('ignores a non-string id rather than aliasing a number', async () => {
    // Nothing in this schema uses numeric ids; if one appears it is a count or
    // an index, not an addressable record.
    const out = await body(json({ data: { id: 42 } }));
    expect(out.data._id).toBeUndefined();
  });

  it('leaves Date values serializing normally', async () => {
    const iso = '2026-07-21T10:00:00.000Z';
    const out = await body(json({ data: { id: 'x', createdAt: new Date(iso) } }));
    expect(out.data.createdAt).toBe(iso);
    expect(out.data._id).toBe('x');
  });

  it('does not walk into class instances whose toJSON must run untouched', async () => {
    class Money {
      constructor(private v: number) {}
      // A Decimal-like: id here must NOT be aliased, and toJSON must survive.
      id = 'should-not-alias';
      toJSON() {
        return `${this.v}`;
      }
    }
    const out = await body(json({ data: { id: 'row', amount: new Money(5) } }));
    expect(out.data.amount).toBe('5');
    expect(out.data._id).toBe('row');
  });

  it('survives a cyclic object instead of blowing the stack', async () => {
    const node: Record<string, unknown> = { id: 'n1' };
    node.self = node;
    // NextResponse.json would still reject the cycle, but the alias walk must
    // not be what fails — a stack overflow here would be an opaque 500.
    expect(() => json({ data: node })).toThrow(/circular|converting/i);
  });
});

describe('the shapes that actually broke in production', () => {
  it('a certificate approval row is addressable', async () => {
    const out = await body(
      json({ success: true, data: [{ id: 'cert-1', approvalStatus: 'pending_approval' }] }),
    );
    expect(out.data[0]._id).toBe('cert-1');
  });

  it('a master-course submission row is addressable', async () => {
    const out = await body(json({ success: true, data: [{ id: 'course-1', status: 'PendingApproval' }] }));
    expect(out.data[0]._id).toBe('course-1');
  });

  it('a batch row and its nested teacher are both addressable', async () => {
    const out = await body(
      json({ success: true, data: [{ id: 'b1', teacherId: { id: 't1', firstName: 'Grace' } }] }),
    );
    expect(out.data[0]._id).toBe('b1');
    expect(out.data[0].teacherId._id).toBe('t1');
  });
});
