import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Deep-mocked Prisma client. Every model and method is auto-stubbed; each
// test configures the return values it needs via e.g.
// `mockDb.membership.findFirst.mockResolvedValue(...)`.
export const mockDb: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

// The codebase has TWO import paths for the Prisma client:
//   - `import { db } from "@quikit/database"` (route handlers, some libs)
//   - `import { db } from "@/lib/db"` (quikscale internal re-export)
// We must mock both, otherwise code importing via the re-export gets the
// real client. Both mocks point at the same `mockDb` instance so tests have
// a single control surface.

vi.mock("@quikit/database", async () => {
  // Re-export enums / Prisma namespace directly from @prisma/client so that
  // `import { Role } from "@quikit/database"` works in tests.  We import from
  // @prisma/client (NOT @quikit/database) to avoid triggering
  // PrismaClient instantiation which requires DATABASE_URL.
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
