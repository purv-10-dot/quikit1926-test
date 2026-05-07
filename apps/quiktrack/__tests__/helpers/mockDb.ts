import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

/**
 * Deep-mocked Prisma client. Every model + method is auto-stubbed; tests
 * configure return values via e.g. `mockDb.qtProject.findMany.mockResolvedValue(...)`.
 */
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
