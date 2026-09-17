"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..", "..");

const managementPath = path.join(
  backendRoot,
  "controllers",
  "admin",
  "managementController.js",
);
const auditPagePath = path.join(
  repoRoot,
  "admin",
  "frontend",
  "src",
  "pages",
  "audit",
  "AuditLogsPage.jsx",
);

const managementSource = fs.readFileSync(managementPath, "utf8");
const auditPageSource = fs.readFileSync(auditPagePath, "utf8");

for (const column of [
  "al.user_id",
  "al.actor_type",
  "al.user_agent",
  "al.request_method",
  "al.request_path",
  "al.response_status",
  "al.request_id",
  "al.ip_country_code",
  "al.ip_region",
  "al.ip_city",
]) {
  assert.ok(
    managementSource.includes(column),
    `Audit-log API must return ${column}.`,
  );
}

for (const searchableColumn of [
  "al.ip_address LIKE ?",
  "al.user_agent LIKE ?",
  "al.request_id LIKE ?",
  "al.request_path LIKE ?",
  "al.ip_country_code LIKE ?",
  "al.ip_region LIKE ?",
  "al.ip_city LIKE ?",
  "al.actor_type LIKE ?",
]) {
  assert.ok(
    managementSource.includes(searchableColumn),
    `Audit-log search must include ${searchableColumn}.`,
  );
}

assert.ok(
  managementSource.includes('where.push("al.actor_type = ?")'),
  "Backend must support actor_type filtering.",
);

for (const exportHeader of [
  '"Actor Type"',
  '"User Agent"',
  '"Request Method"',
  '"Request Path"',
  '"Response Status"',
  '"Request ID"',
  '"Country"',
  '"Region"',
  '"City"',
]) {
  assert.ok(
    managementSource.includes(exportHeader),
    `Audit CSV must include ${exportHeader}.`,
  );
}

for (const action of [
  "accept_project_agreement",
  "cancel_unpaid_custom_project",
  "cleanup_abandoned_registration",
  "close_support_ticket",
  "confirm_blueprint_pickup",
  "confirm_paymongo_webhook_payment",
  "create_project_agreement",
  "create_raw_material_bulk",
  "create_support_ticket",
  "deactivate_user",
  "mark_production_ready_for_pickup",
  "recover_pos_qr_paid_attempt",
  "mark_pos_qr_provider_unknown",
  "permission_denied",
  "publish_blueprint_product",
  "reassign_delivery_rider",
  "reply_support_ticket",
  "update_oversized_delivery_decision",
  "update_user_authority",
  "update_user_permissions",
]) {
  assert.ok(
    auditPageSource.includes(`${action}:`),
    `Audit UI is missing a readable label for ${action}.`,
  );
}

for (const moduleName of ["support_tickets", "user_permission_overrides"]) {
  assert.ok(
    auditPageSource.includes(`${moduleName}:`),
    `Audit UI is missing module label ${moduleName}.`,
  );
}

for (const uiFeature of [
  "parseAuditUserAgent",
  "formatAuditLocation",
  "getAuditSourceContext",
  'label="Actor"',
  "Source / Device",
  'label={sourceContext.locationLabel}',
  'label="Browser"',
  'label="Device / OS"',
  'label="Request Method"',
  'label="Request Path"',
  'label="Response Status"',
  'label="Request ID"',
]) {
  assert.ok(
    auditPageSource.includes(uiFeature),
    `Audit UI context feature missing: ${uiFeature}.`,
  );
}

assert.ok(
  auditPageSource.includes('locationLabel: "Origin"'),
  "Webhook rows must label their location as provider origin.",
);
assert.ok(
  auditPageSource.includes('primary: "System"'),
  "System rows must use a system source label.",
);
assert.ok(
  auditPageSource.includes('browser: "Not applicable"'),
  "Webhook/system rows must not look like human browser sessions.",
);
assert.ok(
  auditPageSource.includes('location: "Not applicable"'),
  "System rows must not show a human location.",
);
assert.ok(
  auditPageSource.includes('|| "Not available"'),
  "Missing human location must use simple Not available wording.",
);

console.log(
  "PASS: Audit Logs API/UI exposes actor, location, browser, device, request context, IP search, and missing labels.",
);
