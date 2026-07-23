'use client';
/**
 * ResourceUploader — ported from the old QuikSkills frontend
 * (QuikSkillsfrontend/src/components/ResourceUploader.tsx).
 *
 * Modal for attaching a file-backed lesson to a module:
 *   1. pick a title, a resource type, and a file (5GB client-side cap);
 *   2. upload the bytes via the presigned-PUT helper
 *      (POST /api/upload/course-resource → PUT straight to S3);
 *   3. create the lesson record (POST /api/courses/lessons) and call onSuccess().
 *
 * DEVIATION FROM SOURCE (approved): the legacy component uploaded through
 * `tus-js-client` to `${VITE_API_URL}/upload` — a route that does not exist on
 * the backend (only `/upload/tus`, itself a stub), so the original could never
 * have completed an upload. It also built a FormData that was never sent. The
 * tus path is replaced with `uploadFile`, the same helper the learner homework
 * page uses. Consequences, all intentional:
 *   - Uploads are NO LONGER RESUMABLE, so the "Upload is resumable…" line is
 *     gone rather than left as a false promise.
 *   - `uploadFile` reports no byte-level progress: the bar holds at 0% while
 *     uploading and is set to 100 on success.
 *   - Cancel cannot abort the in-flight PUT (the helper takes no AbortSignal);
 *     it drops the upload from the UI and suppresses the lesson creation.
 * Everything else — props, state, the 5GB check, the accept map, every
 * className, the error UI, the button labels — is carried over unchanged.
 */
import React, { useState, useRef } from 'react';
import { api } from '@/lib/api';
import { uploadFile } from '@/lib/upload-client';

interface ResourceUploaderProps {
  moduleId: string;
  courseId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ResourceUploader: React.FC<ResourceUploaderProps> = ({
  moduleId,
  courseId,
  onClose,
  onSuccess,
}) => {
  // `courseId` stays in the props contract (CourseBuilder passes it), but the
  // only readers were the tus metadata and the never-sent FormData. The
  // presigned route derives the tenant/course prefix from the session instead.
  void courseId;
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'Video' | 'PDF' | 'PPT' | 'SCORM' | 'Text'>('Video');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Replaces the source's `uploadRef` (a tus.Upload handle). The presigned PUT
  // cannot be aborted, so Cancel instead marks the run as abandoned and the
  // resolved upload is ignored.
  const cancelledRef = useRef(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file size (5GB max)
      if (selectedFile.size > 5 * 1024 * 1024 * 1024) {
        setError('File size exceeds 5GB limit');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setError('Please provide a title and select a file');
      return;
    }

    cancelledRef.current = false;
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Upload the bytes and get the permanent URL back.
      const fileUrl = await uploadFile(file, '/upload/course-resource');

      // The user hit Cancel while the bytes were in flight — the object may
      // exist in S3, but do not create the lesson or report success.
      if (cancelledRef.current) return;

      // Create lesson record
      try {
        await api.post('/courses/lessons', {
          moduleId,
          title,
          type,
          contentUrl: fileUrl,
          orderIndex: 0, // Will be updated by backend
        });

        setUploading(false);
        setProgress(100);
        onSuccess();
      } catch (error: unknown) {
        setError((error as { message?: string })?.message || 'Failed to create lesson');
        setUploading(false);
      }
    } catch (error: unknown) {
      if (cancelledRef.current) return;
      console.error('Upload failed:', error);
      setError((error as { message?: string })?.message || 'Upload failed');
      setUploading(false);
    }
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setUploading(false);
    setProgress(0);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Upload Resource</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label-field">
                Lesson Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field"
                placeholder="Enter lesson title"
                disabled={uploading}
              />
            </div>

            <div>
              <label className="label-field">
                Resource Type <span className="text-red-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'Video' | 'PDF' | 'PPT' | 'SCORM' | 'Text')}
                className="input-field"
                disabled={uploading}
              >
                <option value="Video">Video (MP4)</option>
                <option value="PDF">PDF</option>
                <option value="PPT">PowerPoint</option>
                <option value="SCORM">SCORM Package</option>
                <option value="Text">Text Content</option>
              </select>
            </div>

            <div>
              <label className="label-field">
                File <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                onChange={handleFileSelect}
                className="input-field"
                accept={
                  type === 'Video'
                    ? 'video/*'
                    : type === 'PDF'
                    ? 'application/pdf'
                    : type === 'PPT'
                    ? 'application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'
                    : type === 'SCORM'
                    ? 'application/zip'
                    : '*'
                }
                disabled={uploading}
              />
              {file && (
                <p className="text-sm text-gray-500 mt-1">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Uploading...</span>
                  <span className="text-gray-900 font-medium">{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                onClick={uploading ? handleCancel : handleUpload}
                disabled={!file || !title.trim()}
                className="btn-primary flex-1"
              >
                {uploading ? 'Cancel Upload' : 'Upload & Create Lesson'}
              </button>
              <button onClick={onClose} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceUploader;
