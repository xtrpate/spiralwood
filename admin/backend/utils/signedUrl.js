// utils/signedUrl.js
// Generates short-lived, tamper-proof URLs for sensitive uploaded files.
const crypto = require("crypto");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const AUTHENTICATED_REFERENCE_PREFIX = "cloudinary-auth:";
const ALLOWED_AUTHENTICATED_PUBLIC_ID_PREFIXES = [
  "wisdom_uploads/warranty/",
  "wisdom_uploads/warranty-replacements/",
];
const ALLOWED_RESOURCE_TYPES = new Set(["image", "raw", "video"]);

const isCloudinaryConfigured = () =>
  Boolean(
    String(process.env.CLOUDINARY_CLOUD_NAME || "").trim() &&
      String(process.env.CLOUDINARY_API_KEY || "").trim() &&
      String(process.env.CLOUDINARY_API_SECRET || "").trim(),
  );

// Normalizes any path format ("uploads/x", "/uploads/x", "x") into the
// same canonical form Express uses internally when the static middleware
// is mounted at "/uploads" (i.e. the "uploads" segment gets stripped off).
function normalizePath(relativePath) {
  let p = String(relativePath || "").trim().replace(/\\/g, "/");
  p = p.replace(/^\/?uploads\//i, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

function sign(filePath, expiresAt) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${filePath}:${expiresAt}`)
    .digest("hex");
}

function parseAuthenticatedCloudReference(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith(AUTHENTICATED_REFERENCE_PREFIX)) return null;

  const encoded = raw.slice(AUTHENTICATED_REFERENCE_PREFIX.length);
  if (!encoded || encoded.length > 4096) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const publicId = String(payload?.public_id || "").trim();
  const resourceType = String(payload?.resource_type || "image")
    .trim()
    .toLowerCase();
  const format = String(payload?.format || "")
    .trim()
    .toLowerCase();

  const hasAllowedPrefix = ALLOWED_AUTHENTICATED_PUBLIC_ID_PREFIXES.some(
    (prefix) => publicId.startsWith(prefix),
  );

  if (
    Number(payload?.v) !== 1 ||
    !hasAllowedPrefix ||
    publicId.length > 1024 ||
    !ALLOWED_RESOURCE_TYPES.has(resourceType) ||
    !/^[a-z0-9]{1,20}$/.test(format)
  ) {
    return null;
  }

  return {
    publicId,
    resourceType,
    format,
  };
}

function signAuthenticatedCloudReference(reference) {
  const parsed = parseAuthenticatedCloudReference(reference);
  if (!parsed || !isCloudinaryConfigured()) return null;

  const expiresAt = Math.floor((Date.now() + EXPIRY_MS) / 1000);

  try {
    return cloudinary.utils.private_download_url(
      parsed.publicId,
      parsed.format,
      {
        resource_type: parsed.resourceType,
        type: "authenticated",
        expires_at: expiresAt,
        attachment: false,
      },
    );
  } catch (error) {
    console.error(
      "[signedUrl] Failed to sign authenticated cloud asset:",
      error?.message || error,
    );
    return null;
  }
}

// Turns a stored path like "uploads/warranty/xxx.jpg" into a signed URL,
// e.g. "uploads/warranty/xxx.jpg?exp=1234567890&sig=abcd1234...".
// Authenticated Cloudinary references are instead converted into a
// short-lived provider-signed download URL without exposing the API secret.
exports.signUploadPath = (relativePath) => {
  if (!relativePath) return relativePath;

  const raw = String(relativePath).trim();
  if (raw.startsWith(AUTHENTICATED_REFERENCE_PREFIX)) {
    return signAuthenticatedCloudReference(raw);
  }

  const normalized = normalizePath(raw);
  const expiresAt = Date.now() + EXPIRY_MS;
  const token = sign(normalized, expiresAt);
  const separator = raw.includes("?") ? "&" : "?";
  return `${raw}${separator}exp=${expiresAt}&sig=${token}`;
};

exports.verifyUploadSignature = (relativePath, exp, sig) => {
  if (!exp || !sig) return false;
  if (Date.now() > Number(exp)) return false; // expired link

  const normalized = normalizePath(relativePath);
  const expected = sign(normalized, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};
