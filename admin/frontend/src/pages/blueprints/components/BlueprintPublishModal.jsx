import React from "react";

const SHOP_CATEGORIES = [
  { id: 1, name: "Bedroom Furniture" },
  { id: 2, name: "Kitchen Furniture" },
  { id: 3, name: "Bathroom Furniture" },
  { id: 4, name: "Office Furniture" },
  { id: 5, name: "Living Room Furniture" },
  { id: 6, name: "Dining Room Furniture" },
  { id: 7, name: "Wardrobe and Closet" },
  { id: 8, name: "TV Console and Storage" },
];

export function BlueprintPublishModal({
  publishing,
  setPublishModal,
  handlePublishProduct,
  publishForm,
  setPublishForm,
}) {
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
      onClick={(event) => {
        if (event.target === event.currentTarget && !publishing) {
          setPublishModal(false);
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
              <option value="">Select furniture category</option>
              {SHOP_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
              This category is used by Product Management filters after publishing.
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
              onClick={() => setPublishModal(false)}
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
    </div>
  );
}
