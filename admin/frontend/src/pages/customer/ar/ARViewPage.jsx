/* WISDOM ROOMLE-STYLE AR V1.0.17 - Google Search Scene Viewer stability path */
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import api from "../../../services/api";
import "./ar-roomle.css";

const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+X1Y5WQAAAABJRU5ErkJggg==";

const formatMm = (value) => {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? Math.round(number)
    : "—";
};

const detectDevice = () => {
  const ua = String(navigator.userAgent || "");

  const iOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (
      navigator.platform === "MacIntel" &&
      Number(navigator.maxTouchPoints || 0) > 1
    );

  if (iOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
};

const resolveApiOrigin = () => {
  const base = String(api.defaults.baseURL || "").trim();

  if (/^https?:\/\//i.test(base)) {
    try {
      return new URL(base).origin;
    } catch (_error) {
      return window.location.origin;
    }
  }

  return window.location.origin;
};

const resolveApiAssetUrl = (path) => {
  const raw = String(path || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) return raw;

  return new URL(raw, `${resolveApiOrigin()}/`).href;
};

const preferSecureAssetUrl = (secureUrl, fallbackPath) => {
  const publicUrl = String(secureUrl || "").trim();

  if (publicUrl.startsWith("https://")) {
    return publicUrl;
  }

  return resolveApiAssetUrl(fallbackPath);
};

const buildAndroidSceneViewerIntent = (
  glbUrl,
  fallbackUrl,
) => {
  if (!glbUrl) return "";

  const query = [
    `file=${encodeURIComponent(glbUrl)}`,
    "mode=ar_preferred",
    "resizable=false",
    `title=${encodeURIComponent("WISDOM Furniture")}`,
  ].join("&");

  return (
    `intent://arvr.google.com/scene-viewer/1.0?${query}` +
    "#Intent;" +
    "scheme=https;" +
    "package=com.google.android.googlequicksearchbox;" +
    "action=android.intent.action.VIEW;" +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};` +
    "end;"
  );
};

export default function ARViewPage() {
  const { sessionId } = useParams();

  const [state, setState] = useState({
    status: "loading",
    manifest: null,
    error: "",
  });

  const device = useMemo(detectDevice, []);

  useEffect(() => {
    let active = true;

    setState({
      status: "loading",
      manifest: null,
      error: "",
    });

    api
      .get(
        `/public/ar/sessions/${encodeURIComponent(
          String(sessionId || ""),
        )}`,
        { timeout: 30000 },
      )
      .then((response) => {
        if (!active) return;

        setState({
          status: "ready",
          manifest: response.data || null,
          error: "",
        });
      })
      .catch((error) => {
        if (!active) return;

        setState({
          status: "error",
          manifest: null,
          error:
            error?.response?.data?.message ||
            "This AR preview could not be loaded.",
        });
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  const glbUrl = useMemo(
    () =>
      preferSecureAssetUrl(
        state.manifest?.glb_url,
        state.manifest?.glb_path,
      ),
    [state.manifest],
  );

  const usdzUrl = useMemo(
    () =>
      preferSecureAssetUrl(
        state.manifest?.usdz_url,
        state.manifest?.usdz_path,
      ),
    [state.manifest],
  );

  const hasSecureGlb = glbUrl.startsWith("https://");
  const hasSecureUsdz = usdzUrl.startsWith("https://");

  const quickLookUrl = useMemo(
    () =>
      usdzUrl
        ? `${usdzUrl}#allowsContentScaling=0`
        : "",
    [usdzUrl],
  );

  const androidIntent = useMemo(
    () =>
      buildAndroidSceneViewerIntent(
        glbUrl,
        window.location.href,
      ),
    [glbUrl],
  );

  return (
    <main className="wisdom-ar-mobile-page">
      <section className="wisdom-ar-mobile-card">
        <div className="wisdom-ar-mobile-brand">
          WISDOM
        </div>

        {state.status === "loading" ? (
          <div className="wisdom-ar-mobile-state">
            <div className="wisdom-ar-spinner" />
            <h1>Loading your furniture</h1>
            <p>Preparing the AR viewer for this device.</p>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="wisdom-ar-mobile-state">
            <div className="wisdom-ar-error-mark">!</div>
            <h1>AR preview unavailable</h1>
            <p>{state.error}</p>
          </div>
        ) : null}

        {state.status === "ready" && state.manifest ? (
          <>
            <div className="wisdom-ar-mobile-heading">
              <span>VIEW IN YOUR ROOM</span>
              <h1>Your customized furniture is ready</h1>
              <p>
                Place it on a detected floor and walk around it to
                check the fit from different angles.
              </p>
            </div>

            <div className="wisdom-ar-mobile-size">
              <span>Configured real-world size</span>
              <strong>
                {formatMm(
                  state.manifest?.dimensions_mm?.width_mm,
                )}{" "}
                ×{" "}
                {formatMm(
                  state.manifest?.dimensions_mm?.height_mm,
                )}{" "}
                ×{" "}
                {formatMm(
                  state.manifest?.dimensions_mm?.depth_mm,
                )}{" "}
                mm
              </strong>
            </div>

            {device === "android" && hasSecureGlb ? (
              <a
                className="wisdom-ar-launch-button"
                href={androidIntent}
              >
                View in your room
              </a>
            ) : null}

            {device === "ios" && hasSecureUsdz ? (
              <a
                className="wisdom-ar-launch-button wisdom-ar-quicklook-link"
                rel="ar"
                href={quickLookUrl}
                aria-label="View in your room"
              >
                <img
                  src={TRANSPARENT_PNG}
                  alt=""
                  aria-hidden="true"
                />
              </a>
            ) : null}

            {device === "android" && !hasSecureGlb ? (
              <div className="wisdom-ar-device-note">
                This preview does not have a public HTTPS Android
                model. Close it and create a new AR preview.
              </div>
            ) : null}

            {device === "ios" && !hasSecureUsdz ? (
              <div className="wisdom-ar-device-note">
                This preview does not have a public HTTPS iPhone
                model. Close it and create a new AR preview.
              </div>
            ) : null}

            {device === "other" ? (
              <div className="wisdom-ar-device-note">
                Open this link on a supported Android phone,
                iPhone, or iPad to place the furniture in AR.
              </div>
            ) : null}

            <div className="wisdom-ar-mobile-tips">
              <strong>For the most accurate check</strong>
              <p>
                Move your phone slowly until the floor is detected.
                Place the furniture, then walk around it. Android
                starts in Google Scene Viewer AR with resizing disabled;
                iPhone Quick Look launches with content scaling disabled.
              </p>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
