const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const backendRoot = path.join(__dirname, "..");

const getUploadsRoot = () => {
  const configured = String(process.env.UPLOAD_DIR || "").trim();

  if (!configured) {
    return path.join(backendRoot, "uploads");
  }

  return path.isAbsolute(configured)
    ? configured
    : path.join(backendRoot, configured);
};

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

const uploadCloudinaryBuffer = async ({ file, folder }) =>
  new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: `wisdom_uploads/${folder}`,
        resource_type: "auto",
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.secure_url || !result?.public_id) {
          reject(new Error("Cloud upload did not return a valid file URL."));
          return;
        }

        resolve({
          storage: "cloudinary",
          file_url: result.secure_url,
          file_name: safeFilename(file.originalname || file.filename || result.public_id),
          mime_type: String(file.mimetype || "").trim() || null,
          file_size: Number(result.bytes || file.size || 0) || null,
          public_id: result.public_id,
          resource_type: result.resource_type || "image",
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
    local_path: absolutePath,
  };
};

exports.storeUploadBuffer = async ({ file, folder }) => {
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

  let cloudError = null;

  if (isCloudinaryConfigured()) {
    try {
      return await uploadCloudinaryBuffer({
        file,
        folder: cleanFolder,
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
      invalidate: true,
    });
  }
};
