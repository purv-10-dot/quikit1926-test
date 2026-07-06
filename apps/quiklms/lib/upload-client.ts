'use client';
/**
 * Client-side S3 presigned upload.
 *
 * The /api/upload/*-resource routes are presigned-PUT minters: you POST JSON
 * metadata ({ fileName, fileType, fileSize }) and get back an `uploadUrl` that
 * the browser must PUT the bytes to directly (large media never streams through
 * the Next API). This helper does both steps and returns the permanent URL.
 */
import { api } from '@/lib/api';

interface PresignResponse {
  uploadUrl: string;
  permanentUrl?: string;
  url?: string;
  s3Key?: string;
}

export async function uploadViaPresign(file: File, endpoint: string): Promise<string> {
  const fileType = file.type || 'application/octet-stream';

  // 1. Mint a presigned PUT URL.
  const res = await api.post<{ success: boolean; data: PresignResponse }>(endpoint, {
    fileName: file.name,
    fileType,
    fileSize: file.size,
  });
  const data = res.data;
  if (!data?.uploadUrl) throw new Error('No upload URL returned');

  // 2. PUT the bytes straight to S3.
  const put = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': fileType },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

  return data.permanentUrl || data.url || '';
}
