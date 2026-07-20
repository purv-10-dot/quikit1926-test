/* Probe the running LMS with a minted session. Usage:
 *   npx tsx <path>/probe.ts <role> <METHOD> <path> [jsonBody]
 */
import fs from 'node:fs';
import path from 'node:path';
import { encode } from 'next-auth/jwt';

const APP = 'c:/Users/user/Desktop/quikit/quikit1926/apps/quiklms';
const MANIFEST = JSON.parse(fs.readFileSync(path.join(APP, '__tests__/e2e/.seed-manifest.json'), 'utf8'));
const SECRET = fs.readFileSync(path.join(APP, '.env.local'), 'utf8').match(/^NEXTAUTH_SECRET=(.*)$/m)![1].trim().replace(/^["']|["']$/g, '');

const ORG_MEMBER_ROLE: Record<string, string> = {
  superAdmin: 'super_admin', tenantAdmin: 'org_admin', subAdmin: 'member',
  manager: 'member', teacher: 'member', parent: 'member', learner: 'member',
};

async function token(role: string) {
  const u = process.env.OVERRIDE_ID
    ? { userId: process.env.OVERRIDE_ID, email: process.env.OVERRIDE_EMAIL || 'x@x.test' }
    : MANIFEST.users[role];
  return encode({
    secret: SECRET, maxAge: 60 * 60 * 8,
    token: {
      id: u.userId, sub: u.userId, email: u.email, name: `E2E ${role}`,
      firstName: 'E2E', lastName: role, orgId: MANIFEST.orgId,
      membershipRole: ORG_MEMBER_ROLE[role], membershipCheckedAt: Date.now(),
      isSuperAdmin: role === 'superAdmin', sessionId: `e2e-${role}-${u.userId}`,
      sessionTouchedAt: Date.now(), actingAs: 'user',
    },
  });
}

async function main() {
  const [role, method, p, body] = process.argv.slice(2);
  const t = await token(role);
  const res = await fetch(`http://localhost:3020${p}`, {
    method: method.toUpperCase(),
    headers: { Cookie: `next-auth.session-token=${t}`, 'Content-Type': 'application/json' },
    body: body ? body : undefined,
  });
  const txt = await res.text();
  console.log('STATUS', res.status);
  try { console.log(JSON.stringify(JSON.parse(txt), null, 1).slice(0, 6000)); }
  catch { console.log(txt.slice(0, 2000)); }
}
main();
