import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Pencil, Scissors } from "lucide-react";
import { useCustomCart } from "./customcartcontext";
import { buildAssetUrl } from "../../services/api";
import api from "../../services/api";
import "./customizepage.css";
import useAuthStore from "../../store/authStore";
import CustomerBlueprintViewer from "./CustomerBlueprintViewer";
import LocationPicker from "../../components/LocationPicker";
import { getCustomReferencePhotos } from "../../utils/customReferencePhotoStore";

// Strict parsing prevents blank strings, whitespace, booleans, arrays,
// and objects from being coerced into a fake numeric coordinate such as 0.
const parseStrictCoordinate = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const getValidCoordPair = (lat, lng) => {
  const latitude = parseStrictCoordinate(lat);
  const longitude = parseStrictCoordinate(lng);

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { lat: latitude, lng: longitude };
};

const isValidCoordPair = (lat, lng) => Boolean(getValidCoordPair(lat, lng));

const formatTemplateLabel = (item = {}) => {
  if (item?.template_profile) {
    return `${String(item.template_profile)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())} Template`;
  }

  if (item?.template_category) {
    return String(item.template_category).trim();
  }

  return "Admin Blueprint";
};

/* WISDOM CUSTOM DESIGN EDIT ROUTE + REVIEW CLEANUP V1.0.2 */
const hasMeaningfulCustomerSpec = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;

  return ![
    "not specified",
    "not applicable",
    "n/a",
    "none",
    "null",
    "undefined",
  ].includes(normalized);
};

const resolveCartImageSrc = (src) => {
  const raw = String(src || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("/template-previews/") ||
    raw.startsWith("/images/") ||
    raw.startsWith("/assets/")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const parseCartEditorSnapshot = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

const buildLiveCartBlueprintPreview = (item = {}) => {
  const editorSnapshot = parseCartEditorSnapshot(item?.editor_snapshot);
  const components = Array.isArray(editorSnapshot?.components)
    ? editorSnapshot.components
    : [];

  if (!components.length) return null;

  return {
    id: item?.blueprint_id || item?.key || null,
    title:
      item?.base_blueprint_title || item?.product_name || "Custom Furniture",
    thumbnail_url: null,
    components,
    view_3d_data: {
      components,
      worldSize: editorSnapshot?.worldSize || null,
    },
  };
};

const getItemDisplayDims = (item = {}) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  if (!components.length) {
    return {
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      depth: Number(item.depth) || 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  components.forEach((comp) => {
    const x = Number(comp?.x) || 0;
    const y = Number(comp?.y) || 0;
    const z = Number(comp?.z) || 0;
    const w = Math.max(0, Number(comp?.width) || 0);
    const h = Math.max(0, Number(comp?.height) || 0);
    const d = Math.max(0, Number(comp?.depth) || 0);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);

    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    maxZ = Math.max(maxZ, z + d);
  });

  const width = Math.round(maxX - minX) || Number(item.width) || 0;
  const height = Math.round(maxY - minY) || Number(item.height) || 0;
  const depth = Math.round(maxZ - minZ) || Number(item.depth) || 0;

  return { width, height, depth };
};

export default function CustomCheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { customCart, removeManyFromCustomCart } = useCustomCart();

  const [checkoutItems, setCheckoutItems] = useState([]);
  const [selectionReady, setSelectionReady] = useState(false);

  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    delivery_address: user?.address || "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  const [checkoutNote, setCheckoutNote] = useState("");

  useEffect(() => {
    api
      .get("/website/settings")
      .then((res) => {
        const note =
          res.data?.email?.checkout_note || res.data?.checkout_note || "";
        setCheckoutNote(note);
      })
      .catch((err) => console.error("Could not load checkout note:", err));
  }, []);

  // PHASE 6A — Blueprint Address and Map Fix.
  // useDefaultAddress: whether this request is currently using the saved
  //   profile address/pin as a shortcut (checkbox state).
  // deliveryPin: the CURRENT pin for this request only — never written
  //   back to the user's profile.
  // userToggledRef: becomes true the moment the customer manually edits
  //   the address text or the map pin. Once true, incoming profile
  //   updates stop silently overwriting the customer's in-progress choice.
  const [useDefaultAddress, setUseDefaultAddress] = useState(() =>
    Boolean(String(user?.address || "").trim()),
  );
  const [deliveryPin, setDeliveryPin] = useState(() =>
    getValidCoordPair(user?.address_lat, user?.address_lng),
  );
  const [locationPickerKey, setLocationPickerKey] = useState(0);
  const userToggledRef = useRef(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: user?.name || prev.name || "",
      phone: user?.phone || prev.phone || "",
      delivery_address: userToggledRef.current
        ? prev.delivery_address
        : user?.address || prev.delivery_address || "",
    }));

    if (userToggledRef.current) return;

    const hasDefault = Boolean(String(user?.address || "").trim());
    setUseDefaultAddress(hasDefault);
    setDeliveryPin(
      hasDefault
        ? getValidCoordPair(user?.address_lat, user?.address_lng)
        : null,
    );
    setLocationPickerKey((current) => current + 1);
  }, [user]);

  // Re-checking "Use my default delivery address" always pulls the
  // latest saved profile values, even if the customer had switched to a
  // custom address/pin earlier in this session.
  const handleToggleDefaultAddress = (checked) => {
    userToggledRef.current = true;
    setUseDefaultAddress(checked);
    if (checked) {
      set("delivery_address", user?.address || "");
      setDeliveryPin(getValidCoordPair(user?.address_lat, user?.address_lng));
      setLocationPickerKey((current) => current + 1);
    }
  };

  // Any manual address text edit is a custom-address override for this
  // request only — it never touches users.address. LocationPicker owns
  // the address input itself, so this receives plain text, not an event.
  const handleAddressInputChange = (text) => {
    userToggledRef.current = true;
    setUseDefaultAddress(false);
    set("delivery_address", text);
  };

  // Fired for every LocationPicker pin change: click-to-place, drag,
  // search result, "use my current location", and "clear pin". All of
  // these are custom-address overrides.
  const handlePinChange = (next) => {
    userToggledRef.current = true;
    setUseDefaultAddress(false);
    setDeliveryPin(next);
  };

  useEffect(() => {
    try {
      const raw =
        sessionStorage.getItem("cust_selected_custom_checkout") ||
        sessionStorage.getItem("cust_selected_keys");
      const parsed = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(parsed) || parsed.length !== 1) {
        navigate("/custom-cart", { replace: true });
        return;
      }

      const selectedKey =
        typeof parsed[0] === "string" ? parsed[0] : parsed[0]?.key || null;

      if (!selectedKey) {
        navigate("/custom-cart", { replace: true });
        return;
      }

      let matchedItem = (customCart || []).find(
        (item) => item.key === selectedKey,
      );

      if (!matchedItem && typeof parsed[0] === "object") {
        matchedItem = parsed[0];
      }

      if (!matchedItem) {
        navigate("/custom-cart", { replace: true });
        return;
      }

      const matchedQuantity = Number(matchedItem?.quantity);
      const safeQuantity =
        Number.isSafeInteger(matchedQuantity) && matchedQuantity > 0
          ? matchedQuantity
          : 1;

      setCheckoutItems([{ ...matchedItem, quantity: safeQuantity }]);
      setReviewConfirmed(false);
      setSelectionReady(true);
    } catch {
      navigate("/custom-cart", { replace: true });
    }
  }, [customCart, navigate]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const hasDefaultAddress = Boolean(String(user?.address || "").trim());
  const hasDefaultPin = isValidCoordPair(user?.address_lat, user?.address_lng);

  const totalUnits = useMemo(
    () =>
      checkoutItems.reduce(
        (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
        0,
      ),
    [checkoutItems],
  );

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setError("");

    if (checkoutItems.length !== 1) {
      setError("Select exactly one custom design for this request.");
      return;
    }

    if (!reviewConfirmed) {
      setError(
        "Please review and confirm the exact design, specifications, and quantity before submitting.",
      );
      return;
    }

    if (!form.name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!form.phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }

    if (!String(form.delivery_address || "").trim()) {
      setError("Please enter your project/delivery address.");
      return;
    }

    // PHASE 6A: the location pin is mandatory for every new blueprint/
    // custom-request order — never submit a NULL, half-set, or
    // out-of-range pin (strict validator — see isValidCoordPair).
    const validDeliveryPin = getValidCoordPair(
      deliveryPin?.lat,
      deliveryPin?.lng,
    );

    if (!validDeliveryPin) {
      setError(
        useDefaultAddress
          ? "Your default address has no saved map pin. Please select a location on the map before submitting."
          : "Please select a valid location pin on the map before submitting.",
      );
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      const referencePhotoManifest = [];

      for (
        let itemIndex = 0;
        itemIndex < checkoutItems.length;
        itemIndex += 1
      ) {
        const item = checkoutItems[itemIndex];
        const expectedPhotoCount = Array.isArray(item?.reference_photos)
          ? item.reference_photos.length
          : Number(item?.customization_snapshot?.reference_photo_count || 0);

        const storedPhotos = await getCustomReferencePhotos(item?.key);

        if (
          expectedPhotoCount > 0 &&
          storedPhotos.length !== expectedPhotoCount
        ) {
          throw new Error(
            `Reference photos for "${item?.product_name || "this custom item"}" are missing on this device. Remove the item, add it again, and re-upload the photos before checkout.`,
          );
        }

        if (storedPhotos.length > 5) {
          throw new Error(
            "A custom item can contain up to 5 reference photos only.",
          );
        }

        storedPhotos.forEach((photo) => {
          const blob = photo?.blob;
          if (!(blob instanceof Blob)) {
            throw new Error(
              `A reference photo for "${item?.product_name || "this custom item"}" could not be read. Please add the item again.`,
            );
          }

          const fileName =
            String(photo?.name || "reference-photo").trim() ||
            "reference-photo";

          formData.append("reference_photos", blob, fileName);
          referencePhotoManifest.push({
            item_index: itemIndex,
            photo_id: String(photo?.id || "").trim() || null,
            file_name: fileName,
          });
        });
      }

      formData.append(
        "payload",
        JSON.stringify({
          items: checkoutItems.map((item) => ({
            ...item,
            quantity: Math.max(1, Number(item.quantity || 1)),
          })),
          name: form.name,
          phone: form.phone,
          delivery_address: String(form.delivery_address || "").trim(),
          delivery_lat: validDeliveryPin.lat,
          delivery_lng: validDeliveryPin.lng,
          notes: form.notes,
          design_review_confirmed: true,
        }),
      );
      formData.append(
        "reference_photo_manifest",
        JSON.stringify(referencePhotoManifest),
      );

      const res = await api.post("/customer/custom-orders", formData);

      const submittedKeys = checkoutItems
        .map((item) => item.key)
        .filter(Boolean);

      removeManyFromCustomCart(submittedKeys);
      sessionStorage.removeItem("cust_selected_custom_checkout");

      const nextId = res?.data?.order_id;
      if (nextId) {
        navigate(`/custom-requests/${nextId}`, { replace: true });
        return;
      }

      navigate("/orders", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Failed to submit custom request. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!selectionReady) {
    return (
      <div>
        <div className="page-hero">
          <h1>Custom Request Checkout</h1>
          <p>Loading your selected custom design…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="custom-request-checkout-v2">
      <div className="page-hero">
        <h1>Custom Request Checkout</h1>
        <p>Review this design and submit it for quotation.</p>
      </div>

      <div className="checkout-layout">
        <div className="checkout-form-panel">
          {error && <div className="alert alert-error">{error}</div>}

          {/* WISDOM CUSTOM DESIGN REVIEW EDIT BEFORE SUBMIT V1.0.0 */}
          <div className="checkout-section custom-final-review-section">
            <div className="checkout-section-header custom-final-review-header">
              <div className="checkout-section-num custom-final-review-icon">
                <CheckCircle2 size={17} />
              </div>
              <div>
                <h3>Review Your Design</h3>
                <p>
                  Check the exact edited design, specifications, and quantity
                  before sending this request to our team.
                </p>
              </div>
              <span className="custom-final-review-qty">Qty {totalUnits}</span>
            </div>

            <div className="checkout-section-body">
              {checkoutItems.map((item) => {
                const dims = getItemDisplayDims(item);
                const liveBlueprintPreview =
                  buildLiveCartBlueprintPreview(item);
                const staticImageSrc = resolveCartImageSrc(
                  item.image_url || item.preview_image_url,
                );
                const referenceCount = Array.isArray(item.reference_photos)
                  ? item.reference_photos.length
                  : Number(
                      item?.customization_snapshot?.reference_photo_count || 0,
                    );

                return (
                  <div key={item.key} className="custom-final-review-grid">
                    <div className="custom-final-review-visual">
                      {liveBlueprintPreview ? (
                        <CustomerBlueprintViewer
                          blueprint={liveBlueprintPreview}
                          readOnly
                          showHumanControls={false}
                          compact
                          compactHeight={270}
                          defaultPreset="isometric"
                          defaultShowHuman={false}
                        />
                      ) : staticImageSrc ? (
                        <img
                          src={staticImageSrc}
                          alt={
                            item.base_blueprint_title ||
                            item.product_name ||
                            "Custom design"
                          }
                        />
                      ) : (
                        <div className="custom-final-review-unavailable">
                          Design preview unavailable
                        </div>
                      )}
                    </div>

                    <div className="custom-final-review-details">
                      <div className="custom-final-review-title-row">
                        <div>
                          <div className="custom-final-review-eyebrow">
                            {formatTemplateLabel(item)}
                          </div>
                          <h4>
                            {item.base_blueprint_title ||
                              item.product_name ||
                              "Custom Furniture"}
                          </h4>
                        </div>

                        <button
                          type="button"
                          className="custom-final-review-edit-btn"
                          onClick={() =>
                            navigate(
                              `/custom-cart?edit=${encodeURIComponent(item.key)}`,
                            )
                          }
                        >
                          <Pencil size={15} />
                          Edit Design
                        </button>
                      </div>

                      <div className="custom-final-review-specs">
                        <div>
                          <span>Quantity</span>
                          <strong>
                            {Math.max(1, Number(item.quantity || 1))}
                          </strong>
                        </div>
                        <div>
                          <span>Dimensions</span>
                          <strong>
                            W{formatItemValue(dims.width)} × H
                            {formatItemValue(dims.height)} × D
                            {formatItemValue(dims.depth)} {item.unit || "mm"}
                          </strong>
                        </div>
                        {hasMeaningfulCustomerSpec(item.wood_type) ? (
                          <div>
                            <span>Wood</span>
                            <strong>{item.wood_type}</strong>
                          </div>
                        ) : null}

                        {hasMeaningfulCustomerSpec(
                          item.finish_color || item.color,
                        ) ? (
                          <div>
                            <span>Finish</span>
                            <strong>{item.finish_color || item.color}</strong>
                          </div>
                        ) : null}

                        {hasMeaningfulCustomerSpec(item.door_style) ? (
                          <div>
                            <span>Door style</span>
                            <strong>{item.door_style}</strong>
                          </div>
                        ) : null}

                        {hasMeaningfulCustomerSpec(item.hardware) ? (
                          <div>
                            <span>Hardware</span>
                            <strong>{item.hardware}</strong>
                          </div>
                        ) : null}
                      </div>

                      {item.comments ? (
                        <div className="custom-final-review-note">
                          <span>Project notes</span>
                          <p>{item.comments}</p>
                        </div>
                      ) : null}

                      {referenceCount > 0 ? (
                        <div className="custom-final-review-files">
                          {referenceCount} reference file
                          {referenceCount !== 1 ? "s" : ""} attached
                        </div>
                      ) : null}

                      <div className="custom-final-review-rule">
                        <strong>One design per request.</strong> The quantity
                        above applies to this same design. Different designs are
                        submitted as separate custom requests.
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">1</div>
              <h3>Contact Information</h3>
            </div>

            <div className="checkout-section-body">
              <div className="form-grid">
                <div className="form-field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    placeholder="Juan dela Cruz"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    placeholder="09XXXXXXXXX"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </div>

                {hasDefaultAddress && (
                  <div className="form-field full">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          position: "relative",
                          display: "inline-flex",
                          width: 18,
                          height: 18,
                          flexShrink: 0,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={useDefaultAddress}
                          onChange={(e) =>
                            handleToggleDefaultAddress(e.target.checked)
                          }
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            margin: 0,
                            padding: 0,
                            opacity: 0,
                            cursor: "pointer",
                          }}
                        />
                        <span
                          aria-hidden="true"
                          style={{
                            width: 18,
                            height: 18,
                            boxSizing: "border-box",
                            borderRadius: 4,
                            border: useDefaultAddress
                              ? "2px solid #1d4ed8"
                              : "2px solid #999",
                            background: useDefaultAddress ? "#1d4ed8" : "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            pointerEvents: "none",
                          }}
                        >
                          {useDefaultAddress && (
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                      </span>
                      Use my default delivery address
                    </label>

                    {useDefaultAddress && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#444",
                          marginTop: 6,
                          paddingLeft: 26,
                        }}
                      >
                        📍 {user?.address}
                        {!hasDefaultPin && (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 12.5,
                              color: "#b91c1c",
                              fontWeight: 600,
                            }}
                          >
                            Your default address has no saved map pin. Location
                            pin unavailable — please select a location on the
                            map below to continue.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="form-field full">
                  <LocationPicker
                    key={`custom-checkout-location-${locationPickerKey}`}
                    label={
                      useDefaultAddress
                        ? "Default Delivery Location"
                        : "Project / Delivery Address"
                    }
                    addressValue={form.delivery_address}
                    onAddressChange={handleAddressInputChange}
                    value={deliveryPin}
                    onChange={handlePinChange}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">2</div>
              <h3>Additional Notes</h3>
            </div>

            <div className="checkout-section-body">
              <div className="form-field">
                <textarea
                  className="order-notes"
                  rows={3}
                  placeholder="Any other instructions or information for our team…"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="wisdom-custom-request-summary-column-v14">
          <button
            type="button"
            className="wisdom-custom-request-back-nav-v15"
            onClick={() => navigate("/custom-cart")}
          >
            {"\u2190"} Back to Custom Designs
          </button>

          <div className="checkout-summary">
            <div className="checkout-summary-header">
              <h3>Custom Request Summary</h3>
            </div>

            <div className="checkout-summary-items">
              {checkoutItems.map((item) => (
                <div key={item.key} className="checkout-summary-item">
                  <div>
                    <div className="checkout-summary-item-name">
                      {item.base_blueprint_title || item.product_name}
                    </div>
                    <div className="checkout-summary-item-qty">
                      Custom design • Qty{" "}
                      {Math.max(1, Number(item.quantity || 1))}
                    </div>
                  </div>

                  <div
                    className="checkout-summary-item-price"
                    style={{ color: "#aaa", fontSize: 11 }}
                  >
                    Quotation pending
                  </div>
                </div>
              ))}
            </div>

            <div className="checkout-summary-totals">
              <div className="summary-row">
                <span>Project price</span>
                <span style={{ color: "#D2691E", fontWeight: 700 }}>
                  To be quoted by our team
                </span>
              </div>

              <p className="summary-note" style={{ marginTop: 10 }}>
                Your design will be reviewed before the quotation and payment
                are confirmed.
              </p>
            </div>

            <div
              className={`custom-final-review-confirm ${
                reviewConfirmed ? "is-confirmed" : ""
              }`}
            >
              <label>
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  onChange={(event) => {
                    setReviewConfirmed(event.target.checked);
                    if (event.target.checked) setError("");
                  }}
                />
                <span>
                  <strong>I reviewed this design.</strong>
                  <p>
                    The design,specifications, and quantity shown above are
                    correct for this custom request.
                  </p>
                </span>
              </label>
            </div>

            {checkoutNote && (
              <div
                style={{
                  background: "#fefce8",
                  border: "1px solid #fde047",
                  padding: "16px 18px",
                  borderRadius: "8px",
                  margin: "0 20px 20px",
                  fontSize: "13px",
                  color: "#a16207",
                  lineHeight: "1.5",
                }}
              >
                <strong>📌 Important Note:</strong>
                <br />
                <span style={{ whiteSpace: "pre-wrap" }}>{checkoutNote}</span>
              </div>
            )}

            <button
              className="place-order-btn"
              onClick={handleSubmit}
              disabled={loading || !checkoutItems.length || !reviewConfirmed}
            >
              {loading ? (
                "Submitting…"
              ) : (
                <>
                  <Scissors size={16} /> Submit for Quotation
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatItemValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
