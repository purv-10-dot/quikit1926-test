# Object Storage — Current AWS S3 Implementation (Migration Baseline)

> **Purpose:** This document is the *as-is* reference for how every QuikIT app stores files in
> AWS S3 today. It is the baseline for the upcoming migration to a **Google Cloud Storage (GCS)
> bucket** (production runs on Kubernetes / GKE).
>
> **Scope of this doc:** current state only. The GCS target design + migration steps live in a
> separate document (`02-gcs-migration-plan.md`).
>
> _Last verified: 2026-06-25 against branch `merge/ERP-24-06`._

---

## 1. Executive summary

- **4 apps use S3:** `quikinfra`, `quiktrack`, `quikcrm`, `quikhrms`.
- **7 apps do NOT use S3:** `quikscale`, `quikit`, `admin`, `quiksocial`, `quikvc`, `auth`, `_template`.
- **There is NO shared storage package.** Every app has its own `lib/s3.ts` (or storage dir).
  S3 code is **duplicated 4×** with diverging conventions.
- **All 4 apps pin the same SDK:** `@aws-sdk/client-s3@^3.967.0` and
  `@aws-sdk/s3-request-presigner@^3.967.0`.
- **Only `quikinfra` has a driver abstraction** (`StorageDriver` interface + `S3Driver`). The other
  three call the AWS SDK directly from a flat helper file. **This abstraction is the recommended
  template for the GCS migration** — see §3.1.
- **Credentials are static AWS keys** (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) read from env
  in every app. On GKE these will be replaced by **Workload Identity** (no static keys).

### Migration-impact at a glance

| App | Abstraction | URL strategy | Metadata table | Key prefix | Migration effort |
|---|---|---|---|---|---|
| quikinfra | `StorageDriver` interface ✅ | Presigned PUT + GET | `CnFileObject` | `tenants/{org}/…` | **Low** — add `GcsDriver`, flip factory |
| quiktrack | flat helper | Presigned GET (15m) | `QtIssueAttachment` (issues only) | `tenants/{org}/quiktrack/…` | Medium — rewrite helper or adopt driver |
| quikcrm | flat helper + `documents.ts` | Public URL **and** presigned GET | `CrmDocument` + folders | `crm-documents/…` | Medium — public-URL pattern needs rethink |
| quikhrms | flat helper (raw `s3` client export) | Public URL only | none (transient) | `uploads/{org}/…` | Medium — exports raw client, no presign |

---

## 2. Environment variables (current)

All apps read credentials from env. `quikinfra` adds optional `STORAGE_*` overrides that win over the
shared `AWS_*` names; the other three read `AWS_*` directly.

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `AWS_REGION` | all 4 | `ap-south-1` (hrms: `us-east-1`) | S3 region |
| `AWS_S3_BUCKET` | all 4 | — (infra: `quikinfra-dev`) | bucket name |
| `AWS_ACCESS_KEY_ID` | all 4 | — | static access key |
| `AWS_SECRET_ACCESS_KEY` | all 4 | — | static secret |
| `AWS_S3_PUBLIC_URL` | quikhrms | `""` | optional CDN/public base for returned URLs |
| `STORAGE_BUCKET` | quikinfra | → `AWS_S3_BUCKET` | app-specific bucket override |
| `STORAGE_S3_REGION` | quikinfra | → `AWS_REGION` | region override |
| `STORAGE_S3_ACCESS_KEY_ID` | quikinfra | → `AWS_ACCESS_KEY_ID` | key override |
| `STORAGE_S3_SECRET_ACCESS_KEY` | quikinfra | → `AWS_SECRET_ACCESS_KEY` | secret override |
| `STORAGE_UPLOAD_URL_TTL_SEC` | quikinfra | `300` | presigned PUT TTL |
| `STORAGE_DOWNLOAD_URL_TTL_SEC` | quikinfra | `300` | presigned GET TTL |

> **Migration note:** the diverging env conventions (`STORAGE_*` vs raw `AWS_*`) and the
> `AWS_S3_PUBLIC_URL` special case must all be reconciled into one scheme for GCS.

---

## 3. Per-app implementation detail

### 3.1 quikinfra — driver abstraction (the gold standard)

**Layers:**
```
Routes / Services
   → FileService            (apps/quikinfra/src/lib/storage/file-service.ts)
      → StorageDriver iface  (apps/quikinfra/src/lib/storage/driver.ts)
         → S3Driver          (apps/quikinfra/src/lib/storage/s3-driver.ts)
   ← factory                 (apps/quikinfra/src/lib/storage/index.ts → getStorageDriver())
```

**`StorageDriver` interface** (`driver.ts:30-66`) — the contract every backend must satisfy:

| Method | Signature |
|---|---|
| `getPresignedUploadUrl` | `({key, contentType, contentLength, expiresIn?}) → PresignedUploadUrl` |
| `getPresignedDownloadUrl` | `({key, fileName?, expiresIn?}) → PresignedDownloadUrl` |
| `putObject` | `({key, body, contentType}) → void` (server-side upload) |
| `headObject` | `(key) → {exists, contentLength?, contentType?, etag?}` |
| `deleteObject` | `(key) → void` |

Plus the readonly fields `kind: "s3"` and `bucket: string`.

**`FileService`** (`file-service.ts`) adds the business layer: MIME/size validation, the
`CnFileObject` metadata row, object-key construction, and a **2-stage upload** (`initUpload` returns a
presigned PUT → browser uploads → `confirmUpload` verifies via `headObject` and flips
`pending_upload → active`). Other methods: `getDownloadUrl`, `deleteFile` (soft by default),
`listByEntity`, `buildObjectKey`.

**Factory** (`index.ts:30-54`) caches a singleton `S3Driver`, reading `STORAGE_*` → `AWS_*` → defaults.

**Object key layout:**
```
tenants/{orgId}/companies/{companyId?}/projects/{projectId?}/{entityType}/{entityId}/YYYY/MM/{uuid}-{safeName}
```
Entity types: `boq_import`, `po`, `grn`, `work_order`, `dpr`, `rab`, `safety_incident`,
`quality_inspection`, `project_document`.

**Metadata table — `CnFileObject`** (`packages/database/prisma/schema.prisma`, schema `app_quikinfra`):
- Columns include `storageKey`, **`storageKind` (default `"s3"`)**, **`storageBucket`**, `status`
  (`pending_upload`/`active`/`deleted`), full audit (`uploadedBy/At`, `deletedBy/At`).
- `storageKind` already accepts other values (`"r2"`, `"gcs"`, `"local"`) — **no schema change needed for GCS.**

**Call sites:** `app/api/uploads/route.ts`, `app/api/uploads/view/[...key]/route.ts`,
`src/lib/dpr/dpr-images.ts`, re-export shim `apps/quikinfra/lib/storage.ts`.
**Tests:** `__tests__/unit/storageS3Driver.test.ts`, `storageFileService.test.ts`,
`storageValidation.test.ts`, `__tests__/api/uploadsFiles.test.ts`.

---

### 3.2 quiktrack — flat helper

**File:** `apps/quiktrack/lib/s3.ts` (142 lines). Lazy singleton `getClient()`; throws if env unset.

**Exports:**
| Function | Notes |
|---|---|
| `getBucket()` | reads `AWS_S3_BUCKET` |
| `isAllowedImageType(mime)` / `MAX_IMAGE_BYTES` (8 MB) | image allowlist |
| `buildDocImageKey(orgId, projectId, mime)` | `tenants/{org}/quiktrack/docs/{proj}/{uuid}.{ext}` |
| `buildIssueAttachmentKey(orgId, projectId, issueId, fileName)` | `tenants/{org}/quiktrack/issues/{proj}/{issue}/{uuid}-{safeName}` |
| `putObject(key, body, contentType)` | sets `CacheControl: private, max-age=300` |
| `getPresignedGetUrl(key, expiresIn=900, downloadFileName?)` | 15-min default; optional `Content-Disposition: attachment` |
| `keyBelongsToTenant(key, orgId)` | defense-in-depth: `key.startsWith("tenants/{org}/")` |

**URL strategy:** presigned GET only (no presigned PUT — uploads go through the route, server-side).
Assets are served via proxy routes that mint a fresh presigned URL and redirect.

**Metadata:** `QtIssueAttachment` (schema `app_quiktrack`) for issue attachments; **doc images have no
metadata** — the key is embedded directly in the doc HTML content. No soft-delete.

**Call sites:** `app/api/docs/upload/route.ts`, `app/api/docs/asset/route.ts`,
`app/api/docs/share/[token]/asset/route.ts`,
`app/api/issues/[id]/attachments/[attachmentId]/route.ts`,
`lib/services/migration/migrate-jira.ts`.

---

### 3.3 quikcrm — flat helper + domain wrapper

**Files:** `apps/quikcrm/lib/s3.ts` (113 lines) + `apps/quikcrm/lib/storage/documents.ts` (domain logic).

**`lib/s3.ts` exports:**
| Function | Notes |
|---|---|
| `getBucket()` / `isS3Configured()` | config guards |
| `buildPublicObjectUrl(key)` | **virtual-hosted public URL** `https://{bucket}.s3.{region}.amazonaws.com/{key}` |
| `isCrmDocumentS3Key(key)` | guards on `crm-documents/` prefix |
| `putObject(key, body, contentType)` | `CacheControl: private, max-age=300` |
| `deleteObject(key)` | **only deletes if `isCrmDocumentS3Key`** (skips foreign keys) |
| `getObjectBuffer(key)` | reads full object into memory (`transformToByteArray`) |
| `getPresignedGetUrl(key, expiresIn=900)` | 15-min default |

**`lib/storage/documents.ts` wrapper:** `saveCrmUpload`, `readCrmUpload`, `getCrmUploadDownloadUrl`,
`deleteCrmUpload`, `buildCrmDocumentStorageKey(segment, safeName)`, `resolveDocumentPublicUrl`,
`isAllowedMime`.

**Key layout:** `crm-documents/{folderId|refId|root}/{timestamp}-{safeName}` — **NOT tenant-prefixed**
(isolation relies on the DB row, not the key).

**URL strategy:** mixed — `buildPublicObjectUrl` (assumes public-readable objects) **and** presigned
GET. ⚠️ The public-URL path is the trickiest to port to GCS (different host format + public-ACL model).

**Metadata:** `CrmDocument`, `CrmDocumentFolder` (self-referential hierarchy), `CrmDocumentLink`
(schema `app_quikcrm`); soft-delete via `deletedAt`.

**Call sites:** `lib/storage/documents.ts`, `lib/services/quotes/enterprise/pdf/generate-pdf.ts`,
test `__tests__/unit/storage/crm-documents-s3.test.ts`.

---

### 3.4 quikhrms — raw client export (least abstracted)

**File:** `apps/quikhrms/lib/s3.ts` (49 lines). **Exports the `S3Client` instance directly** (`export const s3`).

**Exports:**
| Function | Notes |
|---|---|
| `s3` | raw `S3Client` (eager-constructed at import) |
| `uploadToS3({key, body, contentType}) → {key, url, bucket}` | builds URL from `AWS_S3_PUBLIC_URL` or virtual-hosted host |
| `getS3Object(key) → {body, contentType, length}` | reads full object into memory |

**Key layout:** `uploads/{orgId}/{uuid}{ext}`.
**URL strategy:** public URL only — `AWS_S3_PUBLIC_URL/{key}` or
`https://{bucket}.s3.{region}.amazonaws.com/{key}`. **No presigning.** Access is gated through a proxy
route.
**Metadata:** none — keys stored on related records or transient.
**Call sites:** `app/api/v1/hrms/uploads/route.ts` (rate-limited 20/60s),
`app/api/v1/hrms/uploads/proxy/route.ts`, `lib/services/offer-pdf.ts`,
`lib/ai/extract-document-text.ts`,
`app/api/v1/hrms/recruit/candidate-documents/[token]/upload/route.ts`.

---

## 4. Cross-app divergences that the migration must reconcile

These are the inconsistencies that make a "swap S3 for GCS" non-trivial:

1. **No shared package.** 4 separate implementations → 4 places to change. Strong case for extracting
   a `@quikit/storage` package built on quikinfra's `StorageDriver` and adding a `GcsDriver`.
2. **Key prefixes differ:** `tenants/{org}/…` (infra, quiktrack) vs `crm-documents/…` (crm, not
   tenant-scoped in the key) vs `uploads/{org}/…` (hrms). Affects how data is copied/laid out in GCS.
3. **URL strategy differs:** presigned PUT+GET (infra) / presigned GET (quiktrack) / **public URLs**
   (crm, hrms). GCS public-object access and signed-URL signing under Workload Identity behave
   differently from S3 — the public-URL apps need the most rework.
4. **Metadata differs:** centralized `CnFileObject` (infra) vs per-feature tables (crm, quiktrack
   issues) vs none (hrms docs, quiktrack docs). `storageKind`/`storageBucket` only exist on
   `CnFileObject` today.
5. **Credential model:** all use static AWS keys in env. GKE target = Workload Identity (no keys),
   which changes how clients are constructed and how signed URLs are produced.
6. **SDK coupling:** every helper imports `@aws-sdk/*` directly. The GCS SDK is `@google-cloud/storage`
   with a different API shape (`getSignedUrl`, `file.save`, `file.getMetadata`, `file.delete`).

---

## 5. Inventory — exact paths

**Helpers / drivers**
- `apps/quikinfra/src/lib/storage/index.ts` — factory + public surface
- `apps/quikinfra/src/lib/storage/driver.ts` — `StorageDriver` interface
- `apps/quikinfra/src/lib/storage/s3-driver.ts` — S3 implementation
- `apps/quikinfra/src/lib/storage/file-service.ts` — business layer
- `apps/quikinfra/src/lib/storage/validation.ts` — MIME/size rules
- `apps/quikinfra/lib/storage.ts` — re-export shim
- `apps/quiktrack/lib/s3.ts`
- `apps/quikcrm/lib/s3.ts` + `apps/quikcrm/lib/storage/documents.ts`
- `apps/quikhrms/lib/s3.ts`

**Prisma metadata models** (`packages/database/prisma/schema.prisma`)
- `CnFileObject` (schema `app_quikinfra`) — has `storageKind` / `storageBucket`
- `QtIssueAttachment` (schema `app_quiktrack`)
- `CrmDocument`, `CrmDocumentFolder`, `CrmDocumentLink` (schema `app_quikcrm`)

**SDK versions (identical across all 4 apps)**
- `@aws-sdk/client-s3@^3.967.0`
- `@aws-sdk/s3-request-presigner@^3.967.0`

---

## 6. Next document

➡️ `02-gcs-migration-plan.md` — target GCS design (shared `@quikit/storage` + `GcsDriver`),
GKE Workload Identity signed-URL signing, bucket CORS, env-var unification, and the one-time
S3→GCS data copy.
