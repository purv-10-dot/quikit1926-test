import generated from "./generated.json";
import { enrichments } from "./enrichments";

/**
 * Assembles the full OpenAPI document served at GET /api/v1/openapi.json.
 *
 * Layering:
 *   1. `base`        — info, servers, the bearerAuth security scheme, and the
 *                      hand-written /api/v1/token operation (the login).
 *   2. `generated`   — the skeleton scanned from the app/api route tree by
 *                      scripts/gen-openapi.mjs (method + path + generic
 *                      responses for every exported handler).
 *   3. `enrichments` — hand-authored request/response detail for high-value
 *                      groups (issues, projects, timesheets, sprints), merged
 *                      OVER the generated skeleton so those endpoints show real
 *                      schemas while everything else stays documented.
 *
 * Every operation inherits the global `bearerAuth` requirement; the token
 * endpoint overrides it with `security: []` since it is the login itself.
 */

interface OpenApiPaths {
  [path: string]: Record<string, unknown>;
}

const description = `
The **QuikTrack API** is a REST API for programmatic access to your QuikTrack
data — projects, issues, sprints, timesheets, reports and more. It's the same
API the QuikTrack web app uses, so anything you can do in the UI you can do here.

Responses are JSON. Every request is authenticated and runs **as your user**,
scoped to **your organization** and your existing **permissions** — the API
grants no elevated access.

---

## Getting started in 3 steps

**1. Get a token.** Send your QuikTrack email and password to \`POST /api/v1/token\`:

\`\`\`bash
curl -X POST https://<host>/api/v1/token \\
  -H "Content-Type: application/json" \\
  -d '{ "email": "you@company.com", "password": "your-password" }'
\`\`\`

Response:

\`\`\`json
{ "access_token": "eyJhbGciOiJIUzI1NiIs...", "token_type": "Bearer", "expires_in": 3600 }
\`\`\`

**2. Authorize.** Click the **Authorize** button at the top of this page and paste
the \`access_token\`. Every "Try it" request will now send it automatically.

**3. Call any endpoint.** Send the token as a Bearer header:

\`\`\`bash
curl https://<host>/api/issues?projectId=PROJECT_ID \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
\`\`\`

---

## Authentication

All endpoints except \`POST /api/v1/token\` require a Bearer token:

\`\`\`
Authorization: Bearer <access_token>
\`\`\`

- **Lifetime:** tokens expire after **1 hour** (\`expires_in\` is in seconds).
  When a token expires, request a new one from \`POST /api/v1/token\`.
- **Scope:** the token is bound to the organization that was active on your
  account when it was issued, and to your role/permissions. Membership is
  re-checked on every request, so if your access is revoked the token stops
  working immediately.
- **Security:** treat the token like a password. Send it only over HTTPS and
  never embed it in client-side code you don't control.

## Rate limiting

The login endpoint is throttled to protect accounts:

- **20 requests** per IP address per **15 minutes**
- **10 requests** per email address per **15 minutes**

Exceeding a limit returns \`429 Too Many Requests\` with a \`Retry-After\` header
(seconds until the window resets).

## Response format

Most business endpoints return an envelope:

\`\`\`json
{ "success": true, "data": { } }
\`\`\`

On error they return:

\`\`\`json
{ "success": false, "error": "Human-readable message" }
\`\`\`

The token endpoint uses \`{ "error": "code", "message": "..." }\`.

## Status codes

| Code | Meaning |
| --- | --- |
| \`200\` / \`201\` | Success |
| \`400\` | Malformed request (bad JSON, missing required field) |
| \`401\` | Missing, invalid, or expired Bearer token |
| \`403\` | Authenticated, but no access to this resource / no active membership |
| \`404\` | Resource not found (or hidden because you can't access it) |
| \`429\` | Rate limited (login endpoint) |
| \`500\` | Unexpected server error |

## Versioning

This is **v1**. Authentication and meta endpoints live under \`/api/v1/*\`;
the resource endpoints live under \`/api/*\`. Breaking changes will ship under a
new version prefix.
`.trim();

const base = {
  openapi: "3.1.0",
  info: {
    title: "QuikTrack API",
    version: "1.0.0",
    description,
    contact: { name: "QuikTrack Support" },
  },
  servers: [{ url: "/", description: "Current host" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Bearer token from POST /api/v1/token.",
      },
    },
  },
  // Applied to every operation unless overridden.
  security: [{ bearerAuth: [] }],
};

const tokenPath: OpenApiPaths = {
  "/api/v1/token": {
    post: {
      tags: ["Authentication"],
      summary: "Exchange email + password for a Bearer token",
      operationId: "post_api_v1_token",
      security: [], // the login itself needs no token
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", format: "email", example: "partner@acme.com" },
                password: { type: "string", format: "password" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Token issued",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  access_token: { type: "string" },
                  token_type: { type: "string", example: "Bearer" },
                  expires_in: { type: "integer", example: 3600 },
                },
              },
            },
          },
        },
        400: { description: "Malformed request" },
        401: { description: "Invalid email or password" },
        403: { description: "No active organization membership" },
        429: { description: "Too many attempts — rate limited" },
      },
    },
  },
};

/**
 * Merge OpenAPI path layers. Merges at the OPERATION (method) level so an
 * enrichment layer can add a `requestBody` or `parameters` to an operation
 * without discarding the generated `summary` / `description` / `responses`.
 */
function mergePaths(...layers: OpenApiPaths[]): OpenApiPaths {
  const out: OpenApiPaths = {};
  for (const layer of layers) {
    for (const [path, methods] of Object.entries(layer)) {
      const existing = out[path] ?? {};
      const merged: Record<string, unknown> = { ...existing };
      for (const [method, op] of Object.entries(methods as Record<string, unknown>)) {
        merged[method] = { ...((existing as Record<string, unknown>)[method] as object ?? {}), ...(op as object) };
      }
      out[path] = merged;
    }
  }
  return out;
}

export function buildOpenApiSpec() {
  const generatedPaths = (generated as { paths: OpenApiPaths }).paths;
  return {
    ...base,
    paths: mergePaths(generatedPaths, enrichments as OpenApiPaths, tokenPath),
    tags: [
      { name: "Authentication" },
      ...((generated as { tags?: { name: string }[] }).tags ?? []),
    ],
  };
}
