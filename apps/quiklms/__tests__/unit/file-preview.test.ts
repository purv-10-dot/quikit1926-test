/**
 * The type detection behind the in-app file preview.
 *
 * Every URL these functions see is a PRESIGNED one — that is the only kind the
 * read paths hand out, because the bucket is private. So a signature query string
 * is the normal case, not an edge case, and it is exactly what a naive
 * `split('.').pop()` trips over: the last dot in
 * `…/a.pdf?X-Goog-Algorithm=GOOG4-RSA-SHA256&…` is not the file extension, so
 * every file would be classified `other` and the preview would degrade to a
 * download link for PDFs it can render perfectly well.
 */
import { describe, it, expect } from 'vitest';
import { extensionOf, fileNameOf, kindOf } from '@/lib/utils/file-kind';

const BASE = 'https://storage.googleapis.com/quikit-bucket/tenants/org-1/homework/1700000000000-report.pdf';
const SIGNED = `${BASE}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=deadbeef`;

describe('extensionOf', () => {
  it('reads the extension through a GCS signature query string', () => {
    expect(extensionOf(SIGNED)).toBe('pdf');
  });

  it('reads it through a legacy AWS signature and a fragment', () => {
    expect(extensionOf(`${BASE}?X-Amz-Signature=old`)).toBe('pdf');
    expect(extensionOf(`${BASE}#page=2`)).toBe('pdf');
  });

  it('is case-insensitive', () => {
    expect(extensionOf('https://x/y/PHOTO.JPG')).toBe('jpg');
  });

  it('returns an empty string for an extensionless object', () => {
    expect(extensionOf('https://x/y/attachment')).toBe('attachment');
    expect(extensionOf('https://x/y/')).toBe('');
  });
});

describe('kindOf', () => {
  const cases: [string, string][] = [
    ['report.pdf', 'pdf'],
    ['scan.PNG', 'image'],
    ['photo.jpeg', 'image'],
    ['diagram.webp', 'image'],
    ['answer.mp4', 'video'],
    ['reading.mov', 'video'],
    ['recital.mp3', 'audio'],
    ['notes.docx', 'other'],
    ['sheet.xlsx', 'other'],
    ['bundle.zip', 'other'],
  ];

  for (const [file, expected] of cases) {
    it(`classifies ${file} as ${expected}`, () => {
      expect(kindOf(`https://storage.googleapis.com/b/k/1700000000000-${file}?X-Goog-Signature=x`)).toBe(expected);
    });
  }
});

describe('fileNameOf', () => {
  it('drops the Date.now() key prefix the upload adds', () => {
    // `buildPrefixedKey` writes `${Date.now()}-${safeName}`, so the raw object
    // name is unreadable without this.
    expect(fileNameOf(SIGNED)).toBe('report.pdf');
  });

  it('decodes a percent-encoded name', () => {
    expect(fileNameOf('https://storage.googleapis.com/b/k/1700000000000-my%20report.pdf')).toBe('my report.pdf');
  });

  it('falls back rather than returning an empty label', () => {
    expect(fileNameOf('not a url', 'Attachment 1')).toBe('Attachment 1');
    expect(fileNameOf('', 'Attachment 1')).toBe('Attachment 1');
  });
});
