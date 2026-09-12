const sanitizeFilenamePart = (value, fallback = "file") => {
  const safe = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return safe || fallback;
};

const extensionFromContentType = (contentType = "") => {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  if (type === "application/pdf") return ".pdf";
  return "";
};

const extensionFromUrl = (url = "") => {
  try {
    const parsed = new URL(url, window.location.href);
    const match = parsed.pathname.match(/(\.[a-zA-Z0-9]{2,5})$/);
    return match ? match[1].toLowerCase() : "";
  } catch {
    return "";
  }
};

export async function downloadRemoteFile(url, filename = "download") {
  const source = String(url || "").trim();
  if (!source) throw new Error("The file is not available for download.");

  const resolvedUrl = new URL(source, window.location.href);
  const response = await fetch(resolvedUrl.href, {
    method: "GET",
    credentials: resolvedUrl.origin === window.location.origin
      ? "include"
      : "omit",
  });

  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error("The downloaded file is empty.");

  const requestedName = sanitizeFilenamePart(filename, "download");
  const hasExtension = /\.[a-zA-Z0-9]{2,5}$/.test(requestedName);
  const extension = hasExtension
    ? ""
    : extensionFromContentType(blob.type) || extensionFromUrl(resolvedUrl.href);
  const finalName = `${requestedName}${extension}`;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = finalName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return finalName;
}

export { sanitizeFilenamePart };
