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

// QuikInfra reaches the Prisma client through TWO specifiers:
//   - `import { db } from "@quikit/database"`  (context.ts, central libs)
//   - `import { db } from "@/lib/db"`          (every masters/* repository —
//                                               a thin re-export that also
//                                               eagerly validates env on import)
// Mock both so neither the real client nor the env-validation side-effect
// loads. Both point at the same `mockDb` instance — one control surface.

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
