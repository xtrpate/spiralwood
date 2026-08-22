import React, { useEffect, useState } from "react";
import api from "../../../services/api";
import { MotionFeedbackOverlay } from "../../../components/MotionFeedbackOverlay";
export function BlueprintPublishModal({
  publishing,
  publishFeedbackStatus,
  setPublishModal,
  handlePublishProduct,
  publishForm,
  setPublishForm,
}) {
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const discardPublishDraft = () => {
    if (publishing) return;

    setPublishForm({
      name: "",
      description: "Custom blueprint product.",
      category_id: "",
    });
    setPublishModal(false);
  };

  useEffect(() => {
    let active = true;

    const loadCategories = async () => {
      setCategoriesLoading(true);

      try {
        const { data } = await api.get("/products/categories");
        if (!active) return;

        const nextCategories = Array.isArray(data?.categories)
          ? data.categories
          : [];

        setCategories(nextCategories);
        setPublishForm((current) => {
          const currentId = String(current?.category_id || "");
          const stillExists = nextCategories.some(
            (category) => String(category.id) === currentId,
          );

          if (!currentId || stillExists) return current;
          return { ...current, category_id: "" };
        });
      } catch {
        if (active) setCategories([]);
      } finally {
        if (active) setCategoriesLoading(false);
      }
    };

    loadCategories();

    return () => {
      active = false;
    };
  }, [setPublishForm]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.72)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !publishing) {
          discardPublishDraft();
        }
      }}
    >
      <div
        style={{
          background: "#ffffff",
          width: "min(520px, 100%)",
          borderRadius: 2,
          boxShadow: "0 24px 70px rgba(2, 6, 23, 0.28)",
          border: "1px solid #dfe3e8",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "24px 26px 18px",
            borderBottom: "1px solid #edf0f3",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#64748b",
              marginBottom: 7,
            }}
          >
            Customer catalog
          </div>
          <h2
            style={{
              margin: 0,
              color: "#0f172a",
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: "-0.02em",
            }}
          >
            Publish Blueprint
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#64748b",
              margin: "8px 0 0",
              lineHeight: 1.6,
            }}
          >
            Make this completed design available in the customer Customize
            Gallery. Pricing will be handled through project estimation and
            will not be shown to customers as a base price.
          </p>
        </div>

        <form onSubmit={handlePublishProduct} style={{ padding: 26 }}>
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 800,
                marginBottom: 7,
                color: "#334155",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
              }}
            >
              Display title
            </label>
            <input
              required
              value={publishForm.name}
              onChange={(e) =>
                setPublishForm({ ...publishForm, name: e.target.value })
              }
              placeholder="Enter customer-facing blueprint title"
              style={{
                width: "100%",
                minHeight: 46,
                padding: "0 14px",
                border: "1px solid #cfd6df",
                borderRadius: 2,
                boxSizing: "border-box",
                outline: "none",
                fontSize: 13,
                color: "#0f172a",
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 800,
                marginBottom: 7,
                color: "#334155",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
              }}
            >
              Customer description
            </label>
            <textarea
              required
              rows={4}
              value={publishForm.description}
              onChange={(e) =>
                setPublishForm({
                  ...publishForm,
                  description: e.target.value,
                })
              }
              placeholder="Describe the furniture design and its intended use"
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid #cfd6df",
                borderRadius: 2,
                boxSizing: "border-box",
                outline: "none",
                fontSize: 13,
                lineHeight: 1.6,
                color: "#0f172a",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 800,
                marginBottom: 7,
                color: "#334155",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
              }}
            >
              Category <span style={{ color: "#b42318" }}>*</span>
            </label>
            <select
              required
              value={publishForm.category_id || ""}
              disabled={
                publishing || categoriesLoading || categories.length === 0
              }
              onChange={(event) =>
                setPublishForm({
                  ...publishForm,
                  category_id: event.target.value,
                })
              }
              style={{
                width: "100%",
                minHeight: 46,
                padding: "0 14px",
                border: "1px solid #cfd6df",
                borderRadius: 2,
                boxSizing: "border-box",
                outline: "none",
                fontSize: 13,
                color: "#0f172a",
                background: "#ffffff",
              }}
            >
              <option value="">
                {categoriesLoading
                  ? "Loading categories..."
                  : categories.length === 0
                    ? "No product categories available"
                    : "Select furniture category"}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
              {categoriesLoading
                ? "Loading Product Management categories..."
                : categories.length === 0
                  ? "No product categories are available in the database."
                  : "Categories are loaded from the Product Management database."}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 2,
              }}
            >
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800 }}>
                CATALOG TYPE
              </div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                Custom Blueprint
              </div>
            </div>
            <div
              style={{
                padding: "12px 14px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 2,
              }}
            >
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800 }}>
                CUSTOMER PRICE
              </div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                Quotation after estimation
              </div>
            </div>
          </div>

          <div
            style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
          >
            <button
              type="button"
              onClick={discardPublishDraft}
              disabled={publishing}
              style={{
                minHeight: 42,
                padding: "0 16px",
                background: "#ffffff",
                border: "1px solid #cfd6df",
                color: "#0f172a",
                borderRadius: 2,
                cursor: publishing ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={publishing}
              style={{
                minHeight: 42,
                padding: "0 20px",
                background: "#111827",
                color: "#ffffff",
                border: "1px solid #111827",
                borderRadius: 2,
                cursor: publishing ? "not-allowed" : "pointer",
                fontWeight: 800,
                fontSize: 13,
                opacity: publishing ? 0.65 : 1,
              }}
            >
              {publishing ? "Publishing…" : "Publish to Gallery"}
            </button>
          </div>
        </form>
      </div>

      <MotionFeedbackOverlay
        open={publishing}
        status={publishFeedbackStatus}
        successVariant="filled"
        message={
          publishFeedbackStatus === "success"
            ? "Blueprint published successfully"
            : "Publishing blueprint..."
        }
        blocking
      />
    </div>
  );
}
