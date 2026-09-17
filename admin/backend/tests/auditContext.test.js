const assert = require("node:assert/strict");

const {
  normalizeClientIp,
  clientIpContextMiddleware,
  getRequestClientIp,
  getRequestAuditContext,
} = require("../utils/clientIp");

const runMiddleware = ({ req, res = {} }) =>
  new Promise((resolve, reject) => {
    try {
      clientIpContextMiddleware(req, res, () => {
        try {
          resolve({
            context: getRequestAuditContext(),
            clientIp: getRequestClientIp(),
          });
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });

async function runTests() {
  const originalRender = process.env.RENDER;

  try {
    // ============================================================
    // TEST 1
    // IP normalization keeps valid addresses and rejects lists.
    // ============================================================
    assert.equal(normalizeClientIp("203.0.113.15"), "203.0.113.15");
    assert.equal(normalizeClientIp("::ffff:203.0.113.15"), "203.0.113.15");
    assert.equal(normalizeClientIp("203.0.113.15, 10.0.0.1"), null);

    // ============================================================
    // TEST 2
    // On Render, trusted Cloudflare headers supply visitor context.
    // Query strings must never be persisted into request_path.
    // ============================================================
    process.env.RENDER = "true";

    let responseRequestId = null;
    const renderResult = await runMiddleware({
      req: {
        method: "patch",
        originalUrl: "/api/admin/products/25?token=must-not-be-stored",
        ip: "10.0.0.9",
        headers: {
          "cf-connecting-ip": "203.0.113.25",
          "cf-ipcountry": "ph",
          "cf-region": "Central Luzon",
          "cf-ipcity": "Angeles City",
          "user-agent": "Example Browser 1.0",
        },
        socket: { remoteAddress: "10.0.0.9" },
      },
      res: {
        setHeader(name, value) {
          if (String(name).toLowerCase() === "x-request-id") {
            responseRequestId = value;
          }
        },
      },
    });

    assert.equal(renderResult.clientIp, "203.0.113.25");
    assert.equal(renderResult.context.clientIp, "203.0.113.25");
    assert.equal(renderResult.context.ipCountryCode, "PH");
    assert.equal(renderResult.context.ipRegion, "Central Luzon");
    assert.equal(renderResult.context.ipCity, "Angeles City");
    assert.equal(renderResult.context.userAgent, "Example Browser 1.0");
    assert.equal(renderResult.context.requestMethod, "PATCH");
    assert.equal(renderResult.context.requestPath, "/api/admin/products/25");
    assert.match(renderResult.context.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(responseRequestId, renderResult.context.requestId);

    // ============================================================
    // TEST 3
    // Outside Render, Cloudflare-looking headers are not trusted.
    // ============================================================
    process.env.RENDER = "false";

    const localResult = await runMiddleware({
      req: {
        method: "GET",
        originalUrl: "/api/health?x=1",
        ip: "127.0.0.1",
        headers: {
          "cf-connecting-ip": "198.51.100.10",
          "cf-ipcountry": "US",
          "cf-region": "California",
          "cf-ipcity": "Los Angeles",
          "user-agent": "Local Test",
        },
        socket: { remoteAddress: "127.0.0.1" },
      },
      res: { setHeader() {} },
    });

    assert.equal(localResult.clientIp, "127.0.0.1");
    assert.equal(localResult.context.ipCountryCode, null);
    assert.equal(localResult.context.ipRegion, null);
    assert.equal(localResult.context.ipCity, null);
    assert.equal(localResult.context.requestPath, "/api/health");

    console.log("✅ Audit request-context tests passed.");
  } finally {
    if (originalRender === undefined) {
      delete process.env.RENDER;
    } else {
      process.env.RENDER = originalRender;
    }
  }
}

runTests().catch((error) => {
  console.error("❌ Audit request-context tests failed.");
  console.error(error);
  process.exitCode = 1;
});
