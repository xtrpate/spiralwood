"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const tar = require("tar");

const DOWNLOAD_URL =
  "https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz";

const targetDir = path.join(__dirname, "..", "data", "geoip");
const targetFile = path.join(targetDir, "GeoLite2-City.mmdb");

const clean = (value) => String(value || "").trim();

const findFileRecursive = async (root, filename) => {
  const entries = await fsp.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isFile() && entry.name === filename) {
      return fullPath;
    }

    if (entry.isDirectory()) {
      const nested = await findFileRecursive(fullPath, filename);
      if (nested) return nested;
    }
  }

  return null;
};

const main = async () => {
  const accountId = clean(process.env.MAXMIND_ACCOUNT_ID);
  const licenseKey = clean(process.env.MAXMIND_LICENSE_KEY);

  if (!accountId && !licenseKey) {
    console.log(
      "[GeoLite] MAXMIND_ACCOUNT_ID / MAXMIND_LICENSE_KEY not set; skipping City database download.",
    );
    return;
  }

  if (!accountId || !licenseKey) {
    throw new Error(
      "[GeoLite] Both MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY are required.",
    );
  }

  const tempRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "wisdom-geolite-"),
  );
  const archivePath = path.join(tempRoot, "GeoLite2-City.tar.gz");
  const extractDir = path.join(tempRoot, "extract");

  try {
    await fsp.mkdir(extractDir, { recursive: true });

    const auth = Buffer.from(`${accountId}:${licenseKey}`).toString("base64");

    console.log("[GeoLite] Downloading latest GeoLite2-City database...");

    const response = await fetch(DOWNLOAD_URL, {
      method: "GET",
      redirect: "follow",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/gzip, application/octet-stream, */*",
        "User-Agent": "WISDOM-GeoLite-Updater/1.0",
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `[GeoLite] Download failed with HTTP ${response.status}.`,
      );
    }

    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(archivePath),
    );

    await tar.x({
      file: archivePath,
      cwd: extractDir,
      gzip: true,
      strict: true,
    });

    const extractedDb = await findFileRecursive(
      extractDir,
      "GeoLite2-City.mmdb",
    );

    if (!extractedDb) {
      throw new Error(
        "[GeoLite] GeoLite2-City.mmdb was not found in the downloaded archive.",
      );
    }

    await fsp.mkdir(targetDir, { recursive: true });

    const nextFile = `${targetFile}.next`;
    await fsp.copyFile(extractedDb, nextFile);
    await fsp.rm(targetFile, { force: true });
    await fsp.rename(nextFile, targetFile);

    const stats = await fsp.stat(targetFile);
    if (!stats.isFile() || stats.size < 1024 * 1024) {
      throw new Error("[GeoLite] Downloaded database file is unexpectedly small.");
    }

    console.log(
      `[GeoLite] GeoLite2-City ready (${Math.round(
        stats.size / 1024 / 1024,
      )} MB).`,
    );
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
