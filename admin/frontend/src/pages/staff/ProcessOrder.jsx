import { useState, useEffect, useRef } from "react";
import api from "../../services/api";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Receipt } from "lucide-react";
import LocationPicker from "../../components/LocationPicker";
import PosCheckoutQr from "../../components/PosCheckoutQr";
import "./ProcessOrder.css";

const isValidPHPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("09");
};

const POS_QR_ENABLED =
  process.env.REACT_APP_POS_QR_ENABLED === "true";
const POS_QR_STORAGE_KEY = "pos_qr_attempt";

const safeParseJson = (value, fallback = null) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const readStoredCart = () => {
  const parsed = safeParseJson(sessionStorage.getItem("pos_cart"), []);
  return Array.isArray(parsed) ? parsed : [];
};

const buildCartFingerprint = (items) =>
  JSON.stringify(
    (Array.isArray(items) ? items : [])
      .map((item) => ({
        product_id: Number(item?.product_id),
        quantity: Number(item?.quantity),
      }))
      .filter(
        (item) =>
          Number.isSafeInteger(item.product_id) &&
          item.product_id > 0 &&
          Number.isSafeInteger(item.quantity) &&
          item.quantity > 0,
      )
      .sort((a, b) => a.product_id - b.product_id),
  );

const createClientToken = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 18)}`.slice(0, 48);
};

const deriveIdempotencyKey = (checkoutToken) =>
  `idem_${checkoutToken}`.slice(0, 64);

const readStoredQrAttempt = () => {
  const parsed = safeParseJson(
    sessionStorage.getItem(POS_QR_STORAGE_KEY),
    null,
  );

  return parsed && typeof parsed === "object" ? parsed : null;
};

const normalizeServerCheckout = (value) => {
  if (!value || typeof value !== "object" || !Array.isArray(value.items)) {
    return null;
  }

  const items = value.items
    .map((item) => {
      const productId = Number(item?.product_id);
      const quantity = Number(item?.quantity);
      const unitPrice = Number(item?.unit_price);
      const lineSubtotal = Number(item?.subtotal);

      if (
        !Number.isSafeInteger(productId) ||
        productId <= 0 ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        return null;
      }

      return {
        key: `reserved-${productId}`,
        product_id: productId,
        product_name:
          typeof item?.product_name === "string" && item.product_name.trim()
            ? item.product_name
            : `Product #${productId}`,
        quantity,
        unit_price: unitPrice,
        subtotal:
          Number.isFinite(lineSubtotal) && lineSubtotal >= 0
            ? lineSubtotal
            : unitPrice * quantity,
        image_url:
          typeof item?.image_url === "string" ? item.image_url.trim() : "",
      };
    })
    .filter(Boolean);

  const subtotal = Number(value.subtotal);
  const discount = Number(value.discount);
  const deliveryFee = Number(value.delivery_fee);
  const total = Number(value.total);

  if (
    items.length === 0 ||
    !Number.isFinite(subtotal) ||
    subtotal < 0 ||
    !Number.isFinite(discount) ||
    discount < 0 ||
    !Number.isFinite(deliveryFee) ||
    deliveryFee < 0 ||
    !Number.isFinite(total) ||
    total < 0
  ) {
    return null;
  }

  return {
    items,
    subtotal,
    discount,
    delivery_fee: deliveryFee,
    total,
  };
};

export default function ProcessOrder() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    payment_method: "cash",
    cash_received: "",

    discount_type: "amount",
    discount: "",

    need_delivery: false,
    delivery_fee: "",
    delivery_address: "",
    delivery_lat: null,
    delivery_lng: null,
    delivery_requested_date: "",
    delivery_notes: "",

    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState("");
  const [qrAttempt, setQrAttempt] = useState(() => readStoredQrAttempt());
  const [qrCreating, setQrCreating] = useState(false);
  const [qrVerifying, setQrVerifying] = useState(false);
  const [qrReconciling, setQrReconciling] = useState(false);
  const [qrNotice, setQrNotice] = useState("");
  const [qrNoticeTone, setQrNoticeTone] = useState("info");
  const resumeStartedRef = useRef(false);
  const checkoutTokenRef = useRef(qrAttempt?.checkout_token || "");
  const effectivePaymentMethod = qrAttempt ? "online" : form.payment_method;

  useEffect(() => {
    const saved = sessionStorage.getItem("pos_cart");
    if (saved) {
      const parsed = safeParseJson(saved, []);
      if (Array.isArray(parsed)) setCart(parsed);
    }
  }, []);

  const handleDeliveryAddressChange = (text) => {
    setForm((prev) => ({
      ...prev,
      delivery_address: text,
    }));
  };

  const handleDeliveryPinChange = (next) => {
    setForm((prev) => ({
      ...prev,
      delivery_lat: Number.isFinite(next?.lat) ? next.lat : null,
      delivery_lng: Number.isFinite(next?.lng) ? next.lng : null,
    }));
  };

  const hasValidDeliveryPin =
    form.delivery_lat !== null &&
    form.delivery_lng !== null &&
    Number.isFinite(Number(form.delivery_lat)) &&
    Number.isFinite(Number(form.delivery_lng)) &&
    Number(form.delivery_lat) >= -90 &&
    Number(form.delivery_lat) <= 90 &&
    Number(form.delivery_lng) >= -180 &&
    Number(form.delivery_lng) <= 180;

  const deliveryPin = hasValidDeliveryPin
    ? {
        lat: Number(form.delivery_lat),
        lng: Number(form.delivery_lng),
      }
    : null;

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  const discountInput = parseFloat(form.discount) || 0;
  let discountAmount = 0;
  if (form.discount_type === "percent") {
    discountAmount = subtotal * (discountInput / 100);
  } else {
    discountAmount = discountInput;
  }

  const deliveryFeeAmt = parseFloat(form.delivery_fee) || 0;
  const total = Math.max(
    subtotal - discountAmount + (form.need_delivery ? deliveryFeeAmt : 0),
    0,
  );

  const cashReceived = parseFloat(form.cash_received) || 0;
  const change =
    effectivePaymentMethod === "cash"
      ? Math.max(cashReceived - total, 0)
      : 0;

  const normalizedPhone = String(form.customer_phone || "").replace(/\D/g, "");
  const phoneIsRequired = form.need_delivery;
  const phoneIsValid = !normalizedPhone || isValidPHPhone(normalizedPhone);

  const discountIsValid =
    form.discount_type === "percent"
      ? discountInput >= 0 && discountInput <= 100
      : discountInput >= 0 && discountInput <= subtotal;

  const cashIsValid =
    effectivePaymentMethod !== "cash" ||
    (!Number.isNaN(parseFloat(form.cash_received)) && cashReceived >= total);

  const deliveryIsValid =
    !form.need_delivery ||
    (form.delivery_address.trim() &&
      hasValidDeliveryPin &&
      form.delivery_requested_date);

  const baseFormIsValid =
    cart.length > 0 &&
    !loading &&
    !!form.customer_name.trim() &&
    discountIsValid &&
    phoneIsValid &&
    (!phoneIsRequired || normalizedPhone.length === 11) &&
    deliveryIsValid;

  const canSubmit = baseFormIsValid && cashIsValid;

  const canSubmitOnline =
    POS_QR_ENABLED &&
    form.payment_method === "online" &&
    baseFormIsValid &&
    !qrCreating &&
    !qrVerifying &&
    !qrReconciling &&
    !qrAttempt;

  const currentCartFingerprint = buildCartFingerprint(cart);
  const qrCartMatchesCurrent =
    !qrAttempt?.cart_fingerprint ||
    qrAttempt.cart_fingerprint === currentCartFingerprint;
  const qrNeedsManualReview = [
    "manual_review",
    "admin_recovery_required",
    "payment_mismatch",
    "access_error",
  ].includes(qrAttempt?.state);
  const serverCheckout = normalizeServerCheckout(qrAttempt?.server_checkout);
  const hasServerCheckout = Boolean(serverCheckout);
  const displayCart = qrAttempt && serverCheckout ? serverCheckout.items : cart;

  const getOrderSummaryImage = (item) => {
    const directImage = String(item?.image_url || "").trim();
    if (directImage) return directImage;

    const localCartItem = cart.find(
      (cartItem) =>
        String(cartItem?.product_id) === String(item?.product_id),
    );

    return String(localCartItem?.image_url || "").trim();
  };

  const displaySubtotal =
    qrAttempt && serverCheckout ? serverCheckout.subtotal : subtotal;
  const displayDiscountAmount =
    qrAttempt && serverCheckout ? serverCheckout.discount : discountAmount;
  const displayDeliveryFee =
    qrAttempt && serverCheckout ? serverCheckout.delivery_fee : deliveryFeeAmt;
  const displayTotal =
    qrAttempt && serverCheckout ? serverCheckout.total : total;
  const qrDisplayTotal = hasServerCheckout
    ? serverCheckout.total
    : Number.isFinite(Number(qrAttempt?.server_total))
      ? Number(qrAttempt.server_total)
      : total;
  const qrCanVerify =
    POS_QR_ENABLED &&
    Number.isSafeInteger(Number(qrAttempt?.attempt_id)) &&
    Number(qrAttempt?.attempt_id) > 0 &&
    ["awaiting_payment", "pending", "provider_error", "returning"].includes(
      qrAttempt?.state,
    );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.payment_method !== "cash") return;
    setError("");

    if (cart.length === 0) return setError("Cart is empty.");
    if (!form.customer_name.trim())
      return setError("Customer name is required.");
    if (phoneIsRequired && !normalizedPhone)
      return setError("Phone number is required for delivery.");
    if (normalizedPhone && !isValidPHPhone(normalizedPhone))
      return setError(
        "Enter a valid 11-digit PH mobile number starting with 09.",
      );
    if (!discountIsValid) return setError("Invalid discount amount.");

    if (form.payment_method === "cash") {
      if (!form.cash_received || Number.isNaN(parseFloat(form.cash_received))) {
        return setError("Cash received is required for cash payments.");
      }
      if (cashReceived < total) {
        return setError("Cash received cannot be less than the total amount.");
      }
    }

    if (form.need_delivery) {
      if (!form.delivery_address.trim())
        return setError("Delivery address is required.");
      if (!hasValidDeliveryPin)
        return setError("Pin the exact delivery location on the map.");
      if (!form.delivery_requested_date)
        return setError("Preferred delivery date and time is required.");
    }

    setLoading(true);

    try {
      const payload = {
        customer_name: form.customer_name.trim(),
        customer_phone: normalizedPhone,
        payment_method: form.payment_method,
        cash_received: form.payment_method === "cash" ? cashReceived : null,
        change: form.payment_method === "cash" ? change : null,
        discount: discountAmount,
        delivery_fee: form.need_delivery ? deliveryFeeAmt : 0,
        notes: form.notes,
        items: cart,
        delivery: form.need_delivery
          ? {
              address: form.delivery_address.trim(),
              lat: form.delivery_lat,
              lng: form.delivery_lng,
              requested_date: form.delivery_requested_date,
              notes: form.delivery_notes.trim(),
            }
          : null,
      };

      const res = await api.post("/pos/orders", payload);

      sessionStorage.removeItem("pos_cart");
      setSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to process order.");
    } finally {
      setLoading(false);
    }
  };

  const persistQrAttempt = (attempt) => {
    if (!attempt) {
      sessionStorage.removeItem(POS_QR_STORAGE_KEY);
      setQrAttempt(null);
      return;
    }

    sessionStorage.setItem(POS_QR_STORAGE_KEY, JSON.stringify(attempt));
    setQrAttempt(attempt);
  };

  const getOnlineValidationError = () => {
    if (cart.length === 0) return "Cart is empty.";
    if (!form.customer_name.trim()) return "Customer name is required.";
    if (form.customer_name.trim().length > 150)
      return "Customer name cannot exceed 150 characters.";
    if (phoneIsRequired && !normalizedPhone)
      return "Phone number is required for delivery.";
    if (normalizedPhone && !isValidPHPhone(normalizedPhone))
      return "Enter a valid 11-digit PH mobile number starting with 09.";
    if (!discountIsValid) return "Invalid discount amount.";
    if (form.need_delivery && !form.delivery_address.trim())
      return "Delivery address is required.";
    if (form.need_delivery && !hasValidDeliveryPin)
      return "Pin the exact delivery location on the map.";
    if (form.need_delivery && !form.delivery_requested_date)
      return "Preferred delivery date and time is required.";
    return null;
  };

  const buildOnlinePayload = (checkoutToken) => ({
    checkout_token: checkoutToken,
    idempotency_key: deriveIdempotencyKey(checkoutToken),
    customer_name: form.customer_name.trim(),
    customer_phone: normalizedPhone,
    items: cart.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
    })),
    discount: Number(discountAmount.toFixed(2)),
    delivery_fee: form.need_delivery
      ? Number(deliveryFeeAmt.toFixed(2))
      : 0,
    delivery: form.need_delivery
      ? {
          address: form.delivery_address.trim(),
          lat: form.delivery_lat,
          lng: form.delivery_lng,
          requested_date: form.delivery_requested_date,
          notes: form.delivery_notes.trim(),
        }
      : null,
    notes: form.notes,
  });

  const handleCreateOnlinePayment = async () => {
    setError("");
    setQrNotice("");

    if (!POS_QR_ENABLED) {
      setError("Online Payment is not enabled on this terminal.");
      return;
    }

    const validationError = getOnlineValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    const existingDraft = readStoredQrAttempt();
    const currentFingerprint = buildCartFingerprint(cart);
    if (
      existingDraft?.cart_fingerprint &&
      existingDraft.cart_fingerprint !== currentFingerprint
    ) {
      setQrNoticeTone("error");
      setQrNotice(
        "The current cart differs from the cart reserved for this payment attempt. Verify the existing attempt instead of creating another one.",
      );
      return;
    }

    const checkoutToken =
      existingDraft?.checkout_token ||
      checkoutTokenRef.current ||
      createClientToken();
    checkoutTokenRef.current = checkoutToken;

    const draft = {
      attempt_id: existingDraft?.attempt_id || null,
      checkout_token: checkoutToken,
      checkout_url: existingDraft?.checkout_url || null,
      state: existingDraft?.state || "creating_attempt",
      created_at: existingDraft?.created_at || new Date().toISOString(),
      updated_at: existingDraft?.updated_at || null,
      expires_at: existingDraft?.expires_at || null,
      cart_fingerprint:
        existingDraft?.cart_fingerprint || buildCartFingerprint(cart),
    };

    persistQrAttempt(draft);
    setQrCreating(true);

    try {
      const response = await api.post(
        "/pos/qr-payments/attempts",
        buildOnlinePayload(checkoutToken),
      );
      const data = response.data || {};
      const nextAttempt = {
        attempt_id: data.attempt_id || draft.attempt_id,
        checkout_token: data.checkout_token || checkoutToken,
        checkout_url: data.checkout_url || draft.checkout_url || null,
        state: data.status || "awaiting_payment",
        created_at: draft.created_at,
        updated_at: data.updated_at || draft.updated_at || null,
        expires_at: data.expires_at || draft.expires_at || null,
        cart_fingerprint: draft.cart_fingerprint,
      };

      persistQrAttempt(nextAttempt);
      setQrNoticeTone(nextAttempt.checkout_url ? "success" : "info");
      setQrNotice(
        nextAttempt.checkout_url
          ? "Online payment session is ready. Ask the customer to scan the QR code or open PayMongo Checkout."
          : data.message || "Payment session is still being prepared.",
      );
    } catch (err) {
      const statusCode = err.response?.status;
      const data = err.response?.data || {};
      const terminalStatuses = ["failed", "expired", "cancelled"];

      if (terminalStatuses.includes(data.status)) {
        persistQrAttempt(null);
        checkoutTokenRef.current = "";
        setError(
          data.message ||
            "This online payment attempt is no longer active. Please create a new attempt.",
        );
      } else if (
        statusCode === 400 ||
        statusCode === 401 ||
        statusCode === 403 ||
        statusCode === 422 ||
        (statusCode === 503 && !data.attempt_id)
      ) {
        persistQrAttempt(null);
        checkoutTokenRef.current = "";
        setError(
          data.message ||
            "Unable to start Online Payment with the current details.",
        );
      } else if (data.attempt_id) {
        persistQrAttempt({
          ...draft,
          attempt_id: data.attempt_id,
          state: data.status || draft.state,
        });
      } else {
        persistQrAttempt({
          ...draft,
          state: "reconcile_required",
        });
      }

      setQrNoticeTone("error");
      setQrNotice(
        data.message ||
          "Payment setup could not be confirmed. Check the saved payment status before trying again.",
      );
    } finally {
      setQrCreating(false);
    }
  };

  const verifyOnlineAttempt = async (attempt, { silent = false } = {}) => {
    const activeAttempt = attempt || readStoredQrAttempt();
    const attemptId = Number(activeAttempt?.attempt_id);

    if (!Number.isSafeInteger(attemptId) || attemptId <= 0) {
      if (!silent) {
        setQrNoticeTone("error");
        setQrNotice("No valid online payment attempt is available to verify.");
      }
      return;
    }

    setQrVerifying(true);
    if (!silent) {
      setQrNoticeTone("info");
      setQrNotice("Checking the payment status...");
    }

    try {
      const response = await api.post(
        `/pos/qr-payments/attempts/${attemptId}/verify`,
        {},
      );
      const data = response.data || {};

      if (data.status === "pending") {
        const nextAttempt = { ...activeAttempt, state: "pending" };
        persistQrAttempt(nextAttempt);
        setQrNoticeTone("info");
        setQrNotice(
          data.message || "Payment has not been confirmed yet.",
        );
        return;
      }

      if (data.status === "consumed") {
        const currentCart = readStoredCart();
        const currentFingerprint = buildCartFingerprint(currentCart);
        const cartMatchesAttempt =
          Boolean(activeAttempt.cart_fingerprint) &&
          activeAttempt.cart_fingerprint === currentFingerprint;

        if (cartMatchesAttempt) {
          sessionStorage.removeItem("pos_cart");
          setCart([]);
        }

        persistQrAttempt(null);
        checkoutTokenRef.current = "";
        setQrNotice("");
        setSuccess({ ...data, cart_preserved: !cartMatchesAttempt });
        return;
      }

      setQrNoticeTone("error");
      setQrNotice(data.message || "Unexpected payment verification response.");
    } catch (err) {
      const statusCode = err.response?.status;
      const data = err.response?.data || {};
      const responseStatus = String(data.status || "").toLowerCase();
      const terminalStatuses = ["failed", "expired", "cancelled"];

      if (terminalStatuses.includes(responseStatus) || statusCode === 404) {
        persistQrAttempt(null);
        checkoutTokenRef.current = "";
        setQrNotice("");
        setError(
          data.message ||
            "This online payment attempt is no longer available. You may create a new attempt.",
        );
        return;
      }

      let state = activeAttempt.state || "awaiting_payment";
      let message = data.message || "Unable to verify payment right now.";
      let tone = "error";

      if (responseStatus === "payment_mismatch") {
        state = "payment_mismatch";
        message =
          data.message ||
          "A payment was found, but its amount did not match this order.";
      } else if (responseStatus === "ambiguous_payment") {
        state = "manual_review";
        message =
          data.message ||
          "Multiple payments were found. Manual review is required.";
      } else if (responseStatus === "provider_response_malformed") {
        state = "provider_error";
        message =
          data.message ||
          "The payment provider response could not be verified. Please retry later.";
      } else if (statusCode === 502 || statusCode === 503) {
        state = "provider_error";
        message =
          data.message ||
          "Payment verification is temporarily unavailable. Please retry.";
      } else if (statusCode === 403) {
        state = "access_error";
        message =
          data.message ||
          "This payment attempt cannot be verified by the current cashier.";
      } else if (statusCode === 409 && responseStatus) {
        state = responseStatus;
      }

      persistQrAttempt({ ...activeAttempt, state });
      setQrNoticeTone(tone);
      setQrNotice(message);
    } finally {
      setQrVerifying(false);
    }
  };

  const handleOpenCheckout = () => {
    if (!qrAttempt?.checkout_url) {
      setQrNoticeTone("error");
      setQrNotice("The PayMongo checkout link is not available yet.");
      return;
    }

    window.location.assign(qrAttempt.checkout_url);
  };

  const reconcileQrAttempt = async (
    attempt,
    { silent = false, verifyAfterResume = false } = {},
  ) => {
    const activeAttempt = attempt || readStoredQrAttempt();
    const checkoutToken =
      typeof activeAttempt?.checkout_token === "string"
        ? activeAttempt.checkout_token.trim()
        : "";

    if (!checkoutToken) {
      persistQrAttempt(null);
      checkoutTokenRef.current = "";
      setQrNotice("");
      setError(
        "The saved online payment state was invalid and has been cleared. You may start again.",
      );
      return null;
    }

    setQrReconciling(true);
    if (!silent) {
      setQrNoticeTone("info");
      setQrNotice("Checking the saved online payment status...");
    }

    try {
      const response = await api.post("/pos/qr-payments/attempts/resume", {
        checkout_token: checkoutToken,
      });
      const data = response.data || {};

      if (data.resume_state === "consumed" && data.result) {
        const currentCart = readStoredCart();
        const currentFingerprint = buildCartFingerprint(currentCart);
        const cartMatchesAttempt =
          Boolean(activeAttempt.cart_fingerprint) &&
          activeAttempt.cart_fingerprint === currentFingerprint;

        if (cartMatchesAttempt) {
          sessionStorage.removeItem("pos_cart");
          setCart([]);
        }

        persistQrAttempt(null);
        checkoutTokenRef.current = "";
        setQrNotice("");
        setSuccess({
          ...data.result,
          cart_preserved: !cartMatchesAttempt,
        });
        return null;
      }

      if (
        data.can_clear_local_state === true &&
        ["terminal", "not_found"].includes(data.resume_state)
      ) {
        persistQrAttempt(null);
        checkoutTokenRef.current = "";
        setQrNotice("");
        setError(
          data.message ||
            "The saved online payment attempt is no longer active. You may start again.",
        );
        return null;
      }

      const nextState =
        data.resume_state === "admin_recovery_required"
          ? "admin_recovery_required"
          : data.resume_state === "manual_review"
            ? "manual_review"
            : data.resume_state === "awaiting_payment"
              ? "awaiting_payment"
              : data.resume_state === "preparing_payment"
                ? "preparing_payment"
                : activeAttempt.state || "reconcile_required";

      const nextAttempt = {
        ...activeAttempt,
        attempt_id: data.attempt_id || activeAttempt.attempt_id || null,
        checkout_url: data.checkout_url || null,
        state: nextState,
        server_total:
          data.total !== undefined && data.total !== null
            ? data.total
            : activeAttempt.server_total,
        server_item_count:
          data.item_count !== undefined && data.item_count !== null
            ? data.item_count
            : activeAttempt.server_item_count,
        server_checkout:
          data.checkout_summary && typeof data.checkout_summary === "object"
            ? data.checkout_summary
            : activeAttempt.server_checkout,
        requires_admin_recovery: Boolean(data.requires_admin_recovery),
        created_at: data.created_at || activeAttempt.created_at,
        updated_at: data.updated_at || activeAttempt.updated_at,
        expires_at: data.expires_at || activeAttempt.expires_at,
      };

      persistQrAttempt(nextAttempt);
      setQrNoticeTone(
        ["manual_review", "admin_recovery_required"].includes(nextState)
          ? "error"
          : "info",
      );
      setQrNotice(
        data.message || "The saved online payment attempt was restored.",
      );

      if (
        verifyAfterResume &&
        POS_QR_ENABLED &&
        nextState === "awaiting_payment" &&
        nextAttempt.attempt_id
      ) {
        await verifyOnlineAttempt(nextAttempt, { silent: true });
      }

      return nextAttempt;
    } catch (err) {
      const statusCode = err.response?.status;
      const data = err.response?.data || {};

      if (
        statusCode === 400 ||
        statusCode === 404 ||
        data.can_clear_local_state === true
      ) {
        persistQrAttempt(null);
        checkoutTokenRef.current = "";
        setQrNotice("");
        setError(
          data.message ||
            "No server payment attempt matched the saved browser state. The stale state was cleared.",
        );
        return null;
      }

      if (statusCode === 409 && data.resume_state === "manual_review") {
        const reviewAttempt = {
          ...activeAttempt,
          attempt_id: data.attempt_id || activeAttempt.attempt_id || null,
          checkout_url: null,
          state: "manual_review",
          created_at: data.created_at || activeAttempt.created_at,
          updated_at: data.updated_at || activeAttempt.updated_at,
          expires_at: data.expires_at || activeAttempt.expires_at,
        };
        persistQrAttempt(reviewAttempt);
        setQrNoticeTone("error");
        setQrNotice(
          data.message ||
            "This payment attempt needs administrator review before it can continue.",
        );
        return reviewAttempt;
      }

      setQrNoticeTone("error");
      setQrNotice(
        data.message ||
          "Unable to check the saved payment right now. The current state was kept safely; please retry.",
      );
      return activeAttempt;
    } finally {
      setQrReconciling(false);
    }
  };

  useEffect(() => {
    const storedAttempt = readStoredQrAttempt();
    if (!storedAttempt || resumeStartedRef.current) return;

    resumeStartedRef.current = true;
    reconcileQrAttempt(storedAttempt, {
      silent: true,
      verifyAfterResume: storedAttempt.state === "returning",
    });

  }, []);

  if (success) {
    return (
      <div
        className="pos-order-success-page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          className="pos-order-success-card"
          style={{
            ...cardStyle,
            maxWidth: 520,
            width: "100%",
            textAlign: "center",
            padding: 40,
          }}
        >
          <CheckCircle size={56} color="#059669" style={{ marginBottom: 16 }} />
          <h2
            style={{
              color: "#0a0a0a",
              marginBottom: 8,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Order Successful!
          </h2>

          <p style={{ color: "#52525b", marginBottom: 6, fontSize: 14 }}>
            Order Number:{" "}
            <strong style={{ color: "#18181b" }}>{success.order_number}</strong>
          </p>
          <p style={{ color: "#52525b", marginBottom: 6, fontSize: 14 }}>
            Receipt Number:{" "}
            <strong style={{ color: "#18181b" }}>
              {success.receipt_number}
            </strong>
          </p>

          {success.cart_preserved && (
            <p
              style={{
                color: "#92400e",
                margin: "10px 0 0",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              A newer cart was detected and was not cleared.
            </p>
          )}

          {success.delivery && (
            <p style={{ color: "#52525b", marginBottom: 6, fontSize: 14 }}>
              Delivery Request Saved
            </p>
          )}

          <div
            className="pos-order-success-total"
            style={{
              margin: "24px 0",
              padding: "20px",
              background: "#fafafa",
              borderRadius: 12,
              border: "1px solid #e4e4e7",
            }}
          >
            <p
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#0a0a0a",
                margin: "0 0 12px",
                letterSpacing: "-0.02em",
              }}
            >
              ₱
              {parseFloat(success.total).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
              })}
            </p>

            {success.cash_received !== null &&
              success.cash_received !== undefined && (
                <>
                  <p
                    style={{ color: "#52525b", marginBottom: 6, fontSize: 14 }}
                  >
                    Cash Received:{" "}
                    <strong style={{ color: "#18181b" }}>
                      ₱
                      {parseFloat(success.cash_received || 0).toLocaleString(
                        "en-PH",
                        { minimumFractionDigits: 2 },
                      )}
                    </strong>
                  </p>
                  <p
                    style={{
                      color: "#059669",
                      margin: 0,
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    Change: ₱
                    {parseFloat(success.change || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </>
              )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              style={btnPrimary}
              onClick={() => navigate(`/staff/receipt/${success.receipt_id}`)}
            >
              <Receipt size={16} /> View Receipt
            </button>
            <button
              style={btnSecondary}
              onClick={() => {
                setSuccess(null);
                setCart([]);
                persistQrAttempt(null);
                checkoutTokenRef.current = "";
                setQrNotice("");
                setForm({
                  customer_name: "",
                  customer_phone: "",
                  payment_method: "cash",
                  cash_received: "",
                  discount_type: "amount",
                  discount: "",
                  delivery_fee: "",
                  notes: "",
                  need_delivery: false,
                  delivery_address: "",
                  delivery_lat: null,
                  delivery_lng: null,
                  delivery_requested_date: "",
                  delivery_notes: "",
                });
                setMapPosition(null);
                navigate("/staff/products");
              }}
            >
              New Order
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0 && !qrAttempt) {
    return (
      <div
        className="pos-process-order"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div style={pageHeader}>
          <h1 style={pageTitle}>Process Order</h1>
        </div>
        <div style={{ ...cardStyle, textAlign: "center", padding: 60 }}>
          <p
            style={{
              color: "#71717a",
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 20,
            }}
          >
            No items in cart.
          </p>
          <button
            style={btnSecondary}
            onClick={() => navigate("/staff/products")}
          >
            Go to Product Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pos-process-order"
      style={{ fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}
    >
      <div style={pageHeader}>
        <h1 style={pageTitle}>Process Order</h1>
        <p style={pageSubtitle}>
          Enter customer details and complete the sale.
        </p>
      </div>

      <div className="pos-order-grid">
        <div className="pos-order-form-card" style={{ ...cardStyle, padding: 32 }}>
          <h3
            style={{
              margin: "0 0 24px",
              fontWeight: 700,
              fontSize: 18,
              color: "#0a0a0a",
              letterSpacing: "-0.01em",
            }}
          >
            {qrAttempt
              ? qrReconciling
                ? "Restoring Online Payment"
                : qrNeedsManualReview
                  ? "Online Payment Needs Review"
                  : "Online Payment Pending"
              : "Sale Details"}
          </h3>

          <form className="pos-order-form" onSubmit={handleSubmit}>
            {!qrAttempt && (
            <fieldset
              disabled={Boolean(qrAttempt)}
              className="pos-order-fieldset"
            >
            <div className="pos-form-field pos-field-customer" style={formField}>
              <label style={labelStyle}>Customer Name *</label>
              <input
                type="text"
                placeholder="Walk-in Customer"
                value={form.customer_name}
                onChange={(e) =>
                  setForm({ ...form, customer_name: e.target.value })
                }
                required
                style={inputStyle}
              />
            </div>

            <div className="pos-form-field pos-field-phone" style={formField}>
              <label style={labelStyle}>
                Phone Number{phoneIsRequired ? " *" : ""}
              </label>
              <input
                type="tel"
                placeholder="09XXXXXXXXX"
                value={form.customer_phone}
                maxLength={11}
                onChange={(e) =>
                  setForm({
                    ...form,
                    customer_phone: e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 11),
                  })
                }
                style={{
                  ...inputStyle,
                  borderColor:
                    form.customer_phone && !phoneIsValid
                      ? "#dc2626"
                      : "#e4e4e7",
                }}
              />
              {form.customer_phone && !phoneIsValid && (
                <div
                  style={{
                    color: "#dc2626",
                    fontSize: 12,
                    marginTop: 6,
                    fontWeight: 600,
                  }}
                >
                  Enter a valid 11-digit PH mobile number starting with 09.
                </div>
              )}
            </div>

            <div className="pos-form-field pos-field-payment" style={formField}>
              <label style={labelStyle}>Payment Method *</label>
              <select
                value={effectivePaymentMethod}
                disabled={Boolean(qrAttempt) || !POS_QR_ENABLED}
                onChange={(e) =>
                  setForm({
                    ...form,
                    payment_method: e.target.value,
                    cash_received:
                      e.target.value === "cash" ? form.cash_received : "",
                  })
                }
                style={{
                  ...inputStyle,
                  background: POS_QR_ENABLED ? "#ffffff" : "#f4f4f5",
                  color: "#52525b",
                }}
              >
                <option value="cash">Cash</option>
                {POS_QR_ENABLED && (
                  <option value="online">Online Payment</option>
                )}
              </select>
              <div
                style={{
                  fontSize: 12,
                  color: "#71717a",
                  marginTop: 6,
                }}
              >
                {POS_QR_ENABLED
                  ? "Choose cash or online payment."
                  : "Cash only."}
              </div>
            </div>

            <div className="pos-form-field pos-field-discount" style={formField}>
              <label style={labelStyle}>Discount</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <select
                  value={form.discount_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      discount_type: e.target.value,
                      discount: "",
                    })
                  }
                  style={{
                    width: "80px",
                    padding: "10px 14px",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    outline: "none",
                    background: "#fff",
                    color: "#18181b",
                    fontSize: 13,
                  }}
                >
                  <option value="amount">₱</option>
                  <option value="percent">%</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={
                    form.discount_type === "amount"
                      ? "Amount (e.g. 500)"
                      : "Percent (e.g. 20)"
                  }
                  value={form.discount}
                  onChange={(e) =>
                    setForm({ ...form, discount: e.target.value })
                  }
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </div>

            {effectivePaymentMethod === "cash" && (
              <div className="pos-form-field pos-field-cash" style={formField}>
                <label style={labelStyle}>Cash Received (₱) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter amount received"
                  value={form.cash_received}
                  onChange={(e) =>
                    setForm({ ...form, cash_received: e.target.value })
                  }
                  required
                  style={inputStyle}
                />
              </div>
            )}

            <div
              className="pos-delivery-section"
              style={{
                marginTop: 24,
                marginBottom: 24,
                background: "#fafafa",
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: 24,
              }}
            >
              <h4
                style={{
                  margin: "0 0 16px",
                  fontWeight: 700,
                  fontSize: 15,
                  color: "#0a0a0a",
                }}
              >
                Delivery
              </h4>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#18181b",
                    cursor: "pointer",
                  }}
                >
                  <div
                    className={`pos-delivery-toggle ${
                      form.need_delivery ? "is-on" : "is-off"
                    }`}
                    onClick={() =>
                      setForm({ ...form, need_delivery: !form.need_delivery })
                    }
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      cursor: "pointer",
                      background: form.need_delivery ? "#18181b" : "#d4d4d8",
                      position: "relative",
                      transition: "background .2s",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      className="pos-delivery-toggle-knob"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "#fff",
                        position: "absolute",
                        top: 3,
                        left: form.need_delivery ? 23 : 3,
                        transition: "left .2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                      }}
                    />
                  </div>
                  Add delivery
                </label>

                {form.need_delivery && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                      marginTop: 8,
                    }}
                  >
                    <div style={{ gridColumn: "1 / -1" }}>
                      <LocationPicker
                        label="Delivery Address *"
                        addressValue={form.delivery_address}
                        onAddressChange={handleDeliveryAddressChange}
                        value={deliveryPin}
                        onChange={handleDeliveryPinChange}
                        height={220}
                        showCurrentLocation={true}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Delivery Fee (₱)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 150"
                        value={form.delivery_fee}
                        onChange={(e) =>
                          setForm({ ...form, delivery_fee: e.target.value })
                        }
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Delivery Date and Time *</label>
                      <input
                        type="datetime-local"
                        value={form.delivery_requested_date}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            delivery_requested_date: e.target.value,
                          })
                        }
                        required={form.need_delivery}
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelStyle}>Delivery Notes</label>
                      <input
                        type="text"
                        placeholder="Optional delivery notes"
                        value={form.delivery_notes}
                        onChange={(e) =>
                          setForm({ ...form, delivery_notes: e.target.value })
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pos-form-field pos-field-notes" style={formField}>
              <label style={labelStyle}>Order Notes</label>
              <textarea
                rows={3}
                placeholder="Add optional notes for this order"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            </fieldset>
            )}

            {error && (
              <div
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  padding: "12px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  marginTop: 20,
                  border: "1px solid #fecaca",
                }}
              >
                {error}
              </div>
            )}

            {qrAttempt && (
              <div className="pos-qr-pending-panel">
                <div>
                  <div className="pos-qr-pending-title">
                    Online Payment Pending
                  </div>
                  <p className="pos-qr-pending-copy">
                    The item stock is reserved for this payment attempt. Ask
                    the customer to scan the QR code below, or open PayMongo
                    Checkout as a fallback.
                  </p>
                  <div className="pos-qr-pending-amount">
                    ₱
                    {qrDisplayTotal.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  {qrAttempt.checkout_url && (
                    <PosCheckoutQr
                      checkoutUrl={qrAttempt.checkout_url}
                      expiresAt={qrAttempt.expires_at}
                      createdAt={qrAttempt.created_at}
                      pollingDisabled={
                        qrCreating ||
                        qrVerifying ||
                        qrReconciling ||
                        qrNeedsManualReview
                      }
                      onPoll={() =>
                        verifyOnlineAttempt(qrAttempt, { silent: true })
                      }
                    />
                  )}

                  {!qrCartMatchesCurrent && hasServerCheckout && (
                    <div className="pos-qr-notice pos-qr-notice-info">
                      {cart.length === 0
                        ? "Reserved order details were restored from the server."
                        : "Reserved order details were restored from the server. A different local cart was preserved and was not overwritten."}
                    </div>
                  )}
                  {!qrCartMatchesCurrent && !hasServerCheckout && (
                    <div className="pos-qr-notice pos-qr-notice-error">
                      The current cart differs from the cart reserved for this
                      payment attempt. The existing PayMongo checkout remains
                      authoritative, and this local cart will not be cleared.
                    </div>
                  )}
                </div>

                {qrNotice && (
                  <div
                    className={`pos-qr-notice pos-qr-notice-${qrNoticeTone}`}
                  >
                    {qrNotice}
                  </div>
                )}

                <div className="pos-qr-actions">
                  {qrAttempt.checkout_url ? (
                    <button
                      type="button"
                      style={btnPrimary}
                      onClick={handleOpenCheckout}
                      disabled={qrCreating || qrVerifying || qrReconciling}
                    >
                      Open PayMongo Checkout
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={btnPrimary}
                      onClick={() => reconcileQrAttempt(qrAttempt)}
                      disabled={qrCreating || qrVerifying || qrReconciling}
                    >
                      {qrReconciling
                        ? "Checking Payment..."
                        : "Check Payment Status"}
                    </button>
                  )}

                  {(qrCanVerify || qrNeedsManualReview) && (
                    <button
                      type="button"
                      style={btnSecondary}
                      onClick={() => verifyOnlineAttempt(qrAttempt)}
                      disabled={
                        qrCreating ||
                        qrVerifying ||
                        qrReconciling ||
                        qrNeedsManualReview
                      }
                    >
                      {qrNeedsManualReview
                        ? "Admin Review Required"
                        : qrVerifying
                          ? "Verifying..."
                          : "Verify Payment"}
                    </button>
                  )}
                </div>

                <p className="pos-qr-lock-note">
                  Order details are locked while this payment attempt is
                  active. Do not create another payment or change the reserved
                  cart until this attempt is resolved.
                </p>
              </div>
            )}

            {!qrAttempt && (
              <div
                className="pos-order-actions"
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 32,
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  style={btnSecondary}
                  onClick={() => navigate("/staff/products")}
                >
                  ← Back to Catalog
                </button>

                {form.payment_method === "online" ? (
                  <button
                    type="button"
                    style={
                      canSubmitOnline
                        ? btnPrimary
                        : {
                            ...btnPrimary,
                            opacity: 0.5,
                            cursor: "not-allowed",
                          }
                    }
                    disabled={!canSubmitOnline}
                    onClick={handleCreateOnlinePayment}
                  >
                    {qrCreating
                      ? "Preparing Payment..."
                      : "Create Online Payment"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    style={
                      canSubmit
                        ? btnPrimary
                        : {
                            ...btnPrimary,
                            opacity: 0.5,
                            cursor: "not-allowed",
                          }
                    }
                    disabled={!canSubmit}
                  >
                    {loading
                      ? "Processing..."
                      : "Confirm Order and Payment"}
                  </button>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Right Sidebar - Summary */}
        <div
          className="pos-order-summary-card"
          style={{ ...cardStyle, padding: 0, height: "fit-content" }}
        >
          <div
            className="pos-order-summary-header"
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #f4f4f5",
              background: "#fafafa",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: 15,
                color: "#0a0a0a",
                letterSpacing: "0",
                textTransform: "none",
              }}
            >
              Order Summary
            </h3>
          </div>

          <div
            className="pos-order-summary-items"
            style={{ maxHeight: 320, overflowY: "auto", padding: "0 24px" }}
          >
            {displayCart.map((item) => (
              <div
                key={item.key || `reserved-${item.product_id}`}
                className="pos-order-summary-item"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "16px 0",
                  borderBottom: "1px solid #f4f4f5",
                  fontSize: 13,
                }}
              >
                <div className="pos-order-summary-thumb">
                  {getOrderSummaryImage(item) ? (
                    <img
                      src={getOrderSummaryImage(item)}
                      alt={item.product_name}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      className="pos-order-summary-thumb-fallback"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="pos-order-summary-copy">
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#0a0a0a",
                      marginBottom: 2,
                    }}
                  >
                    {item.product_name}
                  </div>

                  <div
                    style={{ color: "#71717a", marginTop: 4, fontWeight: 500 }}
                  >
                    Quantity {item.quantity} at ₱{Number(item.unit_price).toLocaleString()} each
                  </div>
                </div>
                <div style={{ fontWeight: 650, color: "#0a0a0a" }}>
                  ₱
                  {(Number.isFinite(Number(item.subtotal))
                    ? Number(item.subtotal)
                    : Number(item.unit_price) * Number(item.quantity)
                  ).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
            ))}
          </div>

          <div
            className="pos-order-summary-totals"
            style={{
              padding: 24,
              background: "#fafafa",
              borderTop: "1px solid #e4e4e7",
            }}
          >
            <div style={summaryRowStyle}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 600, color: "#18181b" }}>
                ₱
                {displaySubtotal.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            {displayDiscountAmount > 0 && (
              <div style={{ ...summaryRowStyle, color: "#dc2626" }}>
                <span>
                  Discount{" "}
                  {!serverCheckout &&
                    (form.discount_type === "percent"
                      ? `(${discountInput}%)`
                      : `(Flat)`)}
                </span>
                <span style={{ fontWeight: 600 }}>
                  -₱
                  {displayDiscountAmount.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            {displayDeliveryFee > 0 && (
              <div style={summaryRowStyle}>
                <span>Delivery Fee</span>
                <span style={{ fontWeight: 600, color: "#18181b" }}>
                  +₱
                  {displayDeliveryFee.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 20,
                fontWeight: 700,
                color: "#0a0a0a",
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid #e4e4e7",
                letterSpacing: "-0.01em",
              }}
            >
              <span>Total</span>
              <span>
                ₱
                {displayTotal.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            {effectivePaymentMethod === "cash" ? (
              <>
                <div
                  style={{
                    ...summaryRowStyle,
                    marginTop: 16,
                    color: "#52525b",
                  }}
                >
                  <span>Cash Received</span>
                  <span style={{ fontWeight: 600, color: "#18181b" }}>
                    ₱
                    {cashReceived.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginTop: 8,
                    color: cashReceived >= total ? "#059669" : "#dc2626",
                    fontWeight: 600,
                  }}
                >
                  <span>
                    {cashReceived >= total ? "Change" : "Insufficient Cash"}
                  </span>
                  <span>
                    ₱
                    {Math.abs(cashReceived - total).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    ...summaryRowStyle,
                    marginTop: 16,
                    color: "#52525b",
                  }}
                >
                  <span>Payment Method</span>
                  <span style={{ fontWeight: 600, color: "#18181b" }}>
                    Online Payment
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginTop: 8,
                    color: "#b45309",
                    fontWeight: 700,
                  }}
                >
                  <span>Status</span>
                  <span>
                    {qrAttempt
                      ? qrNeedsManualReview
                        ? "Needs Review"
                        : qrReconciling
                          ? "Restoring"
                          : "Payment Pending"
                      : "Ready"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reusable Styles ──────────────────────────────────────────

const pageHeader = {
  marginBottom: 24,
};

const pageTitle = {
  fontSize: 24,
  fontWeight: 700,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  fontSize: 13,
  color: "#52525b",
  marginTop: 6,
  lineHeight: 1.5,
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const formField = {
  marginBottom: 20,
};

const labelStyle = {
  display: "block",
  marginBottom: 8,
  fontSize: 11,
  fontWeight: 600,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  color: "#18181b",
  outline: "none",
  boxSizing: "border-box",
  background: "#ffffff",
  transition: "border-color 0.2s",
};

const summaryRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  marginBottom: 10,
  color: "#52525b",
};

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 24px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.2s",
};

const btnSecondary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 20px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.2s",
};
