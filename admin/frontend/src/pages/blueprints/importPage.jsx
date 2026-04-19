import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../../services/api";

const REFERENCE_VIEWS = [
  { key: "front", label: "Front Reference" },
  { key: "back", label: "Back Reference" },
  { key: "left", label: "Left Reference" },
  { key: "right", label: "Right Reference" },
  { key: "top", label: "Top Reference" },
];

const EMPTY_FILES = {
  front: null,
  back: null,
  left: null,
  right: null,
  top: null,
};

const EMPTY_PREVIEWS = {
  front: "",
  back: "",
  left: "",
  right: "",
  top: "",
};

export default function ImportPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const inputRefs = useRef({});

  const [files, setFiles] = useState(EMPTY_FILES);
  const [previews, setPreviews] = useState(EMPTY_PREVIEWS);
  const [comments, setComments] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const uploadedCount = useMemo(
    () => REFERENCE_VIEWS.filter((item) => !!files[item.key]).length,
    [files],
  );

  const hasAnyFile = uploadedCount > 0;
  const isFullFiveViewSet = uploadedCount === REFERENCE_VIEWS.length;

  useEffect(() => {
    return () => {
      Object.values(previews).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previews]);

  const openPicker = (viewKey) => {
    inputRefs.current?.[viewKey]?.click?.();
  };

  const handleFileChange = (viewKey, e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const isValid =
      selectedFile.type.startsWith("image/") ||
      selectedFile.type === "application/pdf";

    if (!isValid) {
      toast.error("Please upload an image or PDF file.");
      e.target.value = null;
      return;
    }

    setFiles((prev) => ({
      ...prev,
      [viewKey]: selectedFile,
    }));

    setPreviews((prev) => {
      if (prev[viewKey]) URL.revokeObjectURL(prev[viewKey]);

      return {
        ...prev,
        [viewKey]: selectedFile.type.startsWith("image/")
          ? URL.createObjectURL(selectedFile)
          : "",
      };
    });

    e.target.value = null;
  };

  const handleRemove = (viewKey, e) => {
    if (e) e.stopPropagation();

    setFiles((prev) => ({
      ...prev,
      [viewKey]: null,
    }));

    setPreviews((prev) => {
      if (prev[viewKey]) URL.revokeObjectURL(prev[viewKey]);

      return {
        ...prev,
        [viewKey]: "",
      };
    });
  };

  const handleImport = async () => {
    if (!hasAnyFile) {
      toast.error("Upload at least one reference image or PDF.");
      return;
    }

    setIsSaving(true);

    try {
      const blueprintRes = await api.get(`/blueprints/${id}`);
      const currentData = blueprintRes.data;

      let designData = {};
      try {
        designData = JSON.parse(currentData.design_data || "{}");
      } catch {
        designData = {};
      }

      delete designData.reference_file;
      delete designData.referenceFile;
      delete designData.reference_files;
      delete designData.referenceFiles;

      if (designData.ai3d?.sourceImageUrl?.startsWith?.("data:")) {
        designData.ai3d.sourceImageUrl = "";
      }

      const emptyCalibration = {
        points: [],
        realDistanceMm: 0,
        pixelsPerMm: 0,
        isCalibrated: false,
      };

      designData.components = [];
      designData.traceObjects = [];
      designData.traceObjectsByView = {
        front: [],
        back: [],
        left: [],
        right: [],
        top: [],
      };
      designData.referenceCalibration = emptyCalibration;
      designData.referenceCalibrationByView = {
        front: { ...emptyCalibration },
        back: { ...emptyCalibration },
        left: { ...emptyCalibration },
        right: { ...emptyCalibration },
        top: { ...emptyCalibration },
      };
      designData.importComments = comments || "";
      designData.editorMode = "reference";
      designData.startMode = "reference";
      designData.referenceImportMode = isFullFiveViewSet
        ? "full-5-view"
        : "partial";

      const formData = new FormData();

      REFERENCE_VIEWS.forEach((item) => {
        const file = files[item.key];
        if (file) {
          formData.append(`${item.key}_reference`, file);
        }
      });

      formData.append("design_data", JSON.stringify(designData));

      await api.put(`/blueprints/${id}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      toast.success(
        isFullFiveViewSet
          ? "5-view references imported successfully!"
          : "Reference file imported successfully!",
      );

      navigate(`/admin/blueprints/${id}/design`);
    } catch (error) {
      console.error("handleImport error:", error);
      toast.error(
        error?.response?.data?.message ||
          "Import failed. Check server connection.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "calc(100vh - 64px)",
        background: "#f4f4f5",
        color: "#18181b",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 20px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e4e4e7",
          borderRadius: 16,
          width: "100%",
          maxWidth: 1100,
          padding: 32,
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 24,
            fontWeight: 800,
            color: "#0a0a0a",
            letterSpacing: "-0.02em",
          }}
        >
          Import Reference Views
        </h2>

        <p
          style={{
            margin: "0 0 24px",
            fontSize: 13,
            color: "#52525b",
            lineHeight: 1.5,
          }}
        >
          You may upload a single reference image, a partial set, or a full
          5-view set. Front / side / top combinations are supported, but full
          5-view import is still recommended for better tracing.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 16,
            marginBottom: 28,
          }}
        >
          {REFERENCE_VIEWS.map((item) => {
            const file = files[item.key];
            const preview = previews[item.key];
            const hasFile = !!file;

            return (
              <div key={item.key}>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  ref={(el) => {
                    inputRefs.current[item.key] = el;
                  }}
                  onChange={(e) => handleFileChange(item.key, e)}
                  style={{ display: "none" }}
                />

                <div
                  onClick={() => openPicker(item.key)}
                  style={{
                    border: hasFile
                      ? "2px solid #18181b"
                      : "2px dashed #d4d4d8",
                    borderRadius: 12,
                    minHeight: 220,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    background: hasFile ? "#fafafa" : "#ffffff",
                    transition: "all 0.2s",
                    padding: 16,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {preview ? (
                    <img
                      src={preview}
                      alt={`${item.label} preview`}
                      style={{
                        width: "100%",
                        maxHeight: 160,
                        objectFit: "contain",
                        opacity: 1,
                        borderRadius: 8,
                        marginBottom: 16,
                      }}
                    />
                  ) : hasFile ? (
                    <div
                      style={{
                        color: "#18181b",
                        fontWeight: 700,
                        fontSize: 13,
                        textAlign: "center",
                        wordBreak: "break-word",
                        marginBottom: 16,
                      }}
                    >
                      📄 {file.name}
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          color: "#71717a",
                        }}
                      >
                        PDF selected
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 24,
                          marginBottom: 8,
                          color: "#18181b",
                        }}
                      >
                        📥
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#18181b",
                          fontWeight: 800,
                          textAlign: "center",
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#71717a",
                          marginTop: 6,
                        }}
                      >
                        JPG, PNG, or PDF
                      </div>
                    </>
                  )}

                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: hasFile ? "#18181b" : "#f4f4f5",
                      borderTop: hasFile ? "none" : "1px solid #e4e4e7",
                      padding: "8px 0",
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      color: hasFile ? "#ffffff" : "#71717a",
                    }}
                  >
                    {item.key} {hasFile && "✓"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPicker(item.key);
                    }}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #e4e4e7",
                      background: "#f4f4f5",
                      color: "#18181b",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 12,
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#e4e4e7")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "#f4f4f5")
                    }
                  >
                    {hasFile ? "Replace" : "Upload"}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleRemove(item.key, e)}
                    disabled={!hasFile}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#991b1b",
                      cursor: hasFile ? "pointer" : "not-allowed",
                      fontWeight: 700,
                      fontSize: 12,
                      opacity: hasFile ? 1 : 0.45,
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      hasFile && (e.currentTarget.style.background = "#fee2e2")
                    }
                    onMouseLeave={(e) =>
                      hasFile && (e.currentTarget.style.background = "#fef2f2")
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginBottom: 32 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 8,
              color: "#18181b",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Blueprint Details & Dimensions
          </label>

          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Type any specific dimensions, materials, or instructions here..."
            rows={4}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 8,
              background: "#ffffff",
              border: "1px solid #e4e4e7",
              color: "#18181b",
              fontSize: 13,
              resize: "vertical",
              boxSizing: "border-box",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "flex-end",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              flex: 1,
              fontSize: 13,
              color: hasAnyFile ? "#059669" : "#dc2626",
              fontWeight: 700,
            }}
          >
            {hasAnyFile
              ? `${uploadedCount} reference view${uploadedCount === 1 ? "" : "s"} selected${
                  isFullFiveViewSet ? " · full 5-view set ✓" : ""
                }`
              : "⚠️ Upload at least one reference view first"}
          </div>

          <button
            onClick={() => navigate(`/admin/blueprints/${id}/design`)}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              background: "#f4f4f5",
              color: "#18181b",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 13,
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e4e4e7")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f4f4f5")}
          >
            Cancel
          </button>

          <button
            onClick={handleImport}
            disabled={!hasAnyFile || isSaving}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "1px solid #18181b",
              background: "#18181b",
              color: "#fff",
              cursor: hasAnyFile && !isSaving ? "pointer" : "not-allowed",
              fontWeight: 700,
              fontSize: 13,
              opacity: hasAnyFile && !isSaving ? 1 : 0.6,
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) =>
              hasAnyFile &&
              !isSaving &&
              (e.currentTarget.style.background = "#3f3f46")
            }
            onMouseLeave={(e) =>
              hasAnyFile &&
              !isSaving &&
              (e.currentTarget.style.background = "#18181b")
            }
          >
            {isSaving
              ? "Importing..."
              : isFullFiveViewSet
                ? "📥 Import 5 Views"
                : "📥 Import References"}
          </button>
        </div>
      </div>
    </div>
  );
}
