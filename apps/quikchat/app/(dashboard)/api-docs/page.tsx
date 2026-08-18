import { notFound } from "next/navigation";
import { apiDocsEnabled } from "@/lib/api-docs";
import { ApiDocsViewer } from "./components/ApiDocsViewer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "QuikChat API reference",
};

/**
 * Interactive API reference — Swagger UI over docs/openapi.yaml, with a working
 * "Try it out" (the FastAPI `/docs` experience). Built for the React Native
 * team, who until now had a spec they could read but nothing they could poke at.
 *
 * Why in-app instead of a static HTML export: auth here is a session cookie, so
 * a developer already logged into QuikChat in this browser has it attached
 * automatically on same-origin requests — no token pasting, which a standalone
 * file could not do.
 *
 * Access tier — authenticated + QuikChat app access, inherited from the
 * (dashboard) layout's `requireAppAccess`. Deliberately NOT admin-only: the
 * audience is mobile devs who need real access, and every route in the spec
 * enforces its own authz per request, so reading it confers nothing an
 * authenticated user doesn't already have — "Try it out" runs as *them*,
 * against *their* org. Equally deliberately not public: the spec documents
 * unvalidated request bodies and undocumented-500 paths.
 *
 * Unlisted by design — reachable by direct URL, with no nav entry, so ordinary
 * end users never trip over a developer tool.
 */
export default function ApiDocsPage() {
  if (!apiDocsEnabled()) notFound();
  return <ApiDocsViewer />;
}
