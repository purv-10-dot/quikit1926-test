import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { route, json, BadRequest, NotFound, ApiError } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, assertTenantMatch } from '@/lib/auth/context';
import { db } from '@/lib/db';
import {
  storage,
  S3_BUCKET,
  putObject,
  getObjectBufferFrom,
  isManagedStorageUrl,
} from '@/lib/s3';
import { optionalEnv } from '@/lib/env';

/**
 * POST /api/transcription/generate-captions — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Port of the legacy `TranscriptionService` (`src/transcription/transcription.service.ts`):
 * read the lesson's media out of object storage, run it through OpenAI Whisper
 * asking for `vtt` back, write the `.vtt` beside the source object, and patch the
 * lesson's `captions[]`.
 *
 * This previously returned 501 ("runs in the transcription worker (Phase 4)"),
 * but no such worker job was ever built, so the feature was simply absent. It is
 * implemented here, in the request path, exactly as the legacy app did it.
 *
 * TWO PORTING NOTES:
 *
 *  1. NO `openai` SDK. The app does not depend on it, so the Whisper call is a
 *     plain `fetch` multipart POST to /v1/audio/transcriptions. Same wire
 *     contract the SDK produces (`model=whisper-1`, `response_format=vtt`), and
 *     with `response_format=vtt` the success body is the VTT document as
 *     text/plain — not JSON.
 *
 *  2. STORAGE IS GCS, not S3 (see lib/s3.ts). The legacy `videoUrl.includes(
 *     'amazonaws.com')` gate is therefore `isManagedStorageUrl`, which matches
 *     both GCS host layouts AND the legacy S3 virtual-host form still present on
 *     pre-migration rows. Keeping the literal string check would have rejected
 *     every URL written since the migration.
 *
 * TIMEOUT RISK (deliberately not solved here): Whisper is called inline, so the
 * request is held open for the download + transcription. A short clip is fine; a
 * long lecture will exceed the serverless function limit and the caller sees a
 * gateway timeout even though the upstream work may still complete. The real fix
 * is to move this to a background job — that is a separate piece of work.
 */
const schema = z.object({
  courseId: z.string(),
  moduleId: z.string().optional(),
  lessonId: z.string(),
  language: z.string().optional(),
  isMasterCourse: z.boolean().optional(),
});

type AnyRec = Record<string, unknown>;

/** Whisper's hard upload ceiling. */
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * The legacy service treated this literal as "unconfigured" and left `openai`
 * null, which is why a dev environment carrying the placeholder failed with a
 * clear message instead of a 401 from OpenAI. Reproduced verbatim.
 */
const PLACEHOLDER_KEY = 'sk-placeholder-replace-with-real-key';

/** Copied from `TranscriptionService.getMimeType`. */
const MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

/** Copied from `TranscriptionService.generateCaptionsForS3Video`. */
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  mr: 'Marathi',
  bn: 'Bengali',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

/**
 * Split a storage URL into { bucket, key }.
 *
 * `lib/s3.ts` has the same parser but keeps it private and only exposes the
 * boolean (`isManagedStorageUrl`) and the presigner. We need the pair itself to
 * read the BYTES, and lib/s3.ts is out of scope for this change, so the three
 * recognised layouts are mirrored here. Keep in sync with `parseStorageUrl`.
 */
function parseStorageUrl(value: string): { bucket: string; key: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  const path = decodeURIComponent(parsed.pathname.slice(1));

  if (host === 'storage.googleapis.com') {
    const slash = path.indexOf('/');
    if (slash <= 0) return null;
    return { bucket: path.slice(0, slash), key: path.slice(slash + 1) };
  }
  const gcsHost = host.match(/^(.+?)\.storage\.googleapis\.com$/);
  if (gcsHost) return { bucket: gcsHost[1], key: path };

  const s3Host = host.match(/^(.+?)\.s3[.-].*\.amazonaws\.com$/);
  if (s3Host) return { bucket: s3Host[1], key: path };

  return null;
}

/**
 * Object size WITHOUT downloading, so an oversized video is rejected before it
 * is buffered into the function's memory. The legacy service downloaded first
 * and measured `buffer.length` afterwards — correct, but it pulled the whole
 * file down just to refuse it, which in a serverless function is an OOM waiting
 * to happen on a 2GB lecture recording.
 *
 * Object-level metadata only (`storage.objects.get`). Never a bucket-metadata
 * call — the service account is not granted `storage.buckets.get` (lib/s3.ts).
 * Returns null when the probe fails for any reason; the post-download length
 * check below is the real guard and still runs.
 */
async function probeObjectSize(bucketName: string, key: string): Promise<number | null> {
  try {
    const [meta] = await storage.bucket(bucketName).file(key).getMetadata();
    const size = Number(meta?.size);
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

function tooLarge(bytes: number): ApiError {
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return BadRequest(
    `Video file is ${mb}MB. Whisper API supports max 25MB. Consider compressing the video.`,
  );
}

/**
 * Merge a caption entry into an existing `captions[]` BY LANGUAGE.
 *
 * DELIBERATE FIX, not a port. The legacy service `$push`ed unconditionally, so
 * re-running caption generation for a lesson — a retry after a timeout, an
 * admin regenerating after replacing the video — appended a second English
 * track. The player renders one `<track>` per entry, so the learner got
 * duplicate "English" options in the CC menu pointing at different VTT files.
 * Upserting on `language` makes the endpoint idempotent: the same language
 * always lands in the same slot with a refreshed URL.
 *
 * Legacy rows are matched on `lang` too — some fixtures/rows use that key.
 */
function upsertCaption(existing: unknown, entry: { language: string; label: string; url: string }): AnyRec[] {
  const list: AnyRec[] = Array.isArray(existing) ? [...(existing as AnyRec[])] : [];
  const target = entry.language.toLowerCase();
  const index = list.findIndex((c) => {
    if (!c || typeof c !== 'object') return false;
    const code = (c as AnyRec).language ?? (c as AnyRec).lang;
    return typeof code === 'string' && code.toLowerCase() === target;
  });
  if (index >= 0) list[index] = { ...list[index], ...entry };
  else list.push(entry);
  return list;
}

/** Locate a resource inside the MasterCourse `modules` JSON tree. */
function findMasterResource(modules: AnyRec[], lessonId: string): AnyRec | null {
  for (const mod of modules || []) {
    for (const sub of ((mod?.subModules as AnyRec[]) || [])) {
      for (const res of ((sub?.resources as AnyRec[]) || [])) {
        // MasterCourse JSON keys resources on `id` (generateModuleIds); `_id`
        // is accepted because the Mongo-era documents used that name.
        const id = res?.id ?? res?._id;
        if (typeof id === 'string' && id === lessonId) return res;
      }
    }
  }
  return null;
}

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);

  if (!dto.courseId || !dto.lessonId) throw BadRequest('courseId and lessonId are required');
  if (!dto.isMasterCourse && !dto.moduleId) throw BadRequest('moduleId is required for tenant courses');

  // ---- configuration guards -------------------------------------------------
  const apiKey = optionalEnv('OPENAI_API_KEY');
  if (!apiKey || apiKey === PLACEHOLDER_KEY) {
    throw BadRequest('OpenAI API key not configured. Please set OPENAI_API_KEY in the environment.');
  }
  if (!S3_BUCKET) {
    throw BadRequest('Caption generation is not configured on this server (GCS_BUCKET is unset).');
  }

  const language = (dto.language || 'en').trim().toLowerCase() || 'en';
  const label = LANGUAGE_LABELS[language] || language.toUpperCase();

  // ---- resolve the lesson + its media URL ----------------------------------
  // Two shapes, exactly as the legacy service: the MasterCourse JSON tree
  // (modules → subModules → resources, media on `url`) and the relational
  // tenant course (Module → Lesson, media on `contentUrl`).
  let mediaUrl: string | undefined;
  let masterModules: AnyRec[] | null = null;
  let masterResource: AnyRec | null = null;
  let lessonCaptions: unknown;

  if (dto.isMasterCourse) {
    const course = await db.lmsMasterCourse.findUnique({ where: { id: dto.courseId } });
    if (!course) throw NotFound('Master course not found');

    masterModules = (course.modules as unknown as AnyRec[]) || [];
    masterResource = findMasterResource(masterModules, dto.lessonId);
    mediaUrl = masterResource?.url as string | undefined;
    lessonCaptions = masterResource?.captions;
  } else {
    const moduleRow = await db.lmsModule.findUnique({
      where: { id: dto.moduleId as string },
      select: { id: true, orgId: true },
    });
    if (!moduleRow) throw NotFound('Module not found');
    // Not in the legacy service (it relied on the controller's TenantGuard alone,
    // which only proved the CALLER had a tenant — never that the module belonged
    // to it). Every other write path in this app scopes on orgId; so does this.
    assertTenantMatch(actor, moduleRow.orgId);

    const lesson = await db.lmsLesson.findFirst({
      where: { id: dto.lessonId, moduleId: moduleRow.id },
      select: { id: true, contentUrl: true, captions: true },
    });
    mediaUrl = lesson?.contentUrl ?? undefined;
    lessonCaptions = lesson?.captions;
  }

  if (!mediaUrl) throw NotFound('Lesson or video URL not found');

  // Legacy `videoUrl.includes('amazonaws.com')` — see the header note on why
  // this is `isManagedStorageUrl` instead.
  if (!isManagedStorageUrl(mediaUrl)) {
    throw BadRequest(
      'Only videos stored in the platform bucket can be auto-captioned. YouTube videos use built-in captions.',
    );
  }
  const source = parseStorageUrl(mediaUrl);
  if (!source) throw BadRequest('Could not extract the storage key from the lesson media URL');

  // ---- fetch the media ------------------------------------------------------
  const probedSize = await probeObjectSize(source.bucket, source.key);
  if (probedSize !== null && probedSize > MAX_MEDIA_BYTES) throw tooLarge(probedSize);

  let media: Buffer;
  try {
    media = await getObjectBufferFrom(source.bucket, source.key);
  } catch {
    throw NotFound('The lesson media could not be read from storage.');
  }
  // Legacy guard, kept as the authoritative check in case the probe was skipped.
  if (media.length > MAX_MEDIA_BYTES) throw tooLarge(media.length);
  if (media.length === 0) throw BadRequest('The lesson media is empty; nothing to transcribe.');

  // ---- Whisper --------------------------------------------------------------
  const ext = source.key.split('.').pop()?.toLowerCase() || 'mp4';
  const contentType = MIME_TYPES[ext] || 'video/mp4';

  const form = new FormData();
  // Content-Type is NOT set on the request: fetch derives it from the FormData
  // and appends the multipart boundary. Setting it by hand breaks the upload.
  form.append('file', new Blob([new Uint8Array(media)], { type: contentType }), `video.${ext}`);
  form.append('model', 'whisper-1');
  form.append('response_format', 'vtt');
  form.append('language', language);

  const whisper = await fetch(WHISPER_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!whisper.ok) {
    const detail = (await whisper.text().catch(() => '')).slice(0, 500);
    // eslint-disable-next-line no-console
    console.error(`Whisper transcription failed (${whisper.status}):`, detail);
    throw new ApiError(
      502,
      `Transcription provider returned ${whisper.status}. Captions were not generated.`,
      'Bad Gateway',
    );
  }

  // `response_format: 'vtt'` → the body IS the VTT document, not JSON.
  const vtt = await whisper.text();
  if (!vtt.trim()) throw new ApiError(502, 'Transcription provider returned an empty transcript.', 'Bad Gateway');

  // ---- store the .vtt beside the source object ------------------------------
  // Legacy key convention: `<sourceKey minus extension>_captions_<lang>.vtt`,
  // which keeps it under the same `tenants/{orgId}/uploads/` prefix. The
  // extension-less fallback is ours — the legacy regex was a silent no-op on a
  // key with no dot, which would have overwritten the source video with text.
  const suffix = `_captions_${language}.vtt`;
  const vttKey = /\.[^./]+$/.test(source.key)
    ? source.key.replace(/\.[^./]+$/, suffix)
    : `${source.key}${suffix}`;

  await putObject(vttKey, vtt, 'text/vtt');
  // Same permanent-URL form as upload-service / scorm-service / certificates.
  // Written to the CONFIGURED bucket even when the source came from a legacy
  // amazonaws.com row, so new captions always land somewhere readable.
  const vttUrl = `https://storage.googleapis.com/${S3_BUCKET}/${vttKey}`;

  // ---- patch captions[] (upsert by language — see upsertCaption) ------------
  const entry = { language, label, url: vttUrl };

  if (dto.isMasterCourse) {
    if (!masterResource || !masterModules) throw NotFound('Lesson or video URL not found');
    masterResource.captions = upsertCaption(lessonCaptions, entry);
    await db.lmsMasterCourse.update({
      where: { id: dto.courseId },
      data: { modules: masterModules as unknown as Prisma.InputJsonValue },
    });
  } else {
    await db.lmsLesson.update({
      where: { id: dto.lessonId },
      data: { captions: upsertCaption(lessonCaptions, entry) as unknown as Prisma.InputJsonValue },
    });
  }

  return json({
    success: true,
    data: { vttUrl, language, label },
    message: `Captions generated successfully in ${label}`,
  });
});
