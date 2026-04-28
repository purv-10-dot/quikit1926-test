/**
 * Deep-mocked Prisma client for QuikVC tests.
 *
 * Pattern matches QuikScale: every model + method auto-stubbed; tests
 * configure return values via e.g. `mockDb.membership.findUnique.mockResolvedValue(...)`.
 *
 * Mocks BOTH import paths the codebase uses:
 *   - `@quikit/database` (route handlers, libs)
 *   - `@/lib/db` (app-internal re-export)
 */
import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

export const mockDb: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

vi.mock("@quikit/database", async () => {
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
