import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import pMap from 'p-map';

import s3 from '../cdnWorkflow/s3';

interface UploadConfig {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  keyPrefix: string;
  publicDomain: string;
  region: string;
  secretAccessKey: string;
}

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

async function clearPrefix(client: S3Client, bucket: string, prefix: string) {
  let continuationToken: string | undefined;
  let totalDeleted = 0;

  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        Prefix: prefix,
      }),
    );

    const keys = list.Contents?.map((obj) => obj.Key!).filter(Boolean);
    if (keys && keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );
      totalDeleted += keys.length;
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`Deleted ${totalDeleted} old objects under ${prefix}`);
}

export async function uploadAssets(assetsDir: string, config: UploadConfig) {
  const files = collectFiles(assetsDir);
  console.log(`Found ${files.length} files to upload`);

  const client = s3.createS3Client({
    accessKeyId: config.accessKeyId,
    bucketName: config.bucket,
    endpoint: config.endpoint,
    pathPrefix: '',
    region: config.region,
    secretAccessKey: config.secretAccessKey,
  });

  // Clean old assets before uploading
  const assetsPrefix = `${config.keyPrefix}/assets/`;
  console.log(`Clearing old objects under ${assetsPrefix}...`);
  await clearPrefix(client, config.bucket, assetsPrefix);

  const results = await pMap(
    files,
    async (filePath) => {
      const relativePath = filePath.slice(assetsDir.length + 1);
      const key = `${config.keyPrefix}/assets/${relativePath}`;
      const buffer = readFileSync(filePath);
      const fileName = basename(filePath);
      const ext = extname(filePath);

      console.log(`Uploading ${key}...`);

      const result = await s3.createUploadTask({
        acl: 'public-read',
        bucketName: config.bucket,
        client,
        item: { buffer, extname: ext, fileName },
        path: key,
        urlPrefix: config.publicDomain,
      });

      console.log(`Uploaded ${key} -> ${result.url}`);
      return result;
    },
    { concurrency: 10 },
  );

  console.log(`Successfully uploaded ${results.length} files`);
  return results;
}
