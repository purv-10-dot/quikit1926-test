/**
 * Integration test setup — runs before each integration test FILE.
 *
 * Unlike __tests__/setup.ts (which installs mocks), this file loads the real
 * DATABASE_URL from .env.local so tests can connect to the dev Postgres
 * instance.  No vi.mock() calls here — integration tests hit the real DB.
 *
 * Run with: npm run test:integration
 * Requires: local Postgres running + .env.local with DATABASE_URL set.
 */
import { config } from "dotenv";
import path from "path";

// Load .env.local from the repo root.  The ||= in the unit-test setup would
// overwrite the real URL with the synthetic placeholder; we set it first so
// the real value wins.
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
