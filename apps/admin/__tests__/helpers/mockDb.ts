import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

export const mockDb: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

vi.mock("@quikit/database", async () => {
  const actual = await vi.importActual<typeof import("@quikit/database")>(
    "@quikit/database"
  );
  return { ...actual, db: mockDb };
});

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

export function resetMockDb() {
  mockReset(mockDb);
}
