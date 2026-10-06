import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const A4_LANDSCAPE_W_MM = 297;
const A4_LANDSCAPE_H_MM = 210;
const EXPORT_PAGE_W = 1200;
const EXPORT_PAGE_H = 820;
const CAPTURE_SCALE = 1.75;

function getPHDateKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function safeFileToken(value = "") {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned || "Blueprint")
    .slice(0, 80)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function createRenderFrame() {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.position = "fixed";
  frame.style.left = "-20000px";
  frame.style.top = "0";
  frame.style.width = `${EXPORT_PAGE_W}px`;
  frame.style.height = `${EXPORT_PAGE_H}px`;
  frame.style.border = "0";
  frame.style.pointerEvents = "none";
  frame.style.background = "#ffffff";
  document.body.appendChild(frame);
  return frame;
}

function loadFrameDocument(frame, html) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      frame.onload = null;
      frame.onerror = null;
    };

    frame.onload = () => {
      cleanup();
      resolve(frame.contentDocument);
    };
    frame.onerror = () => {
      cleanup();
      reject(new Error("Failed to prepare Blueprint PDF pages."));
    };

    frame.srcdoc = html;
  });
}

function addCanvasPage(pdf, canvas, isFirstPage) {
  if (!isFirstPage) {
    pdf.addPage("a4", "landscape");
  }

  const pageAspect = A4_LANDSCAPE_W_MM / A4_LANDSCAPE_H_MM;
  const canvasAspect = canvas.width / Math.max(1, canvas.height);

  let drawW = A4_LANDSCAPE_W_MM;
  let drawH = A4_LANDSCAPE_H_MM;

  if (canvasAspect > pageAspect) {
    drawH = drawW / canvasAspect;
  } else {
    drawW = drawH * canvasAspect;
  }

  const x = (A4_LANDSCAPE_W_MM - drawW) / 2;
  const y = (A4_LANDSCAPE_H_MM - drawH) / 2;

  pdf.addImage(
    canvas,
    "PNG",
    x,
    y,
    drawW,
    drawH,
    undefined,
    "FAST",
  );
}

export async function downloadBlueprintPdf({
  documentHtml = "",
  blueprintTitle = "Blueprint",
} = {}) {
  if (!String(documentHtml || "").trim()) {
    throw new Error("No Blueprint sheets are available to download.");
  }

  const frame = createRenderFrame();

  try {
    const frameDocument = await loadFrameDocument(frame, documentHtml);
    if (!frameDocument) {
      throw new Error("Blueprint PDF document could not be opened.");
    }

    if (frameDocument.fonts?.ready) {
      try {
        await frameDocument.fonts.ready;
      } catch {}
    }

    const pages = Array.from(frameDocument.querySelectorAll(".page"));
    if (!pages.length) {
      throw new Error("No Blueprint sheets were generated.");
    }

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      page.style.margin = "0";
      page.style.boxShadow = "none";

      const captureWidth = Math.max(EXPORT_PAGE_W, page.scrollWidth || 0);
      const captureHeight = Math.max(EXPORT_PAGE_H, page.scrollHeight || 0);

      const canvas = await html2canvas(page, {
        backgroundColor: "#ffffff",
        scale: CAPTURE_SCALE,
        logging: false,
        useCORS: true,
        allowTaint: false,
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: captureHeight,
        scrollX: 0,
        scrollY: 0,
      });

      addCanvasPage(pdf, canvas, index === 0);
      canvas.width = 1;
      canvas.height = 1;
    }

    const filename = `WISDOM-${safeFileToken(blueprintTitle)}-Blueprint-${getPHDateKey()}.pdf`;
    pdf.save(filename);
    return filename;
  } finally {
    frame.remove();
  }
}
