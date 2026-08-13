import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../../services/api";

const ACTION_LABELS = {
  // Security and account access
  login_success: "Signed in successfully",
  login_failed: "Sign-in attempt failed",
  access_denied: "Access was denied",
  password_changed: "Changed own password",
  password_reset_completed: "Completed password reset",
  update_own_profile: "Updated own profile",

  // Products and inventory
  create_product: "Created product",
  update_product: "Updated product",
  delete_product: "Deleted product",
  toggle_active_product: "Changed product availability",
  feature_product: "Featured product",
  unfeature_product: "Removed product from featured",
  publish_product: "Published product",
  unpublish_product: "Unpublished product",
  bulk_publish_products: "Published products",
  bulk_unpublish_products: "Unpublished products",
  unpublish_blueprint_products: "Unpublished blueprint products",
  create_raw_material: "Created raw material",
  update_raw_material: "Updated raw material",
  archive_raw_material: "Archived raw material",
  restore_raw_material: "Restored raw material",
  delete_raw_material: "Deleted raw material",
  create_supplier: "Created supplier",
  update_supplier: "Updated supplier",
  delete_supplier: "Deleted supplier",
  create_stock_movement: "Recorded stock movement",

  // Orders, sales, payments, and delivery
  create_online_order: "Placed online order",
  cancel_online_order: "Cancelled online order",
  verify_online_payment: "Verified online payment",
  system_recover_online_payment: "Recovered online payment",
  system_cancel_unpaid_order: "Auto-cancelled unpaid order",
  create_pos_sale: "Created POS sale",
  update_order_status: "Updated order status",
  accept_order: "Accepted order",
  decline_order: "Declined order",
  confirm_order_receipt: "Confirmed order receipt",
  process_cancellation: "Processed cancellation",
  verify_payment: "Reviewed payment",
  record_blueprint_cash_down_payment: "Recorded blueprint cash down payment",
  record_blueprint_cash_payment: "Recorded blueprint cash payment",
  confirm_blueprint_rider_cash_collection: "Confirmed rider cash collection",
  select_blueprint_payment_method: "Selected blueprint payment method",
  select_blueprint_remaining_payment_method: "Selected remaining payment method",
  verify_blueprint_remaining_balance_payment: "Verified remaining balance payment",
  submit_blueprint_down_payment: "Submitted blueprint down payment",
  verify_pos_qr_payment: "Verified POS QR payment",
  recovery_verify_pos_qr_payment: "Recovered POS QR payment",
  attach_pos_qr_provider_session: "Linked POS QR provider session",
  expire_pos_qr_payment_attempt: "Expired POS QR payment attempt",
  admin_manual_release_pos_qr_attempt: "Released POS QR payment attempt",
  admin_resolve_unpaid_pos_qr_attempt: "Resolved unpaid POS QR attempt",
  create_delivery: "Created delivery",
  reschedule_delivery: "Rescheduled delivery",
  update_delivery_status: "Updated delivery status",

  // Production and blueprints
  assign_production_staff: "Assigned production staff",
  reassign_production_staff: "Reassigned production staff",
  update_project_task: "Updated production task",
  update_project_task_status: "Updated production task status",
  delete_project_task: "Deleted production task",
  mark_production_ready_for_shipping: "Marked production ready for shipping",
  create_blueprint: "Created blueprint",
  update_blueprint: "Updated blueprint",
  archive_blueprint: "Archived blueprint",
  restore_blueprint: "Restored blueprint",
  permanently_delete_blueprint: "Permanently deleted blueprint",
  create_blueprint_estimation: "Created blueprint quotation",
  send_blueprint_estimation: "Sent blueprint quotation",
  generate_contract: "Generated contract",
  create_custom_request: "Submitted custom request",
  approve_custom_request: "Approved custom request",
  reject_custom_request: "Rejected custom request",
  accept_custom_estimate: "Approved custom quotation",
  request_custom_estimate_revision: "Requested quotation revision",
  reject_custom_estimate: "Rejected custom quotation",

  // Appointments, warranty, and support
  request_appointment: "Requested appointment",
  create_appointment: "Created appointment",
  update_appointment: "Updated appointment",
  cancel_appointment: "Cancelled appointment",
  submit_warranty_claim: "Submitted warranty claim",
  cancel_warranty_claim: "Cancelled warranty claim",
  decide_warranty_claim: "Reviewed warranty claim",
  fulfill_warranty_claim: "Completed warranty service",
  create_support_ticket: "Created support ticket",
  assign_support_ticket: "Assigned support ticket",
  update_support_ticket: "Updated support ticket",
  reply_support_ticket: "Replied to support ticket",
  close_support_ticket: "Closed support ticket",

  // Users and customer accounts
  update_customer_status: "Updated customer account",
  create_user: "Created user account",
  update_user: "Updated user account",
  reset_user_password: "Reset user password",
  delete_user: "Deactivated user account",
  update_customer_avatar: "Updated customer profile photo",
  update_customer_email: "Updated customer email",
  update_customer_password: "Changed customer password",
  update_customer_phone: "Updated customer phone",
  update_customer_profile: "Updated customer profile",

  // Website and backups
  update_website_settings: "Updated website settings",
  create_faq: "Created FAQ",
  update_faq: "Updated FAQ",
  delete_faq: "Deleted FAQ",
  update_page: "Updated page content",
  manual_backup_created: "Created database backup",
  manual_backup_failed: "Database backup failed",
  backup_downloaded: "Downloaded database backup",
};

const MODULE_LABELS = {
  security: "Security",
  users: "Accounts",
  products: "Products",
  orders: "Orders",
  payment_transactions: "Payments",
  pos_qr_payment_attempts: "POS QR Recovery",
  raw_materials: "Raw Materials",
  suppliers: "Suppliers",
  stock_movements: "Inventory Activity",
  deliveries: "Deliveries",
  appointments: "Appointments",
  warranties: "Warranty",
  support_tickets: "Support",
  website_content: "Website Settings",
  website_settings: "Website Settings",
  faqs: "FAQs",
  static_pages: "Page Content",
  blueprints: "Blueprints",
  estimations: "Quotations",
  project_tasks: "Production",
  contracts: "Contracts",
  cancellations: "Cancellations",
  backup_logs: "Backups",
};

const TARGET_LABELS = {
  security: "Account",
  users: "Account",
  products: "Product",
  orders: "Order",
  payment_transactions: "Payment",
  pos_qr_payment_attempts: "POS QR Attempt",
  raw_materials: "Raw Material",
  suppliers: "Supplier",
  stock_movements: "Stock Movement",
  deliveries: "Delivery",
  appointments: "Appointment",
  warranties: "Warranty Claim",
  support_tickets: "Support Ticket",
  website_content: "Website Settings",
  website_settings: "Website Settings",
  faqs: "FAQ",
  static_pages: "Page",
  blueprints: "Blueprint",
  estimations: "Quotation",
  project_tasks: "Production Task",
  contracts: "Contract",
  cancellations: "Cancellation",
  backup_logs: "Backup",
};

const FIELD_LABELS = {
  has_logo: "Site Logo Configured",
  logo_uploaded_this_update: "Site Logo Updated",
  is_visible: "Visible",
  is_active: "Active",
  payment_status: "Payment Status",
  order_status: "Order Status",
  customer_status: "Customer Status",
  status: "Status",
  sort_order: "Display Order",
  site_name: "Business Name",
  business_address: "Business Address",
  business_phone: "Business Phone",
  business_email: "Business Email",
  google_maps_url: "Google Maps Link",
  business_latitude: "Business Latitude",
  business_longitude: "Business Longitude",
  google_maps_place_id: "Google Maps Place ID",
  name: "Name",
  product_name: "Product Name",
  material_name: "Material Name",
  supplier_name: "Supplier Name",
  email: "Email",
  phone: "Phone",
  price: "Price",
  social_facebook: "Facebook Page",
  operating_hours: "Operating Hours",
  title: "Title",
  quantity: "Quantity",
  stock: "Stock",
  role: "Role",
  staff_type: "Staff Role",
  user_role: "Account Role",
  attempted_email: "Attempted Email",
  result: "Result",
  reason: "Reason",
  request_method: "Request Method",
  request_path: "Requested Page",
  required_roles: "Allowed Roles",
  required_staff_types: "Allowed Staff Roles",
  order_number: "Order Number",
  order_id: "Order",
  item_count: "Units",
  total: "Total Amount",
  amount: "Amount",
  payment_method: "Payment Method",
  payment_id: "Payment",
  payment_transaction_id: "Payment",
  product_count: "Products",
  product_ids: "Product IDs",
  is_published: "Published",
  is_featured: "Featured",
  blueprint_id: "Blueprint",
  affected_products: "Affected Products",
  file_name: "Backup File",
  file_size_kb: "File Size (KB)",
  category: "Category",
  quoted_total: "Quoted Total",
  down_payment: "Required Down Payment",
  customer_decision: "Customer Decision",
  reply_added: "Reply Added",
  evidence_uploaded: "Evidence Uploaded",
};

const KNOWN_ACTIONS = Object.keys(ACTION_LABELS);
const KNOWN_TABLES = Object.keys(MODULE_LABELS);
const LIMIT_OPTIONS = [10, 20, 50, 100];

const DEFAULT_FILTERS = {
  search: "",
  action: "",
  table_name: "",
  date_from: "",
  date_to: "",
  page: 1,
  limit: 20,
};

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

const humanize = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  return raw
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatActionLabel = (action) => ACTION_LABELS[action] || humanize(action);
const formatModuleLabel = (tableName) =>
  MODULE_LABELS[tableName] || humanize(tableName);

const formatDateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const safeParseJSON = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const formatFieldLabel = (key) => FIELD_LABELS[key] || humanize(key);

const formatValue = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (Array.isArray(value)) {
    if (!value.length) return "—";
    return value
      .map((item) =>
        typeof item === "string" ? formatFieldLabel(item) : String(item),
      )
      .join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${formatFieldLabel(key)}: ${formatValue(item)}`)
      .join(" · ");
  }

  if (typeof value === "string") {
    const clean = value.trim();
    if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(clean)) return humanize(clean);
    return clean;
  }

  return String(value);
};

const isTechnicalChangeFlag = (key) =>
  key === "keys_changed" ||
  key === "changed_fields" ||
  (key.endsWith("_changed") && key !== "status_changed");

const isTechnicalAuditKey = (key) =>
  key === "keys_changed" ||
  key === "changed_fields" ||
  key.endsWith("_changed");

const getReadableObject = (data) => {
  const parsed = safeParseJSON(data);
  if (!parsed || Array.isArray(parsed)) return {};

  return Object.fromEntries(
    Object.entries(parsed).filter(([key, value]) => {
      if (isTechnicalAuditKey(key)) return false;
      if (key === "logo_uploaded_this_update" && value !== true) return false;
      return true;
    }),
  );
};

const getChangedFieldKeys = (log) => {
  const oldObject = getReadableObject(log?.old_values);
  const newObject = getReadableObject(log?.new_values);
  const rawNew = safeParseJSON(log?.new_values);
  const keys = [];

  const add = (key) => {
    const clean = String(key || "").trim();
    if (clean && !keys.includes(clean)) keys.push(clean);
  };

  if (rawNew && !Array.isArray(rawNew)) {
    if (Array.isArray(rawNew.keys_changed)) rawNew.keys_changed.forEach(add);
    if (Array.isArray(rawNew.changed_fields)) rawNew.changed_fields.forEach(add);

    Object.entries(rawNew).forEach(([key, value]) => {
      if (key === "logo_uploaded_this_update" && value === true) {
        add("site_logo");
        return;
      }
      if (key.endsWith("_changed") && value === true) {
        add(key.replace(/_changed$/, ""));
      }
    });
  }

  const union = new Set([...Object.keys(oldObject), ...Object.keys(newObject)]);
  union.forEach((key) => {
    if (key === "has_logo" || key === "logo_uploaded_this_update") return;
    if (JSON.stringify(oldObject[key]) !== JSON.stringify(newObject[key])) add(key);
  });

  return keys;
};

const getActivityLabel = (log) => {
  const base = ACTION_LABELS[log?.action] || humanize(log?.action);
  const newValues = getReadableObject(log?.new_values);
  const nextStatus = String(
    newValues.status || newValues.order_status || newValues.payment_status || "",
  )
    .trim()
    .toLowerCase();

  if (log?.action === "update_website_settings") {
    const changed = getChangedFieldKeys(log);
    if (changed.length === 1) {
      return `Updated ${formatFieldLabel(changed[0]).toLowerCase()}`;
    }
  }

  if (log?.action === "update_order_status" && nextStatus) {
    return `Changed order status to ${humanize(nextStatus)}`;
  }

  if (log?.action === "update_delivery_status" && nextStatus) {
    return `Changed delivery status to ${humanize(nextStatus)}`;
  }

  if (log?.action === "update_project_task_status" && nextStatus) {
    const labels = {
      in_progress: "Started production task",
      completed: "Completed production task",
      blocked: "Blocked production task",
      pending: "Returned production task to pending",
    };
    return labels[nextStatus] || `Changed production task to ${humanize(nextStatus)}`;
  }

  if (log?.action === "update_appointment" && nextStatus) {
    return `Changed appointment to ${humanize(nextStatus)}`;
  }

  if (log?.action === "decide_warranty_claim" && nextStatus) {
    if (nextStatus === "approved") return "Approved warranty claim";
    if (nextStatus === "rejected") return "Rejected warranty claim";
  }

  if (log?.action === "update_support_ticket" && nextStatus) {
    return `Changed support ticket to ${humanize(nextStatus)}`;
  }

  if (log?.action === "verify_payment") {
    const decision = String(newValues.action || "").trim().toLowerCase();
    if (decision === "verified") return "Verified payment";
    if (decision === "rejected") return "Rejected payment";
  }

  if (log?.action === "update_customer_status") {
    const active = newValues.is_active;
    const decision = String(newValues.action || "").trim().toLowerCase();
    if (active === true || active === 1 || decision === "activate") {
      return "Activated customer account";
    }
    if (active === false || active === 0 || ["deactivate", "delete"].includes(decision)) {
      return "Deactivated customer account";
    }
  }

  if (log?.action === "toggle_active_product") {
    const active = newValues.is_active;
    if (active === true || active === 1) return "Enabled product";
    if (active === false || active === 0) return "Disabled product";
  }

  if (log?.action === "send_blueprint_estimation") {
    return "Sent blueprint quotation";
  }

  if (log?.action === "delete_user") return "Deactivated user account";

  if (log?.action === "login_failed") {
    const reason = String(newValues.reason || "").trim().toLowerCase();
    if (reason === "account_inactive") return "Sign-in blocked for inactive account";
    if (reason === "email_not_verified") return "Sign-in blocked until email verification";
    return "Sign-in attempt failed";
  }

  return base;
};

const getTargetLabel = (log) => {
  const tableName = String(log?.table_name || "");
  const base = TARGET_LABELS[tableName] || formatModuleLabel(tableName);

  if (log?.action === "update_website_settings") {
    const changed = getChangedFieldKeys(log);
    if (changed.length === 1) return formatFieldLabel(changed[0]);
    if (changed.length > 1) return "Multiple settings";
    return "Website Settings";
  }

  const merged = {
    ...getReadableObject(log?.old_values),
    ...getReadableObject(log?.new_values),
  };

  if (tableName === "payment_transactions") {
    const paymentId =
      merged.payment_id ||
      merged.payment_transaction_id ||
      (log?.action === "verify_payment" ? null : log?.record_id);
    const orderId =
      merged.order_id ||
      (log?.action === "verify_payment" ? log?.record_id : null);

    if (paymentId && orderId) return `Payment #${paymentId} · Order #${orderId}`;
    if (paymentId) return `Payment #${paymentId}`;
    if (orderId) return `Order #${orderId} payment`;
  }

  if (tableName === "security") {
    if (log?.record_id) return `Account #${log.record_id}`;
    if (merged.attempted_email) return `Sign-in: ${merged.attempted_email}`;
    if (merged.request_path) return merged.request_path;
    return "Security event";
  }

  if (tableName === "backup_logs" && merged.file_name) {
    return merged.file_name;
  }

  if (
    log?.record_id !== null &&
    log?.record_id !== undefined &&
    log?.record_id !== ""
  ) {
    return `${base} #${log.record_id}`;
  }

  for (const key of [
    "product_name",
    "material_name",
    "supplier_name",
    "name",
    "title",
    "question",
    "email",
  ]) {
    const value = merged[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return `${base}: ${String(value).trim()}`;
    }
  }

  return base || "System";
};

const getPerformedBy = (log) => {
  const values = {
    ...getReadableObject(log?.old_values),
    ...getReadableObject(log?.new_values),
  };

  if (log?.user_name) {
    return { name: log.user_name, secondary: log.user_email || "" };
  }

  if (log?.action === "login_failed" && values.attempted_email) {
    return {
      name: "Unknown sign-in attempt",
      secondary: values.attempted_email,
    };
  }

  if (String(log?.action || "").startsWith("system_")) {
    return { name: "System", secondary: "Automated process" };
  }

  return { name: "System", secondary: "" };
};

const getChangeSummary = (log) => {
  const changed = getChangedFieldKeys(log);

  if (changed.length === 1) {
    const field = formatFieldLabel(changed[0]);
    return log?.action === "update_website_settings"
      ? `${field} was updated.`
      : `${field} changed.`;
  }

  if (changed.length > 1) {
    const readable = changed.map(formatFieldLabel);
    const shown = readable.slice(0, 4);
    const remaining = readable.length - shown.length;
    return `Updated ${shown.join(", ")}${
      remaining > 0 ? ` and ${remaining} more` : ""
    }.`;
  }

  const action = getActivityLabel(log);
  const target = getTargetLabel(log);
  return `${action}${target && target !== "System" ? ` — ${target}` : ""}.`;
};

const getPanelEntries = (log, side) => {
  const oldObject = getReadableObject(log?.old_values);
  const newObject = getReadableObject(log?.new_values);
  const source = side === "before" ? oldObject : newObject;
  const other = side === "before" ? newObject : oldObject;
  const changed = getChangedFieldKeys(log);
  const entries = [];

  if (changed.includes("site_logo")) {
    if (side === "before") {
      entries.push({
        key: "site_logo",
        label: "Site Logo",
        value: oldObject.has_logo ? "Existing logo" : "Not configured",
      });
    } else {
      entries.push({
        key: "site_logo",
        label: "Site Logo",
        value: newObject.logo_uploaded_this_update
          ? "New logo uploaded"
          : newObject.has_logo
            ? "Configured"
            : "Not configured",
      });
    }
  }

  const keys =
    changed.length > 0
      ? changed.filter((key) => key !== "site_logo")
      : Array.from(new Set([...Object.keys(source), ...Object.keys(other)]));

  keys.forEach((key) => {
    if (
      key === "has_logo" ||
      key === "logo_uploaded_this_update" ||
      isTechnicalAuditKey(key)
    ) {
      return;
    }

    const sourceHas = Object.prototype.hasOwnProperty.call(source, key);
    const otherHas = Object.prototype.hasOwnProperty.call(other, key);
    if (!sourceHas && !otherHas) return;

    if (
      changed.length === 0 &&
      JSON.stringify(source[key]) === JSON.stringify(other[key])
    ) {
      return;
    }

    entries.push({
      key,
      label: formatFieldLabel(key),
      value: sourceHas ? formatValue(source[key]) : "Not recorded",
    });
  });

  if (entries.length > 0) return entries;

  return Object.entries(source)
    .filter(([key]) => !isTechnicalAuditKey(key))
    .map(([key, value]) => ({
      key,
      label: formatFieldLabel(key),
      value: formatValue(value),
    }));
};

export default function AuditLogsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailLog, setDetailLog] = useState(null);

  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => {
      setFilters((current) =>
        current.search === trimmed
          ? current
          : { ...current, search: trimmed, page: 1 },
      );
    }, 400);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError("");

    try {
      const params = {
        page: filters.page,
        limit: filters.limit,
      };

      if (filters.search) params.search = filters.search;
      if (filters.action) params.action = filters.action;
      if (filters.table_name) params.table_name = filters.table_name;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;

      const { data } = await api.get("/audit-logs", { params });
      if (seq !== requestSeq.current) return;

      setLogs(Array.isArray(data?.logs) ? data.logs : []);
      setPagination(data?.pagination || DEFAULT_PAGINATION);
    } catch (err) {
      if (seq !== requestSeq.current) return;

      setLogs([]);
      setPagination(DEFAULT_PAGINATION);
      setError(
        err?.response?.data?.message ||
          "Unable to load audit activity. Please try again.",
      );
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));

  const clearFilters = () => {
    setSearchInput("");
    setFilters((current) => ({
      ...DEFAULT_FILTERS,
      limit: current.limit,
    }));
  };

  const goToPage = (nextPage) =>
    setFilters((current) => ({ ...current, page: nextPage }));

  const activeFilterCount = [
    "search",
    "action",
    "table_name",
    "date_from",
    "date_to",
  ].filter((key) => Boolean(filters[key])).length;

  return (
    <div style={pageShell}>
      <header style={headerBlock}>
        <div>
          <div style={eyebrow}>Management</div>
          <h1 style={pageTitle}>Audit Logs</h1>
          <p style={pageSubtitle}>
            Review important security, account, sales, inventory, and staff activity across WISDOM.
          </p>
        </div>

        <div style={recordCount}>
          {Number(pagination.total || 0).toLocaleString("en-PH")} records
        </div>
      </header>

      <section style={filterCard}>
        <div style={filterHeader}>
          <div>
            <h2 style={filterTitle}>Find Activity</h2>
            <p style={filterSubtitle}>
              Search by person, email, activity, area, or record number.
            </p>
          </div>

          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} style={btnGhost}>
              Reset Filters
            </button>
          )}
        </div>

        <div style={filterGrid}>
          <FilterField label="Search" wide>
            <input
              placeholder="Search person, email, activity, or record..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              style={inputBase}
            />
          </FilterField>

          <FilterField label="Action">
            <select
              value={filters.action}
              onChange={(event) => setFilter("action", event.target.value)}
              style={inputBase}
            >
              <option value="">All Actions</option>
              {KNOWN_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {formatActionLabel(action)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Area">
            <select
              value={filters.table_name}
              onChange={(event) => setFilter("table_name", event.target.value)}
              style={inputBase}
            >
              <option value="">All Areas</option>
              {KNOWN_TABLES.map((tableName) => (
                <option key={tableName} value={tableName}>
                  {formatModuleLabel(tableName)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="From Date">
            <input
              type="date"
              value={filters.date_from}
              onChange={(event) => setFilter("date_from", event.target.value)}
              style={inputBase}
            />
          </FilterField>

          <FilterField label="To Date">
            <input
              type="date"
              value={filters.date_to}
              onChange={(event) => setFilter("date_to", event.target.value)}
              style={inputBase}
            />
          </FilterField>
        </div>

        <div style={filtersMeta}>
          {activeFilterCount > 0
            ? `${activeFilterCount} active ${
                activeFilterCount === 1 ? "filter" : "filters"
              }`
            : "Showing all recorded activity"}
        </div>
      </section>

      <section style={tableCard}>
        <div style={tableHeader}>
          <div>
            <h2 style={tableTitle}>Activity History</h2>
            <p style={tableSubtitle}>
              Newest activity first. Open Details to review the recorded changes.
            </p>
          </div>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr style={theadRow}>
                <th style={{ ...th, width: 170 }}>Date and Time</th>
                <th style={{ ...th, width: 250 }}>Performed By</th>
                <th style={{ ...th, width: 280 }}>Activity</th>
                <th style={{ ...th, width: 180 }}>Area</th>
                <th style={{ ...th, width: 190 }}>Target</th>
                <th style={{ ...th, width: 110 }} aria-label="Details" />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={emptyCell}>
                    Loading audit activity...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} style={emptyCell}>
                    <div style={emptyState}>
                      <div style={emptyStateTitle}>Unable to load activity</div>
                      <div style={emptyStateText}>{error}</div>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={emptyCell}>
                    <div style={emptyState}>
                      <div style={emptyStateTitle}>No matching activity</div>
                      <div style={emptyStateText}>
                        Adjust the filters to view more records.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const performedBy = getPerformedBy(log);
                  return (
                  <tr key={log.id} style={tbodyRow}>
                    <td style={td}>{formatDateTime(log.created_at)}</td>

                    <td style={td}>
                      <div style={personName}>{performedBy.name}</div>
                      {performedBy.secondary && (
                        <div style={personEmail}>{performedBy.secondary}</div>
                      )}
                    </td>

                    <td style={td}>
                      <span style={activityText}>
                        {getActivityLabel(log)}
                      </span>
                    </td>

                    <td style={td}>
                      <span style={secondaryText}>
                        {formatModuleLabel(log.table_name)}
                      </span>
                    </td>

                    <td style={td}>
                      <span style={targetText}>{getTargetLabel(log)}</span>
                    </td>

                    <td style={td}>
                      <button
                        type="button"
                        style={btnView}
                        onClick={() => setDetailLog(log)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.total > 0 && (
          <div style={paginationBar}>
            <div style={paginationLeft}>
              <span style={paginationText}>
                Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
              </span>

              <select
                aria-label="Rows per page"
                value={filters.limit}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    limit: Number(event.target.value),
                    page: 1,
                  }))
                }
                style={rowsSelect}
              >
                {LIMIT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count} rows
                  </option>
                ))}
              </select>
            </div>

            <div style={paginationActions}>
              <button
                type="button"
                disabled={!pagination.hasPreviousPage}
                onClick={() => goToPage(pagination.page - 1)}
                style={{
                  ...btnGhost,
                  opacity: pagination.hasPreviousPage ? 1 : 0.45,
                  cursor: pagination.hasPreviousPage
                    ? "pointer"
                    : "not-allowed",
                }}
              >
                Previous
              </button>

              <button
                type="button"
                disabled={!pagination.hasNextPage}
                onClick={() => goToPage(pagination.page + 1)}
                style={{
                  ...btnGhost,
                  opacity: pagination.hasNextPage ? 1 : 0.45,
                  cursor: pagination.hasNextPage ? "pointer" : "not-allowed",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {detailLog && (
        <AuditDetailModal
          log={detailLog}
          onClose={() => setDetailLog(null)}
        />
      )}
    </div>
  );
}

function FilterField({ label, wide = false, children }) {
  return (
    <label style={{ ...filterField, ...(wide ? filterFieldWide : {}) }}>
      <span style={filterLabel}>{label}</span>
      {children}
    </label>
  );
}

function ValuesPanel({ title, emptyLabel, entries }) {

  return (
    <section style={panel}>
      <h4 style={panelTitle}>{title}</h4>

      {entries.length === 0 ? (
        <div style={emptyValueText}>{emptyLabel}</div>
      ) : (
        <div style={valueList}>
          {entries.map((entry) => (
            <div key={entry.key} style={valueRow}>
              <span style={valueKey}>{entry.label}</span>
              <span style={valueVal}>{entry.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AuditDetailModal({ log, onClose }) {
  const summary = getChangeSummary(log);
  const performedBy = getPerformedBy(log);
  const beforeEntries = getPanelEntries(log, "before");
  const afterEntries = getPanelEntries(log, "after");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      style={overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div style={detailModal} role="dialog" aria-modal="true">
        <div style={modalHeader}>
          <div>
            <div style={modalEyebrow}>Audit Entry</div>
            <h3 style={modalTitle}>{getActivityLabel(log)}</h3>
            <div style={modalSubline}>{formatDateTime(log.created_at)}</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={closeBtn}
            aria-label="Close audit details"
          >
            ×
          </button>
        </div>

        <div style={modalBody}>
          <div style={detailGrid}>
            <DetailRow
              label="Performed By"
              value={performedBy.name}
              secondary={performedBy.secondary}
            />
            <DetailRow
              label="Area"
              value={formatModuleLabel(log.table_name)}
            />
            <DetailRow label="Target" value={getTargetLabel(log)} />
            <DetailRow
              label="Source IP"
              value={log.ip_address || "Not recorded"}
            />
          </div>

          {summary && (
            <section style={summaryCard}>
              <div style={summaryLabel}>Change Summary</div>
              <div style={summaryText}>{summary}</div>
            </section>
          )}

          <div style={changeGrid}>
            <ValuesPanel
              title="Before Change"
              emptyLabel="The previous value was not recorded for this audit entry."
              entries={beforeEntries}
            />
            <ValuesPanel
              title="After Change"
              emptyLabel="The new value was not recorded for this audit entry."
              entries={afterEntries}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, secondary = "" }) {
  return (
    <div>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
      {secondary && <div style={detailSecondary}>{secondary}</div>}
    </div>
  );
}

/* WISDOM ADMIN AUDIT LOGS UI V1.1 */
const pageShell = {
  width: "min(100%, 1460px)",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const headerBlock = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 18,
  flexWrap: "wrap",
};

const eyebrow = {
  fontSize: 10,
  fontWeight: 650,
  letterSpacing: "1.2px",
  textTransform: "uppercase",
  color: "#73777f",
  marginBottom: 7,
};

const pageTitle = {
  margin: 0,
  fontSize: 26,
  lineHeight: 1.15,
  fontWeight: 760,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  margin: "7px 0 0",
  color: "#656b74",
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 400,
  maxWidth: 680,
};

const recordCount = {
  padding: "9px 11px",
  border: "1px solid #dfe2e6",
  borderRadius: 3,
  background: "#ffffff",
  color: "#30343a",
  fontSize: 12,
  fontWeight: 650,
};

const filterCard = {
  background: "#ffffff",
  border: "1px solid #dfe2e6",
  borderRadius: 4,
  padding: 16,
};

const filterHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 14,
};

const filterTitle = {
  margin: 0,
  color: "#17191d",
  fontSize: 14,
  lineHeight: 1.3,
  fontWeight: 700,
};

const filterSubtitle = {
  margin: "4px 0 0",
  color: "#777d86",
  fontSize: 11.5,
  lineHeight: 1.45,
  fontWeight: 400,
};

const filterGrid = {
  display: "grid",
  gridTemplateColumns:
    "minmax(300px, 1.8fr) minmax(180px, 1fr) minmax(170px, 0.9fr) minmax(145px, 0.75fr) minmax(145px, 0.75fr)",
  gap: 10,
  alignItems: "end",
};

const filterField = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const filterFieldWide = {
  minWidth: 260,
};

const filterLabel = {
  color: "#41464e",
  fontSize: 11,
  fontWeight: 650,
};

const inputBase = {
  width: "100%",
  height: 38,
  padding: "0 11px",
  border: "1px solid #ccd1d7",
  borderRadius: 3,
  background: "#ffffff",
  color: "#262a30",
  fontSize: 12.5,
  fontWeight: 400,
  outline: "none",
};

const filtersMeta = {
  marginTop: 11,
  color: "#858b94",
  fontSize: 11,
  fontWeight: 400,
};

const tableCard = {
  background: "#ffffff",
  border: "1px solid #dfe2e6",
  borderRadius: 4,
  overflow: "hidden",
};

const tableHeader = {
  padding: "17px 18px 13px",
  borderBottom: "1px solid #e2e5e9",
};

const tableTitle = {
  margin: 0,
  color: "#111317",
  fontSize: 17,
  lineHeight: 1.3,
  fontWeight: 720,
};

const tableSubtitle = {
  margin: "4px 0 0",
  color: "#737983",
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 400,
};

const tableWrap = {
  width: "100%",
  overflowX: "auto",
};

const table = {
  width: "100%",
  minWidth: 1080,
  borderCollapse: "separate",
  borderSpacing: 0,
};

const theadRow = {
  background: "#fafafa",
};

const th = {
  padding: "12px 14px",
  borderBottom: "1px solid #e2e5e9",
  color: "#727780",
  textAlign: "left",
  fontSize: 9.5,
  fontWeight: 650,
  letterSpacing: "1.05px",
  textTransform: "uppercase",
};

const tbodyRow = {
  background: "#ffffff",
};

const td = {
  padding: "14px",
  borderBottom: "1px solid #eef0f2",
  color: "#292d33",
  fontSize: 12.5,
  fontWeight: 400,
  lineHeight: 1.35,
  verticalAlign: "middle",
};

const personName = {
  color: "#202328",
  fontSize: 12.5,
  fontWeight: 650,
};

const personEmail = {
  marginTop: 3,
  color: "#838992",
  fontSize: 10.5,
  fontWeight: 400,
  wordBreak: "break-word",
};

const activityText = {
  color: "#202328",
  fontWeight: 650,
};

const secondaryText = {
  color: "#5f656e",
  fontWeight: 400,
};

const targetText = {
  color: "#3b4047",
  fontWeight: 600,
};

const btnView = {
  minHeight: 31,
  padding: "0 12px",
  border: "1px solid #cfd3d8",
  borderRadius: 3,
  background: "#ffffff",
  color: "#282c31",
  fontSize: 11.5,
  fontWeight: 650,
  cursor: "pointer",
};

const btnGhost = {
  minHeight: 34,
  padding: "0 12px",
  border: "1px solid #cfd3d8",
  borderRadius: 3,
  background: "#ffffff",
  color: "#3c4148",
  fontSize: 11.5,
  fontWeight: 650,
  cursor: "pointer",
};

const emptyCell = {
  padding: 36,
  color: "#777d86",
  textAlign: "center",
  fontSize: 12.5,
};

const emptyState = {
  display: "inline-flex",
  flexDirection: "column",
  gap: 5,
  maxWidth: 420,
};

const emptyStateTitle = {
  color: "#24282e",
  fontSize: 14,
  fontWeight: 700,
};

const emptyStateText = {
  color: "#747a83",
  fontSize: 12,
  lineHeight: 1.5,
  fontWeight: 400,
};

const paginationBar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "13px 18px",
  background: "#fafafa",
  flexWrap: "wrap",
};

const paginationLeft = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const paginationText = {
  color: "#6c727b",
  fontSize: 11.5,
  fontWeight: 500,
};

const rowsSelect = {
  height: 32,
  padding: "0 9px",
  border: "1px solid #d0d4d9",
  borderRadius: 3,
  background: "#ffffff",
  color: "#454a51",
  fontSize: 11.5,
  fontWeight: 400,
};

const paginationActions = {
  display: "flex",
  gap: 7,
};

const overlay = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.58)",
};

const detailModal = {
  width: "min(100%, 760px)",
  maxHeight: "90vh",
  overflowY: "auto",
  border: "1px solid #dfe2e6",
  borderRadius: 4,
  background: "#ffffff",
  boxShadow: "0 20px 52px rgba(0, 0, 0, 0.18)",
};

const modalHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 18,
  padding: "20px 20px 15px",
  borderBottom: "1px solid #e3e6e9",
};

const modalEyebrow = {
  marginBottom: 6,
  color: "#777d86",
  fontSize: 9.5,
  fontWeight: 650,
  letterSpacing: "1.1px",
  textTransform: "uppercase",
};

const modalTitle = {
  margin: 0,
  color: "#111317",
  fontSize: 20,
  lineHeight: 1.2,
  fontWeight: 740,
};

const modalSubline = {
  marginTop: 6,
  color: "#777d86",
  fontSize: 11.5,
  fontWeight: 400,
};

const closeBtn = {
  width: 32,
  height: 32,
  border: "1px solid #d2d6db",
  borderRadius: 3,
  background: "#ffffff",
  color: "#555b63",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
};

const modalBody = {
  padding: 20,
};

const detailGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 18,
};

const detailLabel = {
  marginBottom: 5,
  color: "#7b8189",
  fontSize: 9.5,
  fontWeight: 650,
  letterSpacing: "0.9px",
  textTransform: "uppercase",
};

const detailValue = {
  color: "#22262b",
  fontSize: 12.5,
  fontWeight: 650,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const detailSecondary = {
  marginTop: 3,
  color: "#818790",
  fontSize: 10.5,
  fontWeight: 400,
  wordBreak: "break-word",
};

const summaryCard = {
  marginTop: 18,
  padding: "12px 14px",
  border: "1px solid #e0e3e7",
  borderRadius: 3,
  background: "#fafafa",
};

const summaryLabel = {
  marginBottom: 5,
  color: "#777d86",
  fontSize: 9.5,
  fontWeight: 650,
  letterSpacing: "0.9px",
  textTransform: "uppercase",
};

const summaryText = {
  color: "#25292f",
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1.5,
};

const changeGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const panel = {
  padding: 14,
  border: "1px solid #e0e3e7",
  borderRadius: 3,
  background: "#ffffff",
};

const panelTitle = {
  margin: "0 0 11px",
  color: "#34383e",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.9px",
  textTransform: "uppercase",
};

const emptyValueText = {
  color: "#858b94",
  fontSize: 11.5,
  fontWeight: 400,
  lineHeight: 1.45,
};

const valueList = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const valueRow = {
  display: "grid",
  gridTemplateColumns: "minmax(130px, 0.9fr) minmax(0, 1.1fr)",
  gap: 12,
  paddingBottom: 7,
  borderBottom: "1px solid #eef0f2",
};

const valueKey = {
  color: "#6f757e",
  fontSize: 11.5,
  fontWeight: 500,
};

const valueVal = {
  color: "#272b30",
  fontSize: 11.5,
  fontWeight: 600,
  textAlign: "right",
  wordBreak: "break-word",
};
