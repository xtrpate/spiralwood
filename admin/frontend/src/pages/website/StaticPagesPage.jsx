// src/pages/website/StaticPagesPage.jsx – Static Page Content (About Us, Contact, FAQ)
import React, { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import api from "../../services/api";
import toast from "react-hot-toast";
import "./WebsiteContentPolish.css";

const PAGE_META = {
  about_us: {
    label: "About Us",
    icon: "🏢",
    hint: "Tell customers about Spiral Wood Services — history, mission, and what makes you unique.",
    preview: "Shown on the /about page of the customer website.",
  },
  contact: {
    label: "Contact Us",
    icon: "📞",
    hint: "Provide contact details, business hours, and how customers can reach you.",
    preview: "Shown on the /contact page of the customer website.",
  },
  faq: {
    label: "FAQ Intro",
    icon: "❓",
    hint: "Introductory text shown above the FAQ list. Individual Q&As are managed in the FAQ section.",
    preview: "Shown at the top of the /faq page.",
  },
};

export default function StaticPagesPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [pages, setPages] = useState({});
  const [active, setActive] = useState("about_us");
  const [form, setForm] = useState({
    title: "",
    content: "",
    is_visible: true,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showPrev, setShowPrev] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data } = await api.get("/website/pages");
      const map = {};

      (Array.isArray(data) ? data : []).forEach((page) => {
        map[page.slug] = page;
      });

      setPages(map);

      const first = map.about_us;
      setForm(
        first
          ? {
              title: first.title || "",
              content: first.content || "",
              is_visible: !!first.is_visible,
            }
          : { title: "", content: "", is_visible: true },
      );
    } catch (error) {
      const message =
        error.response?.data?.message || "Unable to load page content.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const switchTab = (slug) => {
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) {
      return;
    }

    setActive(slug);
    const page = pages[slug];

    setForm(
      page
        ? {
            title: page.title,
            content: page.content,
            is_visible: !!page.is_visible,
          }
        : { title: "", content: "", is_visible: true },
    );

    setDirty(false);
    setShowPrev(false);
  };

  const setF = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/website/pages/${active}`, form);
      toast.success(`${PAGE_META[active]?.label} page saved.`);
      setPages((current) => ({
        ...current,
        [active]: {
          ...current[active],
          slug: active,
          ...form,
        },
      }));
      setDirty(false);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to save page content.",
      );
    } finally {
      setSaving(false);
    }
  };

  const meta = PAGE_META[active];

  if (loading) {
    return <div className="website-empty-state website-page-loader">Loading pages...</div>;
  }

  if (loadError) {
    return (
      <div className="website-empty-state website-page-loader">
        <strong>{loadError}</strong>
        <button
          type="button"
          onClick={load}
          className="website-btn website-btn-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="website-admin-page website-static-page">
      <header className="website-page-header">
        <div>
          <h1 className="website-page-title">Page Content</h1>
          <p className="website-page-subtitle">
            Edit the content of static pages shown on the customer website.
          </p>
        </div>

        <div className="website-header-actions">
          <button
            type="button"
            onClick={() => setShowPrev((current) => !current)}
            className={`website-btn website-btn-secondary ${
              showPrev ? "is-active" : ""
            }`}
          >
            {showPrev ? "Edit mode" : "Preview"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`website-btn ${
              dirty ? "website-btn-primary" : "website-btn-saved"
            }`}
          >
            {saving ? "Saving..." : dirty ? "Save page" : "Saved"}
          </button>
        </div>
      </header>

      {dirty && (
        <div className="website-unsaved-banner">
          <CircleAlert size={15} strokeWidth={1.9} />
          <span>
            You have unsaved changes on the{" "}
            <strong>{meta?.label}</strong> page.
          </span>
        </div>
      )}

      <div className="website-content-layout">
        <nav className="website-page-selector-list" aria-label="Website pages">
          {Object.entries(PAGE_META).map(([slug, item]) => {
            const page = pages[slug];
            const isActive = slug === active;

            return (
              <button
                type="button"
                key={slug}
                onClick={() => switchTab(slug)}
                className={`website-page-selector ${
                  isActive ? "is-active" : ""
                }`}
              >
                <span className="website-page-selector-icon" aria-hidden="true">
                  {item.icon}
                </span>

                <span className="website-page-selector-copy">
                  <strong>{item.label}</strong>
                  <small>
                    <span
                      className={`website-visibility-dot ${
                        page?.is_visible ? "is-visible" : "is-hidden"
                      }`}
                    />
                    {page?.is_visible ? "Visible on site" : "Hidden from site"}
                  </small>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="website-panel website-editor-panel">
          <div className="website-editor-heading">
            <div className="website-editor-title-group">
              <span className="website-editor-icon" aria-hidden="true">
                {meta?.icon}
              </span>

              <div>
                <h2>{meta?.label}</h2>
                <p>{meta?.preview}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setF("is_visible", !form.is_visible)}
              className="website-editor-visibility"
            >
              <span>Visible on site</span>
              <span
                className={`website-switch ${
                  form.is_visible ? "is-on" : ""
                }`}
                aria-hidden="true"
              >
                <span />
              </span>
            </button>
          </div>

          <div className="website-editor-body">
            {!showPrev ? (
              <>
                <div className="website-editor-note">
                  {meta?.hint}
                </div>

                <div className="website-form-group">
                  <label className="website-form-label" htmlFor="page-title">
                    Page title
                  </label>
                  <input
                    id="page-title"
                    value={form.title || ""}
                    onChange={(e) => setF("title", e.target.value)}
                    className="website-input"
                    placeholder={`${meta?.label} page title`}
                  />
                </div>

                <div className="website-form-group">
                  <div className="website-form-label-row">
                    <label
                      className="website-form-label"
                      htmlFor="page-content"
                    >
                      Page content
                    </label>
                    <span>Plain text · Use a blank line between paragraphs</span>
                  </div>

                  <textarea
                    id="page-content"
                    value={form.content || ""}
                    onChange={(e) => setF("content", e.target.value)}
                    rows={15}
                    className="website-input website-textarea website-page-content-textarea"
                    placeholder={`Write the content for the ${meta?.label} page here...`}
                  />

                  <div className="website-content-count">
                    {(form.content || "").length} characters
                    <span>·</span>
                    {(form.content || "").split("\n").filter(Boolean).length} lines
                  </div>
                </div>
              </>
            ) : (
              <div className="website-preview-surface">
                <span className="website-preview-label">
                  {meta?.label} page preview
                </span>

                <h2>{form.title || meta?.label}</h2>

                <div className="website-preview-copy">
                  {form.content || (
                    <span className="website-preview-empty">
                      No content yet.
                    </span>
                  )}
                </div>

                {!form.is_visible && (
                  <div className="website-preview-hidden">
                    <CircleAlert size={15} strokeWidth={1.9} />
                    This page is currently hidden from the website.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
