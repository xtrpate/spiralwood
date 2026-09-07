"use strict";

const net = require("net");
const { AsyncLocalStorage } = require("async_hooks");

const requestIpStorage = new AsyncLocalStorage();

const isRenderRuntime = () =>
  String(process.env.RENDER || "").trim().toLowerCase() === "true";

const firstHeaderValue = (value) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : null;
  }
  return value;
};

const normalizeClientIp = (value) => {
  const raw = firstHeaderValue(value);
  if (raw === null || raw === undefined) return null;

  let candidate = String(raw).trim();
  if (!candidate) return null;

  // CF-Connecting-IP / CF-Connecting-IPv6 should each be one address.
  // Reject a list rather than accidentally trusting an injected chain.
  if (candidate.includes(",")) return null;

  if (
    candidate.length >= 2 &&
    candidate.startsWith('"') &&
    candidate.endsWith('"')
  ) {
    candidate = candidate.slice(1, -1).trim();
  }

  // [IPv6]:port or [IPv6]
  if (candidate.startsWith("[")) {
    const close = candidate.indexOf("]");
    if (close > 1) {
      candidate = candidate.slice(1, close);
    }
  }

  // IPv4:port
  const ipv4WithPort = candidate.match(
    /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/,
  );
  if (ipv4WithPort && net.isIP(ipv4WithPort[1]) === 4) {
    candidate = ipv4WithPort[1];
  }

  // IPv4-mapped IPv6.
  if (candidate.toLowerCase().startsWith("::ffff:")) {
    const mapped = candidate.slice(7);
    if (net.isIP(mapped) === 4) {
      candidate = mapped;
    }
  }

  // Remove an IPv6 zone identifier from local/socket values.
  const zoneIndex = candidate.indexOf("%");
  if (zoneIndex > 0 && candidate.includes(":")) {
    candidate = candidate.slice(0, zoneIndex);
  }

  return net.isIP(candidate) ? candidate : null;
};

const getClientIp = (req) => {
  if (!req) return null;

  if (isRenderRuntime()) {
    /*
     * Render public web-service traffic passes through Cloudflare.
     * CF-Connecting-IP is generated/overwritten by Cloudflare before the
     * request reaches the Render service, so it is the preferred source.
     *
     * If Cloudflare Pseudo IPv4 "Overwrite Headers" is ever enabled,
     * CF-Connecting-IPv6 carries the visitor's original IPv6 address.
     */
    const connectingIpv6 = normalizeClientIp(
      req.headers?.["cf-connecting-ipv6"],
    );
    if (connectingIpv6 && net.isIP(connectingIpv6) === 6) {
      return connectingIpv6;
    }

    const connectingIp = normalizeClientIp(
      req.headers?.["cf-connecting-ip"],
    );
    if (connectingIp) {
      return connectingIp;
    }

    /*
     * Fail closed for forwarded-header trust:
     * do not blindly use the left-most X-Forwarded-For value.
     * If the trusted Cloudflare header is unexpectedly unavailable, use the
     * normal Express/socket address instead. That can be a Render proxy IP,
     * but it is preferable to persisting a spoofed address.
     */
  }

  return (
    normalizeClientIp(req.ip) ||
    normalizeClientIp(req.socket?.remoteAddress) ||
    normalizeClientIp(req.connection?.remoteAddress) ||
    null
  );
};

const clientIpContextMiddleware = (req, _res, next) => {
  const clientIp = getClientIp(req);
  requestIpStorage.run({ clientIp }, () => next());
};

const getRequestClientIp = () =>
  requestIpStorage.getStore()?.clientIp || null;

module.exports = {
  normalizeClientIp,
  getClientIp,
  clientIpContextMiddleware,
  getRequestClientIp,
};
