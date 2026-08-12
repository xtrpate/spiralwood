// WISDOM SUPPLIERS UI POLISH V1
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";
import "./SuppliersPage.css";

const EMPTY_FORM = {
  name: "",
  address: "",
  contact_number: "",
  email: "",
};

const normalizeText = (value) => String(value || "").trim();

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/suppliers");
      setSuppliers(Array.isArray(data) ? data : data?.rows || []);
    } catch (error) {
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suppliers;

    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.address,
        supplier.contact_number,
        supplier.email,
      ].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [search, suppliers]);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setModal({ mode: "add", supplierId: null });
  };

  const openEdit = (supplier) => {
    setForm({
      name: supplier.name || "",
      address: supplier.address || "",
      contact_number: supplier.contact_number || "",
      email: supplier.email || "",
    });
    setModal({ mode: "edit", supplierId: supplier.id });
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setForm({ ...EMPTY_FORM });
  };

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    const payload = {
      name: normalizeText(form.name),
      address: normalizeText(form.address),
      contact_number: normalizeText(form.contact_number),
      email: normalizeText(form.email),
    };

    if (!payload.name) {
      toast.error("Company name is required.");
      return;
    }

    setSaving(true);
    try {
      if (modal?.mode === "add") {
        await api.post("/suppliers", payload);
        toast.success("Supplier added.");
      } else {
        await api.put(`/suppliers/${modal?.supplierId}`, payload);
        toast.success("Supplier updated.");
      }

      setModal(null);
      setForm({ ...EMPTY_FORM });
      await loadSuppliers();
    } catch (error) {
      // The global API interceptor already displays the server error.
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await api.delete(`/suppliers/${deleteTarget.id}`);
      toast.success("Supplier deleted.");
      setDeleteTarget(null);
      await loadSuppliers();
    } catch (error) {
      // The global API interceptor already displays the server error.
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="suppliers-page">
      <div className="suppliers-page-header">
        <div>
          <h1>Suppliers</h1>
          <p>Manage supplier contact information and sourcing details.</p>
        </div>

        <button
          type="button"
          className="suppliers-btn suppliers-btn-primary"
          onClick={openAdd}
        >
          Add Supplier
        </button>
      </div>

      <section className="suppliers-directory" aria-label="Supplier directory">
        <div className="suppliers-toolbar">
          <div className="suppliers-search-group">
            <label htmlFor="supplier-search">Search suppliers</label>
            <div className="suppliers-search-wrap">
              <span aria-hidden="true">⌕</span>
              <input
                id="supplier-search"
                type="search"
                placeholder="Search name, phone, email, or address"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="suppliers-result-count" aria-live="polite">
            {filteredSuppliers.length} of {suppliers.length} supplier
            {suppliers.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="suppliers-table-wrap">
          <table className="suppliers-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Contact</th>
                <th>Location</th>
                <th className="suppliers-actions-heading">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="suppliers-empty">
                    Loading suppliers...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="suppliers-empty">
                    {search.trim()
                      ? "No suppliers match your search."
                      : "No suppliers have been added yet."}
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <div className="suppliers-name">
                        {supplier.name || "Unnamed supplier"}
                      </div>
                    </td>

                    <td>
                      <div className="suppliers-contact">
                        {supplier.contact_number ? (
                          <a href={`tel:${supplier.contact_number}`}>
                            {supplier.contact_number}
                          </a>
                        ) : (
                          <span className="suppliers-muted">No phone added</span>
                        )}

                        {supplier.email ? (
                          <a
                            href={`mailto:${supplier.email}`}
                            className="suppliers-contact-secondary"
                          >
                            {supplier.email}
                          </a>
                        ) : (
                          <span className="suppliers-contact-secondary suppliers-muted">
                            No email added
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="suppliers-location">
                        {supplier.address || (
                          <span className="suppliers-muted">
                            No address added
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="suppliers-row-actions">
                        <button
                          type="button"
                          className="suppliers-btn suppliers-btn-secondary"
                          onClick={() => openEdit(supplier)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="suppliers-btn suppliers-btn-danger"
                          onClick={() => setDeleteTarget(supplier)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modal && (
        <div className="suppliers-modal-backdrop" role="presentation">
          <div
            className="suppliers-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplier-form-title"
          >
            <div className="suppliers-modal-header">
              <div>
                <h2 id="supplier-form-title">
                  {modal.mode === "add" ? "Add Supplier" : "Edit Supplier"}
                </h2>
                <p>
                  {modal.mode === "add"
                    ? "Add the supplier details used for inventory sourcing."
                    : "Update the supplier contact and location details."}
                </p>
              </div>

              <button
                type="button"
                className="suppliers-modal-close"
                onClick={closeModal}
                aria-label="Close"
                disabled={saving}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="suppliers-form-field">
                <label htmlFor="supplier-name">Company Name</label>
                <input
                  id="supplier-name"
                  type="text"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Enter supplier name"
                />
              </div>

              <div className="suppliers-form-grid">
                <div className="suppliers-form-field">
                  <label htmlFor="supplier-phone">Phone</label>
                  <input
                    id="supplier-phone"
                    type="tel"
                    value={form.contact_number}
                    onChange={(event) =>
                      setField("contact_number", event.target.value)
                    }
                    placeholder="Enter phone number"
                  />
                </div>

                <div className="suppliers-form-field">
                  <label htmlFor="supplier-email">Email</label>
                  <input
                    id="supplier-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setField("email", event.target.value)}
                    placeholder="Enter email address"
                  />
                </div>
              </div>

              <div className="suppliers-form-field">
                <label htmlFor="supplier-address">Address</label>
                <textarea
                  id="supplier-address"
                  rows={3}
                  value={form.address}
                  onChange={(event) => setField("address", event.target.value)}
                  placeholder="Enter supplier address"
                />
              </div>

              <div className="suppliers-modal-actions">
                <button
                  type="button"
                  className="suppliers-btn suppliers-btn-secondary suppliers-btn-modal"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="suppliers-btn suppliers-btn-primary suppliers-btn-modal"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : modal.mode === "add"
                      ? "Add Supplier"
                      : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="suppliers-modal-backdrop" role="presentation">
          <div
            className="suppliers-modal suppliers-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplier-delete-title"
          >
            <div className="suppliers-delete-copy">
              <h2 id="supplier-delete-title">Delete Supplier?</h2>
              <p>
                Delete <strong>{deleteTarget.name}</strong> from the supplier
                directory? If this supplier is linked to inventory records, the
                system may prevent the deletion.
              </p>
            </div>

            <div className="suppliers-modal-actions">
              <button
                type="button"
                className="suppliers-btn suppliers-btn-secondary suppliers-btn-modal"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="suppliers-btn suppliers-btn-danger-solid suppliers-btn-modal"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
