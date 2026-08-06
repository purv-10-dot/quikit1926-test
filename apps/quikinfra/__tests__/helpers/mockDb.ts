import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Deep-mocked Prisma client. Every model and method is auto-stubbed; each
// test configures the return values it needs via e.g.
// `(mockDb as any).cnContractor.findMany.mockResolvedValue(...)`.
//
// QuikInfra's `Cn`-prefixed models are accessed through `(db as any).cnXxx`
// in the repositories, so tests cast `mockDb as any` to reach them — the
// mockDeep proxy auto-stubs any property access.
export const mockDb: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

// Every QuikInfra module reaches the Prisma client through ONE specifier —
// `import { db } from "@/lib/db"` (a thin re-export of @quikit/database that
// also eagerly validates env on import). Mocking it keeps both the real
// client and the env-validation side-effect out of tests.
//
// `@quikit/database` is still mocked below because ~60 modules import the
// `Prisma` namespace/enums from it, and loading the real module would
// instantiate a PrismaClient (which demands DATABASE_URL).

vi.mock("@quikit/database", async () => {
  // Re-export the Prisma namespace / enums from @prisma/client directly so
  // `import { Prisma } from "@quikit/database"` works in tests. We import
  // @prisma/client (NOT @quikit/database) to avoid instantiating a real
  // PrismaClient (which would demand DATABASE_URL).
  const prismaClient = await vi.importActual<typeof import("@prisma/client")>(
    "@prisma/client",
  );
  return { ...prismaClient, db: mockDb };
});

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

export function resetMockDb() {
  mockReset(mockDb);
}
