// S3 media helpers. Every key is scoped under businesses/<business_id>/.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

const s3 = new S3Client({ region: config.region });

export function businessKey(businessId: string, ...parts: string[]): string {
  if (!businessId) throw new Error("business_id is required");
  return ["businesses", businessId, ...parts].join("/");
}

/** Throws if a key does not belong to the business (tenant guard). */
export function assertOwnedKey(businessId: string, key: string): void {
  if (!key.startsWith(`businesses/${businessId}/`)) {
    throw new Error(`S3 key ${key} does not belong to business ${businessId}`);
  }
}

export async function putMedia(
  businessId: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  assertOwnedKey(businessId, key);
  await s3.send(
    new PutObjectCommand({ Bucket: config.mediaBucket, Key: key, Body: body, ContentType: contentType }),
  );
  return key;
}

export async function getMedia(businessId: string, key: string): Promise<Buffer> {
  assertOwnedKey(businessId, key);
  const res = await s3.send(new GetObjectCommand({ Bucket: config.mediaBucket, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

/** Short-lived public link, e.g. so Make/Meta can download an image. */
export async function presignedGetUrl(businessId: string, key: string, expiresIn = 3600): Promise<string> {
  assertOwnedKey(businessId, key);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.mediaBucket, Key: key }), { expiresIn });
}
