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

  const handleRemove = (viewKey) => {
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
        background: "#0f172a",
        color: "#e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 12,
          width: "100%",
          maxWidth: 1100,
          padding: 30,
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
        }}
      >
        <h2
          style={{
            margin: "0 0 5px",
            fontSize: 24,
            fontWeight: 700,
            color: "#f8fafc",
          }}
        >
          Import Reference Views
        </h2>

        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#94a3b8" }}>
          You may upload a single reference image, a partial set, or a full
          5-view set. Front / side / top combinations are supported, but full
          5-view import is still recommended for better tracing.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 14,
            marginBottom: 24,
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
                      ? "2px solid #0ea5e9"
                      : "2px dashed #475569",
                    borderRadius: 10,
                    minHeight: 220,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    background: hasFile ? "#0f172a" : "transparent",
                    transition: "all 0.2s",
                    padding: 14,
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
                        maxHeight: 180,
                        objectFit: "contain",
                        opacity: 0.92,
                      }}
                    />
                  ) : hasFile ? (
                    <div
                      style={{
                        color: "#38bdf8",
                        fontWeight: 600,
                        fontSize: 13,
                        textAlign: "center",
                        wordBreak: "break-word",
                      }}
                    >
                      📄 {file.name}
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          color: "#94a3b8",
                        }}
                      >
                        PDF selected
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>📥</div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#cbd5e1",
                          fontWeight: 700,
                          textAlign: "center",
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
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
                      background: "rgba(15, 23, 42, 0.9)",
                      padding: "6px 0",
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: hasFile ? "#38bdf8" : "#cbd5e1",
                    }}
                  >
                    {item.key} {hasFile && "✓"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => openPicker(item.key)}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #334155",
                      background: "#0f172a",
                      color: "#cbd5e1",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {hasFile ? "Replace" : "Upload"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemove(item.key)}
                    disabled={!hasFile}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #7f1d1d",
                      background: "rgba(127, 29, 29, 0.15)",
                      color: "#fca5a5",
                      cursor: hasFile ? "pointer" : "not-allowed",
                      fontWeight: 600,
                      opacity: hasFile ? 1 : 0.45,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginBottom: 30 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
              color: "#cbd5e1",
            }}
          >
            Blueprint Details & Dimensions
          </label>

          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Type any specific dimensions, materials, or instructions here..."
            rows={3}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 6,
              background: "#0f172a",
              border: "1px solid #334155",
              color: "#f8fafc",
              fontSize: 14,
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <div
            style={{
              flex: 1,
              fontSize: 12,
              color: hasAnyFile ? "#10b981" : "#f43f5e",
              fontWeight: 600,
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
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "#94a3b8",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleImport}
            disabled={!hasAnyFile || isSaving}
            style={{
              padding: "10px 24px",
              borderRadius: 6,
              border: "none",
              background: "#0ea5e9",
              color: "#fff",
              cursor: hasAnyFile && !isSaving ? "pointer" : "not-allowed",
              fontWeight: 600,
              opacity: hasAnyFile && !isSaving ? 1 : 0.5,
            }}
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
