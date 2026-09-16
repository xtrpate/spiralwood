// services/r2BackupStorageService.js
// Private Cloudflare R2 storage adapter for compressed database backups.
const fs = require("fs");
const path = require("path");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const R2_STORAGE_PREFIX = "r2://";
const DEFAULT_R2_BACKUP_PREFIX = "wisdom/database-backups";

let cachedClient = null;
let cachedClientKey = null;

function getBackupStorageMode() {
  const mode = String(process.env.BACKUP_STORAGE_MODE || "local")
    .trim()
    .toLowerCase();

  if (!new Set(["local", "r2"]).has(mode)) {
    throw new Error(
      "BACKUP_STORAGE_MODE must be either 'local' or 'r2'.",
    );
  }

  return mode;
}

function isR2BackupStorageEnabled() {
  return getBackupStorageMode() === "r2";
}

function normalizePrefix(value) {
  return String(value || DEFAULT_R2_BACKUP_PREFIX)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

function getR2Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(
    process.env.R2_SECRET_ACCESS_KEY || "",
  ).trim();
  const bucket = String(process.env.R2_BUCKET || "").trim();
  const endpointOverride = String(process.env.R2_ENDPOINT || "").trim();
  const prefix = normalizePrefix(process.env.R2_BACKUP_PREFIX);

  const missing = [];
  if (!accountId && !endpointOverride) missing.push("R2_ACCOUNT_ID or R2_ENDPOINT");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("R2_BUCKET");

  if (missing.length > 0) {
    throw new Error(
      `R2 backup storage is enabled but these settings are missing: ${missing.join(
        ", ",
      )}.`,
    );
  }

  const endpoint =
    endpointOverride || `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    prefix,
  };
}

function getR2Client() {
  const config = getR2Config();
  const cacheKey = [
    config.endpoint,
    config.accessKeyId,
    config.bucket,
  ].join("|");

  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedClientKey = cacheKey;
  }

  return { client: cachedClient, config };
}

function buildObjectKey(fileName, prefix) {
  const safeFileName = path.basename(String(fileName || ""));
  if (!safeFileName) {
    throw new Error("Backup filename is required for R2 upload.");
  }

  const normalizedPrefix = normalizePrefix(prefix);
  return normalizedPrefix
    ? `${normalizedPrefix}/${safeFileName}`
    : safeFileName;
}

function buildR2StoragePath(bucket, key) {
  return `${R2_STORAGE_PREFIX}${bucket}/${key}`;
}

function isR2StoragePath(value) {
  return String(value || "").startsWith(R2_STORAGE_PREFIX);
}

function parseR2StoragePath(value) {
  const raw = String(value || "");
  if (!isR2StoragePath(raw)) {
    throw new Error("Backup storage path is not an R2 object reference.");
  }

  const withoutPrefix = raw.slice(R2_STORAGE_PREFIX.length);
  const slashIndex = withoutPrefix.indexOf("/");

  if (slashIndex <= 0 || slashIndex === withoutPrefix.length - 1) {
    throw new Error("Backup R2 storage path is invalid.");
  }

  return {
    bucket: withoutPrefix.slice(0, slashIndex),
    key: withoutPrefix.slice(slashIndex + 1),
  };
}

async function uploadBackupFileToR2({ filePath, fileName }) {
  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error("Compressed backup file is empty or unavailable.");
  }

  const { client, config } = getR2Client();
  const key = buildObjectKey(fileName, config.prefix);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentLength: stats.size,
      ContentType: "application/gzip",
      ContentDisposition: `attachment; filename="${path.basename(fileName)}"`,
      CacheControl: "no-store",
      Metadata: {
        source: "wisdom-database-backup",
        compression: "gzip",
      },
    }),
  );

  return {
    bucket: config.bucket,
    key,
    sizeBytes: stats.size,
    storagePath: buildR2StoragePath(config.bucket, key),
  };
}

async function getR2BackupObject(storagePath) {
  const { bucket, key } = parseR2StoragePath(storagePath);
  const { client } = getR2Client();

  return client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

module.exports = {
  getBackupStorageMode,
  isR2BackupStorageEnabled,
  isR2StoragePath,
  uploadBackupFileToR2,
  getR2BackupObject,
};
