import type { Bucket } from "@google-cloud/storage";

/**
 * Google Cloud Storage backend for asset invoice files.
 *
 * Reuses the SAME env var names as quikcrm's GCS setup so one service account +
 * project can serve both apps — quikasset just needs its own bucket (or can
 * share one; objects are namespaced under the `quikasset-invoices/` prefix):
 *
 *   GCS_PROJECT_ID    — GCP project id
 *   GCS_BUCKET        — target bucket name
 *   GCS_CLIENT_EMAIL  — service-account email
 *   GCS_PRIVATE_KEY   — service-account private key (single-line with escaped
 *                       `\n`, un-escaped here for the JWT signer)
 *
 * The @google-cloud/storage SDK is imported LAZILY (dynamic import inside the
 * client getter) so the local-disk fallback path never loads it — the feature
 * keeps working even before the package/credentials exist. Callers use
 * `isGcsConfigured()` to decide between this backend and local disk.
 */

/**
 * All GCS objects for this app live under this key prefix within the bucket, so
 * quikasset's files can't collide with quikcrm's (which use `crm-documents/`)
 * when sharing a bucket (e.g. gs://quikit-bucket). Final object path:
 *   quikasset/invoices/<orgId>/<assetId>/<uuid>.<ext>
 */
const GCS_PREFIX = "quikasset/invoices";

function readConfig() {
  return {
    projectId: process.env.GCS_PROJECT_ID,
    bucketName: process.env.GCS_BUCKET,
    clientEmail: process.env.GCS_CLIENT_EMAIL,
    // Env files store the key single-line with literal `\n`; un-escape for the signer.
    privateKey: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}

/** True only when every GCS credential is present — otherwise callers fall back to disk. */
export function isGcsConfigured(): boolean {
  const c = readConfig();
  return Boolean(c.projectId && c.bucketName && c.clientEmail && c.privateKey);
}

let cachedBucket: Bucket | null = null;

async function getBucket(): Promise<Bucket> {
  const c = readConfig();
  if (!c.projectId || !c.bucketName || !c.clientEmail || !c.privateKey) {
    throw new Error("GCS is not configured (GCS_PROJECT_ID / GCS_BUCKET / GCS_CLIENT_EMAIL / GCS_PRIVATE_KEY).");
  }
  if (!cachedBucket) {
    const { Storage } = await import("@google-cloud/storage");
    const storage = new Storage({
      projectId: c.projectId,
      credentials: { client_email: c.clientEmail, private_key: c.privateKey },
    });
    cachedBucket = storage.bucket(c.bucketName);
  }
  return cachedBucket;
}

/** The DB stores a backend-agnostic key (org/asset/uuid.ext); GCS namespaces it. */
const objectName = (key: string) => `${GCS_PREFIX}/${key}`;

export async function gcsSaveInvoice(key: string, bytes: Buffer, contentType: string): Promise<void> {
  await (await getBucket()).file(objectName(key)).save(Buffer.from(bytes), {
    contentType,
    resumable: false, // small one-shot uploads — skip the resumable-session round trip
    metadata: { cacheControl: "private, max-age=300" },
  });
}

export async function gcsReadInvoice(key: string): Promise<Buffer> {
  const [buf] = await (await getBucket()).file(objectName(key)).download();
  return buf;
}

export async function gcsDeleteInvoice(key: string): Promise<void> {
  try {
    await (await getBucket()).file(objectName(key)).delete();
  } catch {
    // best-effort — already gone or transient
  }
}
