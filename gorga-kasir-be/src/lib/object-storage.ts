import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "crypto";

import { env } from "./env";

let s3Client: S3Client | null = null;

function getClient() {
  if (!env.s3Endpoint || !env.s3AccessKeyId || !env.s3SecretAccessKey || !env.s3Bucket) {
    return null;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: env.s3Region,
      endpoint: env.s3Endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.s3AccessKeyId,
        secretAccessKey: env.s3SecretAccessKey
      }
    });
  }

  return s3Client;
}

export function isObjectStorageConfigured() {
  return Boolean(env.s3Endpoint && env.s3AccessKeyId && env.s3SecretAccessKey && env.s3Bucket && env.s3PublicBaseUrl);
}

export async function uploadProfileImage(options: {
  userId: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const client = getClient();
  if (!client || !env.s3Bucket || !env.s3PublicBaseUrl) {
    throw new Error("OBJECT_STORAGE_NOT_CONFIGURED");
  }

  const extension = options.mimeType.includes("png") ? "png" : options.mimeType.includes("webp") ? "webp" : "jpg";
  const key = `profiles/${options.userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  await client.send(new PutObjectCommand({
    Bucket: env.s3Bucket,
    Key: key,
    Body: options.bytes,
    ContentType: options.mimeType,
    ACL: "public-read"
  }));

  const baseUrl = env.s3PublicBaseUrl.replace(/\/$/, "");
  return `${baseUrl}/${key}`;
}
