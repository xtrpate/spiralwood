"use strict";

const assert = require("node:assert/strict");

const {
  isPublicIp,
  parseGeoLiteCity,
  resolveApproximateLocation,
  setIpLocationLookupForTests,
  resetIpGeolocationForTests,
} = require("../utils/ipGeolocation");

(async () => {
  try {
    assert.equal(isPublicIp("127.0.0.1"), false);
    assert.equal(isPublicIp("::1"), false);
    assert.equal(isPublicIp("192.168.1.10"), false);
    assert.equal(isPublicIp("10.0.0.1"), false);
    assert.equal(isPublicIp("8.8.8.8"), true);
    assert.equal(isPublicIp("1.1.1.1"), true);

    assert.deepEqual(
      parseGeoLiteCity({
        country: { isoCode: "PH" },
        subdivisions: [{ names: { en: "Central Luzon" } }],
        city: { names: { en: "Angeles City" } },
      }),
      {
        countryCode: "PH",
        region: "Central Luzon",
        city: "Angeles City",
      },
    );

    let lookupCount = 0;
    setIpLocationLookupForTests(async () => {
      lookupCount += 1;
      return {
        countryCode: "PH",
        region: "Central Luzon",
        city: "Angeles City",
      };
    });

    assert.deepEqual(
      await resolveApproximateLocation({
        ipAddress: "8.8.8.8",
        actorType: "user",
        countryCode: "PH",
      }),
      {
        countryCode: "PH",
        region: "Central Luzon",
        city: "Angeles City",
      },
    );
    assert.equal(lookupCount, 1);

    // Full trusted location should not need a local DB lookup.
    assert.deepEqual(
      await resolveApproximateLocation({
        ipAddress: "8.8.8.8",
        actorType: "user",
        countryCode: "PH",
        region: "Central Luzon",
        city: "Angeles City",
      }),
      {
        countryCode: "PH",
        region: "Central Luzon",
        city: "Angeles City",
      },
    );
    assert.equal(lookupCount, 1);

    // Webhook location is provider origin only; no customer-style lookup.
    assert.deepEqual(
      await resolveApproximateLocation({
        ipAddress: "8.8.8.8",
        actorType: "webhook",
        countryCode: "SG",
      }),
      {
        countryCode: "SG",
        region: null,
        city: null,
      },
    );
    assert.equal(lookupCount, 1);

    // System jobs do not represent a person's location.
    assert.deepEqual(
      await resolveApproximateLocation({
        ipAddress: "8.8.8.8",
        actorType: "system",
        countryCode: "SG",
        region: "Singapore",
        city: "Singapore",
      }),
      {
        countryCode: null,
        region: null,
        city: null,
      },
    );
    assert.equal(lookupCount, 1);

    // Never combine a fallback city with a different trusted country.
    setIpLocationLookupForTests(async () => ({
      countryCode: "US",
      region: "California",
      city: "Los Angeles",
    }));

    assert.deepEqual(
      await resolveApproximateLocation({
        ipAddress: "1.1.1.1",
        actorType: "user",
        countryCode: "PH",
      }),
      {
        countryCode: "PH",
        region: null,
        city: null,
      },
    );

    // Private/local IPs never reach the lookup.
    let privateLookupCount = 0;
    setIpLocationLookupForTests(async () => {
      privateLookupCount += 1;
      return {
        countryCode: "PH",
        region: "Central Luzon",
        city: "Angeles City",
      };
    });

    assert.deepEqual(
      await resolveApproximateLocation({
        ipAddress: "127.0.0.1",
        actorType: "user",
      }),
      {
        countryCode: null,
        region: null,
        city: null,
      },
    );
    assert.equal(privateLookupCount, 0);

    console.log(
      "PASS: local GeoLite lookup preserves trusted-country, webhook/system, and localhost semantics.",
    );
  } finally {
    resetIpGeolocationForTests();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
