"use strict";

const db = require("../config/db");
const {
  runWarrantyAssetReconciliation,
} = require("../services/warrantyAssetReconciliationService");

const printHelp = () => {
  console.log(`Warranty asset orphan reconciliation

Usage:
  node scripts/reconcileWarrantyAssets.js
  node scripts/reconcileWarrantyAssets.js --delete

Modes:
  default    DRY RUN only. Lists old unreferenced Cloudinary Warranty assets.
  --delete   Rechecks the DB immediately before each exact asset deletion.

Safety:
  - fixed 24-hour grace period
  - Warranty Cloudinary scopes only
  - no local-file deletion
  - no DB writes or migrations
  - no prefix/bulk deletion`);
};

const main = async () => {
  const args = process.argv.slice(2);
  const allowed = new Set(["--delete", "--help", "-h"]);
  const unknown = args.filter((arg) => !allowed.has(arg));

  if (unknown.length) {
    throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  }
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const deleteOrphans = args.includes("--delete");
  console.log(
    `[W9B] Warranty orphan reconciliation starting in ${
      deleteOrphans ? "DELETE" : "DRY-RUN"
    } mode.`,
  );

  const result = await runWarrantyAssetReconciliation({
    db,
    deleteOrphans,
  });

  console.log("\n[W9B] Summary");
  console.log(JSON.stringify(result.summary, null, 2));

  if (result.candidates.length) {
    console.log("\n[W9B] Old unreferenced candidates");
    for (const candidate of result.candidates) {
      console.log(
        `- ${candidate.scope} | ${candidate.delivery_type}/${candidate.resource_type} | ${candidate.public_id} | created=${candidate.created_at} | age_hours=${candidate.age_hours}`,
      );
    }
  } else {
    console.log("\n[W9B] No old unreferenced candidates found.");
  }

  if (result.blocking_issues.length) {
    console.error("\n[W9B] Blocking DB reference issues");
    for (const issue of result.blocking_issues) {
      console.error(
        `- warranty=${issue.warranty_id ?? "?"} column=${issue.column}: ${issue.reason} (${issue.value})`,
      );
    }
  }

  if (result.unsafe_provider_assets.length) {
    console.error("\n[W9B] Unsafe provider assets");
    for (const issue of result.unsafe_provider_assets) {
      console.error(`- ${issue.key}: ${issue.reason}`);
    }
  }

  if (result.delete_failures.length) {
    console.error("\n[W9B] Delete failures");
    for (const failure of result.delete_failures) {
      console.error(`- ${failure.key}: ${failure.message}`);
    }
  }

  if (deleteOrphans && result.deletion_blocked) {
    console.error(
      "\n[W9B] STOP: Delete mode was blocked by a fail-closed safety condition. No further candidates were deleted.",
    );
    process.exitCode = 2;
    return;
  }

  if (result.summary.delete_failed > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n[W9B] COMPLETE: ${deleteOrphans ? "delete reconciliation" : "dry run"} finished.`,
  );
};

main()
  .catch((error) => {
    console.error("[W9B] FAILED:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch (error) {
      console.error("[W9B] Database pool close failed:", error?.message || error);
      process.exitCode = 1;
    }
  });
