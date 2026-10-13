const pool = require("../../config/db");

const SITE_URL = "https://www.spiralwoodservice.com";

// Pages without a verified, reliable last-modified timestamp.
const STATIC_PUBLIC_URLS = [
  "/",
  "/catalog",
  "/customize",
  "/terms",
  "/privacy",
];

// These editable pages have an updated_at field in website_content.
const EDITABLE_PAGE_URLS = [
  { path: "/about", key: "about_us" },
  { path: "/contact", key: "contact" },
];

const FAQ_URL = "/faq";

function formatLastmod(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

exports.getSitemap = async (req, res) => {
  try {
    const [pageRows] = await pool.query(
      `SELECT content_key, updated_at
       FROM website_content
       WHERE content_type = 'page'
         AND content_key IN ('about_us', 'contact')
         AND is_visible = 1`,
    );

    const lastmodByKey = new Map(
      pageRows.map((row) => [row.content_key, formatLastmod(row.updated_at)]),
    );

    const urls = [
      ...STATIC_PUBLIC_URLS.map((path) => ({
        path,
        lastmod: null,
      })),

      ...EDITABLE_PAGE_URLS.map((page) => ({
        path: page.path,
        lastmod: lastmodByKey.get(page.key) || null,
      })),

      {
        path: FAQ_URL,
        lastmod: null,
      },
    ];

    const xmlEntries = urls.map(({ path, lastmod }) => {
      const loc = `${SITE_URL}${path === "/" ? "/" : path}`;

      return [
        "  <url>",
        `    <loc>${escapeXml(loc)}</loc>`,
        ...(lastmod ? [`    <lastmod>${escapeXml(lastmod)}</lastmod>`] : []),
        "  </url>",
      ].join("\n");
    });

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...xmlEntries,
      "</urlset>",
      "",
    ].join("\n");

    res.status(200);
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=0, s-maxage=300");

    return res.send(xml);
  } catch (error) {
    console.error("[sitemap] Failed to generate sitemap:", error);

    return res
      .status(500)
      .type("text/plain")
      .send("Unable to generate sitemap.");
  }
};
