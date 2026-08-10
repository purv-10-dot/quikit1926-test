import { describe, expect, it, vi } from "vitest";
import {
  createPrismaCursorIterator,
  type PrismaListDelegate,
} from "@/lib/services/reports/prisma-cursor";

type Row = { id: string; n: number };

function makeDelegate(rows: Row[]): PrismaListDelegate<Row> {
  return {
    findMany: vi.fn(async (args) => {
      const { take, cursor, skip } = args;
      const startIdx = cursor ? rows.findIndex((r) => r.id === cursor.id) + (skip ?? 0) : 0;
      return rows.slice(startIdx, startIdx + (take ?? rows.length));
    }),
  };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const r of iter) out.push(r);
  return out;
}

describe("createPrismaCursorIterator", () => {
  it("yields all rows when total count is below pageSize", async () => {
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, n: i }));
    const delegate = makeDelegate(rows);
    const iter = createPrismaCursorIterator<Row>({
      delegate,
      where: {},
      pageSize: 100,
    });
    const collected = await collect(iter);
    expect(collected.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    expect(delegate.findMany).toHaveBeenCalledTimes(1);
  });

  it("pages with cursor when total count exceeds pageSize", async () => {
    const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({ id: `r${i.toString().padStart(2, "0")}`, n: i }));
    const delegate = makeDelegate(rows);
    const iter = createPrismaCursorIterator<Row>({
      delegate,
      where: {},
      pageSize: 10,
    });
    const collected = await collect(iter);
    expect(collected).toHaveLength(25);
    // 25 / 10 → 3 batches (10, 10, 5). Last batch shorter than pageSize so
    // the loop exits without an extra "is there more?" call.
    expect(delegate.findMany).toHaveBeenCalledTimes(3);
  });

  it("skips 1 after cursor to avoid yielding the cursor row twice", async () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, n: i }));
    const delegate = makeDelegate(rows);
    const iter = createPrismaCursorIterator<Row>({
      delegate,
      where: {},
      pageSize: 5,
    });
    await collect(iter);
    const calls = (delegate.findMany as ReturnType<typeof vi.fn>).mock.calls;
    // Call 1: no cursor. Call 2+: skip:1.
    expect(calls[0][0].cursor).toBeUndefined();
    expect(calls[1][0].cursor).toEqual({ id: "r4" });
    expect(calls[1][0].skip).toBe(1);
  });

  it("forwards the where + select args verbatim", async () => {
    const delegate = makeDelegate([]);
    const where = { tenantId: "t1", deletedAt: null };
    const select = { id: true, name: true };
    const iter = createPrismaCursorIterator<Row>({
      delegate,
      where,
      select,
    });
    await collect(iter);
    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, select, orderBy: { id: "asc" } }),
    );
  });
});
