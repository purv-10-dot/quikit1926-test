/**
 * Apply the bucket CORS policy in scripts/gcs-cors.json to the GCS bucket.
 *
 * WHY THIS EXISTS
 * quiklms is the only app that uploads from the BROWSER: `lib/upload-client.ts`
 * mints a presigned PUT and then has the browser PUT the bytes straight to
 * storage.googleapis.com. A cross-origin PUT carrying a Content-Type header
 * forces a CORS preflight, and a bucket with no CORS policy answers that
 * preflight 200 but WITHOUT Access-Control-Allow-Origin — so the browser blocks
 * the request and fetch() rejects with the bare `TypeError: Failed to fetch`.
 *
 * Every other app (quikcrm, quikhrms, quiktrack, quikinfra) writes to the same
 * bucket server-side, which is why this was never needed before and why nothing
 * else in the repo configures it.
 *
 * Bucket CORS is bucket METADATA — it cannot be set from app config or from a
 * signed URL. It has to be applied once, out of band, by a principal holding
 * `storage.buckets.update`. The runtime service account only has object-level
 * access (see the PERMISSIONS note in lib/s3.ts), so this will very likely 403
 * with the app's own credentials — run it with an owner/admin service account.
 *
 * USAGE
 *   node scripts/set-gcs-cors.mjs            # apply, reading ./.env.local
 *   node scripts/set-gcs-cors.mjs --check    # print current policy, change nothing
 *
 * Equivalent one-liner if you have the gcloud CLI:
 *   gcloud storage buckets update gs://$GCS_BUCKET --cors-file=scripts/gcs-cors.json
 */
import { Storage } from '@google-cloud/storage';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');

/** Minimal .env reader — avoids adding a dotenv dep to a one-shot ops script. */
function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let [, key, val] = m;
    val = val.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(resolve(appRoot, '.env.local'));

const bucketName = process.env.GCS_BUCKET || process.env.AWS_S3_BUCKET;
const projectId = process.env.GCS_PROJECT_ID;
const clientEmail = process.env.GCS_CLIENT_EMAIL;
// Vercel stores the PEM on one line with literal \n escapes — same fix as lib/s3.ts.
const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!bucketName) {
  console.error('GCS_BUCKET is not set (checked .env.local and the environment).');
  process.exit(1);
}

const storage = new Storage({
  projectId: projectId || undefined,
  credentials: clientEmail && privateKey ? { client_email: clientEmail, private_key: privateKey } : undefined,
});
const bucket = storage.bucket(bucketName);

const checkOnly = process.argv.includes('--check');

try {
  if (checkOnly) {
    const [metadata] = await bucket.getMetadata();
    console.log(`Current CORS policy on gs://${bucketName}:`);
    console.log(JSON.stringify(metadata.cors ?? [], null, 2));
    if (!metadata.cors?.length) {
      console.log('\n→ EMPTY. Browser uploads will fail with "Failed to fetch". Re-run without --check.');
    }
  } else {
    const cors = JSON.parse(readFileSync(resolve(here, 'gcs-cors.json'), 'utf8'));
    await bucket.setCorsConfiguration(cors);
    console.log(`Applied CORS policy to gs://${bucketName}:`);
    console.log(JSON.stringify(cors, null, 2));
    console.log('\nPropagation is usually immediate. Hard-refresh the browser to clear any cached preflight.');
  }
} catch (err) {
  console.error(`\nFailed against gs://${bucketName}: ${err.message}`);
  if (String(err.message).includes('403') || err.code === 403) {
    console.error(
      '\n403 — these credentials have object-level access but not `storage.buckets.update`.\n' +
        'Re-run with an owner/admin service account, or apply scripts/gcs-cors.json\n' +
        'from the Cloud Console / gcloud with an account that has bucket-admin rights.',
    );
  }
  process.exit(1);
}
