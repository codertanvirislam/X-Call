import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

function getClient() {
  if (!env.s3.accessKey || !env.s3.secretKey) {
    throw new Error("S3 is not configured");
  }

  return new S3Client({
    region: env.s3.region,
    endpoint: env.s3.endpoint,
    forcePathStyle: env.s3.forcePathStyle,
    credentials: {
      accessKeyId: env.s3.accessKey,
      secretAccessKey: env.s3.secretKey,
    },
  });
}

export const ALLOWED_KYC_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const MAX_KYC_BYTES = 5 * 1024 * 1024;

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

export async function uploadKycFile(opts: {
  userId: string;
  side: "front" | "back";
  mimeType: string;
  body: Buffer;
}): Promise<string> {
  if (!ALLOWED_KYC_MIME.has(opts.mimeType)) {
    throw new Error("Unsupported file type");
  }
  if (opts.body.byteLength > MAX_KYC_BYTES) {
    throw new Error("File too large (max 5MB)");
  }

  const key = `kyc/${opts.userId}/nid-${opts.side}-${Date.now()}.${extFromMime(opts.mimeType)}`;
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: opts.body,
      ContentType: opts.mimeType,
    }),
  );

  return key;
}

export async function getKycSignedUrl(key: string, expiresIn = 600): Promise<string> {
  const client = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
    }),
    { expiresIn },
  );
}
