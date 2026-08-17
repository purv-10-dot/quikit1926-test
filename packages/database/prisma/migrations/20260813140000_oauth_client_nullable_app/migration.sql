-- AlterTable: allow a dynamically-registered OAuthClient (RFC 7591) to exist
-- with no App bound yet. Real MCP clients (e.g. Claude Desktop) have no
-- `resource` field in their registration request body -- RFC 8707 resource
-- indicators belong on the authorize/token requests, not registration -- so
-- registration can no longer assume it can always resolve an appId up front.
-- authorize.ts now falls back to resolving the app from the `resource` query
-- param on such unbound clients (see resolveAppByResource() in lib/oauth.ts).
-- The existing FK constraint already permits NULL once NOT NULL is dropped;
-- idempotent since dropping an already-dropped NOT NULL is a no-op.
ALTER TABLE "quikit"."OAuthClient" ALTER COLUMN "appId" DROP NOT NULL;
