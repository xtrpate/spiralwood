"use strict";

const fs = require("fs");
const net = require("net");
const path = require("path");

const DEFAULT_DB_PATH = path.join(
  __dirname,
  "..",
  "data",
  "geoip",
  "GeoLite2-City.mmdb",
);

let readerPromise = null;
let readerPath = null;
let lookupOverrideForTests = null;

const cleanText = (value, maxLength = 120) => {
  if (value === null || value === undefined) return null;
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, maxLength) : null;
};

const normalizeCountryCode = (value) => {
  const clean = cleanText(value, 2)?.toUpperCase() || null;
  if (!clean || !/^[A-Z]{2}$/.test(clean)) return null;
  if (clean === "XX") return null;
  return clean;
};

const isPublicIp = (value) => {
  const ip = String(value || "").trim();
  const version = net.isIP(ip);
  if (!version) return false;

  if (version === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;

    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;

    // Documentation/test networks.
    if (a === 192 && b === 0 && parts[2] === 2) return false;
    if (a === 198 && b === 51 && parts[2] === 100) return false;
    if (a === 203 && b === 0 && parts[2] === 113) return false;

    return true;
  }

  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false;

  const firstHextet = Number.parseInt(lower.split(":")[0] || "0", 16);
  if (Number.isInteger(firstHextet)) {
    if ((firstHextet & 0xffc0) === 0xfe80) return false; // link local
    if ((firstHextet & 0xff00) === 0xff00) return false; // multicast
  }

  if (lower.startsWith("2001:db8:") || lower === "2001:db8::") {
    return false;
  }

  return true;
};

const getGeoLiteDatabasePath = () => {
  const configured = cleanText(process.env.GEOLITE2_CITY_DB_PATH, 1000);
  return configured ? path.resolve(configured) : DEFAULT_DB_PATH;
};

const getEnglishName = (record) =>
  cleanText(record?.names?.en || record?.name, 120);

const parseGeoLiteCity = (data) => {
  const countryCode = normalizeCountryCode(
    data?.country?.isoCode || data?.country?.iso_code,
  );
  const subdivisions = Array.isArray(data?.subdivisions)
    ? data.subdivisions
    : [];
  const mostSpecificSubdivision =
    subdivisions.length > 0 ? subdivisions[subdivisions.length - 1] : null;

  return {
    countryCode,
    region: getEnglishName(mostSpecificSubdivision),
    city: getEnglishName(data?.city),
  };
};

const openLocalReader = async () => {
  const dbPath = getGeoLiteDatabasePath();

  if (!fs.existsSync(dbPath)) {
    return null;
  }

  if (readerPromise && readerPath === dbPath) {
    return readerPromise;
  }

  readerPath = dbPath;
  readerPromise = import("@maxmind/geoip2-node")
    .then(({ Reader }) => Reader.open(dbPath))
    .catch(() => {
      readerPromise = null;
      readerPath = null;
      return null;
    });

  return readerPromise;
};

const lookupLocalCity = async (ipAddress) => {
  const ip = String(ipAddress || "").trim();
  if (!isPublicIp(ip)) return null;

  if (lookupOverrideForTests) {
    return lookupOverrideForTests(ip);
  }

  const reader = await openLocalReader();
  if (!reader) return null;

  try {
    return parseGeoLiteCity(reader.city(ip));
  } catch {
    return null;
  }
};

const resolveApproximateLocation = async ({
  ipAddress,
  actorType,
  countryCode = null,
  region = null,
  city = null,
}) => {
  const actor = String(actorType || "").trim().toLowerCase();
  const base = {
    countryCode: normalizeCountryCode(countryCode),
    region: cleanText(region, 120),
    city: cleanText(city, 120),
  };

  // A background/system event does not represent a person's location.
  if (actor === "system") {
    return {
      countryCode: null,
      region: null,
      city: null,
    };
  }

  // For webhooks, the stored location is only the provider request origin.
  // Do not run a customer-style GeoLite lookup.
  if (actor === "webhook") {
    return base;
  }

  if (actor !== "user" && actor !== "anonymous") {
    return base;
  }

  if (base.countryCode && base.region && base.city) {
    return base;
  }

  const geo = await lookupLocalCity(ipAddress);
  if (!geo) return base;

  // Cloudflare's country value is already trusted in production. Never mix a
  // local database city/region with a different trusted country.
  if (
    base.countryCode &&
    geo.countryCode &&
    base.countryCode !== geo.countryCode
  ) {
    return base;
  }

  return {
    countryCode: base.countryCode || geo.countryCode || null,
    region: base.region || geo.region || null,
    city: base.city || geo.city || null,
  };
};

const setIpLocationLookupForTests = (lookup) => {
  lookupOverrideForTests = typeof lookup === "function" ? lookup : null;
};

const resetIpGeolocationForTests = () => {
  lookupOverrideForTests = null;
  readerPromise = null;
  readerPath = null;
};

module.exports = {
  isPublicIp,
  getGeoLiteDatabasePath,
  parseGeoLiteCity,
  resolveApproximateLocation,
  setIpLocationLookupForTests,
  resetIpGeolocationForTests,
};
