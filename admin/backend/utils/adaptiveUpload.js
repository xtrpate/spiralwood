const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { v2: cloudinary } = require("cloudinary");
const { getUploadsRoot } = require("./uploadRoot");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const AUTHENTICATED_REFERENCE_PREFIX = "cloudinary-auth:";
const ALLOWED_CLOUDINARY_DELIVERY_TYPES = new Set(["upload", "authenticated"]);

const isCloudinaryConfigured = () =>
  Boolean(
    String(process.env.CLOUDINARY_CLOUD_NAME || "").trim() &&
      String(process.env.CLOUDINARY_API_KEY || "").trim() &&
      String(process.env.CLOUDINARY_API_SECRET || "").trim(),
  );

const allowLocalFallback = () => {
  if (
    String(process.env.ALLOW_LOCAL_UPLOAD_FALLBACK || "")
      .trim()
      .toLowerCase() === "true"
  ) {
    return true;
  }

  return String(process.env.NODE_ENV || "development").toLowerCase() !== "production";
};

const safeFolder = (value) =>
  String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean)
    .join("/");

const safeFilename = (value = "attachment") => {
  const original = String(value || "attachment").trim();
  const ext = path.extname(original).toLowerCase();
  const base = path
    .basename(original, ext)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 80);

  return `${base || "attachment"}${ext}`;
};

const normalizeDeliveryType = (value) => {
  const normalized = String(value || "upload")
    .trim()
    .toLowerCase();

  if (!ALLOWED_CLOUDINARY_DELIVERY_TYPES.has(normalized)) {
    const error = new Error("Unsupported cloud delivery type.");
    error.status = 500;
    throw error;
  }

  return normalized;
};

const deriveFormat = (result, file) => {
  const fromResult = String(result?.format || "")
    .trim()
    .toLowerCase();
  if (fromResult) return fromResult;

  return path
    .extname(String(file?.originalname || file?.filename || ""))
    .replace(/^\./, "")
    .trim()
    .toLowerCase();
};

const buildAuthenticatedCloudReference = ({
  publicId,
  resourceType,
  format,
}) => {
  const payload = {
    v: 1,
    public_id: String(publicId || "").trim(),
    resource_type: String(resourceType || "image")
      .trim()
      .toLowerCase(),
    format: String(format || "")
      .trim()
      .toLowerCase(),
  };

  if (!payload.public_id || !payload.format) {
    throw new Error("Authenticated cloud upload metadata is incomplete.");
  }

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${AUTHENTICATED_REFERENCE_PREFIX}${encoded}`;
};

const uploadCloudinaryBuffer = async ({ file, folder, deliveryType }) =>
  new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: `wisdom_uploads/${folder}`,
        resource_type: "auto",
        type: deliveryType,
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.public_id) {
          reject(new Error("Cloud upload did not return a valid asset ID."));
          return;
        }

        const effectiveDeliveryType = String(
          result.type || deliveryType || "upload",
        )
          .trim()
          .toLowerCase();
        const resourceType = String(result.resource_type || "image")
          .trim()
          .toLowerCase();
        const format = deriveFormat(result, file);

        let storedFileUrl = result.secure_url || null;
        if (effectiveDeliveryType === "authenticated") {
          try {
            storedFileUrl = buildAuthenticatedCloudReference({
              publicId: result.public_id,
              resourceType,
              format,
            });
          } catch (referenceErr) {
            reject(referenceErr);
            return;
          }
        } else if (!storedFileUrl) {
          reject(new Error("Cloud upload did not return a valid file URL."));
          return;
        }

        resolve({
          storage: "cloudinary",
          file_url: storedFileUrl,
          file_name: safeFilename(
            file.originalname || file.filename || result.public_id,
          ),
          mime_type: String(file.mimetype || "").trim() || null,
          file_size: Number(result.bytes || file.size || 0) || null,
          public_id: result.public_id,
          resource_type: resourceType,
          delivery_type: effectiveDeliveryType,
          format: format || null,
          local_path: null,
        });
      },
    );

    upload.end(file.buffer);
  });

const saveLocalBuffer = async ({ file, folder }) => {
  const uploadsRoot = getUploadsRoot();
  const absoluteDir = path.join(uploadsRoot, ...folder.split("/"));
  await fs.promises.mkdir(absoluteDir, { recursive: true });

  const original = safeFilename(file.originalname || file.filename || "attachment");
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, ext).slice(0, 60) || "attachment";
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const filename = `${unique}-${base}${ext}`;
  const absolutePath = path.join(absoluteDir, filename);

  await fs.promises.writeFile(absolutePath, file.buffer);

  return {
    storage: "local",
    file_url: `/uploads/${folder}/${filename}`,
    file_name: original,
    mime_type: String(file.mimetype || "").trim() || null,
    file_size: Number(file.size || file.buffer?.length || 0) || null,
    public_id: null,
    resource_type: null,
    delivery_type: "local",
    format: ext.replace(/^\./, "") || null,
    local_path: absolutePath,
  };
};

exports.storeUploadBuffer = async ({
  file,
  folder,
  deliveryType = "upload",
  requireCloud = false,
}) => {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    const error = new Error("The selected upload is empty.");
    error.status = 400;
    throw error;
  }

  const cleanFolder = safeFolder(folder);
  if (!cleanFolder) {
    const error = new Error("Upload destination is invalid.");
    error.status = 500;
    throw error;
  }

  const cleanDeliveryType = normalizeDeliveryType(deliveryType);
  let cloudError = null;

  if (isCloudinaryConfigured()) {
    try {
      return await uploadCloudinaryBuffer({
        file,
        folder: cleanFolder,
        deliveryType: cleanDeliveryType,
      });
    } catch (err) {
      cloudError = err;
      console.error(
        `[adaptiveUpload] Cloudinary upload failed for ${cleanFolder}:`,
        err?.message || err,
      );
    }
  } else {
    cloudError = new Error("Cloudinary credentials are not configured.");
    console.warn(
      `[adaptiveUpload] Cloudinary is unavailable for ${cleanFolder}; checking local fallback.`,
    );
  }

  if (requireCloud) {
    const error = new Error(
      "Durable cloud upload is unavailable. Check the server upload configuration.",
    );
    error.status = 502;
    error.cause = cloudError;
    throw error;
  }

  if (allowLocalFallback()) {
    try {
      const local = await saveLocalBuffer({
        file,
        folder: cleanFolder,
      });

      console.warn(
        `[adaptiveUpload] Using protected local upload fallback for ${cleanFolder} in ${process.env.NODE_ENV || "development"}.`,
      );

      return local;
    } catch (localErr) {
      const error = new Error(
        "The file could not be saved to Cloudinary or local development storage.",
      );
      error.status = 500;
      error.cause = localErr;
      throw error;
    }
  }

  const error = new Error(
    cloudError?.message ||
      "Cloud upload is unavailable. Check the server upload configuration.",
  );
  error.status = 502;
  throw error;
};

exports.cleanupStoredUpload = async (asset = {}) => {
  if (!asset) return;

  if (asset.storage === "local" && asset.local_path) {
    try {
      await fs.promises.unlink(asset.local_path);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    return;
  }

  if (asset.storage === "cloudinary" && asset.public_id) {
    await cloudinary.uploader.destroy(asset.public_id, {
      resource_type: asset.resource_type || "image",
      type: asset.delivery_type || "upload",
      invalidate: true,
    });
  }
};
