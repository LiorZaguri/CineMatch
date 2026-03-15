import {S3Client,PutObjectCommand,DeleteObjectCommand,HeadBucketCommand,CreateBucketCommand,PutBucketPolicyCommand,} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getS3Config() {
  return {
    internalEndpoint: requireEnv("S3_INTERNAL_ENDPOINT_URL"),
    publicEndpoint: requireEnv("S3_PUBLIC_ENDPOINT_URL"),
    region: requireEnv("S3_REGION"),
    bucketName: requireEnv("S3_BUCKET_NAME"),
    accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
  };
}

function createS3Client(endpoint: string) {
  const s3Config = getS3Config();

  return new S3Client({
    region: s3Config.region,
    endpoint,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

function getInternalS3Client() {
  const s3Config = getS3Config();
  return createS3Client(s3Config.internalEndpoint);
}

function getPublicS3Client() {
  const s3Config = getS3Config();
  return createS3Client(s3Config.publicEndpoint);
}

function getExtensionFromContentType(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error("Unsupported content type");
  }
}

function buildPublicReadBucketPolicy(bucketName: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucketName}/*`],
      },
    ],
  });
}

async function ensureAvatarBucketIsPublic() {
  const s3Config = getS3Config();
  const s3Client = getInternalS3Client();

  await s3Client.send(
    new PutBucketPolicyCommand({
      Bucket: s3Config.bucketName,
      Policy: buildPublicReadBucketPolicy(s3Config.bucketName),
    }),
  );
}

export function validateAvatarContentType(contentType: string) {
  if (!allowedContentTypes.has(contentType)) {
    throw new Error("Unsupported avatar content type");
  }
}

export function buildAvatarFileKey(userId: string, contentType: string): string {
  const ext = getExtensionFromContentType(contentType);
  return `avatars/${userId}/${crypto.randomUUID()}.${ext}`;
}

export function buildPublicFileUrl(fileKey: string): string {
  const s3Config = getS3Config();
  return `${s3Config.publicEndpoint}/${s3Config.bucketName}/${fileKey}`;
}

export async function ensureAvatarBucketExists() {
  const s3Config = getS3Config();
  const s3Client = getInternalS3Client();

  try {
    await s3Client.send(
      new HeadBucketCommand({
        Bucket: s3Config.bucketName,
      }),
    );
  } catch (error: any) {
    const statusCode = error?.$metadata?.httpStatusCode;
    const errorName = error?.name;

    if (statusCode !== 404 && errorName !== "NotFound" && errorName !== "NoSuchBucket") {
      throw error;
    }

    await s3Client.send(
      new CreateBucketCommand({
        Bucket: s3Config.bucketName,
      }),
    );
  }

  await ensureAvatarBucketIsPublic();
}

export async function createAvatarUploadUrl(userId: string, contentType: string) {
  validateAvatarContentType(contentType);

  const s3Config = getS3Config();
  const s3Client = getPublicS3Client();
  const fileKey = buildAvatarFileKey(userId, contentType);

  const command = new PutObjectCommand({
    Bucket: s3Config.bucketName,
    Key: fileKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return {
    uploadUrl,
    fileKey,
    publicUrl: buildPublicFileUrl(fileKey),
  };
}

export async function deleteObject(fileKey: string) {
  const s3Config = getS3Config();
  const s3Client = getInternalS3Client();

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Config.bucketName,
      Key: fileKey,
    }),
  );
}
