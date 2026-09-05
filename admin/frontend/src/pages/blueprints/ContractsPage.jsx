import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";
import { downloadProjectAgreementPdf } from "../../utils/projectAgreementPdf";
import "./ContractsPage.css";

const DEFAULT_TERMS = `1. PROJECT WORK
Spiral Wood Services will build the furniture based on the approved design and quotation.

2. PAYMENT
Production starts after the required 30% down payment is verified. The remaining balance must be fully paid before the order is completed.

3. CHANGES
Any requested change after the contract is accepted must be reviewed first. Approved changes may affect the price or completion date.

4. CANCELLATION
Before any payment is verified, the customer may cancel an eligible project through WISDOM. After a payment is verified or production starts, the customer must contact Spiral Wood Services. Cancellation does not remove existing payment or acceptance records.

5. COMPLETION
The completion and handoff schedule follows the fulfillment method selected for the order. Full payment is required before final release. Delays outside the reasonable control of Spiral Wood Services may affect the schedule.

6. OWNERSHIP
Ownership of the finished furniture transfers to the customer after full payment.

7. GOVERNING LAW
This contract is governed by the laws of the Republic of the Philippines.`;

const DEFAULT_WARRANTY = `The furniture is covered by a one (1) year warranty from the handoff date for defects in materials and workmanship under normal use.

The warranty does not cover misuse, neglect, unauthorized changes, accidents, natural disasters, or damage caused by outside factors.

For warranty service, contact Spiral Wood Services and provide proof of purchase with details or photos of the reported problem.`;

const formatCurrencyUI = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatPersonName = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const titleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "—";

function isPositiveIntegerString(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(text)) return false;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

export default function ContractsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const navigate = useNavigate();
  const location = useLocation();

  const [contracts, setContracts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contractSearch, setContractSearch] = useState("");
  // WISDOM CONTRACT DATE FILTER V1
  // WISDOM CONTRACT DATE FILTER CLEANUP V1
  const [contractDateFilter, setContractDateFilter] = useState("all");
  const [contractFrom, setContractFrom] = useState("");
  const [contractTo, setContractTo] = useState("");

  const [selectedOrderInfo, setSelectedOrderInfo] = useState(null);
  const [loadingOrderInfo, setLoadingOrderInfo] = useState(false);
  const [orderInfoError, setOrderInfoError] = useState("");

  const [estimationResponse, setEstimationResponse] = useState(null);
  const [loadingEstimation, setLoadingEstimation] = useState(false);
  const [estimationError, setEstimationError] = useState("");

  const [form, setForm] = useState({
    order_id: "",
    blueprint_id: "",
    terms: DEFAULT_TERMS,
    warranty_terms: DEFAULT_WARRANTY,
  });

  const resetForm = () => {
    setForm({
      order_id: "",
      blueprint_id: "",
      terms: DEFAULT_TERMS,
      warranty_terms: DEFAULT_WARRANTY,
    });
    setSelectedOrderInfo(null);
    setOrderInfoError("");
    setEstimationResponse(null);
    setEstimationError("");
  };

  const load = async () => {
    setLoading(true);
    try {
      const [contractsRes, ordersRes] = await Promise.all([
        api.get("/contracts"),
        api.get("/orders", { params: { status: "confirmed", limit: 100 } }),
      ]);

      setContracts(Array.isArray(contractsRes.data) ? contractsRes.data : []);
      setOrders(
        Array.isArray(ordersRes.data?.orders) ? ordersRes.data.orders : [],
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load contracts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const draft = location.state?.contractDraft;
    if (!draft) return;

    setForm((prev) => ({
      ...prev,
      order_id: draft.order_id ? String(draft.order_id) : prev.order_id,
      blueprint_id: draft.blueprint_id
        ? String(draft.blueprint_id)
        : prev.blueprint_id,
    }));

    setModal(true);
  }, [location.state]);

  useEffect(() => {
    if (!modal || !form.order_id) {
      setSelectedOrderInfo(null);
      setOrderInfoError("");
      return;
    }

    let cancelled = false;

    const fetchOrderInfo = async () => {
      setLoadingOrderInfo(true);
      setOrderInfoError("");

      try {
        const { data } = await api.get(`/orders/${form.order_id}`);
        if (!cancelled) {
          setSelectedOrderInfo(data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setSelectedOrderInfo(null);
          setOrderInfoError(
            err?.response?.data?.message ||
              "Failed to load selected order details.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingOrderInfo(false);
        }
      }
    };

    fetchOrderInfo();

    return () => {
      cancelled = true;
    };
  }, [modal, form.order_id]);

  const manualBlueprintId = String(form.blueprint_id || "").trim();

  // Canonical blueprint id comes ONLY from the loaded order — never from
  // manual/navigation-supplied input, and never from an existing
  // contract's own blueprint_id (an eligible order must not already have
  // a contract in the first place, so that fallback made no sense as a
  // source of truth for a NEW contract).
  const canonicalBlueprintId = selectedOrderInfo?.blueprint_id
    ? String(selectedOrderInfo.blueprint_id)
    : "";

  // Strict validation of the canonical id itself — even though it comes
  // from the order (not user input), it's validated with the same
  // strict rule before ever being used for a lookup or a submit, so a
  // malformed/unexpected value from the order record can never silently
  // pass through as "0", a decimal, scientific notation, etc.
  const canonicalBlueprintValid = isPositiveIntegerString(canonicalBlueprintId);

  const manualBlueprintInvalid =
    manualBlueprintId && !isPositiveIntegerString(manualBlueprintId);

  // The manual/navigation-draft value is only ever a consistency check —
  // it never overrides the canonical id, and never controls lookup or
  // submit. This also naturally covers the navigation-draft mismatch
  // case: location.state.contractDraft.blueprint_id lands in
  // form.blueprint_id the same way a manually-typed value would.
  const manualBlueprintMismatch =
    Boolean(manualBlueprintId) &&
    !manualBlueprintInvalid &&
    Boolean(canonicalBlueprintId) &&
    manualBlueprintId !== canonicalBlueprintId;

  useEffect(() => {
    if (
      !modal ||
      !form.order_id ||
      !canonicalBlueprintId ||
      !canonicalBlueprintValid
    ) {
      setEstimationResponse(null);
      setEstimationError("");
      return;
    }

    let cancelled = false;

    const fetchEstimation = async () => {
      setLoadingEstimation(true);
      setEstimationResponse(null);
      setEstimationError("");

      try {
        const { data } = await api.get(
          `/blueprints/${canonicalBlueprintId}/estimation`,
        );

        if (cancelled) return;

        // Block immediately on any integrity/recovery-draft/unpersisted
        // signal — never treat an unpersisted recovery draft, a stale
        // record, or a multiple-owner conflict as a normal saved,
        // approved estimation just because `status` happens to say
        // "approved".
        if (
          data?.integrity_warning ||
          data?.is_recovery_draft ||
          data?.persisted === false ||
          data?.id == null
        ) {
          setEstimationResponse(null);
          setEstimationError(
            data?.message ||
              "No saved, approved estimation was found for the linked blueprint.",
          );
          return;
        }

        setEstimationResponse(data);
      } catch (err) {
        if (!cancelled) {
          setEstimationResponse(null);
          setEstimationError(
            err?.response?.data?.message ||
              "Failed to check blueprint estimation status.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingEstimation(false);
        }
      }
    };

    fetchEstimation();

    return () => {
      cancelled = true;
    };
  }, [modal, form.order_id, canonicalBlueprintId, canonicalBlueprintValid]);

  const setF = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleOrderChange = (value) => {
    setForm((prev) => ({
      ...prev,
      order_id: value,
      blueprint_id: "",
    }));
    setSelectedOrderInfo(null);
    setOrderInfoError("");
    setEstimationResponse(null);
    setEstimationError("");
  };

  const printContract = async (c) => {
    try {
      let orderInfo = null;
      let approvedEstimation = null;

      try {
        const { data } = await api.get(`/orders/${c.order_id}`);
        orderInfo = data || null;
      } catch (orderErr) {
        // The PDF remains downloadable from the immutable contract record even
        // if a related order lookup is temporarily unavailable.
      }

      if (c.blueprint_id) {
        try {
          const { data } = await api.get(
            `/blueprints/${c.blueprint_id}/estimation`,
          );
          if (
            data &&
            !data.integrity_warning &&
            !data.is_recovery_draft &&
            data.persisted !== false &&
            normalize(data.status) === "approved"
          ) {
            approvedEstimation = data;
          }
        } catch (estimationErr) {
          // Same fallback principle as the order lookup above.
        }
      }

      downloadProjectAgreementPdf({
        agreement: {
          ...c,
          terms: c.materials_used || "",
          total_amount: Number(c.total_amount || 0),
        },
        order: orderInfo || {
          id: c.order_id,
          blueprint_id: c.blueprint_id,
          customer_name: c.customer_name,
          customer_email: c.customer_email,
        },
        estimation: approvedEstimation,
        customerName: formatPersonName(c.customer_name) || "Customer",
        customerEmail: c.customer_email || "",
        authorizedByName:
          formatPersonName(c.issued_by_name || "System Administrator") ||
          "System Administrator",
      });
      toast.success("Contract PDF downloaded.");
    } catch (err) {
      console.error("[ContractsPage PDF]", err);
      toast.error("Failed to generate contract PDF.");
    }
  };

  const contractsThisMonth = contracts.filter((c) => {
    const d = new Date(c.created_at);
    const now = new Date();
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  }).length;

  const filteredContracts = useMemo(() => {
    const query = normalize(contractSearch);
    const now = new Date();

    const startOfDay = (date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const endOfDay = (date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

    let rangeStart = null;
    let rangeEnd = null;

    if (contractDateFilter === "this_month") {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      rangeEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
    } else if (contractDateFilter === "last_month") {
      rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      rangeEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );
    } else if (contractDateFilter === "this_year") {
      rangeStart = new Date(now.getFullYear(), 0, 1);
      rangeEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (contractDateFilter === "custom") {
      if (contractFrom) {
        const parsedFrom = new Date(`${contractFrom}T00:00:00`);
        if (!Number.isNaN(parsedFrom.getTime())) {
          rangeStart = startOfDay(parsedFrom);
        }
      }

      if (contractTo) {
        const parsedTo = new Date(`${contractTo}T00:00:00`);
        if (!Number.isNaN(parsedTo.getTime())) {
          rangeEnd = endOfDay(parsedTo);
        }
      }
    }

    return contracts.filter((contract) => {
      const haystack = [
        `CNT-${String(contract.id || "").padStart(5, "0")}`,
        contract.order_id ? `#${String(contract.order_id).padStart(5, "0")}` : "",
        contract.blueprint_id
          ? `BP-${String(contract.blueprint_id).padStart(5, "0")}`
          : "",
        contract.customer_name,
        contract.customer_email,
        contract.issued_by_name,
      ]
        .map(normalize)
        .join(" ");

      const matchesSearch = !query || haystack.includes(query);

      const issuedAt = new Date(contract.created_at);
      const validIssuedDate = !Number.isNaN(issuedAt.getTime());
      const matchesStart =
        !rangeStart || (validIssuedDate && issuedAt >= rangeStart);
      const matchesEnd =
        !rangeEnd || (validIssuedDate && issuedAt <= rangeEnd);

      return matchesSearch && matchesStart && matchesEnd;
    });
  }, [
    contractSearch,
    contractDateFilter,
    contractFrom,
    contractTo,
    contracts,
  ]);

  const contractedOrderIds = new Set(
    contracts.map((c) => String(c.order_id || "")),
  );

  const availableOrders = orders.filter(
    (o) =>
      normalize(o.order_type) === "blueprint" &&
      normalize(o.status) === "confirmed" &&
      !contractedOrderIds.has(String(o.id)),
  );

  const duplicateOrderIds = useMemo(() => {
    const counts = new Map();

    contracts.forEach((contract) => {
      const key = String(contract.order_id || "");
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([orderId]) => orderId);
  }, [contracts]);

  const paymentRows = Array.isArray(selectedOrderInfo?.payments)
    ? selectedOrderInfo.payments
    : [];

  // orderController.getOne may append a synthetic legacy row
  // (id: `initial_${order.id}`) when no real payment_transactions row
  // exists, derived from order.payment_status rather than an actual
  // verified transaction. That row — and selectedOrderInfo's own
  // payment_verified_total, which is computed from the same
  // synthetic-row-inclusive array on the backend — must never
  // contribute to contract eligibility. Only rows with a real,
  // persisted, strictly-numeric database id are counted here.
  const persistedPaymentRows = paymentRows.filter((payment) =>
    isPositiveIntegerString(payment?.id),
  );

  const verifiedPayments = persistedPaymentRows.filter(
    (payment) => normalize(payment?.status) === "verified",
  );

  const verifiedPaymentTotal = verifiedPayments.reduce(
    (sum, payment) => sum + Number(payment?.amount || 0),
    0,
  );

  const hasVerifiedPayment = verifiedPayments.length > 0;

  // Estimation eligibility — derived entirely from the full stored
  // response, never from a bare extracted status string. An unpersisted
  // recovery draft, a stale/blocked record, or a missing id can never
  // read as "approved" here, regardless of what estimationResponse.status
  // itself says.
  const estimationIntegrityBlocked =
    Boolean(estimationResponse?.integrity_warning) ||
    Boolean(estimationResponse?.is_recovery_draft) ||
    estimationResponse?.persisted === false ||
    estimationResponse?.id == null;

  const estimationGrandTotal = Number(estimationResponse?.grand_total);

  const estimationEligible =
    Boolean(estimationResponse) &&
    !estimationIntegrityBlocked &&
    normalize(estimationResponse?.status) === "approved" &&
    Number.isFinite(estimationGrandTotal) &&
    estimationGrandTotal > 0;

  const approvedEstimationTotal = estimationEligible ? estimationGrandTotal : 0;

  const orderTotalAmount = Number(selectedOrderInfo?.total_amount || 0);

  // Required down payment is always 30% of the APPROVED ESTIMATION total,
  // never derived from an unverified/corrupted order total alone. Rounded
  // to two decimals exactly like the backend's
  // Number((estimationGrandTotal * 0.3).toFixed(2)) so the two never
  // disagree at a cent boundary.
  const requiredDownPayment = Number(
    (approvedEstimationTotal * 0.3).toFixed(2),
  );

  // Contract document preview — read-only values derived from the same
  // canonical order + approved estimation already used by the readiness gates.
  const agreementPreviewItem =
    (Array.isArray(selectedOrderInfo?.custom_request_items)
      ? selectedOrderInfo.custom_request_items[0]
      : null) ||
    (Array.isArray(selectedOrderInfo?.items)
      ? selectedOrderInfo.items.find(
          (item) => item?.customization || item?.requested_base_blueprint_title,
        ) || selectedOrderInfo.items[0]
      : null);
  const agreementPreviewItems = (Array.isArray(estimationResponse?.items)
    ? estimationResponse.items
    : []
  ).filter(
    (item) =>
      !item?.raw_material_id &&
      normalize(item?.source_type || item?.sourceType) !== "inventory_material",
  );
  const agreementPreviewWidth = Number(
    agreementPreviewItem?.requested_width || agreementPreviewItem?.width || 0,
  );
  const agreementPreviewHeight = Number(
    agreementPreviewItem?.requested_height || agreementPreviewItem?.height || 0,
  );
  const agreementPreviewDepth = Number(
    agreementPreviewItem?.requested_depth || agreementPreviewItem?.depth || 0,
  );
  const agreementPreviewUnit =
    agreementPreviewItem?.requested_unit || agreementPreviewItem?.unit || "mm";
  const agreementPreviewDimensions =
    agreementPreviewWidth > 0 ||
    agreementPreviewHeight > 0 ||
    agreementPreviewDepth > 0
      ? `${agreementPreviewWidth || "—"} × ${agreementPreviewHeight || "—"} × ${agreementPreviewDepth || "—"} ${agreementPreviewUnit}`
      : "Not specified";
  const agreementPreviewName =
    agreementPreviewItem?.requested_base_blueprint_title ||
    agreementPreviewItem?.display_name ||
    agreementPreviewItem?.product_name ||
    selectedOrderInfo?.blueprint_title ||
    "Custom Furniture";
  const agreementPreviewWood =
    agreementPreviewItem?.requested_wood_type ||
    agreementPreviewItem?.wood_type ||
    "Not specified";
  const agreementPreviewFinish =
    agreementPreviewItem?.requested_finish_color ||
    agreementPreviewItem?.finish_color ||
    agreementPreviewItem?.color ||
    "Not specified";
  const agreementRemainingBalance = Math.max(
    0,
    approvedEstimationTotal - requiredDownPayment,
  );

  const totalsMatch =
    approvedEstimationTotal > 0 &&
    orderTotalAmount > 0 &&
    Math.abs(orderTotalAmount - approvedEstimationTotal) <= 0.01;

  // Verified payment_transactions rows only — orders.payment_status and
  // payment_status_display are display-only and never authorize contract
  // generation (an order could read "paid" from a stale/corrupted total
  // while having zero actual verified transactions behind it).
  const paymentReady =
    estimationEligible &&
    verifiedPaymentTotal >= Math.max(0, requiredDownPayment - 0.01);

  const currentOrderStatus = normalize(
    selectedOrderInfo?.status || selectedOrderInfo?.raw_status,
  );

  const orderTypeValid =
    Boolean(selectedOrderInfo) &&
    normalize(selectedOrderInfo?.order_type) === "blueprint";

  const orderStatusConfirmed = currentOrderStatus === "confirmed";

  // Explicit block list (rather than "not confirmed") purely so the UI
  // can name the exact status a blocked order is sitting in — every one
  // of these, plus any unknown/empty value, resolves to the same
  // !orderStatusConfirmed condition underneath.
  const EXPLICITLY_BLOCKED_ORDER_STATUSES = [
    "pending",
    "contract_released",
    "production",
    "shipping",
    "delivered",
    "completed",
    "cancelled",
  ];
  const orderStatusBlocked =
    EXPLICITLY_BLOCKED_ORDER_STATUSES.includes(currentOrderStatus) ||
    !orderStatusConfirmed;

  const hasExistingContract = Boolean(selectedOrderInfo?.contract);

  const lifecycleIntegrityWarning = Boolean(
    selectedOrderInfo?.lifecycle_integrity_warning,
  );
  const lifecycleIntegrityReason =
    selectedOrderInfo?.lifecycle_integrity_reason || "";
  const conflictingOrderIds = Array.isArray(
    selectedOrderInfo?.conflicting_order_ids,
  )
    ? selectedOrderInfo.conflicting_order_ids
    : null;

  const hasCustomerId = Boolean(selectedOrderInfo?.customer_id);

  const contractTermsReady = Boolean(String(form.terms || "").trim());
  const warrantyTermsReady = Boolean(String(form.warranty_terms || "").trim());

  const validationItems = [
    {
      label: "Order Status",
      ok: Boolean(selectedOrderInfo) && orderStatusConfirmed,
      value: loadingOrderInfo
        ? "Checking order"
        : selectedOrderInfo
          ? titleCase(selectedOrderInfo.status || selectedOrderInfo.raw_status)
          : "Select an order",
    },
    {
      label: "Customer",
      ok: hasCustomerId,
      value: hasCustomerId
        ? formatPersonName(selectedOrderInfo?.customer_name) || "Linked customer"
        : "Customer account required",
    },
    {
      label: "Blueprint",
      ok:
        Boolean(canonicalBlueprintId) &&
        canonicalBlueprintValid &&
        !manualBlueprintMismatch,
      value: canonicalBlueprintId && canonicalBlueprintValid
        ? `BP-${String(canonicalBlueprintId).padStart(5, "0")}`
        : "Linked blueprint required",
    },
    {
      label: "Approved Estimation",
      ok: estimationEligible,
      value: loadingEstimation
        ? "Checking estimation"
        : estimationEligible
          ? formatCurrencyUI(approvedEstimationTotal)
          : estimationError || "Approved estimation required",
    },
    {
      label: "Order Total",
      ok: totalsMatch,
      value: totalsMatch
        ? `${formatCurrencyUI(orderTotalAmount)} confirmed`
        : "Must match the approved estimation",
    },
    {
      label: "Payment",
      ok: estimationEligible,
      value: estimationEligible
        ? `Not required yet · 30% due after customer acceptance (${formatCurrencyUI(requiredDownPayment)})`
        : "Waiting for approved estimation",
    },
    {
      label: "Existing Contract",
      ok: !hasExistingContract,
      value: hasExistingContract ? "Contract already exists" : "No existing contract",
    },
  ];

  const canSubmit =
    Boolean(form.order_id) &&
    isPositiveIntegerString(form.order_id) &&
    !saving &&
    !loadingOrderInfo &&
    !loadingEstimation &&
    !orderInfoError &&
    Boolean(selectedOrderInfo) &&
    orderTypeValid &&
    orderStatusConfirmed &&
    hasCustomerId &&
    !hasExistingContract &&
    !lifecycleIntegrityWarning &&
    Boolean(canonicalBlueprintId) &&
    canonicalBlueprintValid &&
    !manualBlueprintInvalid &&
    !manualBlueprintMismatch &&
    estimationEligible &&
    orderTotalAmount > 0 &&
    totalsMatch &&
    contractTermsReady &&
    warrantyTermsReady;

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (!form.order_id || !isPositiveIntegerString(form.order_id)) {
      toast.error("Please select a valid order.");
      return;
    }

    const selectedOrder = availableOrders.find(
      (o) => String(o.id) === String(form.order_id),
    );

    if (!selectedOrder) {
      toast.error("Selected order is no longer available.");
      return;
    }

    if (loadingOrderInfo) {
      toast.error("Please wait while the selected order details are loading.");
      return;
    }

    if (orderInfoError || !selectedOrderInfo) {
      toast.error(orderInfoError || "Failed to validate the selected order.");
      return;
    }

    if (!orderTypeValid) {
      toast.error("Project Agreements can only be created for blueprint orders.");
      return;
    }

    if (!orderStatusConfirmed) {
      toast.error(
        `Order must be exactly "confirmed" to create a Project Agreement (current status: "${currentOrderStatus || "unknown"}").`,
      );
      return;
    }

    if (!hasCustomerId) {
      toast.error(
        "This order has no linked customer account; a Project Agreement requires a registered customer.",
      );
      return;
    }

    if (hasExistingContract) {
      toast.error("A Project Agreement already exists for this order.");
      return;
    }

    if (lifecycleIntegrityWarning) {
      toast.error(
        titleCase(lifecycleIntegrityReason) ||
          "This order has a lifecycle integrity conflict and requires manual review before a Project Agreement can be created.",
      );
      return;
    }

    if (manualBlueprintInvalid) {
      toast.error("Blueprint ID must be a valid positive number.");
      return;
    }

    if (manualBlueprintMismatch) {
      toast.error(
        "The entered blueprint ID does not match this order's linked blueprint.",
      );
      return;
    }

    if (!canonicalBlueprintId) {
      toast.error(
        "A linked blueprint is required before creating a Project Agreement.",
      );
      return;
    }

    if (!canonicalBlueprintValid) {
      toast.error(
        "This order's linked blueprint ID is invalid. Please contact support.",
      );
      return;
    }

    if (loadingEstimation) {
      toast.error(
        "Please wait while the blueprint estimation is being checked.",
      );
      return;
    }

    if (!estimationEligible) {
      toast.error(
        estimationError ||
          "Only a customer-approved quotation can proceed to Project Agreement creation.",
      );
      return;
    }

    if (!(orderTotalAmount > 0)) {
      toast.error(
        "Order total must be finalized before creating a Project Agreement.",
      );
      return;
    }

    if (!totalsMatch) {
      toast.error("Order total does not match the approved estimation total.");
      return;
    }

    if (!contractTermsReady) {
      toast.error("Project Agreement terms are required.");
      return;
    }

    if (!warrantyTermsReady) {
      toast.error("Warranty terms are required.");
      return;
    }

    if (!canSubmit) {
      // Defensive final backstop — every specific condition above should
      // already have caught the reason.
      toast.error("This Project Agreement cannot be created right now.");
      return;
    }

    setSaving(true);
    try {
      // Canonical payload only — order_id and the canonical blueprint id
      // (never the manual/navigation-supplied value, and never any
      // server-owned field like customer_id, customer_name, total,
      // down_payment, or authorized_by; the backend derives all of those
      // itself from the locked, canonical order).
      const payload = {
        order_id: Number(form.order_id),
        blueprint_id: Number(canonicalBlueprintId),
        terms: String(form.terms || "").trim(),
        warranty_terms: String(form.warranty_terms || "").trim(),
      };

      const { data } = await api.post("/contracts", payload);

      toast.success(data?.message || "Project Agreement created.");
      setModal(false);
      resetForm();
      load();
    } catch (err) {
      // Preserve the modal and the user's entered terms on failure — do
      // not reset the form or imply a contract was generated.
      toast.error(
        err?.response?.data?.message || "Failed to create Project Agreement.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="contracts-page">
      <header className="contracts-page-header">
        <div>
          <h1>Project Agreements</h1>
          <p>Create and review Project Agreements after the customer approves the quotation.</p>
        </div>
        <button
          type="button"
          className="contracts-btn contracts-btn-primary contracts-create-btn"
          onClick={() => setModal(true)}
        >
          Create Project Agreement
        </button>
      </header>

      <section className="contracts-summary" aria-label="Contract summary">
        <SummaryCard label="Total Agreements" value={contracts.length} />
        <SummaryCard label="Issued This Month" value={contractsThisMonth} />
      </section>

      {duplicateOrderIds.length > 0 && (
        <div className="contracts-alert contracts-alert-warning">
          Some older records contain more than one contract for the same order.
          Existing records remain available, but the system will prevent new duplicate contracts.
        </div>
      )}

      <section className="contracts-records-card">
        <div className="contracts-records-toolbar">
          <div>
            <h2>Project Agreement Records</h2>
            <p>Review Project Agreements and access related order details.</p>
          </div>
          <div className="contracts-records-controls">
            <div className="contracts-search-wrap">
              <span className="contracts-search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={contractSearch}
                onChange={(event) => setContractSearch(event.target.value)}
                placeholder="Search contract, order, customer, or blueprint"
                aria-label="Search contracts"
              />
            </div>

            <label className="contracts-date-filter-field">
              <select
                value={contractDateFilter}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setContractDateFilter(nextValue);

                  if (nextValue !== "custom") {
                    setContractFrom("");
                    setContractTo("");
                  }
                }}
              >
                <option value="all">All dates</option>
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="this_year">This year</option>
                <option value="custom">Custom range</option>
              </select>
            </label>

            {contractDateFilter === "custom" && (
              <>
                <label className="contracts-date-filter-field contracts-date-input-field">
                  <span>From</span>
                  <input
                    type="date"
                    value={contractFrom}
                    max={contractTo || undefined}
                    onChange={(event) => setContractFrom(event.target.value)}
                  />
                </label>
                <label className="contracts-date-filter-field contracts-date-input-field">
                  <span>To</span>
                  <input
                    type="date"
                    value={contractTo}
                    min={contractFrom || undefined}
                    onChange={(event) => setContractTo(event.target.value)}
                  />
                </label>
              </>
            )}
</div>
        </div>

        <div className="contracts-table-scroll">
          <table className="contracts-table">
            <thead>
              <tr>
                <th>Agreement No.</th>
                <th>Customer</th>
                <th>Order Ref.</th>
                <th>Blueprint Ref.</th>
                <th className="contracts-amount-col">Amount</th>
                <th>Authorized By</th>
                <th>Issued Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="contracts-empty-cell">Loading contracts...</td>
                </tr>
              ) : filteredContracts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="contracts-empty-cell">
                    {contractSearch || contractDateFilter !== "all"
                      ? "No contracts match the current filters."
                      : "No contracts have been generated yet."}
                  </td>
                </tr>
              ) : (
                filteredContracts.map((contract) => (
                  <tr key={contract.id}>
                    <td className="contracts-contract-no">
                      CNT-{String(contract.id).padStart(5, "0")}
                    </td>
                    <td>
                      <div className="contracts-customer-name">
                        {formatPersonName(contract.customer_name) || "—"}
                      </div>
                      {contract.customer_email ? (
                        <div className="contracts-secondary-text">{contract.customer_email}</div>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="contracts-text-link"
                        onClick={() => navigate(`/admin/orders/${contract.order_id}`)}
                      >
                        #{String(contract.order_id).padStart(5, "0")}
                      </button>
                    </td>
                    <td>
                      {contract.blueprint_id ? (
                        <button
                          type="button"
                          className="contracts-text-link"
                          onClick={() =>
                            navigate(`/admin/blueprints/${contract.blueprint_id}/design`)
                          }
                        >
                          BP-{String(contract.blueprint_id).padStart(5, "0")}
                        </button>
                      ) : (
                        <span className="contracts-secondary-text">Not available</span>
                      )}
                    </td>
                    <td className="contracts-amount-col contracts-amount">
                      {contract.total_amount
                        ? formatCurrencyUI(contract.total_amount)
                        : "—"}
                    </td>
                    <td>{formatPersonName(contract.issued_by_name || "System Administrator")}</td>
                    <td className="contracts-issued-date">{formatDate(contract.created_at)}</td>
                    <td>
                      <div className="contracts-row-actions">
                        <button
                          type="button"
                          className="contracts-btn contracts-btn-primary contracts-btn-sm"
                          onClick={() => printContract(contract)}
                        >
                          Download PDF
                        </button>
                        <button
                          type="button"
                          className="contracts-btn contracts-btn-secondary contracts-btn-sm"
                          onClick={() => navigate(`/admin/orders/${contract.order_id}`)}
                        >
                          Order Details
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
        <div className="contracts-modal-overlay" role="presentation">
          <div className="contracts-modal" role="dialog" aria-modal="true" aria-labelledby="create-contract-title">
            <div className="contracts-modal-header">
              <div>
                <h2 id="create-contract-title">Create Project Agreement</h2>
                <p>
                  Select an eligible blueprint order. The system will confirm the customer,
                  approved quotation and order total before the Project Agreement is created.
                </p>
              </div>
              <button
                type="button"
                className="contracts-modal-close"
                aria-label="Close create contract window"
                onClick={() => {
                  setModal(false);
                  resetForm();
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleGenerate} className="contracts-form">
              <section className="contracts-form-section">
                <div className="contracts-section-heading">
                  <span>1</span>
                  <div>
                    <h3>Order Details</h3>
                    <p>Choose the confirmed blueprint order covered by this agreement.</p>
                  </div>
                </div>

                <label className="contracts-field">
                  <span>Confirmed Blueprint Order</span>
                  <select
                    required
                    value={form.order_id}
                    onChange={(event) => handleOrderChange(event.target.value)}
                  >
                    <option value="">Select an order</option>
                    {availableOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.order_number || `#${String(order.id).padStart(5, "0")}`} · {formatPersonName(order.customer_name) || "Customer"} · {formatCurrencyUI(order.total_amount || 0)}
                      </option>
                    ))}
                  </select>
                  <small>Only confirmed blueprint orders with a customer-approved quotation and no existing Project Agreement are listed.</small>
                </label>

                {availableOrders.length === 0 && (
                  <div className="contracts-alert contracts-alert-neutral">
                    There are no eligible approved blueprint orders available for a new Project Agreement.
                  </div>
                )}

                <label className="contracts-field">
                  <span>Blueprint Reference</span>
                  <input
                    type="text"
                    readOnly
                    value={
                      canonicalBlueprintId
                        ? `BP-${String(canonicalBlueprintId).padStart(5, "0")}`
                        : selectedOrderInfo
                          ? "No blueprint linked"
                          : "Select an order first"
                    }
                  />
                  <small>The blueprint is taken directly from the selected order.</small>
                </label>

                {manualBlueprintMismatch && (
                  <div className="contracts-alert contracts-alert-error">
                    The blueprint reference from the previous page does not match the selected order.
                    Reopen the contract from the correct order before continuing.
                  </div>
                )}

                {orderInfoError && (
                  <div className="contracts-alert contracts-alert-error">{orderInfoError}</div>
                )}

                {lifecycleIntegrityWarning && (
                  <div className="contracts-alert contracts-alert-error">
                    This order has a blueprint workflow conflict and requires review before a Project Agreement can be created.
                  </div>
                )}
              </section>

              {form.order_id && (
                <section className="contracts-form-section">
                  <div className="contracts-section-heading">
                    <span>2</span>
                    <div>
                      <h3>Project Agreement Readiness</h3>
                      <p>All required checks must be complete before generation.</p>
                    </div>
                  </div>

                  <div className="contracts-readiness-grid">
                    {validationItems.map((item) => (
                      <ReadinessItem key={item.label} {...item} />
                    ))}
                  </div>
                </section>
              )}

              {form.order_id && selectedOrderInfo && estimationEligible && (
                <section className="contracts-form-section">
                  <div className="contracts-section-heading">
                    <span>3</span>
                    <div>
                      <h3>Contract Preview</h3>
                      <p>Confirm the main details before creating the contract.</p>
                    </div>
                  </div>

                  <div className="contracts-readiness-grid">
                    <ReadinessItem
                      label="Furniture"
                      ok={Boolean(agreementPreviewName)}
                      value={agreementPreviewName}
                    />
                    <ReadinessItem
                      label="Dimensions"
                      ok={agreementPreviewDimensions !== "Not specified"}
                      value={agreementPreviewDimensions}
                    />
                    <ReadinessItem
                      label="Wood"
                      ok={agreementPreviewWood !== "Not specified"}
                      value={titleCase(agreementPreviewWood)}
                    />
                    <ReadinessItem
                      label="Finish"
                      ok={agreementPreviewFinish !== "Not specified"}
                      value={titleCase(agreementPreviewFinish)}
                    />
                    <ReadinessItem
                      label="Total Price"
                      ok={approvedEstimationTotal > 0}
                      value={formatCurrencyUI(approvedEstimationTotal)}
                    />
                    <ReadinessItem
                      label="Down Payment"
                      ok={requiredDownPayment > 0}
                      value={`30% · ${formatCurrencyUI(requiredDownPayment)}`}
                    />
                  </div>

                  {agreementPreviewItems.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 7 }}>Scope of Work</div>
                      <div style={{ border: "1px solid #e4e4e7" }}>
                        {agreementPreviewItems.map((item, index) => (
                          <div
                            key={item.id || "agreement-item-" + index}
                            style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, padding: "9px 11px", borderBottom: index === agreementPreviewItems.length - 1 ? 0 : "1px solid #eeeeef", fontSize: 11 }}
                          >
                            <span>{item.description || item.name || "Item " + (index + 1)}</span>
                            <span>Qty {Number(item.quantity || 0) || "—"}</span>
                            <strong>{formatCurrencyUI(item.subtotal || 0)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="contracts-form-section">
                <div className="contracts-section-heading">
                  <span>4</span>
                  <div>
                    <h3>Agreement Content</h3>
                    <p>Review the contract terms and warranty before creating the contract.</p>
                  </div>
                </div>

                <label className="contracts-field">
                  <span>Agreement Terms</span>
                  <textarea
                    value={form.terms}
                    onChange={(event) => setF("terms", event.target.value)}
                    rows={11}
                  />
                </label>

                <label className="contracts-field">
                  <span>Warranty Coverage</span>
                  <textarea
                    value={form.warranty_terms}
                    onChange={(event) => setF("warranty_terms", event.target.value)}
                    rows={6}
                  />
                </label>
              </section>

              <div className="contracts-modal-actions">
                <button
                  type="button"
                  className="contracts-btn contracts-btn-secondary"
                  onClick={() => {
                    setModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="contracts-btn contracts-btn-primary"
                  disabled={!canSubmit}
                >
                  {saving ? "Creating..." : "Create Project Agreement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="contracts-summary-card">
      <div className="contracts-summary-label">{label}</div>
      <div className="contracts-summary-value">{value}</div>
    </div>
  );
}

function ReadinessItem({ label, value, ok }) {
  return (
    <div className="contracts-readiness-item">
      <span
        className={`contracts-readiness-dot ${ok ? "is-ready" : "is-blocked"}`}
        aria-hidden="true"
      />
      <div>
        <div className="contracts-readiness-label">{label}</div>
        <div className="contracts-readiness-value">{value}</div>
      </div>
    </div>
  );
}
