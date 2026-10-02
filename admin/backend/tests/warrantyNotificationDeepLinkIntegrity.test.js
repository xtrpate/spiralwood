const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");

const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const adminBellSource = read(
  "admin/frontend/src/components/NotificationBell.jsx",
);
const customerBellSource = read(
  "admin/frontend/src/components/CustomerNotificationBell.jsx",
);
const adminWarrantySource = read(
  "admin/frontend/src/pages/warranty/WarrantyPage.jsx",
);
const customerWarrantySource = read(
  "admin/frontend/src/pages/customer/warrantypage.jsx",
);
const customerWarrantyCssSource = read(
  "admin/frontend/src/pages/customer/warrantypage.css",
);
const customerWarrantyControllerSource = read(
  "admin/backend/controllers/customer/customer.warranty.js",
);
const adminWarrantyControllerSource = read(
  "admin/backend/controllers/admin/warrantyController.js",
);

assert.match(
  adminBellSource,
  /\/admin\/warranty\?focus_claim_id=\$\{targetId\}/,
  "Admin warranty notifications must carry the exact claim id.",
);

assert.match(
  customerBellSource,
  /\/warranty\?focus_claim_id=\$\{targetId\}/,
  "Customer warranty notifications must carry the exact claim id.",
);

assert.match(
  customerWarrantyControllerSource,
  /targetType:\s*"warranty"[\s\S]*?targetId:\s*result\.insertId/,
  "New warranty claim notifications must target the inserted claim.",
);

assert.match(
  adminWarrantyControllerSource,
  /targetType:\s*"warranty"[\s\S]*?targetId:\s*claim\.id/,
  "Warranty update notifications must target the exact claim.",
);

for (const [label, source] of [
  ["admin", adminWarrantySource],
  ["customer", customerWarrantySource],
]) {
  assert.match(
    source,
    /const parseFocusClaimId = \(value\) =>/,
    `${label}: strict focus parser missing`,
  );

  assert.match(
    source,
    /!\/\^\\d\+\$\/\.test\(raw\)/,
    `${label}: digit-only focus validation missing`,
  );

  assert.match(
    source,
    /Number\.isSafeInteger\(parsed\) && parsed > 0/,
    `${label}: positive safe-integer validation missing`,
  );

  assert.match(
    source,
    /searchParams\.get\("focus_claim_id"\)/,
    `${label}: focus_claim_id is not consumed`,
  );

  assert.match(
    source,
    /next\.delete\("focus_claim_id"\)/,
    `${label}: consumed focus parameter is not removed`,
  );

  assert.match(
    source,
    /setSearchParams\(next, \{ replace: true \}\)/,
    `${label}: focus cleanup must replace browser history`,
  );

  assert.match(
    source,
    /claimsLoadedSuccessfully/,
    `${label}: successful-load guard missing`,
  );
}

assert.match(
  adminWarrantySource,
  /setSearch\(""\);[\s\S]*?setStatusFilter\(""\);[\s\S]*?setClaimTypeFilter\(""\);/,
  "Admin focus must clear presentation filters.",
);

assert.match(
  adminWarrantySource,
  /setSelectedRow\(matchedRow\)/,
  "Admin focus must open the exact claim Review modal.",
);

assert.match(
  customerWarrantySource,
  /initialFocusClaimParam \? "claims" : "file"/,
  "Customer deep links must initialize directly on Your claims.",
);

assert.match(
  customerWarrantySource,
  /const location = useLocation\(\);/,
  "Customer warranty page must track router locations for same-page notification freshness.",
);

assert.match(
  customerWarrantySource,
  /initialLocationKeyRef = useRef\(location\.key\)/,
  "Customer warranty page must distinguish the initial route from later same-page notification navigation.",
);

assert.match(
  customerWarrantySource,
  /location\.key !== initialLocationKeyRef\.current[\s\S]*refreshedFocusLocationKeyRef\.current === location\.key/,
  "Same-page warranty focus must detect whether the current navigation still needs a fresh claims load.",
);

assert.match(
  customerWarrantySource,
  /refreshedFocusLocationKeyRef\.current = location\.key;[\s\S]*setClaimFocusResolving\(true\);[\s\S]*void Promise\.all\(\[fetchClaims\(\), fetchOrders\(\)\]\);[\s\S]*return;/,
  "Same-page warranty notification navigation must refresh both claims and eligibility before resolving the focused claim.",
);

assert.match(
  customerWarrantySource,
  /claimFocusResolving/,
  "Customer deep links must keep a stable resolving state.",
);

assert.match(
  customerWarrantySource,
  /setWarrantyCenterTab\("claims"\)/,
  "Customer focus must select the claims tab.",
);

assert.match(
  customerWarrantySource,
  /setFocusedClaimId\(focusClaimId\)/,
  "Customer focus must select the exact claim.",
);

assert.match(
  customerWarrantySource,
  /id=\{\`warranty-claim-\$\{claim\.id\}\`\}/,
  "Customer claim cards must expose stable focus anchors.",
);

assert.match(
  customerWarrantySource,
  /if \(forceOpen\) setOpen\(true\)/,
  "Focused customer claims must auto-expand.",
);

assert.match(
  customerWarrantySource,
  /useLayoutEffect/,
  "Customer direct positioning must run in a layout effect.",
);

assert.match(
  customerWarrantySource,
  /requestAnimationFrame/,
  "Customer direct positioning must wait for the focused claim DOM.",
);

assert.match(
  customerWarrantySource,
  /scrollIntoView\(\{ behavior: "auto", block: "center" \}\)/,
  "Customer notification focus must position directly on the exact claim.",
);

assert.doesNotMatch(
  customerWarrantySource,
  /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/,
  "Customer notification focus must not visibly smooth-scroll from page top.",
);

assert.match(
  customerWarrantySource,
  /className="warranty-focus-loading"/,
  "Customer deep links must show a stable loading state while resolving.",
);

assert.match(
  customerWarrantySource,
  /className="warranty-focus-spinner"/,
  "Customer deep-link loading state must render a spinner.",
);

assert.doesNotMatch(
  customerWarrantySource,
  /Opening warranty claim|Please wait while we load the exact claim\./,
  "Customer deep-link loading state must not show visible loading copy.",
);

assert.match(
  customerWarrantyCssSource,
  /@keyframes warranty-focus-spin/,
  "Customer deep-link spinner must animate.",
);

assert.match(
  customerWarrantyCssSource,
  /\.warranty-page\.warranty-page-resolving-focus \.warranty-shell\s*\{[\s\S]*?visibility:\s*hidden/,
  "Normal Warranty content must remain hidden until claim positioning completes.",
);

assert.match(
  customerWarrantyCssSource,
  /\.wclaim-card\.wclaim-notification-focus\s*\{/,
  "Focused claims must retain the temporary visible focus indicator.",
);

console.log("PASS: Warranty notification deep-link integrity checks passed.");
