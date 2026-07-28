/**
 * TUS resumable upload server (@tus/server). Uploads land in S3 when AWS is
 * configured, otherwise a local ./tus-uploads dir for dev. Mounted at /uploads.
 * Large media never passes through the Next.js API — clients upload here or via
 * S3 presigned PUT.
 */
import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { S3Store } from '@tus/s3-store';
import { env } from './env.js';

function buildStore() {
  if (env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID) {
    return new S3Store({
      partSize: 8 * 1024 * 1024,
      s3ClientConfig: {
        bucket: env.AWS_S3_BUCKET,
        region: env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      },
    });
  }
  return new FileStore({ directory: './tus-uploads' });
}

export const tusServer = new Server({
  path: '/uploads',
  datastore: buildStore(),
  maxSize: 150 * 1024 * 1024, // 150 MB cap
});
