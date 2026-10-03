"use strict";

const AUTHENTICATED_REFERENCE_PREFIX = "cloudinary-auth:";
const WARRANTY_RECONCILIATION_GRACE_HOURS = 24;
const WARRANTY_RECONCILIATION_GRACE_MS =
  WARRANTY_RECONCILIATION_GRACE_HOURS * 60 * 60 * 1000;
const CLOUDINARY_PAGE_SIZE = 500;
const MAX_CLOUDINARY_PAGES_PER_RESOURCE_TYPE = 100;
const MAX_DELETE_PER_RUN = 100;
const ALLOWED_RESOURCE_TYPES = new Set(["image", "raw", "video"]);

const ASSET_SCOPES = Object.freeze([
  Object.freeze({
    name: "customer_evidence",
    publicIdPrefix: "wisdom_uploads/warranty/",
    deliveryType: "authenticated",
  }),
  Object.freeze({
    name: "replacement_receipts",
    publicIdPrefix: "wisdom_uploads/warranty-replacements/",
    deliveryType: "upload",
  }),
]);

const safeText = (value, maxLength = 180) => {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
};

const normalizeResourceType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeDeliveryType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const buildAssetKey = ({ deliveryType, resourceType, publicId }) =>
  `${normalizeDeliveryType(deliveryType)}:${normalizeResourceType(resourceType)}:${String(
    publicId || "",
  ).trim()}`;

const findManagedScope = ({ publicId, deliveryType }) => {
  const normalizedPublicId = String(publicId || "").trim();
  const normalizedDeliveryType = normalizeDeliveryType(deliveryType);

  return (
    ASSET_SCOPES.find(
      (scope) =>
        scope.deliveryType === normalizedDeliveryType &&
        normalizedPublicId.startsWith(scope.publicIdPrefix),
    ) || null
  );
};

const parseAuthenticatedReference = (value) => {
  const raw = String(value || "").trim();
  if (!raw.startsWith(AUTHENTICATED_REFERENCE_PREFIX)) return null;

  const encoded = raw.slice(AUTHENTICATED_REFERENCE_PREFIX.length);
  if (!encoded || encoded.length > 4096) {
    return { error: "Authenticated Cloudinary reference payload is invalid." };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { error: "Authenticated Cloudinary reference cannot be decoded." };
  }

  const publicId = String(payload?.public_id || "").trim();
  const resourceType = normalizeResourceType(payload?.resource_type || "image");
  const format = String(payload?.format || "")
    .trim()
    .toLowerCase();

  if (
    Number(payload?.v) !== 1 ||
    !publicId ||
    publicId.length > 1024 ||
    !ALLOWED_RESOURCE_TYPES.has(resourceType) ||
    !/^[a-z0-9]{1,20}$/.test(format)
  ) {
    return { error: "Authenticated Cloudinary reference metadata is invalid." };
  }

  const scope = findManagedScope({
    publicId,
    deliveryType: "authenticated",
  });
  if (!scope) {
    return {
      error:
        "Authenticated Cloudinary reference points outside the managed Warranty evidence scope.",
    };
  }

  return {
    kind: "cloud",
    scope: scope.name,
    deliveryType: "authenticated",
    resourceType,
    publicId,
    key: buildAssetKey({
      deliveryType: "authenticated",
      resourceType,
      publicId,
    }),
  };
};

const parseManagedCloudinaryUploadUrl = (value, cloudName) => {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: "Stored cloud URL is invalid." };
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "res.cloudinary.com") {
    return null;
  }

  let parts;
  try {
    parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  } catch {
    return { error: "Stored Cloudinary URL path cannot be decoded safely." };
  }

  if (parts.length < 6) {
    return { error: "Stored Cloudinary URL does not match the expected direct asset URL shape." };
  }

  const [urlCloudName, resourceTypeRaw, deliveryTypeRaw, version, ...assetParts] = parts;
  const resourceType = normalizeResourceType(resourceTypeRaw);
  const deliveryType = normalizeDeliveryType(deliveryTypeRaw);

  if (urlCloudName !== cloudName) {
    return { error: "Stored Cloudinary URL belongs to a different cloud name." };
  }
  if (!ALLOWED_RESOURCE_TYPES.has(resourceType)) {
    return { error: "Stored Cloudinary URL has an unsupported resource type." };
  }
  if (deliveryType !== "upload") {
    return { error: "Stored Cloudinary URL has an unsupported delivery type." };
  }
  if (!/^v\d+$/.test(version)) {
    return {
      error:
        "Stored Cloudinary URL is not a direct versioned upload URL; refusing to guess its public ID.",
    };
  }
  if (!assetParts.length || assetParts.some((part) => !part || part === "." || part === "..")) {
    return { error: "Stored Cloudinary URL has an invalid asset path." };
  }

  let publicId;
  if (resourceType === "raw") {
    publicId = assetParts.join("/");
  } else {
    const filename = assetParts[assetParts.length - 1];
    const dot = filename.lastIndexOf(".");
    if (dot <= 0 || dot === filename.length - 1) {
      return {
        error:
          "Stored Cloudinary image/video URL is missing the expected format extension.",
      };
    }
    const publicFilename = filename.slice(0, dot);
    publicId = [...assetParts.slice(0, -1), publicFilename].join("/");
  }

  const scope = findManagedScope({ publicId, deliveryType });
  if (!scope) {
    return {
      error:
        "Stored Cloudinary URL points outside the managed Warranty replacement scope.",
    };
  }

  return {
    kind: "cloud",
    scope: scope.name,
    deliveryType,
    resourceType,
    publicId,
    key: buildAssetKey({ deliveryType, resourceType, publicId }),
  };
};

const classifyLegacyLocalReference = (value) => {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (/^uploads\/warranty\/[^?#]+$/i.test(normalized)) {
    return { kind: "legacy_local", scope: "customer_evidence" };
  }
  if (/^uploads\/warranty-replacements\/[^?#]+$/i.test(normalized)) {
    return { kind: "legacy_local", scope: "replacement_receipts" };
  }
  return null;
};

const inspectStoredReference = (value, cloudName) => {
  const raw = String(value || "").trim();
  if (!raw) return { kind: "empty" };

  if (raw.startsWith(AUTHENTICATED_REFERENCE_PREFIX)) {
    return parseAuthenticatedReference(raw);
  }

  const legacy = classifyLegacyLocalReference(raw);
  if (legacy) return legacy;

  const cloud = parseManagedCloudinaryUploadUrl(raw, cloudName);
  if (cloud) return cloud;

  return {
    error:
      "Stored Warranty asset reference uses an unsupported format; destructive reconciliation is blocked.",
  };
};

const collectReferenceSnapshot = (rows, cloudName) => {
  const referencedKeys = new Set();
  const blockingIssues = [];
  let legacyLocalReferences = 0;
  let cloudReferences = 0;
  let storedReferences = 0;

  const inspect = ({ warrantyId, column, value }) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    storedReferences += 1;

    const parsed = inspectStoredReference(raw, cloudName);
    if (parsed?.kind === "cloud") {
      referencedKeys.add(parsed.key);
      cloudReferences += 1;
      return;
    }
    if (parsed?.kind === "legacy_local") {
      legacyLocalReferences += 1;
      return;
    }

    blockingIssues.push({
      warranty_id: Number(warrantyId) || null,
      column,
      reason: parsed?.error || "Unsupported Warranty asset reference.",
      value: safeText(raw),
    });
  };

  for (const row of rows || []) {
    const warrantyId = row?.id;
    const proofParts = String(row?.proof_url || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    for (const value of proofParts) {
      inspect({ warrantyId, column: "proof_url", value });
    }

    inspect({
      warrantyId,
      column: "replacement_receipt",
      value: row?.replacement_receipt,
    });
  }

  return {
    referencedKeys,
    blockingIssues,
    legacyLocalReferences,
    cloudReferences,
    storedReferences,
  };
};

const loadWarrantyRows = async (db) => {
  const [rows] = await db.query(
    `SELECT id, proof_url, replacement_receipt
     FROM warranties
     ORDER BY id ASC`,
  );
  return Array.isArray(rows) ? rows : [];
};

const listScopeAssets = async (cloudinary, scope) => {
  const assets = [];

  for (const resourceType of ALLOWED_RESOURCE_TYPES) {
    let nextCursor = null;
    const seenCursors = new Set();
    let pageCount = 0;

    do {
      pageCount += 1;
      if (pageCount > MAX_CLOUDINARY_PAGES_PER_RESOURCE_TYPE) {
        throw new Error(
          `Cloudinary listing exceeded the safety page limit for ${scope.name}/${resourceType}.`,
        );
      }

      const options = {
        type: scope.deliveryType,
        resource_type: resourceType,
        prefix: scope.publicIdPrefix,
        max_results: CLOUDINARY_PAGE_SIZE,
      };
      if (nextCursor) options.next_cursor = nextCursor;

      const result = await cloudinary.api.resources(options);
      const resources = Array.isArray(result?.resources) ? result.resources : [];

      for (const asset of resources) {
        const publicId = String(asset?.public_id || "").trim();
        const actualResourceType = normalizeResourceType(
          asset?.resource_type || resourceType,
        );
        const actualDeliveryType = normalizeDeliveryType(
          asset?.type || scope.deliveryType,
        );

        if (
          !publicId.startsWith(scope.publicIdPrefix) ||
          actualDeliveryType !== scope.deliveryType ||
          actualResourceType !== resourceType
        ) {
          throw new Error(
            `Cloudinary returned an asset outside the requested Warranty scope (${scope.name}).`,
          );
        }

        assets.push({
          scope: scope.name,
          public_id: publicId,
          resource_type: actualResourceType,
          delivery_type: actualDeliveryType,
          created_at: asset?.created_at || null,
          key: buildAssetKey({
            deliveryType: actualDeliveryType,
            resourceType: actualResourceType,
            publicId,
          }),
        });
      }

      const returnedCursor = String(result?.next_cursor || "").trim();
      if (!returnedCursor) {
        nextCursor = null;
      } else {
        if (seenCursors.has(returnedCursor)) {
          throw new Error(
            `Cloudinary returned a repeated pagination cursor for ${scope.name}/${resourceType}.`,
          );
        }
        seenCursors.add(returnedCursor);
        nextCursor = returnedCursor;
      }
    } while (nextCursor);
  }

  return assets;
};

const listAllManagedAssets = async (cloudinary) => {
  const byKey = new Map();
  const scopeCounts = {};

  for (const scope of ASSET_SCOPES) {
    const assets = await listScopeAssets(cloudinary, scope);
    scopeCounts[scope.name] = assets.length;

    for (const asset of assets) {
      if (byKey.has(asset.key)) {
        throw new Error(`Duplicate Cloudinary Warranty asset returned: ${asset.key}`);
      }
      byKey.set(asset.key, asset);
    }
  }

  return {
    assets: [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
    scopeCounts,
  };
};

const classifyProviderAssets = ({ assets, snapshot, cutoffMs, nowMs }) => {
  const candidates = [];
  const unsafeProviderAssets = [];
  let referenced = 0;
  let tooRecent = 0;

  for (const asset of assets) {
    if (snapshot.referencedKeys.has(asset.key)) {
      referenced += 1;
      continue;
    }

    const createdAtMs = Date.parse(String(asset.created_at || ""));
    if (!Number.isFinite(createdAtMs)) {
      unsafeProviderAssets.push({
        key: asset.key,
        reason: "Provider asset has no trustworthy created_at timestamp.",
      });
      continue;
    }

    if (createdAtMs > cutoffMs) {
      tooRecent += 1;
      continue;
    }

    candidates.push({
      ...asset,
      age_hours: Math.floor(((nowMs - createdAtMs) / (60 * 60 * 1000)) * 10) / 10,
    });
  }

  return { candidates, unsafeProviderAssets, referenced, tooRecent };
};

const destroyCandidate = async (cloudinary, candidate) => {
  const result = await cloudinary.uploader.destroy(candidate.public_id, {
    resource_type: candidate.resource_type,
    type: candidate.delivery_type,
    invalidate: true,
  });

  const outcome = String(result?.result || "").trim().toLowerCase();
  if (outcome === "ok") return "deleted";
  if (outcome === "not found") return "already_missing";

  throw new Error(
    `Cloudinary destroy returned an unexpected result for ${candidate.key}: ${safeText(
      result?.result || "empty result",
      80,
    )}`,
  );
};

const resolveDependencies = (options = {}) => {
  const db = options.db || require("../config/db");
  const cloudinary = options.cloudinary || require("cloudinary").v2;
  const cloudName = String(
    options.cloudName ?? process.env.CLOUDINARY_CLOUD_NAME ?? "",
  ).trim();
  const apiKey = String(options.apiKey ?? process.env.CLOUDINARY_API_KEY ?? "").trim();
  const apiSecret = String(
    options.apiSecret ?? process.env.CLOUDINARY_API_SECRET ?? "",
  ).trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary credentials are required for Warranty asset reconciliation.",
    );
  }
  if (!db || typeof db.query !== "function") {
    throw new Error("A valid database pool is required for Warranty asset reconciliation.");
  }
  if (
    !cloudinary?.api ||
    typeof cloudinary.api.resources !== "function" ||
    !cloudinary?.uploader ||
    typeof cloudinary.uploader.destroy !== "function"
  ) {
    throw new Error("A valid Cloudinary SDK client is required for reconciliation.");
  }

  if (typeof cloudinary.config === "function") {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  }

  return { db, cloudinary, cloudName };
};

const runWarrantyAssetReconciliation = async (options = {}) => {
  const deleteOrphans = options.deleteOrphans === true;
  const nowMs = Number.isFinite(Number(options.nowMs))
    ? Number(options.nowMs)
    : Date.now();
  const cutoffMs = nowMs - WARRANTY_RECONCILIATION_GRACE_MS;
  const { db, cloudinary, cloudName } = resolveDependencies(options);

  // Safety ordering matters: obtain a complete DB snapshot and a complete
  // provider listing before any destructive action is considered.
  const initialRows = await loadWarrantyRows(db);
  const initialSnapshot = collectReferenceSnapshot(initialRows, cloudName);
  const provider = await listAllManagedAssets(cloudinary);
  const classified = classifyProviderAssets({
    assets: provider.assets,
    snapshot: initialSnapshot,
    cutoffMs,
    nowMs,
  });

  const result = {
    mode: deleteOrphans ? "delete" : "dry-run",
    grace_hours: WARRANTY_RECONCILIATION_GRACE_HOURS,
    cutoff_iso: new Date(cutoffMs).toISOString(),
    deletion_blocked:
      initialSnapshot.blockingIssues.length > 0 ||
      classified.unsafeProviderAssets.length > 0,
    blocking_issues: [...initialSnapshot.blockingIssues],
    unsafe_provider_assets: [...classified.unsafeProviderAssets],
    candidates: classified.candidates.map((candidate) => ({ ...candidate })),
    summary: {
      db_rows: initialRows.length,
      stored_references: initialSnapshot.storedReferences,
      referenced_cloud_keys: initialSnapshot.referencedKeys.size,
      legacy_local_references: initialSnapshot.legacyLocalReferences,
      unsupported_references: initialSnapshot.blockingIssues.length,
      provider_assets_scanned: provider.assets.length,
      provider_assets_by_scope: provider.scopeCounts,
      provider_assets_referenced: classified.referenced,
      provider_assets_too_recent: classified.tooRecent,
      provider_assets_unsafe: classified.unsafeProviderAssets.length,
      orphan_candidates: classified.candidates.length,
      delete_batch_limit: MAX_DELETE_PER_RUN,
      deferred_candidates: Math.max(0, classified.candidates.length - MAX_DELETE_PER_RUN),
      recheck_referenced: 0,
      deleted: 0,
      already_missing: 0,
      delete_failed: 0,
    },
    delete_failures: [],
  };

  if (!deleteOrphans || result.deletion_blocked) {
    return result;
  }

  const deleteBatch = classified.candidates.slice(0, MAX_DELETE_PER_RUN);

  for (const candidate of deleteBatch) {
    // Race guard: every destructive action gets a fresh autocommit DB read.
    // Normal upload paths create unique public IDs, while the 24-hour grace
    // protects in-flight upload-before-INSERT windows from reconciliation.
    const freshRows = await loadWarrantyRows(db);
    const freshSnapshot = collectReferenceSnapshot(freshRows, cloudName);

    if (freshSnapshot.blockingIssues.length) {
      result.deletion_blocked = true;
      result.blocking_issues.push(...freshSnapshot.blockingIssues);
      break;
    }

    if (freshSnapshot.referencedKeys.has(candidate.key)) {
      result.summary.recheck_referenced += 1;
      continue;
    }

    try {
      const outcome = await destroyCandidate(cloudinary, candidate);
      if (outcome === "deleted") result.summary.deleted += 1;
      else result.summary.already_missing += 1;
    } catch (error) {
      result.summary.delete_failed += 1;
      result.delete_failures.push({
        key: candidate.key,
        message: safeText(error?.message || error, 240),
      });
    }
  }

  return result;
};

module.exports = {
  WARRANTY_RECONCILIATION_GRACE_HOURS,
  MAX_DELETE_PER_RUN,
  runWarrantyAssetReconciliation,
  // Intentionally limited test hooks; the production entry point remains the
  // reconciliation runner above.
  _test: {
    buildAssetKey,
    collectReferenceSnapshot,
    parseAuthenticatedReference,
    parseManagedCloudinaryUploadUrl,
  },
};
