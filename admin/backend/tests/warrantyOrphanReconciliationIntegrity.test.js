"use strict";

const assert = require("node:assert/strict");

const {
  WARRANTY_RECONCILIATION_GRACE_HOURS,
  MAX_DELETE_PER_RUN,
  runWarrantyAssetReconciliation,
  _test,
} = require("../services/warrantyAssetReconciliationService");

const CLOUD_NAME = "w9b-test-cloud";
const API_KEY = "w9b-test-key";
const API_SECRET = "w9b-test-secret";
const NOW_MS = Date.parse("2026-10-03T02:00:00.000Z");

const authRef = ({ publicId, resourceType = "image", format = "png" }) => {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      public_id: publicId,
      resource_type: resourceType,
      format,
    }),
    "utf8",
  ).toString("base64url");
  return `cloudinary-auth:${payload}`;
};

const replacementUrl = (publicId, extension = "png", resourceType = "image") =>
  `https://res.cloudinary.com/${CLOUD_NAME}/${resourceType}/upload/v1790900000/${publicId}${
    resourceType === "raw" ? "" : `.${extension}`
  }`;

const asset = ({
  publicId,
  type,
  resourceType = "image",
  createdAt = "2026-10-01T00:00:00.000Z",
}) => ({
  public_id: publicId,
  type,
  resource_type: resourceType,
  created_at: createdAt,
});

const makeDb = (snapshots) => {
  let call = 0;
  return {
    get calls() {
      return call;
    },
    async query(sql) {
      assert.match(String(sql), /SELECT id, proof_url, replacement_receipt\s+FROM warranties/i);
      const index = Math.min(call, snapshots.length - 1);
      call += 1;
      return [snapshots[index]];
    },
  };
};

const makeCloudinary = ({ assetsByRequest }) => {
  const destroyCalls = [];
  const listCalls = [];
  const configCalls = [];

  return {
    destroyCalls,
    listCalls,
    configCalls,
    config(value) {
      configCalls.push(value);
    },
    api: {
      async resources(options) {
        listCalls.push({ ...options });
        const key = `${options.type}:${options.resource_type}:${options.prefix}:${
          options.next_cursor || "first"
        }`;
        return assetsByRequest[key] || { resources: [] };
      },
    },
    uploader: {
      async destroy(publicId, options) {
        destroyCalls.push({ publicId, options: { ...options } });
        return { result: "ok" };
      },
    },
  };
};

const runOptions = (db, cloudinary, deleteOrphans) => ({
  db,
  cloudinary,
  cloudName: CLOUD_NAME,
  apiKey: API_KEY,
  apiSecret: API_SECRET,
  deleteOrphans,
  nowMs: NOW_MS,
});

async function testParsers() {
  assert.equal(WARRANTY_RECONCILIATION_GRACE_HOURS, 24);
  assert.equal(MAX_DELETE_PER_RUN, 100);

  const authenticated = authRef({
    publicId: "wisdom_uploads/warranty/evidence-a",
  });
  const parsedAuthenticated = _test.parseAuthenticatedReference(authenticated);
  assert.equal(parsedAuthenticated.scope, "customer_evidence");
  assert.equal(parsedAuthenticated.deliveryType, "authenticated");
  assert.equal(parsedAuthenticated.resourceType, "image");

  const authenticatedReplacement = authRef({
    publicId: "wisdom_uploads/warranty-replacements/receipt-auth",
  });
  const parsedAuthenticatedReplacement =
    _test.parseAuthenticatedReference(authenticatedReplacement);
  assert.equal(parsedAuthenticatedReplacement.scope, "replacement_receipts");
  assert.equal(parsedAuthenticatedReplacement.deliveryType, "authenticated");
  assert.equal(parsedAuthenticatedReplacement.resourceType, "image");

  const parsedReplacement = _test.parseManagedCloudinaryUploadUrl(
    replacementUrl("wisdom_uploads/warranty-replacements/receipt-a"),
    CLOUD_NAME,
  );
  assert.equal(parsedReplacement.scope, "replacement_receipts");
  assert.equal(parsedReplacement.publicId, "wisdom_uploads/warranty-replacements/receipt-a");

  const rawPublicId = "wisdom_uploads/warranty-replacements/receipt.pdf";
  const parsedRaw = _test.parseManagedCloudinaryUploadUrl(
    replacementUrl(rawPublicId, "", "raw"),
    CLOUD_NAME,
  );
  assert.equal(parsedRaw.resourceType, "raw");
  assert.equal(parsedRaw.publicId, rawPublicId);

  assert.match(
    _test.parseAuthenticatedReference("cloudinary-auth:not-valid").error,
    /cannot be decoded|invalid/i,
  );
}

async function testDryRunAndDeleteRecheck() {
  const referencedAuthPublicId = "wisdom_uploads/warranty/ref-auth";
  const orphanAuthPublicId = "wisdom_uploads/warranty/orphan-auth";
  const referencedReceiptPublicId =
    "wisdom_uploads/warranty-replacements/ref-receipt";
  const raceReceiptPublicId = "wisdom_uploads/warranty-replacements/race-receipt";
  const recentReceiptPublicId =
    "wisdom_uploads/warranty-replacements/recent-receipt";

  const initialRows = [
    {
      id: 1,
      proof_url: `${authRef({ publicId: referencedAuthPublicId })},uploads/warranty/legacy-proof.png`,
      replacement_receipt: replacementUrl(referencedReceiptPublicId),
    },
    {
      // Terminal claims must protect evidence exactly like active claims.
      id: 2,
      proof_url: "uploads/warranty/terminal-legacy.png",
      replacement_receipt: "uploads/warranty-replacements/terminal-receipt.png",
    },
  ];

  const raceRows = [
    ...initialRows,
    {
      id: 3,
      proof_url: "uploads/warranty/race-proof.png",
      replacement_receipt: replacementUrl(raceReceiptPublicId),
    },
  ];

  const assetsByRequest = {
    [`authenticated:image:wisdom_uploads/warranty/:first`]: {
      resources: [
        asset({
          publicId: referencedAuthPublicId,
          type: "authenticated",
        }),
      ],
      next_cursor: "page-2",
    },
    [`authenticated:image:wisdom_uploads/warranty/:page-2`]: {
      resources: [
        asset({
          publicId: orphanAuthPublicId,
          type: "authenticated",
        }),
      ],
    },
    [`upload:image:wisdom_uploads/warranty-replacements/:first`]: {
      resources: [
        asset({ publicId: referencedReceiptPublicId, type: "upload" }),
        asset({ publicId: raceReceiptPublicId, type: "upload" }),
        asset({
          publicId: recentReceiptPublicId,
          type: "upload",
          createdAt: "2026-10-03T01:30:00.000Z",
        }),
      ],
    },
  };

  {
    const db = makeDb([initialRows]);
    const cloudinary = makeCloudinary({ assetsByRequest });
    const result = await runWarrantyAssetReconciliation(
      runOptions(db, cloudinary, false),
    );

    assert.equal(result.mode, "dry-run");
    assert.equal(result.deletion_blocked, false);
    assert.equal(result.summary.db_rows, 2);
    assert.equal(result.summary.legacy_local_references, 3);
    assert.equal(result.summary.provider_assets_scanned, 5);
    assert.equal(result.summary.provider_assets_referenced, 2);
    assert.equal(result.summary.provider_assets_too_recent, 1);
    assert.equal(result.summary.orphan_candidates, 2);
    assert.equal(result.summary.delete_batch_limit, 100);
    assert.equal(result.summary.deferred_candidates, 0);
    assert.equal(result.summary.deleted, 0);
    assert.equal(cloudinary.destroyCalls.length, 0);
    assert.equal(db.calls, 1);

    const imageWarrantyCalls = cloudinary.listCalls.filter(
      (call) =>
        call.type === "authenticated" &&
        call.resource_type === "image" &&
        call.prefix === "wisdom_uploads/warranty/",
    );
    assert.equal(imageWarrantyCalls.length, 2);
    assert.equal(imageWarrantyCalls[1].next_cursor, "page-2");
  }

  {
    // Initial snapshot sees two old orphans. First candidate is deleted after
    // a fresh clean recheck. Before the second candidate, the DB starts
    // referencing it, so the race-safe recheck must protect it.
    const db = makeDb([initialRows, initialRows, raceRows]);
    const cloudinary = makeCloudinary({ assetsByRequest });
    const result = await runWarrantyAssetReconciliation(
      runOptions(db, cloudinary, true),
    );

    assert.equal(result.mode, "delete");
    assert.equal(result.deletion_blocked, false);
    assert.equal(result.summary.orphan_candidates, 2);
    assert.equal(result.summary.deleted, 1);
    assert.equal(result.summary.recheck_referenced, 1);
    assert.equal(result.summary.delete_failed, 0);
    assert.equal(cloudinary.destroyCalls.length, 1);
    assert.equal(cloudinary.destroyCalls[0].publicId, orphanAuthPublicId);
    assert.deepEqual(cloudinary.destroyCalls[0].options, {
      resource_type: "image",
      type: "authenticated",
      invalidate: true,
    });
    assert.equal(db.calls, 3);
  }
}


async function testAuthenticatedReplacementCompatibility() {
  const authenticatedReceiptPublicId =
    "wisdom_uploads/warranty-replacements/auth-receipt";
  const legacyPublicReceiptPublicId =
    "wisdom_uploads/warranty-replacements/public-receipt";

  const rows = [
    {
      id: 7,
      proof_url: null,
      replacement_receipt: authRef({ publicId: authenticatedReceiptPublicId }),
    },
    {
      id: 8,
      proof_url: null,
      replacement_receipt: replacementUrl(legacyPublicReceiptPublicId),
    },
  ];

  const cloudinary = makeCloudinary({
    assetsByRequest: {
      [`authenticated:image:wisdom_uploads/warranty-replacements/:first`]: {
        resources: [
          asset({
            publicId: authenticatedReceiptPublicId,
            type: "authenticated",
          }),
        ],
      },
      [`upload:image:wisdom_uploads/warranty-replacements/:first`]: {
        resources: [
          asset({
            publicId: legacyPublicReceiptPublicId,
            type: "upload",
          }),
        ],
      },
    },
  });
  const db = makeDb([rows]);

  const result = await runWarrantyAssetReconciliation(
    runOptions(db, cloudinary, false),
  );

  assert.equal(result.deletion_blocked, false);
  assert.equal(result.summary.db_rows, 2);
  assert.equal(result.summary.stored_references, 2);
  assert.equal(result.summary.referenced_cloud_keys, 2);
  assert.equal(result.summary.provider_assets_scanned, 2);
  assert.equal(result.summary.provider_assets_referenced, 2);
  assert.equal(result.summary.orphan_candidates, 0);
  assert.equal(result.summary.provider_assets_by_scope.replacement_receipts, 2);
  assert.equal(cloudinary.destroyCalls.length, 0);

  const replacementImageCalls = cloudinary.listCalls.filter(
    (call) =>
      call.resource_type === "image" &&
      call.prefix === "wisdom_uploads/warranty-replacements/",
  );
  assert.equal(
    replacementImageCalls.some((call) => call.type === "upload"),
    true,
  );
  assert.equal(
    replacementImageCalls.some((call) => call.type === "authenticated"),
    true,
  );
}

async function testDeleteBatchBound() {
  const resources = Array.from({ length: 101 }, (_, index) =>
    asset({
      publicId: `wisdom_uploads/warranty/batch-orphan-${String(index + 1).padStart(3, "0")}`,
      type: "authenticated",
    }),
  );

  const db = makeDb([[]]);
  const cloudinary = makeCloudinary({
    assetsByRequest: {
      [`authenticated:image:wisdom_uploads/warranty/:first`]: { resources },
    },
  });

  const result = await runWarrantyAssetReconciliation(
    runOptions(db, cloudinary, true),
  );

  assert.equal(result.summary.orphan_candidates, 101);
  assert.equal(result.summary.delete_batch_limit, 100);
  assert.equal(result.summary.deferred_candidates, 1);
  assert.equal(result.summary.deleted, 100);
  assert.equal(cloudinary.destroyCalls.length, 100);
  assert.equal(db.calls, 101); // 1 initial snapshot + 100 pre-delete rechecks
}

async function testFailClosedMalformedReference() {
  const rows = [
    {
      id: 9,
      proof_url: "cloudinary-auth:not-valid",
      replacement_receipt: null,
    },
  ];
  const assetsByRequest = {
    [`authenticated:image:wisdom_uploads/warranty/:first`]: {
      resources: [
        asset({
          publicId: "wisdom_uploads/warranty/old-orphan",
          type: "authenticated",
        }),
      ],
    },
  };

  const db = makeDb([rows]);
  const cloudinary = makeCloudinary({ assetsByRequest });
  const result = await runWarrantyAssetReconciliation(
    runOptions(db, cloudinary, true),
  );

  assert.equal(result.deletion_blocked, true);
  assert.equal(result.summary.unsupported_references, 1);
  assert.equal(result.summary.orphan_candidates, 1);
  assert.equal(result.summary.deleted, 0);
  assert.equal(cloudinary.destroyCalls.length, 0);
  assert.equal(db.calls, 1);
}

async function run() {
  await testParsers();
  await testDryRunAndDeleteRecheck();
  await testAuthenticatedReplacementCompatibility();
  await testDeleteBatchBound();
  await testFailClosedMalformedReference();
  console.log("PASS: Warranty orphan reconciliation integrity checks passed.");
}

run().catch((error) => {
  console.error("FAIL: Warranty orphan reconciliation integrity checks failed.");
  console.error(error);
  process.exitCode = 1;
});
