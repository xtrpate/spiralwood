const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) =>
  fs
    .readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/\r\n/g, "\n");

const dashboard = read("../../frontend/src/pages/staff/RiderDashboard.jsx");
const deliveries = read("../../frontend/src/pages/staff/DeliveryManagement.jsx");
const history = read("../../frontend/src/pages/staff/RiderHistory.jsx");
const css = read("../../frontend/src/pages/staff/RiderScreen.css");

const mustInclude = (source, needle, message) =>
  assert.ok(source.includes(needle), message);

mustInclude(
  dashboard,
  'import { PH_TIME_ZONE, parseSystemDateTime } from "../../utils/dateTime";',
  "Rider Home must use the shared Philippine/system datetime utilities.",
);
mustInclude(
  dashboard,
  'const [loadError, setLoadError] = useState("");',
  "Rider Home must separate load failure from legitimate empty data.",
);
mustInclude(
  dashboard,
  'throw new Error("Invalid rider deliveries response.");',
  "Rider Home must reject malformed successful API responses.",
);
mustInclude(
  dashboard,
  'setDeliveries(res.data);\n      setLoadError("");',
  "A valid Rider Home response, including silent refresh, must clear stale load errors.",
);
mustInclude(
  dashboard,
  'status === "completed" &&\n    !normalize(delivery.notes).includes("failure reason:")',
  "Delivered Today must retain successful completed deliveries without counting failed legacy outcomes.",
);
mustInclude(
  dashboard,
  'getPHDateKey(delivery.delivered_date || delivery.updated_at) === todayKey',
  "Delivered Today must use the Philippine business date.",
);
mustInclude(
  dashboard,
  'loadError ? "—" : activeCount',
  "Rider Home must not show fake zero active deliveries during load failure.",
);
mustInclude(
  dashboard,
  'loadError ? "—" : dueToday',
  "Rider Home must not show fake zero due-today deliveries during load failure.",
);
mustInclude(
  dashboard,
  'loadError ? "—" : deliveredToday',
  "Rider Home must not show fake zero delivered-today counts during load failure.",
);
mustInclude(
  dashboard,
  "Delivery queue unavailable until retry succeeds.",
  "Rider Home queue must not present a failed request as a real empty queue.",
);

mustInclude(
  deliveries,
  'const [loadError, setLoadError] = useState("");',
  "Deliveries must separate page-load errors from delivery-action errors.",
);
mustInclude(
  deliveries,
  'throw new Error("Invalid deliveries response.");',
  "Deliveries must reject malformed successful responses.",
);
assert.ok(
  !deliveries.includes(
    "const list = Array.isArray(res.data) ? res.data : [];",
  ),
  "Malformed delivery responses must never become a legitimate empty list.",
);

const loadStart = deliveries.indexOf(
  "const loadDeliveries = useCallback(async ({ silent = false } = {}) => {",
);
const loadEnd = deliveries.indexOf("  }, []);", loadStart);
assert.ok(loadStart >= 0 && loadEnd > loadStart, "loadDeliveries block missing.");
const loadBlock = deliveries.slice(loadStart, loadEnd);
assert.ok(
  !loadBlock.includes('setError("")') && !loadBlock.includes('setSuccess("")'),
  "Loading/refreshing deliveries must not clear delivery-action feedback.",
);

const silentStart = deliveries.indexOf(
  "const silentRefreshDeliveries = useCallback(async () => {",
);
const silentEnd = deliveries.indexOf("  }, []);", silentStart);
assert.ok(
  silentStart >= 0 && silentEnd > silentStart,
  "silentRefreshDeliveries block missing.",
);
const silentBlock = deliveries.slice(silentStart, silentEnd);
assert.ok(
  silentBlock.includes('throw new Error("Invalid deliveries response.");'),
  "Silent refresh must reject malformed responses.",
);
assert.ok(
  silentBlock.includes('setLoadError("");'),
  "A valid silent refresh must clear stale load errors.",
);
assert.ok(
  !silentBlock.includes("setError(") && !silentBlock.includes("setSuccess("),
  "Silent refresh must never erase action error/success feedback.",
);

mustInclude(
  deliveries,
  'if (normalize(orderType) === "blueprint") return null;',
  "Blueprint deliveries must remain pin-only.",
);
mustInclude(
  deliveries,
  "encodeURIComponent(savedAddress)",
  "Standard deliveries must retain address fallback for Open Map.",
);
mustInclude(
  deliveries,
  '[".jfif", "image/jpeg"]',
  "Frontend proof validation must retain JFIF/image/jpeg parity.",
);
mustInclude(
  deliveries,
  "if (!expectedMime || mime !== expectedMime)",
  "Frontend proof MIME/extension validation must match the backend strictly.",
);
mustInclude(
  deliveries,
  'accept=".jpg,.jpeg,.jfif,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"',
  "Mobile proof picker must advertise only supported file types.",
);
assert.ok(
  !deliveries.includes('accept="image/*,.pdf"'),
  "Broad image/* proof selection must be removed.",
);
mustInclude(
  deliveries,
  "URL.revokeObjectURL(nextPreviewUrl);",
  "Proof preview object URLs must be released.",
);
mustInclude(
  deliveries,
  "actionErrorRef.current?.scrollIntoView",
  "Delivery-action errors must be brought into view on mobile.",
);
mustInclude(
  deliveries,
  "formatPHDateTime",
  "Delivery timestamps must use the existing PH datetime formatter.",
);
mustInclude(
  deliveries,
  "timeZone: PH_TIME_ZONE",
  "Overdue/today delivery logic must use the Philippine timezone.",
);
mustInclude(
  deliveries,
  "fresh Proof of Delivery photo",
  "Fresh POD completion requirement must remain.",
);
mustInclude(
  deliveries,
  "Record Payment Again",
  "Rejected-payment recovery action must remain.",
);
mustInclude(
  deliveries,
  "DeliverySignaturePad",
  "Recipient signature workflow must remain.",
);

mustInclude(
  history,
  'const [retryAvailable, setRetryAvailable] = useState(false);',
  "History must track whether a load failure can be retried.",
);
mustInclude(
  history,
  'throw new Error("Invalid delivery history response.");',
  "History must reject malformed successful responses.",
);
mustInclude(
  history,
  "setReloadToken((value) => value + 1)",
  "History must expose Retry for load failures.",
);
mustInclude(
  history,
  'error ? "—" : `${pagination.total} total`',
  "History must not show a fake zero total during load failure.",
);

mustInclude(
  css,
  "max-height: calc(100dvh - 24px);",
  "Failure/Undo dialogs must be mobile viewport safe.",
);
mustInclude(
  css,
  "text-overflow: ellipsis;",
  "Long proof filenames must remain inside the mobile layout.",
);
mustInclude(
  css,
  "safe-area-inset-bottom",
  "Existing fixed-nav safe-area support must remain.",
);
mustInclude(
  css,
  "grid-template-columns: repeat(3, minmax(0, 1fr)) !important;",
  "Existing 3x2 mobile delivery filters must remain.",
);

console.log(
  "PASS: Delivery Personnel mobile reliability/responsiveness integrity checks passed.",
);
