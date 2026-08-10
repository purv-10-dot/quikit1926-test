-- AlterTable: allow multiple OAuthClient rows per App (was one-to-one).
-- A first-party client (the app's own SSO client) and any number of
-- dynamically self-registered clients (RFC 7591, see purpose column below)
-- can now coexist against the same appId.
DROP INDEX "quikit"."OAuthClient_appId_key";
CREATE INDEX "OAuthClient_appId_idx" ON "quikit"."OAuthClient"("appId");

-- AlterTable: distinguish the app's own first-party client from
-- dynamically self-registered ones.
ALTER TABLE "quikit"."OAuthClient" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'first_party';
ALTER TABLE "quikit"."OAuthClient" ADD COLUMN "clientName" TEXT;
