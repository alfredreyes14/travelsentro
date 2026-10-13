import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * The private documents bucket (B2B contracts and the like). Unlike
 * lib/storage/r2-client.ts's media bucket it has no public URL: files go
 * in and come out only through short-lived presigned URLs handed out
 * after a session check. Server-only by use (it reads the R2 secret), but
 * deliberately not marked `server-only` so scripts/verify-r2-private.ts
 * can import it.
 */
const URL_TTL_SECONDS = 300;

function getClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // By default the SDK adds a CRC32 checksum to every upload. On a
    // presigned URL that becomes a signed parameter a plain browser PUT
    // cannot satisfy, and R2 rejects the upload.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function privateBucket(): string {
  const name = process.env.R2_PRIVATE_BUCKET_NAME;
  if (!name) throw new Error("R2_PRIVATE_BUCKET_NAME is not set");
  // A copy-paste slip here would publish contracts on the CDN.
  if (name === process.env.R2_BUCKET_NAME) {
    throw new Error("R2_PRIVATE_BUCKET_NAME must not be the public media bucket");
  }
  return name;
}

/** A URL the browser can PUT one file to, valid for 5 minutes. */
export async function presignUpload(
  key: string,
  contentType: string
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: privateBucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: URL_TTL_SECONDS }
  );
}

/** A URL that serves one file, valid for 5 minutes. */
export async function presignDownload(
  key: string,
  disposition: string,
  contentType: string
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: privateBucket(),
      Key: key,
      ResponseContentDisposition: disposition,
      ResponseContentType: contentType,
    }),
    { expiresIn: URL_TTL_SECONDS }
  );
}

/** The stored object's real size and type, or null if it does not exist. */
export async function headObject(
  key: string
): Promise<{ size: number; contentType: string } | null> {
  try {
    const result = await getClient().send(
      new HeadObjectCommand({ Bucket: privateBucket(), Key: key })
    );
    return {
      size: result.ContentLength ?? 0,
      contentType: result.ContentType ?? "",
    };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

export async function deletePrivateObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: privateBucket(), Key: key })
  );
}
