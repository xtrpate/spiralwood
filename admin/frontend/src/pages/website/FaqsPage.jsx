// src/pages/website/FaqsPage.jsx – FAQ Management (Admin)
import React, { useEffect, useState } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";

const BLANK = { question: "", answer: "", sort_order: 0, is_visible: true };

export default function FaqsPage() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoad] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit'
  const [form, setForm] = useState(BLANK);
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoad(true);
    try {
      const { data } = await api.get("/website/faqs");
      setFaqs(data);
    } finally {
      setLoad(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm({ ...BLANK, sort_order: faqs.length + 1 });
    setTarget(null);
    setModal("add");
  };

  const openEdit = (faq) => {
    setForm({
      question: faq.question,
      answer: faq.answer,
      sort_order: faq.sort_order,
      is_visible: !!faq.is_visible,
    });
    setTarget(faq);
    setModal("edit");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "add") {
        await api.post("/website/faqs", form);
        toast.success("FAQ added.");
      } else {
        await api.put(`/website/faqs/${target.id}`, form);
        toast.success("FAQ updated.");
      }
      setModal(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, question) => {
    if (!window.confirm(`Delete this FAQ?\n"${question}"`)) return;
    await api.delete(`/website/faqs/${id}`);
    toast.success("FAQ deleted.");
    load();
  };

  const toggleVisibility = async (faq) => {
    await api.put(`/website/faqs/${faq.id}`, {
      ...faq,
      is_visible: !faq.is_visible,
    });
    toast.success(
      faq.is_visible ? "FAQ hidden from website." : "FAQ shown on website.",
    );
    load();
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const visible = faqs.filter((f) => f.is_visible).length;
  const hidden = faqs.filter((f) => !f.is_visible).length;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={pageTitle}>FAQ Management</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Manage frequently asked questions displayed on the customer website.
          </p>
        </div>
        <button onClick={openAdd} style={btnPrimary}>
          + Add FAQ
        </button>
      </div>

      {/* ── Summary ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total FAQs", value: faqs.length, color: "#3b82f6" },
          { label: "Visible", value: visible, color: "#10b981" },
          { label: "Hidden", value: hidden, color: "#94a3b8" },
        ].map((chip) => (
          <div
            key={chip.label}
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: "12px 18px",
              borderLeft: `4px solid ${chip.color}`,
              boxShadow: "0 1px 6px rgba(0,0,0,.08)",
              minWidth: 120,
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: "#64748b",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              {chip.label}
            </p>
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#1e2a38",
                margin: "4px 0 0",
              }}
            >
              {chip.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── FAQ List ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={center}>Loading FAQs...</div>
      ) : faqs.length === 0 ? (
        <div
          style={{
            ...card,
            padding: 48,
            textAlign: "center",
            color: "#94a3b8",
          }}
        >
          No FAQs yet. Click <strong>+ Add FAQ</strong> to create one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {faqs.map((faq, i) => (
            <div
              key={faq.id}
              style={{
                ...card,
                padding: "18px 20px",
                border: faq.is_visible
                  ? "1px solid #e2e8f0"
                  : "1px dashed #d1d5db",
                opacity: faq.is_visible ? 1 : 0.6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#94a3b8",
                        width: 24,
                      }}
                    >
                      #{faq.sort_order}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1e2a38",
                      }}
                    >
                      {faq.question}
                    </span>
                    {!faq.is_visible && (
                      <span
                        style={{
                          fontSize: 10,
                          background: "#f1f5f9",
                          color: "#64748b",
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontWeight: 600,
                        }}
                      >
                        Hidden
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#64748b",
                      margin: 0,
                      lineHeight: 1.6,
                      paddingLeft: 32,
                    }}
                  >
                    {faq.answer}
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => toggleVisibility(faq)}
                    title={
                      faq.is_visible ? "Hide from website" : "Show on website"
                    }
                    style={{
                      ...btnIcon,
                      background: faq.is_visible ? "#d1fae5" : "#f1f5f9",
                      color: faq.is_visible ? "#065f46" : "#94a3b8",
                    }}
                  >
                    {faq.is_visible ? "👁 Visible" : "🙈 Hidden"}
                  </button>
                  <button
                    onClick={() => openEdit(faq)}
                    style={{
                      ...btnIcon,
                      background: "#e0f2fe",
                      color: "#0369a1",
                    }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDelete(faq.id, faq.question)}
                    style={{
                      ...btnIcon,
                      background: "#fee2e2",
                      color: "#dc2626",
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────── */}
      {modal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3 style={{ margin: "0 0 20px" }}>
              {modal === "add" ? "➕ Add New FAQ" : "✏️ Edit FAQ"}
            </h3>
            <form onSubmit={handleSave}>
              {/* Question */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelSm}>Question *</label>
                <input
                  required
                  value={form.question}
                  onChange={(e) => setF("question", e.target.value)}
                  style={inputFull}
                  placeholder="e.g. How long does delivery take?"
                />
              </div>

              {/* Answer */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelSm}>Answer *</label>
                <textarea
                  required
                  value={form.answer}
                  onChange={(e) => setF("answer", e.target.value)}
                  rows={5}
                  style={{ ...inputFull, resize: "vertical" }}
                  placeholder="Provide a clear and helpful answer..."
                />
              </div>

              {/* Sort order + visibility */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label style={labelSm}>Display Order</label>
                  <input
                    type="number"
                    min="1"
                    value={form.sort_order}
                    onChange={(e) =>
                      setF("sort_order", parseInt(e.target.value) || 1)
                    }
                    style={inputFull}
                  />
                  <p
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                      margin: "4px 0 0",
                    }}
                  >
                    Lower number = shown first
                  </p>
                </div>
                <div>
                  <label style={labelSm}>Visibility</label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      marginTop: 8,
                    }}
                  >
                    <div
                      onClick={() => setF("is_visible", !form.is_visible)}
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        cursor: "pointer",
                        background: form.is_visible ? "#1e40af" : "#d1d5db",
                        position: "relative",
                        transition: "background .2s",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: "#fff",
                          position: "absolute",
                          top: 3,
                          left: form.is_visible ? 23 : 3,
                          transition: "left .2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        color: form.is_visible ? "#065f46" : "#64748b",
                        fontWeight: 500,
                      }}
                    >
                      {form.is_visible ? "Visible on website" : "Hidden"}
                    </span>
                  </label>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 20,
                }}
              >
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving
                    ? "Saving..."
                    : modal === "add"
                      ? "Add FAQ"
                      : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageTitle = {
  fontSize: 22,
  fontWeight: 700,
  color: "#1e2a38",
  margin: 0,
};
const card = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,.08)",
};
const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 200,
  color: "#64748b",
};
const labelSm = {
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  display: "block",
  marginBottom: 6,
};
const inputFull = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
};
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalBox = {
  background: "#fff",
  borderRadius: 12,
  padding: 28,
  width: 560,
  maxHeight: "88vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};
const btnPrimary = {
  padding: "8px 20px",
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const btnGhost = {
  padding: "8px 16px",
  background: "#f1f5f9",
  color: "#374151",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};
const btnIcon = {
  padding: "5px 12px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};
