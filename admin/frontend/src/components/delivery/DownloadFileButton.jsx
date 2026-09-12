import { useState } from "react";
import { downloadRemoteFile } from "../../utils/downloadRemoteFile";

export default function DownloadFileButton({
  url,
  filename = "download",
  label = "Download",
  loadingLabel = "Downloading...",
  className = "",
  style,
  disabled = false,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    if (!url || disabled || loading) return;
    setLoading(true);
    setError("");

    try {
      await downloadRemoteFile(url, filename);
    } catch (err) {
      setError(err?.message || "Download failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 4,
        width: style?.width === "100%" ? "100%" : undefined,
      }}
    >
      <button
        type="button"
        className={className}
        style={style}
        disabled={disabled || loading || !url}
        onClick={handleDownload}
      >
        {loading ? loadingLabel : label}
      </button>
      {error ? (
        <span role="alert" style={{ color: "#b91c1c", fontSize: 10, lineHeight: 1.3 }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
