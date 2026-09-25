// src/pages/website/FaqsPage.jsx – FAQ Management (Admin)
import React, { useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import api from "../../services/api";
import toast from "react-hot-toast";
import "./WebsiteContentPolish.css";

const BLANK = { question: "", answer: "", sort_order: 0, is_visible: true };

export default function FaqsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [faqs, setFaqs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoad] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [target, setTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [faqPage, setFaqPage] = useState(null);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [visibilityFilter, setVisibilityFilter] = useState("all");

  const load = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoad(true);
    }

    try {
      const [faqResponse, pageResponse] = await Promise.all([
        api.get("/website/faqs/admin"),
        api.get("/website/pages/admin"),
      ]);

      setFaqs(Array.isArray(faqResponse.data) ? faqResponse.data : []);

      const pageRows = Array.isArray(pageResponse.data)
        ? pageResponse.data
        : [];

      setFaqPage(pageRows.find((page) => page.slug === "faq") || null);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to load FAQ management.",
      );
    } finally {
      if (!silent) {
        setLoad(false);
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm({ ...BLANK, sort_order: faqs.length + 1 });
    setFormErrors({});
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

    setFormErrors({});
    setTarget(faq);
    setModal("edit");
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please correct the highlighted fields.");
      return;
    }

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
      await load({ silent: true });
    } catch (error) {
      console.error("Failed to save FAQ:", error);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = (faq) => {
    setDeleteTarget(faq);
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;

    setDeleting(true);

    try {
      await api.delete(`/website/faqs/${deleteTarget.id}`);

      toast.success("FAQ deleted.");

      setDeleteTarget(null);

      await load({ silent: true });
    } catch (error) {
      console.error("Failed to delete FAQ:", error);
    } finally {
      setDeleting(false);
    }
  };

  const toggleVisibility = async (faq) => {
    try {
      await api.put(`/website/faqs/${faq.id}`, {
        question: faq.question,
        answer: faq.answer,
        sort_order: faq.sort_order,
        is_visible: !Boolean(faq.is_visible),
      });

      toast.success(
        faq.is_visible ? "FAQ hidden from website." : "FAQ shown on website.",
      );

      await load({ silent: true });
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to update FAQ visibility.",
      );
    }
  };

  const setF = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    setFormErrors((current) => {
      if (!current[key]) return current;

      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const validateForm = () => {
    const nextErrors = {};

    const question = String(form.question || "").trim();
    const answer = String(form.answer || "").trim();
    const sortOrder = Number(form.sort_order);

    if (!question) {
      nextErrors.question = "Question is required.";
    } else if (question.length < 3) {
      nextErrors.question = "Question must be at least 3 characters.";
    } else if (question.length > 200) {
      nextErrors.question = "Question must not exceed 200 characters.";
    }

    if (!answer) {
      nextErrors.answer = "Answer is required.";
    } else if (answer.length < 5) {
      nextErrors.answer = "Answer must be at least 5 characters.";
    } else if (answer.length > 2000) {
      nextErrors.answer = "Answer must not exceed 2,000 characters.";
    }

    if (!Number.isInteger(sortOrder) || sortOrder < 1) {
      nextErrors.sort_order =
        "Display order must be a whole number 1 or greater.";
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const visible = faqs.filter((faq) => faq.is_visible).length;
  const hidden = faqs.filter((faq) => !faq.is_visible).length;
  const filteredFaqs = faqs.filter((faq) => {
    const search = searchTerm.trim().toLowerCase();

    const matchesSearch =
      !search ||
      String(faq.question || "")
        .toLowerCase()
        .includes(search) ||
      String(faq.answer || "")
        .toLowerCase()
        .includes(search);

    const matchesVisibility =
      visibilityFilter === "all" ||
      (visibilityFilter === "visible" && Boolean(faq.is_visible)) ||
      (visibilityFilter === "hidden" && !Boolean(faq.is_visible));

    return matchesSearch && matchesVisibility;
  });
  const faqPageVisible =
    faqPage?.is_visible === true ||
    faqPage?.is_visible === 1 ||
    faqPage?.is_visible === "1";

  const toggleFaqPageVisibility = async () => {
    if (!faqPage) {
      toast.error("FAQ page settings are unavailable.");
      return;
    }

    const nextVisible = !faqPageVisible;
    setVisibilitySaving(true);

    try {
      await api.put("/website/pages/faq", {
        title: faqPage.title || "",
        content: faqPage.content || "",
        is_visible: nextVisible,
      });

      setFaqPage((current) => ({
        ...current,
        is_visible: nextVisible ? 1 : 0,
      }));

      toast.success(
        nextVisible
          ? "FAQ page shown on website."
          : "FAQ page hidden from website.",
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Unable to update FAQ page visibility.",
      );
    } finally {
      setVisibilitySaving(false);
    }
  };

  return (
    <div className="website-admin-page website-faq-page">
      <header className="website-page-header">
        <div>
          <h1 className="website-page-title">FAQ Management</h1>
          <p className="website-page-subtitle">
            Manage frequently asked questions displayed on the customer website.
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="website-btn website-btn-primary"
        >
          <Plus size={15} strokeWidth={2} />
          Add FAQ
        </button>
      </header>

      <section className="website-panel">
        <div className="website-panel-heading">
          <div>
            <h2>FAQ Page Visibility</h2>
            <p>
              Show or hide the FAQ page and its footer link. Individual FAQ
              visibility is managed separately below.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleFaqPageVisibility}
            disabled={!faqPage || visibilitySaving}
            className="website-switch-row"
          >
            <span
              className={`website-switch ${faqPageVisible ? "is-on" : ""}`}
              aria-hidden="true"
            >
              <span />
            </span>
            <span>
              {visibilitySaving
                ? "Saving..."
                : faqPageVisible
                  ? "Visible on site"
                  : "Hidden from site"}
            </span>
          </button>
        </div>
      </section>

      <section
        className="website-summary-grid website-summary-grid-3"
        aria-label="FAQ summary"
      >
        {[
          { label: "Total FAQs", value: faqs.length },
          { label: "Visible", value: visible },
          { label: "Hidden", value: hidden },
        ].map((item) => (
          <div className="website-summary-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section className="website-panel website-faq-panel">
        <div className="website-panel-heading">
          <div>
            <h2>FAQ List</h2>
            <p>Review questions, answers, visibility, and display order.</p>
          </div>
          {!loading && (
            <span className="website-panel-count">
              {faqs.length} {faqs.length === 1 ? "question" : "questions"}
            </span>
          )}
        </div>

        <div style={{ padding: "0 15px 12px" }}>
          <input
            type="search"
            className="website-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search FAQ questions or answers..."
            aria-label="Search FAQs"
          />
        </div>

        <div className="website-faq-filters">
          {[
            { key: "all", label: "All" },
            { key: "visible", label: "Visible" },
            { key: "hidden", label: "Hidden" },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`website-faq-filter ${
                visibilityFilter === filter.key ? "is-active" : ""
              }`}
              onClick={() => setVisibilityFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="website-empty-state">Loading FAQs...</div>
        ) : filteredFaqs.length === 0 ? (
          <div className="website-empty-state">
            <strong>No matching FAQs</strong>
            <span>Try to search more.</span>
          </div>
        ) : (
          <div className="website-faq-list">
            {filteredFaqs.map((faq) => (
              <article
                key={faq.id}
                className={`website-faq-row ${
                  faq.is_visible ? "" : "is-hidden"
                }`}
              >
                <div className="website-faq-content">
                  <div className="website-faq-question-row">
                    <span className="website-faq-order">#{faq.sort_order}</span>
                    <h3>{faq.question}</h3>
                    {!faq.is_visible && (
                      <span className="website-state-badge">Hidden</span>
                    )}
                  </div>

                  <p className="website-faq-answer">{faq.answer}</p>
                </div>

                <div className="website-row-actions">
                  <button
                    type="button"
                    onClick={() => toggleVisibility(faq)}
                    title={
                      faq.is_visible ? "Hide from website" : "Show on website"
                    }
                    className={`website-btn website-btn-compact website-visibility-btn ${
                      faq.is_visible ? "is-visible" : "is-hidden"
                    }`}
                  >
                    {faq.is_visible ? (
                      <Eye size={14} strokeWidth={1.9} />
                    ) : (
                      <EyeOff size={14} strokeWidth={1.9} />
                    )}
                    {faq.is_visible ? "Visible" : "Hidden"}
                  </button>

                  <button
                    type="button"
                    onClick={() => openEdit(faq)}
                    className="website-btn website-btn-compact website-btn-secondary"
                  >
                    <Pencil size={13} strokeWidth={1.9} />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => openDeleteModal(faq)}
                    className="website-btn website-btn-compact website-btn-danger"
                  >
                    <Trash2 size={13} strokeWidth={1.9} />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <div className="website-modal-overlay">
          <div
            className="website-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="faq-modal-title"
          >
            <div className="website-modal-heading">
              <h2 id="faq-modal-title">
                {modal === "add" ? "Add FAQ" : "Edit FAQ"}
              </h2>
              <p>
                {modal === "add"
                  ? "Create a clear question and customer-friendly answer."
                  : "Update the question, answer, order, or visibility."}
              </p>
            </div>

            <form onSubmit={handleSave}>
              <div className="website-form-group">
                <div className="website-form-label-row">
                  <label className="website-form-label" htmlFor="faq-question">
                    Question
                  </label>
                  <span>{String(form.question || "").length}/200</span>
                </div>

                <input
                  id="faq-question"
                  required
                  maxLength={200}
                  value={form.question}
                  onChange={(e) => setF("question", e.target.value)}
                  className="website-input"
                  placeholder="e.g. How long does delivery take?"
                  aria-invalid={Boolean(formErrors.question)}
                  aria-describedby={
                    formErrors.question ? "faq-question-error" : undefined
                  }
                />

                {formErrors.question ? (
                  <div id="faq-question-error" className="website-form-error">
                    {formErrors.question}
                  </div>
                ) : null}
              </div>

              <div className="website-form-group">
                <div className="website-form-label-row">
                  <label className="website-form-label" htmlFor="faq-answer">
                    Answer
                  </label>
                  <span>{String(form.answer || "").length}/2000</span>
                </div>
                <textarea
                  id="faq-answer"
                  required
                  value={form.answer}
                  onChange={(e) => setF("answer", e.target.value)}
                  rows={5}
                  className="website-input website-textarea"
                  placeholder="Provide a clear and helpful answer..."
                />
                {formErrors.answer ? (
                  <div className="website-form-error">{formErrors.answer}</div>
                ) : null}
              </div>

              <div className="website-faq-preview">
                <div className="website-faq-preview-label">
                  Customer Preview
                </div>

                <div className="website-faq-preview-question">
                  {String(form.question || "").trim() || "FAQ question"}
                </div>

                <div className="website-faq-preview-answer">
                  {String(form.answer || "").trim() ||
                    "The customer-facing answer will appear here."}
                </div>
              </div>

              <div className="website-form-split">
                <div className="website-form-group">
                  <label className="website-form-label" htmlFor="faq-order">
                    Display order
                  </label>
                  <input
                    id="faq-order"
                    type="number"
                    min="1"
                    step="1"
                    value={form.sort_order}
                    onChange={(e) => setF("sort_order", e.target.value)}
                    className="website-input"
                    aria-invalid={Boolean(formErrors.sort_order)}
                  />
                  {formErrors.sort_order ? (
                    <div className="website-form-error">
                      {formErrors.sort_order}
                    </div>
                  ) : null}
                  <span className="website-form-help">
                    Lower numbers appear first.
                  </span>
                </div>

                <div className="website-form-group">
                  <span className="website-form-label">Visibility</span>
                  <button
                    type="button"
                    onClick={() => setF("is_visible", !form.is_visible)}
                    className="website-switch-row"
                  >
                    <span
                      className={`website-switch ${
                        form.is_visible ? "is-on" : ""
                      }`}
                      aria-hidden="true"
                    >
                      <span />
                    </span>
                    <span>
                      {form.is_visible ? "Visible on website" : "Hidden"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="website-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setModal(null);
                    setFormErrors({});
                  }}
                  className="website-btn website-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="website-btn website-btn-primary"
                >
                  {saving
                    ? "Saving..."
                    : modal === "add"
                      ? "Add FAQ"
                      : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="website-modal-overlay">
          <div
            className="website-modal website-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-faq-title"
          >
            <div className="website-modal-heading">
              <h2 id="delete-faq-title">Delete FAQ</h2>

              <p>This action cannot be undone.</p>
            </div>

            <div className="website-delete-warning">
              <Trash2 size={18} strokeWidth={1.8} />

              <div>
                <strong>Are you sure you want to delete this FAQ?</strong>

                <p>{deleteTarget.question}</p>
              </div>
            </div>

            <div className="website-modal-actions">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="website-btn website-btn-secondary"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="website-btn website-btn-danger"
              >
                <Trash2 size={13} strokeWidth={1.9} />

                {deleting ? "Deleting..." : "Delete FAQ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
