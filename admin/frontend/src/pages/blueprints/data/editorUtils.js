// General Blueprint editor helpers that do not depend on component state.
import toast from "react-hot-toast";

export const deepClone = (value) => JSON.parse(JSON.stringify(value));

export const createObjectId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `obj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function openBlueprintWindow(html, autoPrint = false) {
  const win = window.open(
    "about:blank",
    "_blank",
    "width=1280,height=900,resizable=yes,scrollbars=yes",
  );

  if (!win) {
    toast.error("Popup blocked. I-allow ang popups para sa export/print.");
    return false;
  }

  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (err) {
    console.error("openBlueprintWindow write error:", err);
    toast.error("Failed to prepare export/print window.");
    try {
      win.close();
    } catch {}
    return false;
  }

  try {
    win.opener = null;
  } catch {}

  const triggerPrint = () => {
    if (!autoPrint || win.closed) return;

    const run = () => {
      try {
        win.focus();
        setTimeout(() => {
          try {
            win.print();
          } catch (printErr) {
            console.error("print error:", printErr);
            toast.error("Failed to open print dialog.");
          }
        }, 250);
      } catch (focusErr) {
        console.error("focus/print error:", focusErr);
      }
    };

    if (win.document.readyState === "complete") {
      run();
      return;
    }

    win.addEventListener(
      "load",
      () => {
        run();
      },
      { once: true },
    );
  };

  triggerPrint();
  return true;
}
