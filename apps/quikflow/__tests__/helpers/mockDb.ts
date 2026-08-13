import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

/**
 * Deep-mocked Prisma client. Both import paths the codebase uses
 * (`@quikit/database` and `@/lib/db`) point at this single instance so tests
 * have one control surface. Mirrors apps/quikscale/__tests__/helpers/mockDb.ts.
 */
export const mockDb: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

vi.mock("@quikit/database", async () => {
  const prismaClient = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return { ...prismaClient, db: mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));

export function resetMockDb() {
  mockReset(mockDb);
}
