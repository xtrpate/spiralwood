import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

const POS_QR_STORAGE_KEY = "pos_qr_attempt";

const safeParseJson = (value, fallback = null) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
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

export default function QrPaymentReturn() {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const attemptId = Number(id);
    const existing = safeParseJson(
      sessionStorage.getItem(POS_QR_STORAGE_KEY),
      null,
    );

    if (Number.isSafeInteger(attemptId) && attemptId > 0) {
      const currentCart = safeParseJson(
        sessionStorage.getItem("pos_cart"),
        [],
      );
      const sameAttempt = Number(existing?.attempt_id) === attemptId;
      const nextAttempt = {
        attempt_id: attemptId,
        checkout_token: sameAttempt ? existing.checkout_token || "" : "",
        checkout_url: sameAttempt ? existing.checkout_url || null : null,
        state: "returning",
        created_at:
          (sameAttempt && existing.created_at) || new Date().toISOString(),
        cart_fingerprint:
          (sameAttempt && existing.cart_fingerprint) ||
          buildCartFingerprint(currentCart),
      };

      sessionStorage.setItem(
        POS_QR_STORAGE_KEY,
        JSON.stringify(nextAttempt),
      );
    }

    // Query-string values such as ?status=success are intentionally ignored.
    // ProcessOrder always asks the backend to verify the real payment state.
    navigate("/staff/order", { replace: true });
  }, [id, navigate]);

  return (
    <div
      style={{
        minHeight: "50vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
        color: "#52525b",
        fontWeight: 600,
      }}
    >
      Returning to the cashier payment screen...
    </div>
  );
}
