// src/pages/users/UsersPage.jsx – User Management (Admin only)
import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";
import useAuthStore from "../../store/authStore";
import {
  BriefcaseBusiness,
  KeyRound,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Plus,
  UserX,
  Users,
  X,
} from "lucide-react";

const STAFF_TYPES = {
  cashier: {
    label: "Cashier",
    desc: "Sales and payment access",
  },
  indoor: {
    label: "Furniture Specialist",
    desc: "Production and appointment access",
  },
  delivery_rider: {
    label: "Delivery Staff",
    desc: "Delivery assignment access",
  },
};

const BLANK_FORM = {
  name: "",
  email: "",
  password: "",
  role: "staff",
  staff_type: "cashier",
  phone: "",
  address: "",
  is_active: true,
};

const FILTERS = {
  search: "",
  role: "",
  status: "",
};

const getInitial = (name) => {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0] || ""}${words[words.length - 1][0] || ""}`.toUpperCase();
};

function UserAvatar({ src, name, isAdmin = false }) {
  const [failed, setFailed] = useState(false);
  const resolved = buildAssetUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div className={`um-avatar${isAdmin ? " um-avatar-admin" : ""}`}>
      {resolved && !failed ? (
        <img
          src={resolved}
          alt={`${name || "Account"} profile`}
          onError={() => setFailed(true)}
        />
      ) : (
        getInitial(name)
      )}
    </div>
  );
}

const getRoleLabel = (user) => {
  if (user?.role === "admin") return "Administrator";
  return STAFF_TYPES[user?.staff_type]?.label || "Staff";
};

const getRoleDescription = (role, staffType) => {
  if (role === "admin") return "Full administrative access";
  return STAFF_TYPES[staffType]?.desc || "Assigned staff access";
};

const formatLastLogin = (value) => {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const normalizePhoneDigits = (value) =>
  String(value || "")
    .replace(/\D/g, "");

const formatPhoneForDisplay = (value) => {
  const digits = normalizePhoneDigits(value);
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  return value || "Phone not provided";
};

const formatPhoneForInput = (value) => {
  const display = formatPhoneForDisplay(value);
  return display === "Phone not provided" ? "" : display;
};

export default function UsersPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const { user: me } = useAuthStore();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // add | edit | password | delete
  const [form, setForm] = useState(BLANK_FORM);
  const [pwForm, setPwForm] = useState({
    new_password: "",
    confirm: "",
  });
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [filters, setFilters] = useState(FILTERS);
  const [openMenuId, setOpenMenuId] = useState(null);

  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Unable to load accounts.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm({ ...BLANK_FORM });
    setTarget(null);
    setPhotoFile(null);
    setPhotoPreview("");
    setModal("add");
    setOpenMenuId(null);
  };

  const openEdit = (user) => {
    setForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role || "staff",
      staff_type: user.staff_type || "cashier",
      phone: formatPhoneForInput(user.phone),
      address: user.address || "",
      is_active: !!user.is_active,
      password: "",
    });
    setTarget(user);
    setPhotoFile(null);
    setPhotoPreview(buildAssetUrl(user.profile_photo) || "");
    setModal("edit");
    setOpenMenuId(null);
  };

  const openPassword = (user) => {
    setPwForm({
      new_password: "",
      confirm: "",
    });
    setTarget(user);
    setModal("password");
    setOpenMenuId(null);
  };

  const openDelete = (user) => {
    if (user.id === me?.id) {
      toast.error("You cannot deactivate your own account.");
      return;
    }

    setTarget(user);
    setModal("delete");
    setOpenMenuId(null);
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setTarget(null);
    setPhotoFile(null);
    setPhotoPreview("");
  };

  const setF = (key, value) =>
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) return;

    const extension = String(file.name || "")
      .toLowerCase()
      .match(/\.[a-z0-9]+$/)?.[0];
    const allowedExtensions = new Set([
      ".jpg",
      ".jpeg",
      ".jfif",
      ".png",
      ".webp",
    ]);

    if (!extension || !allowedExtensions.has(extension)) {
      toast.error("Profile photo must be JPG, JPEG, JFIF, PNG, or WEBP.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Profile photo must be 2MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoFile(file);
      setPhotoPreview(String(reader.result || ""));
    };
    reader.onerror = () => {
      toast.error("Unable to preview the selected photo.");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (modal === "add" && !form.password) {
      toast.error("Password is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = new FormData();
      payload.append("name", form.name.trim());
      payload.append("email", form.email.trim());
      payload.append("phone", form.phone.trim());
      payload.append("address", form.address.trim());
      payload.append("role", form.role);
      payload.append(
        "staff_type",
        form.role === "staff" ? form.staff_type : "",
      );
      payload.append("is_active", form.is_active ? "true" : "false");

      if (modal === "add") {
        payload.append("password", form.password);
      }
      if (photoFile) {
        payload.append("profile_photo", photoFile);
      }

      if (modal === "add") {
        await api.post("/users", payload);
        toast.success("Account created with a temporary password.");
      } else {
        await api.put(`/users/${target.id}`, payload);
        toast.success("Account updated.");
      }

      setModal(null);
      setTarget(null);
      setPhotoFile(null);
      setPhotoPreview("");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Unable to save account.");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();

    if (pwForm.new_password !== pwForm.confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    if (pwForm.new_password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setSaving(true);

    try {
      await api.patch(`/users/${target.id}/password`, {
        new_password: pwForm.new_password,
      });
      toast.success("Temporary password reset. User must change it on next login.");
      setModal(null);
      setTarget(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Unable to reset password.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!target || target.id === me?.id) {
      toast.error("You cannot deactivate your own account.");
      return;
    }

    setSaving(true);

    try {
      await api.delete(`/users/${target.id}`);
      toast.success("Account deactivated.");
      setModal(null);
      setTarget(null);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Unable to deactivate account.");
    } finally {
      setSaving(false);
    }
  };

  const admins = useMemo(
    () => users.filter((user) => user.role === "admin"),
    [users],
  );

  const staff = useMemo(
    () => users.filter((user) => user.role === "staff"),
    [users],
  );

  const inactiveCount = useMemo(
    () => users.filter((user) => !user.is_active).length,
    [users],
  );

  const filteredUsers = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return users.filter((user) => {
      const roleLabel = getRoleLabel(user).toLowerCase();
      const searchable = [
        user.name,
        user.email,
        user.phone,
        formatPhoneForDisplay(user.phone),
        roleLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !search || searchable.includes(search);
      const matchesRole = !filters.role || user.role === filters.role;

      const isActive = !!user.is_active;
      const matchesStatus =
        !filters.status ||
        (filters.status === "active" && isActive) ||
        (filters.status === "inactive" && !isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, filters]);

  const activeFilterCount = [
    filters.search,
    filters.role,
    filters.status,
  ].filter(Boolean).length;

  const resetFilters = () => setFilters(FILTERS);

  return (
    <div className="wisdom-admin-users-v2">
      {/* WISDOM ADMIN USER MANAGEMENT UI V2 */}
      {/* WISDOM USER SUMMARY CARD CLEANUP V1 */}
      {/* WISDOM INACTIVE ACCOUNT NUMBER RED V1 */}
      <style>{styles}</style>

      <header className="um-page-header">
        <div>
          <h1 className="um-page-title">User Management</h1>
          <p className="um-page-subtitle">
            Manage administrator and staff accounts, roles, and access.
          </p>
        </div>

        <button
          type="button"
          className="um-btn um-btn-primary um-add-account-btn"
          onClick={openAdd}
        >
          {/* WISDOM ADD ACCOUNT BUTTON POLISH V1 */}
          <Plus size={14} strokeWidth={2.1} />
          <span>Add Account</span>
        </button>
      </header>

      <section className="um-summary-grid" aria-label="Account summary">
        <SummaryCard
          label="Total Accounts"
          value={users.length}
          icon={<Users size={18} strokeWidth={1.9} />}
        />
        <SummaryCard
          label="Administrators"
          value={admins.length}
          icon={<ShieldCheck size={18} strokeWidth={1.9} />}
        />
        <SummaryCard
          label="Staff Members"
          value={staff.length}
          icon={<BriefcaseBusiness size={18} strokeWidth={1.9} />}
        />
        <SummaryCard
          label="Inactive Accounts"
          value={inactiveCount}
          icon={<UserX size={18} strokeWidth={1.9} />}
          alert={inactiveCount > 0}
        />
      </section>

      <section className="um-card">
        <div className="um-card-heading">
          <div>
            <h2>Accounts</h2>
            <p>
              Review account details, access roles, status, and recent sign-in activity.
            </p>
          </div>

          <div className="um-result-count">
            {filteredUsers.length} of {users.length} accounts
          </div>
        </div>

        <div className="um-toolbar">
          <label className="um-field um-search-field">
            <span>Search</span>
            <div className="um-search-wrap">
              <Search size={15} strokeWidth={1.8} aria-hidden="true" />
              <input
                value={filters.search}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                placeholder="Search name, email, phone, or role..."
              />
            </div>
          </label>

          <label className="um-field">
            <span>Account Type</span>
            <select
              value={filters.role}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  role: event.target.value,
                }))
              }
            >
              <option value="">All Types</option>
              <option value="admin">Administrator</option>
              <option value="staff">Staff</option>
            </select>
          </label>

          <label className="um-field">
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          {activeFilterCount > 0 && (
            <button
              type="button"
              className="um-btn um-btn-secondary um-reset-btn"
              onClick={resetFilters}
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="um-table-wrap">
          <table className="um-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Contact</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th className="um-actions-heading">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="um-empty">
                    Loading accounts...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="um-empty">
                    <strong>No matching accounts</strong>
                    <span>Adjust the search or filters to view more accounts.</span>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    me={me}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    menuRef={menuRef}
                    onEdit={openEdit}
                    onPassword={openPassword}
                    onDelete={openDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {(modal === "add" || modal === "edit") && (
        <AccountModal
          mode={modal}
          target={target}
          form={form}
          setF={setF}
          me={me}
          photoPreview={photoPreview}
          onPhotoChange={handlePhotoChange}
          saving={saving}
          onClose={closeModal}
          onSubmit={handleSave}
        />
      )}

      {modal === "password" && (
        <PasswordModal
          target={target}
          value={pwForm}
          setValue={setPwForm}
          saving={saving}
          onClose={closeModal}
          onSubmit={handlePasswordReset}
        />
      )}

      {modal === "delete" && (
        <DeleteModal
          target={target}
          saving={saving}
          onClose={closeModal}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, alert = false }) {
  return (
    <div className={`um-summary-card${alert ? " um-summary-alert" : ""}`}>
      <div>
        <div className="um-summary-label">{label}</div>
        <div className={`um-summary-value${alert ? " is-alert" : ""}`}>{value}</div>
      </div>
      <div className="um-summary-icon" aria-hidden="true">
        {icon}
      </div>
    </div>
  );
}

function UserRow({
  user,
  me,
  openMenuId,
  setOpenMenuId,
  menuRef,
  onEdit,
  onPassword,
  onDelete,
}) {
  const isMe = user.id === me?.id;
  const roleLabel = getRoleLabel(user);

  return (
    <tr>
      <td>
        <div className="um-account-cell">
          <UserAvatar
            src={user.profile_photo}
            name={user.name}
            isAdmin={user.role === "admin"}
          />

          <div className="um-account-copy">
            <div className="um-name-row">
              <span className="um-user-name">{user.name}</span>
              {isMe && <span className="um-you-label">You</span>}
            </div>
            <span className="um-account-type">
              {user.role === "admin" ? "Administrator account" : "Staff account"}
            </span>
          </div>
        </div>
      </td>

      <td>
        <div className="um-contact">
          <span>{user.email || "No email"}</span>
          <small>{formatPhoneForDisplay(user.phone)}</small>
        </div>
      </td>

      <td>
        <div className="um-role-cell">
          <span className={`um-role-label${user.role === "admin" ? " um-role-admin" : ""}`}>
            {roleLabel}
          </span>
          {user.role === "staff" && (
            <small>{STAFF_TYPES[user.staff_type]?.desc || "Assigned staff access"}</small>
          )}
        </div>
      </td>

      <td>
        <span className={`um-status ${user.is_active ? "is-active" : "is-inactive"}`}>
          <i aria-hidden="true" />
          {user.is_active ? "Active" : "Inactive"}
        </span>
      </td>

      <td>
        <span className="um-last-login">{formatLastLogin(user.last_login)}</span>
      </td>

      <td>
        <div className="um-row-actions">
          <button
            type="button"
            className="um-btn um-btn-secondary um-edit-btn"
            onClick={() => onEdit(user)}
          >
            <Pencil size={13} strokeWidth={1.9} />
            Edit
          </button>

          <div
            className="um-more-wrap"
            ref={openMenuId === user.id ? menuRef : null}
          >
            <button
              type="button"
              className="um-icon-btn"
              aria-label={`More actions for ${user.name}`}
              aria-expanded={openMenuId === user.id}
              onClick={() =>
                setOpenMenuId((current) => (current === user.id ? null : user.id))
              }
            >
              <MoreHorizontal size={17} strokeWidth={2} />
            </button>

            {openMenuId === user.id && (
              <div className="um-action-menu">
                <button type="button" onClick={() => onPassword(user)}>
                  <KeyRound size={14} strokeWidth={1.9} />
                  Reset Password
                </button>

                {!isMe && (
                  <>
                    <div className="um-menu-divider" />
                    <button
                      type="button"
                      className="um-menu-danger"
                      onClick={() => onDelete(user)}
                    >
                      <Trash2 size={14} strokeWidth={1.9} />
                      Deactivate Account
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function AccountModal({
  mode,
  target,
  form,
  setF,
  me,
  photoPreview,
  onPhotoChange,
  saving,
  onClose,
  onSubmit,
}) {
  const isEdit = mode === "edit";
  const isSelf = isEdit && target?.id === me?.id;

  return (
    <ModalShell onClose={onClose}>
      <div className="um-modal-header">
        <div>
          <div className="um-modal-eyebrow">{isEdit ? "Account Details" : "New Account"}</div>
          <h3>{isEdit ? "Edit Account" : "Add Account"}</h3>
          <p>
            {isEdit
              ? `Update account information and access for ${target?.name || "this user"}.`
              : "Create an administrator or staff account."}
          </p>
        </div>

        <button
          type="button"
          className="um-modal-close"
          aria-label="Close"
          onClick={onClose}
          disabled={saving}
        >
          <X size={17} strokeWidth={1.9} />
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <div className="um-modal-body">
          <section className="um-profile-photo-section">
            <div className="um-profile-photo-preview">
              {photoPreview ? (
                <img src={photoPreview} alt="Profile preview" />
              ) : (
                getInitial(form.name)
              )}
            </div>

            <div className="um-profile-photo-copy">
              <div className="um-section-label">Profile Photo</div>
              <p>Optional. JPG, JPEG, JFIF, PNG, or WEBP up to 2MB.</p>
              <label className="um-btn um-btn-secondary um-photo-upload-btn">
                <ImagePlus size={14} strokeWidth={1.9} />
                {photoPreview ? "Change Photo" : "Upload Photo"}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.jfif,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={onPhotoChange}
                  disabled={saving}
                />
              </label>
            </div>
          </section>

          <div className="um-form-grid">
            <Field label="Full Name" required>
              <input
                required
                value={form.name}
                onChange={(event) => setF("name", event.target.value)}
                placeholder="Juan Dela Cruz"
              />
            </Field>

            <Field label="Email Address" required>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setF("email", event.target.value)}
                placeholder="user@spiralwood.com"
              />
            </Field>

            {!isEdit && (
              <Field label="Temporary Password" required>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(event) => setF("password", event.target.value)}
                  placeholder="Minimum 8 characters"
                />
              </Field>
            )}

            <Field label="Phone Number" required>
              <input
                required
                value={form.phone}
                onChange={(event) => setF("phone", event.target.value)}
                placeholder="09XX XXX XXXX"
              />
            </Field>

            <Field label="Address" required>
              <input
                required
                value={form.address}
                onChange={(event) => setF("address", event.target.value)}
                placeholder="Complete address"
              />
            </Field>
          </div>

          <section className="um-form-section">
            <div className="um-section-label">Account Type</div>

            <div className="um-choice-grid">
              {[
                {
                  value: "admin",
                  label: "Administrator",
                  desc: "Full administrative access",
                },
                {
                  value: "staff",
                  label: "Staff",
                  desc: "Access based on assigned staff role",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`um-choice${form.role === option.value ? " is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={form.role === option.value}
                    disabled={isSelf && option.value !== "admin"}
                    onChange={() => {
                      setF("role", option.value);

                      if (option.value === "staff" && !form.staff_type) {
                        setF("staff_type", "cashier");
                      }
                    }}
                  />

                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.desc}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {form.role === "staff" && (
            <section className="um-form-section">
              <div className="um-section-label">Staff Role</div>

              <div className="um-choice-grid um-choice-grid-three">
                {Object.entries(STAFF_TYPES).map(([value, meta]) => (
                  <label
                    key={value}
                    className={`um-choice${form.staff_type === value ? " is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="staff_type"
                      value={value}
                      checked={form.staff_type === value}
                      onChange={() => setF("staff_type", value)}
                    />

                    <span>
                      <strong>{meta.label}</strong>
                      <small>{meta.desc}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="um-form-section um-status-section">
            <div>
              <div className="um-section-label">Account Status</div>
              <p>Controls whether this account can sign in to WISDOM.</p>
            </div>

            <label className="um-checkbox-row">
              <input
                type="checkbox"
                checked={!!form.is_active}
                disabled={isSelf}
                onChange={(event) => setF("is_active", event.target.checked)}
              />
              <span>
                <strong>Active account</strong>
                <small>Can sign in and access assigned features.</small>
              </span>
            </label>
          </section>
        </div>

        <div className="um-modal-footer">
          <button
            type="button"
            className="um-btn um-btn-secondary um-account-modal-action"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="um-btn um-btn-primary um-account-modal-action"
            disabled={saving}
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Account"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function PasswordModal({
  target,
  value,
  setValue,
  saving,
  onClose,
  onSubmit,
}) {
  return (
    <ModalShell onClose={onClose} compact>
      <div className="um-modal-header">
        <div>
          <div className="um-modal-eyebrow">Account Security</div>
          <h3>Reset Password</h3>
          <p>Set a new password for {target?.name || "this account"}.</p>
        </div>

        <button
          type="button"
          className="um-modal-close"
          aria-label="Close"
          onClick={onClose}
          disabled={saving}
        >
          <X size={17} strokeWidth={1.9} />
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <div className="um-modal-body">
          <Field label="New Password" required>
            <input
              required
              type="password"
              minLength={8}
              value={value.new_password}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  new_password: event.target.value,
                }))
              }
              placeholder="Minimum 8 characters"
            />
          </Field>

          <Field label="Confirm Password" required>
            <input
              required
              type="password"
              minLength={8}
              value={value.confirm}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  confirm: event.target.value,
                }))
              }
              placeholder="Re-enter new password"
            />
          </Field>
        </div>

        <div className="um-modal-footer">
          <button
            type="button"
            className="um-btn um-btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="um-btn um-btn-primary"
            disabled={saving}
          >
            {saving ? "Resetting..." : "Reset Password"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteModal({ target, saving, onClose, onConfirm }) {
  return (
    <ModalShell onClose={onClose} compact>
      <div className="um-modal-header">
        <div>
          <div className="um-modal-eyebrow um-danger-text">Account Access</div>
          <h3>Deactivate Account</h3>
          <p>
            Deactivate {target?.name || "this account"} in WISDOM?
          </p>
        </div>

        <button
          type="button"
          className="um-modal-close"
          aria-label="Close"
          onClick={onClose}
          disabled={saving}
        >
          <X size={17} strokeWidth={1.9} />
        </button>
      </div>

      <div className="um-modal-body">
        <div className="um-delete-warning">
          <Trash2 size={18} strokeWidth={1.9} />
          <div>
            <strong>This is a reversible access change.</strong>
            <span>
              The account will remain in WISDOM for history and can be reactivated later.
            </span>
          </div>
        </div>
      </div>

      <div className="um-modal-footer">
        <button
          type="button"
          className="um-btn um-btn-secondary"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>

        <button
          type="button"
          className="um-btn um-btn-danger"
          onClick={onConfirm}
          disabled={saving}
        >
          {saving ? "Deactivating..." : "Deactivate Account"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ children, onClose, compact = false }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="um-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`um-modal${compact ? " um-modal-compact" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, required = false, children }) {
  return (
    <label className="um-field um-form-field">
      <span>
        {label}
        {required && <b aria-hidden="true"> *</b>}
      </span>
      {children}
    </label>
  );
}

const styles = `
  .wisdom-admin-users-v2 {
    width: min(100%, 1460px);
    margin: 0 auto;
    color: #18181b;
    --um-border: #dde1e6;
    --um-border-soft: #eceff2;
    --um-muted: #71717a;
    --um-soft: #fafafa;
    --um-danger: #b42318;
    --um-danger-soft: #fff4f2;
  }

  .wisdom-admin-users-v2 *,
  .wisdom-admin-users-v2 *::before,
  .wisdom-admin-users-v2 *::after {
    box-sizing: border-box;
  }

  .wisdom-admin-users-v2 button,
  .wisdom-admin-users-v2 input,
  .wisdom-admin-users-v2 select {
    font: inherit;
  }

  .um-page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 18px;
  }

  .um-page-title {
    margin: 0;
    color: #18181b;
    font-size: 24px;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .um-page-subtitle {
    margin: 4px 0 0;
    max-width: 680px;
    color: #71717a;
    font-size: 12.5px;
    line-height: 1.5;
    font-weight: 400;
  }

  .um-btn {
    min-height: 35px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11.5px;
    line-height: 1;
    font-weight: 650;
    transition: background 130ms ease, border-color 130ms ease, color 130ms ease;
  }

  .um-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .um-btn-primary {
    border-color: #18181b;
    background: #18181b;
    color: #ffffff;
  }

  .um-btn-primary:hover:not(:disabled) {
    background: #2f2f33;
  }

  /* WISDOM USER ACCOUNT MODAL BUTTON FONT V1
     Font only: Cancel + Create Account / Save Changes. */
  .um-modal-footer .um-account-modal-action {
    font-family: "Inter", sans-serif !important;
    font-size: 11.5px !important;
    line-height: 1 !important;
    font-weight: 700 !important;
    letter-spacing: 0 !important;
  }

  .um-add-account-btn {
    min-height: 34px;
    padding: 0 13px;
    gap: 6px;
    border-radius: 3px;
    box-shadow: none;
    font-family: "Inter", sans-serif;
    font-size: 12px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .um-add-account-btn svg {
    flex: 0 0 auto;
  }

  /* WISDOM ADD ACCOUNT TEXT FORCE MATCH V1
     Target the rendered text directly so no broader button rule can alter it. */
  .wisdom-admin-users-v2 .um-add-account-btn > span {
    font-family: "Inter", sans-serif !important;
    font-size: 11.5px !important;
    line-height: 1 !important;
    font-weight: 700 !important;
    letter-spacing: 0 !important;
  }

  .um-add-account-btn:hover:not(:disabled) {
    background: #252529;
    border-color: #252529;
  }

  .um-btn-secondary {
    border-color: #cfd4da;
    background: #ffffff;
    color: #2e3238;
  }

  .um-btn-secondary:hover:not(:disabled) {
    background: #f7f7f8;
  }

  .um-btn-danger {
    border-color: #b42318;
    background: #b42318;
    color: #ffffff;
  }

  .um-btn-danger:hover:not(:disabled) {
    background: #912018;
  }

  .um-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 16px;
  }

  .um-summary-card {
    min-height: 82px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 15px;
    border: 1px solid var(--um-border);
    border-radius: 4px;
    background: #ffffff;
  }

  .um-summary-label {
    color: #696f78;
    font-size: 9.5px;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .um-summary-value {
    margin-top: 7px;
    color: #111214;
    font-size: 25px;
    line-height: 1;
    font-weight: 760;
  }

  .um-summary-value.is-alert {
    color: #c43b31;
  }

  .um-summary-icon {
    color: #464b52;
  }

  .um-summary-alert .um-summary-value {
    color: #c43b31;
  }

  .um-summary-alert .um-summary-icon {
    color: #464b52;
  }

  .um-card {
    border: 1px solid var(--um-border);
    border-radius: 4px;
    background: #ffffff;
    overflow: visible;
  }

  .um-card-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
    padding: 16px 17px 13px;
    border-bottom: 1px solid var(--um-border);
  }

  .um-card-heading h2 {
    margin: 0;
    color: #1e2023;
    font-size: 16px;
    line-height: 1.25;
    font-weight: 700;
  }

  .um-card-heading p {
    margin: 4px 0 0;
    color: #737982;
    font-size: 11.5px;
    line-height: 1.45;
    font-weight: 400;
  }

  .um-result-count {
    padding: 7px 9px;
    border: 1px solid var(--um-border);
    border-radius: 3px;
    color: #555b63;
    background: #ffffff;
    font-size: 10.5px;
    font-weight: 550;
    white-space: nowrap;
  }

  .um-toolbar {
    display: grid;
    grid-template-columns: minmax(300px, 1.7fr) minmax(160px, 0.75fr) minmax(150px, 0.65fr) auto;
    align-items: end;
    gap: 10px;
    padding: 13px 17px;
    border-bottom: 1px solid var(--um-border);
    background: #fafafa;
  }

  .um-field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .um-field > span,
  .um-section-label {
    color: #393e45;
    font-size: 10.5px;
    line-height: 1.3;
    font-weight: 650;
  }

  .um-field > span b {
    color: #b42318;
    font-weight: 650;
  }

  .um-field input,
  .um-field select {
    width: 100%;
    height: 37px;
    padding: 0 10px;
    border: 1px solid #cbd0d6;
    border-radius: 3px;
    outline: none;
    background: #ffffff;
    color: #262a30;
    font-size: 12.5px;
    font-weight: 400;
  }

  .um-field input:focus,
  .um-field select:focus {
    border-color: #777d85;
    box-shadow: 0 0 0 2px rgba(24, 24, 27, 0.07);
  }

  .um-search-wrap {
    position: relative;
  }

  .um-search-wrap svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #8a9098;
    pointer-events: none;
  }

  .um-search-wrap input {
    padding-left: 32px;
  }

  .um-reset-btn {
    min-width: 100px;
  }

  .um-table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .um-table {
    width: 100%;
    min-width: 1040px;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .um-table th {
    padding: 11px 13px;
    border-bottom: 1px solid var(--um-border);
    background: #fbfbfb;
    color: #60656d;
    font-size: 9.5px;
    line-height: 1.2;
    font-weight: 600;
    letter-spacing: 0.35px;
    text-align: left;
    text-transform: uppercase;
  }

  .um-table th:nth-child(1) { width: 25%; }
  .um-table th:nth-child(2) { width: 23%; }
  .um-table th:nth-child(3) { width: 18%; }
  .um-table th:nth-child(4) { width: 11%; }
  .um-table th:nth-child(5) { width: 12%; }
  .um-table th:nth-child(6) { width: 11%; }

  .um-table td {
    padding: 12px 13px;
    border-bottom: 1px solid var(--um-border-soft);
    color: #34383d;
    font-size: 11.5px;
    line-height: 1.35;
    font-weight: 400;
    vertical-align: middle;
  }

  .um-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .um-table tbody tr:hover {
    background: #fcfcfc;
  }

  .um-account-cell {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .um-avatar {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: grid;
    place-items: center;
    border: 1px solid #dfe2e6;
    border-radius: 50%;
    background: #f7f7f8;
    color: #535860;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.2px;
    overflow: hidden;
  }

  .um-avatar img {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: inherit;
    object-fit: cover;
  }

  .um-avatar-admin {
    border-color: #18181b;
    background: #18181b;
    color: #ffffff;
  }

  .um-account-copy,
  .um-contact,
  .um-role-cell {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .um-name-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .um-user-name {
    overflow: hidden;
    color: #25282c;
    font-size: 11.8px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .um-you-label {
    padding: 2px 5px;
    border-radius: 3px;
    background: #18181b;
    color: #ffffff;
    font-size: 8.5px;
    line-height: 1.2;
    font-weight: 650;
  }

  .um-account-type,
  .um-contact small,
  .um-role-cell small {
    overflow: hidden;
    color: #858a91;
    font-size: 9.8px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .um-contact > span {
    overflow: hidden;
    color: #34383d;
    font-size: 11.5px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .um-role-label {
    width: fit-content;
    color: #30343a;
    font-size: 11.5px;
    font-weight: 600;
  }

  .um-role-admin {
    font-weight: 650;
  }

  .um-status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #3f444a;
    font-size: 10.5px;
    font-weight: 500;
  }

  .um-status i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #369060;
  }

  .um-status.is-inactive {
    color: #9d3028;
  }

  .um-status.is-inactive i {
    background: #c43b31;
  }

  .um-last-login {
    color: #858a91;
    font-size: 10.5px;
    font-weight: 400;
  }

  .um-row-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
  }

  .um-actions-heading {
    text-align: right !important;
  }

  .um-edit-btn {
    min-height: 31px;
    padding: 0 9px;
    font-size: 10.5px;
  }

  .um-more-wrap {
    position: relative;
  }

  .um-icon-btn,
  .um-modal-close {
    width: 32px;
    height: 32px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 1px solid #cfd4da;
    border-radius: 3px;
    background: #ffffff;
    color: #50565e;
    cursor: pointer;
  }

  .um-icon-btn:hover,
  .um-modal-close:hover:not(:disabled) {
    background: #f7f7f8;
  }

  .um-action-menu {
    position: absolute;
    z-index: 30;
    top: calc(100% + 5px);
    right: 0;
    width: 180px;
    padding: 5px;
    border: 1px solid #d6dae0;
    border-radius: 3px;
    background: #ffffff;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  }

  .um-action-menu button {
    width: 100%;
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 9px;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: #34383e;
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 550;
    text-align: left;
  }

  .um-action-menu button:hover {
    background: #f5f6f7;
  }

  .um-menu-divider {
    height: 1px;
    margin: 4px 0;
    background: #eceef1;
  }

  .um-action-menu .um-menu-danger {
    color: #b42318;
  }

  .um-action-menu .um-menu-danger:hover {
    background: #fff4f2;
  }

  .um-empty {
    height: 170px;
    text-align: center;
    color: #777d86;
  }

  .um-empty strong,
  .um-empty span {
    display: block;
  }

  .um-empty strong {
    margin-bottom: 5px;
    color: #30343a;
    font-size: 13px;
    font-weight: 650;
  }

  .um-empty span {
    font-size: 11.5px;
    font-weight: 400;
  }

  .um-overlay {
    position: fixed;
    z-index: 1000;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.58);
  }

  .um-modal {
    width: min(100%, 720px);
    max-height: 90vh;
    overflow-y: auto;
    border: 1px solid #d8dce1;
    border-radius: 4px;
    background: #ffffff;
    box-shadow: 0 22px 56px rgba(0, 0, 0, 0.2);
  }

  .um-modal-compact {
    width: min(100%, 500px);
  }

  .um-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 19px 15px;
    border-bottom: 1px solid #e1e4e8;
  }

  .um-modal-eyebrow {
    margin-bottom: 5px;
    color: #7b8189;
    font-size: 9px;
    font-weight: 650;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .um-modal-header h3 {
    margin: 0;
    color: #17191d;
    font-size: 20px;
    line-height: 1.2;
    font-weight: 740;
  }

  .um-modal-header p {
    margin: 6px 0 0;
    color: #727881;
    font-size: 11.5px;
    line-height: 1.45;
    font-weight: 400;
  }

  .um-modal-close {
    flex: 0 0 32px;
  }

  .um-modal-body {
    padding: 18px 19px;
  }

  .um-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .um-form-field {
    margin-bottom: 13px;
  }

  .um-form-grid .um-form-field {
    margin-bottom: 0;
  }

  .um-form-section {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid #eceef1;
  }

  .um-choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 8px;
  }

  .um-choice-grid-three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .um-choice {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 11px;
    border: 1px solid #d6dae0;
    border-radius: 3px;
    background: #ffffff;
    cursor: pointer;
  }

  .um-choice:hover {
    background: #fafafa;
  }

  .um-choice.is-selected {
    border-color: #18181b;
    background: #fafafa;
    box-shadow: inset 3px 0 0 #18181b;
  }

  .um-choice input {
    margin: 2px 0 0;
    accent-color: #18181b;
  }

  .um-choice span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .um-choice strong,
  .um-checkbox-row strong {
    color: #24272c;
    font-size: 11.5px;
    font-weight: 650;
  }

  .um-choice small,
  .um-checkbox-row small {
    color: #7b818a;
    font-size: 10px;
    line-height: 1.35;
    font-weight: 400;
  }

  .um-status-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .um-status-section p {
    margin: 4px 0 0;
    color: #7b818a;
    font-size: 10.5px;
    line-height: 1.4;
    font-weight: 400;
  }

  .um-checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 9px 10px;
    border: 1px solid #d6dae0;
    border-radius: 3px;
    background: #ffffff;
    cursor: pointer;
  }

  .um-checkbox-row input {
    margin-top: 2px;
    accent-color: #18181b;
  }

  .um-checkbox-row span {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .um-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 13px 19px;
    border-top: 1px solid #e1e4e8;
    background: #fafafa;
  }

  .um-delete-warning {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    padding: 12px;
    border: 1px solid #f0c9c5;
    border-radius: 3px;
    background: #fff8f7;
    color: #9d3028;
  }

  .um-delete-warning > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .um-delete-warning strong {
    color: #84241d;
    font-size: 12px;
    font-weight: 650;
  }

  .um-delete-warning span {
    color: #8c5b56;
    font-size: 10.5px;
    line-height: 1.45;
    font-weight: 400;
  }

  .um-danger-text {
    color: #b42318;
  }

  @media (max-width: 1000px) {
    .um-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .um-toolbar {
      grid-template-columns: minmax(240px, 1fr) minmax(150px, 0.6fr) minmax(145px, 0.6fr);
    }

    .um-reset-btn {
      width: fit-content;
    }
  }

  @media (max-width: 720px) {
    .wisdom-admin-users-v2 {
      width: 100%;
    }

    .um-page-header {
      flex-direction: column;
    }

    .um-page-header .um-btn-primary {
      width: 100%;
    }

    .um-summary-grid,
    .um-toolbar,
    .um-form-grid,
    .um-choice-grid,
    .um-choice-grid-three {
      grid-template-columns: 1fr;
    }

    .um-card-heading,
    .um-status-section {
      align-items: flex-start;
      flex-direction: column;
    }

    .um-result-count {
      align-self: flex-start;
    }

    .um-modal {
      max-height: 94vh;
    }
  }
  .um-profile-photo-section {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px;
    margin-bottom: 16px;
    border: 1px solid var(--um-border-soft);
    border-radius: 4px;
    background: #fafafa;
  }

  .um-profile-photo-preview {
    width: 62px;
    height: 62px;
    flex: 0 0 62px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid #d9dde2;
    border-radius: 50%;
    background: #ffffff;
    color: #4d535b;
    font-size: 14px;
    font-weight: 700;
  }

  .um-profile-photo-preview img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .um-profile-photo-copy {
    min-width: 0;
  }

  .um-profile-photo-copy p {
    margin: 4px 0 9px;
    color: var(--um-muted);
    font-size: 10.5px;
    line-height: 1.45;
  }

  .um-photo-upload-btn {
    width: fit-content;
    min-height: 32px;
    cursor: pointer;
  }

  .um-photo-upload-btn input {
    display: none;
  }

`;
