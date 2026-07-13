/**
 * Upload service — presigned-URL minting ported from UploadService.
 * Large files NEVER stream through route bodies; the browser PUTs directly to S3
 * using these presigned URLs. Key format matches the legacy backend exactly:
 *   tenants/{orgId}/uploads/{uuid}-{fileName}
 * and the specialised prefixes (course-resources, homework, scorm, …).
 */
import { randomUUID } from 'crypto';
import { presignPut, presignGet, S3_BUCKET } from '@/lib/s3';
import { optionalEnv } from '@/lib/env';

const REGION = optionalEnv('AWS_REGION') || 'ap-south-1';

function publicUrl(key: string): string {
  return `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

function safeName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
}

/** Generic upload presign (matches UploadService.generatePresignedUrl). */
export async function generatePresignedUrl(
  orgId: string,
  fileName: string,
  fileType: string,
): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string }> {
  const fileKey = `tenants/${orgId}/uploads/${randomUUID()}-${fileName}`;
  const uploadUrl = await presignPut(fileKey, fileType, 3600);
  return { uploadUrl, fileKey, fileUrl: publicUrl(fileKey) };
}

/**
 * Mint a presigned PUT for a given S3 prefix. Used by the course-resource /
 * homework / non-teaching / thumbnail / scorm upload endpoints, which previously
 * accepted multipart bodies — now the browser uploads directly.
 */
export async function presignForPrefix(
  prefix: string,
  fileName: string,
  fileType: string,
): Promise<{ uploadUrl: string; s3Key: string; permanentUrl: string }> {
  const key = `${prefix}/${Date.now()}-${safeName(fileName)}`;
  const uploadUrl = await presignPut(key, fileType, 3600);
  return { uploadUrl, s3Key: key, permanentUrl: publicUrl(key) };
}

export async function presignReadUrl(s3Key: string): Promise<string> {
  return presignGet(s3Key, 3600);
}

export function getResourceTypeFromFile(filename: string, mimetype: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (mimetype.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video_upload';
  if (mimetype.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio_upload';
  if (ext === 'pdf' || mimetype === 'application/pdf') return 'document_pdf';
  if (['ppt', 'pptx'].includes(ext) || mimetype.includes('presentation')) return 'document_ppt';
  if (['doc', 'docx'].includes(ext) || mimetype.includes('word')) return 'document_word';
  if (['xls', 'xlsx'].includes(ext) || mimetype.includes('spreadsheet')) return 'document_excel';
  return 'document_pdf';
}
