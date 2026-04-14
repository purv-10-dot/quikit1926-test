import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Deep-mocked Prisma client. Every model and method is auto-stubbed; each
// test configures the return values it needs via e.g.
// `mockDb.membership.findFirst.mockResolvedValue(...)`.
export const mockDb: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

// The codebase has TWO import paths for the Prisma client:
//   - `import { db } from "@quikit/database"` (auth packages, some libs)
//   - `import { db } from "@/lib/db"` (admin internal re-export)
// We must mock both, otherwise code importing via the re-export gets the
// real client. Both mocks point at the same `mockDb` instance so tests have
// a single control surface.
//
// We avoid `vi.importActual("@quikit/database")` because the database package
// instantiates a real PrismaClient at module scope, which fails without
// DATABASE_URL. Instead, we re-export Prisma types from @prisma/client
// directly (which does NOT trigger client construction).

vi.mock("@quikit/database", async () => {
  const prismaClient = await vi.importActual<typeof import("@prisma/client")>(
    "@prisma/client"
  );
  return { ...prismaClient, db: mockDb };
});

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

export function resetMockDb() {
  mockReset(mockDb);
}
