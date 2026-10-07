import { useState, useRef, useEffect } from "react";
import api, { buildAssetUrl } from "../../services/api";
import {
  User,
  Mail,
  Phone,
  Lock,
  Camera,
  Check,
  Pencil,
  Eye,
  EyeOff,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import "./profile.css";
import useAuthStore from "../../store/authStore";
import LocationPicker from "../../components/LocationPicker";

const MAX_NAME_LENGTH = 50;
const MAX_ADDRESS_LENGTH = 500;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 72;
const OTP_LENGTH = 6;
import {
  MotionFeedbackOverlay,
  getMotionFeedbackDurations,
} from "../../components/MotionFeedbackOverlay";

/* ── Password strength helper ── */
const getStrength = (pw) => {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const labels = ["", "Very Weak", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] };
};

const StrengthBar = ({ password }) => {
  const { score, label } = getStrength(password);
  const colors = ["", "weak", "weak", "fair", "good", "strong"];
  return (
    <div className="password-strength">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`strength-bar ${score >= i ? `filled-${colors[score]}` : ""}`}
        />
      ))}
      <span className="strength-label">{label}</span>
    </div>
  );
};

/* ── Alert ── */
const Alert = ({ type, msg }) =>
  msg ? (
    <div className={`alert alert-${type}`} style={{ marginBottom: 14 }}>
      {msg}
    </div>
  ) : null;

const getInlineErrorInputStyle = (hasError, extra = {}) =>
  hasError
    ? {
        ...extra,
        border: "1px solid #dc2626",
        boxShadow: "0 0 0 1px #dc2626",
      }
    : extra;

const InlineFieldError = ({ id, message }) =>
  message ? (
    <span
      id={id}
      role="alert"
      style={{
        display: "block",
        color: "#b91c1c",
        fontSize: 11,
        lineHeight: 1.2,
        whiteSpace: "normal",
        wordWrap: "break-word",
      }}
    >
      {message}
    </span>
  ) : null;

/* ── Avatar URL builder ──
   Backend currently stores only the bare filename, but this stays
   defensive in case a row ever holds "/uploads/avatars/filename" or
   a full URL instead. Reuses buildAssetUrl() so the domain always
   matches whatever the app is actually calling. */
const getAvatarUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^(https?:|data:|blob:)/i.test(raw)) {
    return buildAssetUrl(raw);
  }

  const cleaned = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  const withPrefix = cleaned.startsWith("uploads/avatars/")
    ? `/${cleaned}`
    : `/uploads/avatars/${cleaned}`;

  return buildAssetUrl(withPrefix);
};

// Intelligently splits the database name for the two textboxes
const parseName = (fullName) => {
  if (!fullName) return { firstName: "", lastName: "" };

  if (fullName.includes(",")) {
    const [last, ...firsts] = fullName.split(",");
    return { lastName: last.trim(), firstName: firsts.join(",").trim() };
  }

  const parts = fullName.trim().split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  const last = parts.pop();
  const first = parts.join(" ");
  return { firstName: first, lastName: last };
};

// ─── THE NEW SKELETON COMPONENT ───
function ProfileSkeleton() {
  return (
    <div className="profile-layout">
      <div className="profile-content">
        {/* Avatar Skeleton */}
        <div className="profile-section">
          <div className="profile-section-header">
            <div
              className="profile-skeleton-pulse"
              style={{ height: "20px", width: "160px", borderRadius: "4px" }}
            />
          </div>
          <div className="profile-section-body">
            <div className="avatar-upload-area">
              <div
                className="profile-skeleton-pulse"
                style={{
                  width: "96px",
                  height: "96px",
                  borderRadius: "50%",
                  flexShrink: 0,
                }}
              />
              <div
                className="avatar-upload-info"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div
                  className="profile-skeleton-pulse"
                  style={{
                    height: "14px",
                    width: "100%",
                    maxWidth: "320px",
                    borderRadius: "4px",
                  }}
                />
                <div
                  className="profile-skeleton-pulse"
                  style={{
                    height: "40px",
                    width: "135px",
                    borderRadius: "0",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 5 Generic Section Skeletons (Basic Info, Address, Email, Phone, Password) */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div className="profile-section" key={i}>
            <div
              className="profile-section-header"
              style={{ justifyContent: "space-between" }}
            >
              <div
                className="profile-skeleton-pulse"
                style={{
                  height: "20px",
                  width: "180px",
                  borderRadius: "4px",
                }}
              />
              <div
                className="profile-skeleton-pulse"
                style={{ height: "34px", width: "75px", borderRadius: "0" }}
              />
            </div>
            <div className="profile-section-body">
              <div className="field-display">
                <div className="field-row">
                  <div
                    className="profile-skeleton-pulse"
                    style={{
                      height: "11px",
                      width: "80px",
                      borderRadius: "4px",
                      marginBottom: "8px",
                    }}
                  />
                  <div
                    className="profile-skeleton-pulse"
                    style={{
                      height: "18px",
                      width: "160px",
                      borderRadius: "4px",
                    }}
                  />
                </div>
                <div className="field-row">
                  <div
                    className="profile-skeleton-pulse"
                    style={{
                      height: "11px",
                      width: "80px",
                      borderRadius: "4px",
                      marginBottom: "8px",
                    }}
                  />
                  <div
                    className="profile-skeleton-pulse"
                    style={{
                      height: "18px",
                      width: "160px",
                      borderRadius: "4px",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProfileSettings() {
  const { user, setUser } = useAuthStore();
  const fileRef = useRef(null);

  /* ─ State ─ */
  const [avatarPreview, setAvatarPreview] = useState(() =>
    getAvatarUrl(user?.profile_photo),
  );
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarMsg, setAvatarMsg] = useState({ type: "", text: "" });
  const [avatarLoading, setAvatarLoading] = useState(false);

  /* Basic info — Name (independent of address) */
  const [editName, setEditName] = useState(false);
  const [nameForm, setNameForm] = useState(parseName(user?.name));
  const [nameMsg, setNameMsg] = useState({ type: "", text: "" });
  const [nameLoading, setNameLoading] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});

  /* Default Delivery Address (independent of name) */
  const [editAddress, setEditAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    address: user?.address || "",
    address_lat: user?.address_lat ?? null,
    address_lng: user?.address_lng ?? null,
  });
  const [addressMsg, setAddressMsg] = useState({ type: "", text: "" });
  const [addressLoading, setAddressLoading] = useState(false);

  /* Email change */
  const [editEmail, setEditEmail] = useState(false);
  const [currentEmailOtp, setCurrentEmailOtp] = useState("");
  const [emailAuthMethod, setEmailAuthMethod] = useState("email");
  const [newEmail, setNewEmail] = useState("");
  const [newEmailOtp, setNewEmailOtp] = useState("");
  const [emailStep, setEmailStep] = useState(1);
  const [emailMsg, setEmailMsg] = useState({ type: "", text: "" });
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);

  /* Phone change (with OTP verification) */
  const [editPhone, setEditPhone] = useState(false);
  const [phoneStep, setPhoneStep] = useState(1);
  const [newPhone, setNewPhone] = useState(
    user?.phone ? user.phone.replace(/^(\+?63|0)/, "") : "",
  );
  const [currentPhoneOtp, setCurrentPhoneOtp] = useState("");
  const [phoneAuthMethod, setPhoneAuthMethod] = useState("sms");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneMsg, setPhoneMsg] = useState({ type: "", text: "" });
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneCooldown, setPhoneCooldown] = useState(0);
  const [showPhone, setShowPhone] = useState(false);

  /* Password change */
  const [editPass, setEditPass] = useState(false);
  const [passForm, setPassForm] = useState({
    current: "",
    newPass: "",
    confirm: "",
  });
  const [passOtp, setPassOtp] = useState("");
  const [passStep, setPassStep] = useState(1);
  const [passMsg, setPassMsg] = useState({ type: "", text: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [showPass, setShowPass] = useState({
    current: false,
    newPass: false,
    confirm: false,
  });
  const [passCooldown, setPassCooldown] = useState(0);

  /* Cooldown timer */
  useEffect(() => {
    const timers = [];
    if (emailCooldown > 0)
      timers.push(setTimeout(() => setEmailCooldown((c) => c - 1), 1000));
    if (passCooldown > 0)
      timers.push(setTimeout(() => setPassCooldown((c) => c - 1), 1000));
    if (phoneCooldown > 0)
      timers.push(setTimeout(() => setPhoneCooldown((c) => c - 1), 1000));
    return () => timers.forEach(clearTimeout);
  }, [emailCooldown, passCooldown, phoneCooldown]);

  /* ── Fullscreen Overlay State ── */
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("loading");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  /* ── Page Loading State ── */
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    // Show the skeleton for a fraction of a second to ensure smooth visual transition
    const timer = setTimeout(() => {
      setPageLoading(false);
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  if (pageLoading || !user) {
    return (
      <div>
        <div className="page-hero profile-page-hero">
          <h1>Profile Settings</h1>
          <p>Manage your account information and security</p>
        </div>
        <ProfileSkeleton />
      </div>
    );
  }

  /* ════ AVATAR ════ */
  // WISDOM CUSTOMER AVATAR DESKTOP VALIDATION V1
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const allowedExtensions = new Set([
      ".jpg",
      ".jpeg",
      ".jfif",
      ".png",
      ".webp",
    ]);
    const maxBytes = 2 * 1024 * 1024;

    const fileName = String(file.name || "").toLowerCase();
    const extension = fileName.includes(".")
      ? `.${fileName.split(".").pop()}`
      : "";

    if (
      !allowedMimeTypes.has(String(file.type || "").toLowerCase()) ||
      !allowedExtensions.has(extension)
    ) {
      setAvatarFile(null);
      setAvatarMsg({
        type: "error",
        text: "Choose a JPG, JPEG, JFIF, PNG, or WEBP image.",
      });
      e.target.value = "";
      return;
    }

    if (file.size > maxBytes) {
      setAvatarFile(null);
      setAvatarMsg({
        type: "error",
        text: "Profile picture must be 2MB or smaller.",
      });
      e.target.value = "";
      return;
    }

    setAvatarMsg({ type: "", text: "" });
    setAvatarFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const saveAvatar = async (e) => {
    if (e) e.preventDefault();
    if (!avatarFile) return;
    setAvatarLoading(true);
    setAvatarMsg({ type: "", text: "" });

    setFeedbackOpen(true);
    setFeedbackStatus("loading");
    setFeedbackMsg("Uploading photo...");

    try {
      const fd = new FormData();
      fd.append("avatar", avatarFile);
      const res = await api.post("/customer/profile/avatar", fd);
      const savedProfilePhoto = res.data.profile_photo;

      if (user) {
        setUser({ ...user, profile_photo: savedProfilePhoto });
      }
      setAvatarPreview(getAvatarUrl(savedProfilePhoto));

      setFeedbackStatus("success");
      setFeedbackMsg("Profile picture updated!");

      const durations = getMotionFeedbackDurations();
      setTimeout(() => {
        setFeedbackOpen(false);
        setAvatarFile(null);
      }, durations.success);
    } catch (err) {
      setFeedbackOpen(false);
      console.error("FRONTEND CRASH LOG:", err);
      setAvatarMsg({
        type: "error",
        text:
          err.response?.data?.message ||
          "Upload failed. Check browser console.",
      });
    } finally {
      setAvatarLoading(false);
    }
  };

  /* ════ NAME ════ */
  const saveName = async (e) => {
    if (e) e.preventDefault();

    const trimmedFirst = (nameForm.firstName || "").trim();
    const trimmedLast = (nameForm.lastName || "").trim();

    setFieldErrors((prev) => ({
      ...prev,
      firstName: "",
      lastName: "",
    }));

    if (!trimmedFirst || !trimmedLast) {
      setFieldErrors((prev) => ({
        ...prev,
        firstName: trimmedFirst ? "" : "First Name is required.",
        lastName: trimmedLast ? "" : "Last Name is required.",
      }));
      return;
    }

    const nameRegex = /^[\p{L}]+(?:[ '\-][\p{L}]+)*$/u;

    if (!nameRegex.test(trimmedFirst)) {
      setFieldErrors((prev) => ({
        ...prev,
        firstName:
          "First Name may contain letters, spaces, hyphens, and apostrophes only.",
      }));
      return;
    }

    if (!nameRegex.test(trimmedLast)) {
      setFieldErrors((prev) => ({
        ...prev,
        lastName:
          "Last Name may contain letters, spaces, hyphens, and apostrophes only.",
      }));
      return;
    }

    const combinedName = `${trimmedFirst} ${trimmedLast}`.trim();
    const displayName = combinedName;

    setNameLoading(true);
    setNameMsg({ type: "", text: "" });

    setFeedbackOpen(true);
    setFeedbackStatus("loading");
    setFeedbackMsg("Updating profile...");

    try {
      await api.put("/customer/profile/basic", {
        name: combinedName,
        address: user?.address || "",
        address_lat: user?.address_lat ?? null,
        address_lng: user?.address_lng ?? null,
      });
      setUser((prev) => ({ ...prev, name: combinedName }));

      setFeedbackStatus("success");
      setFeedbackMsg("Profile updated successfully!");

      const durations = getMotionFeedbackDurations();
      setTimeout(() => {
        setFeedbackOpen(false);
        setEditName(false);
      }, durations.success);
    } catch (err) {
      setFeedbackOpen(false);
      setNameMsg({
        type: "error",
        text: err.response?.data?.message || "Update failed.",
      });
    } finally {
      setNameLoading(false);
    }
  };

  /* ════ DEFAULT DELIVERY ADDRESS ════ */
  const saveDefaultAddress = async (e) => {
    if (e) e.preventDefault();
    const trimmedAddress = (addressForm.address || "").trim();
    const hasLat =
      addressForm.address_lat !== null &&
      addressForm.address_lat !== undefined &&
      addressForm.address_lat !== "";
    const hasLng =
      addressForm.address_lng !== null &&
      addressForm.address_lng !== undefined &&
      addressForm.address_lng !== "";

    setFieldErrors((prev) => ({
      ...prev,
      address: "",
      address_pin: "",
    }));

    if (!trimmedAddress) {
      setFieldErrors((prev) => ({
        ...prev,
        address: "Address is required.",
      }));
      return;
    }

    if (hasLat !== hasLng) {
      setFieldErrors((prev) => ({
        ...prev,
        address_pin: "Both latitude and longitude must be set together.",
      }));
      return;
    }

    if (!hasLat || !hasLng) {
      setFieldErrors((prev) => ({
        ...prev,
        address_pin: "Please set a map pin for your default delivery address.",
      }));
      return;
    }

    const latNum = Number(addressForm.address_lat);
    const lngNum = Number(addressForm.address_lng);

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      setFieldErrors((prev) => ({
        ...prev,
        address_pin: "Invalid map pin. Please set the pin again.",
      }));
      return;
    }

    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      setFieldErrors((prev) => ({
        ...prev,
        address_pin: "Invalid map pin coordinates. Please set the pin again.",
      }));
      return;
    }

    setAddressLoading(true);
    setAddressMsg({ type: "", text: "" });

    setFeedbackOpen(true);
    setFeedbackStatus("loading");
    setFeedbackMsg("Saving address...");

    try {
      await api.put("/customer/profile/basic", {
        name: user?.name || "",
        address: trimmedAddress,
        address_lat: latNum,
        address_lng: lngNum,
      });
      setUser((prev) => ({
        ...prev,
        address: trimmedAddress,
        address_lat: latNum,
        address_lng: lngNum,
      }));

      setFeedbackStatus("success");
      setFeedbackMsg("Default delivery address saved!");

      const durations = getMotionFeedbackDurations();
      setTimeout(() => {
        setFeedbackOpen(false);
        setEditAddress(false);
      }, durations.success);
    } catch (err) {
      setFeedbackOpen(false);
      setAddressMsg({
        type: "error",
        text: err.response?.data?.message || "Update failed.",
      });
    } finally {
      setAddressLoading(false);
    }
  };

  /* ════ EMAIL CHANGE ════ */

  // STEP 1: Request OTP to Current Email (or Phone)
  const requestCurrentEmailAuth = async (method = "email") => {
    setEmailLoading(true);
    setEmailMsg({ type: "", text: "" });
    try {
      await api.post("/customer/profile/request-current-email-auth", {
        method,
      });
      setEmailAuthMethod(method);
      setEmailStep(2);
      setEmailCooldown(60);
      setEmailMsg({
        type: "success",
        text: `Security code sent to your ${method === "email" ? "current email" : "registered phone"}.`,
      });
    } catch (err) {
      setEmailMsg({
        type: "error",
        text: err.response?.data?.message || "Failed to send OTP.",
      });
    } finally {
      setEmailLoading(false);
    }
  };

  // STEP 2: Verify Identity OTP
  const verifyCurrentEmailAuth = async () => {
    if (!currentEmailOtp.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        currentEmailOtp: "Enter the OTP.",
      }));
      return;
    }

    setFieldErrors((prev) => ({
      ...prev,
      currentEmailOtp: "",
    }));

    setEmailLoading(true);
    try {
      await api.post("/customer/profile/verify-current-email-auth", {
        otp: currentEmailOtp,
      });
      setEmailMsg({
        type: "success",
        text: "Identity verified. Enter your new email address.",
      });
      setEmailStep(3);
      setCurrentEmailOtp("");
    } catch (err) {
      setFieldErrors((prev) => ({
        ...prev,
        currentEmailOtp: err.response?.data?.message || "Invalid OTP.",
      }));
    } finally {
      setEmailLoading(false);
    }
  };

  // STEP 3: Request OTP to New Email
  const requestNewEmailOtp = async () => {
    const trimmedEmail = newEmail.trim().toLowerCase();

    setFieldErrors((prev) => ({
      ...prev,
      newEmail: "",
    }));

    if (!trimmedEmail) {
      setFieldErrors((prev) => ({
        ...prev,
        newEmail: "Enter a new email address.",
      }));
      return;
    }

    if (trimmedEmail.length > MAX_EMAIL_LENGTH) {
      setFieldErrors((prev) => ({
        ...prev,
        newEmail: `Email address must not exceed ${MAX_EMAIL_LENGTH} characters.`,
      }));
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(trimmedEmail)) {
      setFieldErrors((prev) => ({
        ...prev,
        newEmail: "Enter a valid email address.",
      }));
      return;
    }

    setEmailLoading(true);
    setEmailMsg({ type: "", text: "" });
    try {
      await api.post("/customer/profile/request-email-change", {
        new_email: trimmedEmail,
      });
      setEmailStep(4);
      setEmailCooldown(60);
      setEmailMsg({
        type: "success",
        text: `Verification OTP sent to ${newEmail}`,
      });
    } catch (err) {
      setEmailMsg({
        type: "error",
        text: err.response?.data?.message || "Failed to send OTP.",
      });
    } finally {
      setEmailLoading(false);
    }
  };

  // STEP 4: Verify New Email OTP & Save
  const verifyNewEmailOtp = async (e) => {
    if (e) e.preventDefault();

    const normalizedOtp = newEmailOtp.trim();

    if (!/^\d{6}$/.test(normalizedOtp)) {
      setFieldErrors((prev) => ({
        ...prev,
        newEmailOtp: `OTP must be exactly ${OTP_LENGTH} digits.`,
      }));
      return;
    }

    setFieldErrors((prev) => ({
      ...prev,
      newEmailOtp: "",
    }));

    setEmailLoading(true);
    setFeedbackOpen(true);
    setFeedbackStatus("loading");
    setFeedbackMsg("Updating email...");

    try {
      await api.post("/customer/profile/verify-email-change", {
        otp: normalizedOtp,
      });
      setUser((prev) => ({ ...prev, email: newEmail }));

      setFeedbackStatus("success");
      setFeedbackMsg("Email updated successfully!");

      const durations = getMotionFeedbackDurations();
      setTimeout(() => {
        setFeedbackOpen(false);
        setEditEmail(false);
        setEmailStep(1);
        setNewEmail("");
        setNewEmailOtp("");
      }, durations.success);
    } catch (err) {
      setFeedbackOpen(false);
      setFieldErrors((prev) => ({
        ...prev,
        newEmailOtp: err.response?.data?.message || "Invalid OTP.",
      }));
    } finally {
      setEmailLoading(false);
    }
  };

  /* ════ PHONE CHANGE (PHASE 1: IDENTITY VERIFICATION) ════ */
  const requestCurrentPhoneAuth = async (method = "sms") => {
    setPhoneLoading(true);
    setPhoneMsg({ type: "", text: "" });
    try {
      await api.post("/customer/profile/request-current-phone-auth", {
        method,
      });
      setPhoneAuthMethod(method);
      setPhoneStep(2);
      setPhoneCooldown(60);
      setPhoneMsg({
        type: "success",
        text: `Security code sent to your ${method === "sms" ? "current phone" : "email"}.`,
      });
    } catch (err) {
      setPhoneMsg({
        type: "error",
        text:
          err.response?.data?.message || "Failed to send authorization code.",
      });
    } finally {
      setPhoneLoading(false);
    }
  };

  const verifyCurrentPhoneAuth = async () => {
    if (!currentPhoneOtp.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        currentPhoneOtp: "Enter the OTP code.",
      }));
      return;
    }

    setFieldErrors((prev) => ({
      ...prev,
      currentPhoneOtp: "",
    }));

    setPhoneLoading(true);
    try {
      await api.post("/customer/profile/verify-current-phone-auth", {
        otp: currentPhoneOtp,
      });
      setPhoneStep(3); // Identity verified, move to entering the new number!
      setPhoneMsg({
        type: "success",
        text: "Identity verified. Enter your new phone number.",
      });
      setCurrentPhoneOtp("");
    } catch (err) {
      setFieldErrors((prev) => ({
        ...prev,
        currentPhoneOtp: err.response?.data?.message || "Invalid OTP code.",
      }));
    } finally {
      setPhoneLoading(false);
    }
  };

  /* ════ PHONE CHANGE (OTP VERIFIED) ════ */
  const requestPhoneOtp = async (formattedPhone) => {
    const phoneToSend =
      typeof formattedPhone === "string" ? formattedPhone : "0" + newPhone;

    setFieldErrors((prev) => ({
      ...prev,
      newPhone: "",
    }));

    if (!phoneToSend || phoneToSend.length !== 11) {
      setFieldErrors((prev) => ({
        ...prev,
        newPhone: "Enter a valid 10-digit phone number.",
      }));
      return;
    }

    if (phoneToSend === user?.phone) {
      setFieldErrors((prev) => ({
        ...prev,
        newPhone:
          "New phone number must be different from your current number.",
      }));
      return;
    }

    setPhoneLoading(true);
    setPhoneMsg({ type: "", text: "" });
    try {
      await api.post("/customer/profile/request-phone-change", {
        new_phone: phoneToSend,
      });
      setPhoneStep(4);
      setPhoneCooldown(60);
      setPhoneMsg({
        type: "success",
        text: `Verification OTP sent to +63 ${newPhone}`,
      });
    } catch (err) {
      setPhoneMsg({
        type: "error",
        text:
          err.response?.data?.message || "Failed to send verification code.",
      });
    } finally {
      setPhoneLoading(false);
    }
  };

  const verifyPhoneOtp = async (formattedPhone, e) => {
    if (e) e.preventDefault();

    const normalizedOtp = phoneOtp.trim();

    if (!/^\d{6}$/.test(normalizedOtp)) {
      setFieldErrors((prev) => ({
        ...prev,
        phoneOtp: `OTP must be exactly ${OTP_LENGTH} digits.`,
      }));
      return;
    }

    setFieldErrors((prev) => ({
      ...prev,
      phoneOtp: "",
    }));

    const phoneToSend =
      typeof formattedPhone === "string" ? formattedPhone : "0" + newPhone;

    setPhoneLoading(true);
    setFeedbackOpen(true);
    setFeedbackStatus("loading");
    setFeedbackMsg("Updating phone number...");

    try {
      const res = await api.post("/customer/profile/verify-phone-change", {
        otp: normalizedOtp,
        new_phone: phoneToSend,
      });
      setUser({ ...user, phone: res.data.phone });

      setFeedbackStatus("success");
      setFeedbackMsg("Phone number updated successfully!");

      const durations = getMotionFeedbackDurations();
      setTimeout(() => {
        setFeedbackOpen(false);
        setEditPhone(false);
        setPhoneStep(1);
        setPhoneOtp("");
      }, durations.success);
    } catch (err) {
      setFeedbackOpen(false);
      setFieldErrors((prev) => ({
        ...prev,
        phoneOtp: err.response?.data?.message || "Invalid OTP code.",
      }));
    } finally {
      setPhoneLoading(false);
    }
  };

  /* ════ PASSWORD CHANGE ════ */
  const requestPassOtp = async () => {
    // STEP 1: Only check current password to trigger the email
    if (!passForm.current) {
      setFieldErrors((prev) => ({
        ...prev,
        currentPassword: "Enter your current password to continue.",
      }));
      return;
    }

    setFieldErrors((prev) => ({
      ...prev,
      currentPassword: "",
    }));

    setPassLoading(true);
    setPassMsg({ type: "", text: "" });
    try {
      await api.post("/customer/profile/request-password-change", {
        current_password: passForm.current,
      });
      setPassStep(2); // Move to OTP and New Password screen
      setPassCooldown(60);
      setPassMsg({
        type: "success",
        text: `Verification OTP sent to ${user?.email}`,
      });
    } catch (err) {
      setPassMsg({
        type: "error",
        text: err.response?.data?.message || "Failed to send OTP.",
      });
    } finally {
      setPassLoading(false);
    }
  };

  const verifyPassOtp = async (e) => {
    if (e) e.preventDefault();
    setFieldErrors((prev) => ({
      ...prev,
      newPass: "",
      confirmPassword: "",
    }));

    if (!passForm.newPass) {
      setFieldErrors((prev) => ({
        ...prev,
        newPass: "Enter a new password.",
      }));
    }

    if (!passForm.confirm) {
      setFieldErrors((prev) => ({
        ...prev,
        confirmPassword: "Please confirm your new password.",
      }));
    }

    if (!passForm.newPass || !passForm.confirm) {
      return;
    }

    if (passForm.newPass !== passForm.confirm) {
      setFieldErrors((prev) => ({
        ...prev,
        confirmPassword: "New passwords do not match.",
      }));
      return;
    }

    if (getStrength(passForm.newPass).score < 5) {
      setFieldErrors((prev) => ({
        ...prev,
        newPass:
          "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.",
      }));
      return;
    }

    setPassLoading(true);
    setFeedbackOpen(true);
    setFeedbackStatus("loading");
    setFeedbackMsg("Saving new password...");

    try {
      await api.post("/customer/profile/verify-password-change", {
        otp: passOtp,
        new_password: passForm.newPass,
      });

      setFeedbackStatus("success");
      setFeedbackMsg("Password changed successfully!");

      const durations = getMotionFeedbackDurations();
      setTimeout(() => {
        setFeedbackOpen(false);
        setEditPass(false);
        setPassStep(1);
        setPassForm({ current: "", newPass: "", confirm: "" });
        setPassOtp("");
      }, durations.success);
    } catch (err) {
      setFeedbackOpen(false);
      setPassMsg({
        type: "error",
        text: err.response?.data?.message || "Invalid OTP or request failed.",
      });
    } finally {
      setPassLoading(false);
    }
  };

  /* ── helper ── */
  const cancelSection = (section) => {
    if (section === "email") {
      setEditEmail(false);
      setEmailStep(1);
      setNewEmail("");
      setCurrentEmailOtp("");
      setNewEmailOtp("");
      setEmailMsg({ type: "", text: "" });
      setFieldErrors({});
    }
    if (section === "phone") {
      setEditPhone(false);
      setPhoneStep(1);
      setNewPhone(user?.phone || "");
      setCurrentPhoneOtp("");
      setPhoneOtp("");
      setPhoneMsg({ type: "", text: "" });
      setFieldErrors({});
    }
    if (section === "pass") {
      setEditPass(false);
      setPassStep(1);
      setPassForm({ current: "", newPass: "", confirm: "" });
      setPassOtp("");
      setPassMsg({ type: "", text: "" });
      setFieldErrors({});
    }
  };

  const initials = user?.name?.charAt(0).toUpperCase() || "?";

  // Check if Name has changed
  const initialName = parseName(user?.name);
  const isNameChanged =
    nameForm.firstName !== initialName.firstName ||
    nameForm.lastName !== initialName.lastName;

  // Check if Address has changed
  const isAddressChanged =
    addressForm.address !== (user?.address || "") ||
    addressForm.address_lat !== (user?.address_lat ?? null) ||
    addressForm.address_lng !== (user?.address_lng ?? null);

  return (
    <div>
      <div className="page-hero profile-page-hero">
        <h1>Profile Settings</h1>
        <p>Manage your account information and security</p>
      </div>

      <div className="profile-layout">
        <div className="profile-content">
          {/* ══ AVATAR ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>Profile Picture</h3>
            </div>
            <div className="profile-section-body">
              <Alert type={avatarMsg.type} msg={avatarMsg.text} />
              <div className="avatar-upload-area">
                <div className="avatar-preview">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="preview"
                      onError={() => setAvatarPreview(null)}
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="avatar-upload-info">
                  <p>
                    Upload a photo to personalize your account. JPG, JPEG, JFIF,
                    PNG, or WEBP, max 2MB.
                  </p>
                  <button
                    className="avatar-upload-btn"
                    onClick={() => fileRef.current?.click()}
                  >
                    Choose Photo
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jfif"
                    style={{ display: "none" }}
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>
              {avatarFile && (
                <div className="profile-form-actions" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveAvatar}
                    disabled={avatarLoading}
                  >
                    {avatarLoading ? "Uploading…" : "Save Photo"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarPreview(getAvatarUrl(user?.profile_photo));
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ══ BASIC INFO (Name) ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3> Basic Information</h3>
              {!editName && (
                <button
                  className="edit-toggle"
                  onClick={() => setEditName(true)}
                >
                  Edit
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={nameMsg.type} msg={nameMsg.text} />
              {editName ? (
                <div className="profile-form">
                  <div className="form-row">
                    <div className="form-field">
                      <label>First Name</label>
                      <input
                        type="text"
                        value={nameForm.firstName}
                        aria-invalid={Boolean(fieldErrors.firstName)}
                        aria-describedby={
                          fieldErrors.firstName
                            ? "profile-first-name-error"
                            : undefined
                        }
                        onChange={(e) => {
                          const value = e.target.value;

                          setNameForm((p) => ({
                            ...p,
                            firstName: value,
                          }));

                          setFieldErrors((prev) => ({
                            ...prev,
                            firstName: "",
                          }));
                        }}
                        placeholder="First Name"
                        maxLength={MAX_NAME_LENGTH}
                        style={getInlineErrorInputStyle(
                          Boolean(fieldErrors.firstName),
                        )}
                      />

                      <InlineFieldError
                        id="profile-first-name-error"
                        message={fieldErrors.firstName}
                      />
                    </div>
                    <div className="form-field">
                      <label>Last Name</label>
                      <input
                        type="text"
                        value={nameForm.lastName}
                        aria-invalid={Boolean(fieldErrors.lastName)}
                        aria-describedby={
                          fieldErrors.lastName
                            ? "profile-last-name-error"
                            : undefined
                        }
                        onChange={(e) => {
                          const value = e.target.value;

                          setNameForm((p) => ({
                            ...p,
                            lastName: value,
                          }));

                          setFieldErrors((prev) => ({
                            ...prev,
                            lastName: "",
                          }));
                        }}
                        placeholder="Last Name"
                        maxLength={MAX_NAME_LENGTH}
                        style={getInlineErrorInputStyle(
                          Boolean(fieldErrors.lastName),
                        )}
                      />

                      <InlineFieldError
                        id="profile-last-name-error"
                        message={fieldErrors.lastName}
                      />
                    </div>
                  </div>
                  <div className="profile-form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={saveName}
                      disabled={nameLoading || !isNameChanged}
                    >
                      {nameLoading ? (
                        <>
                          <svg
                            className="spinner-icon"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Saving…
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditName(false);
                        setNameForm(parseName(user?.name));
                        setNameMsg({ type: "", text: "" });
                        setFieldErrors({});
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="field-display">
                  <div className="field-row">
                    <label>First Name</label>
                    <span
                      className={
                        parseName(user?.name).firstName
                          ? "field-val"
                          : "field-empty"
                      }
                    >
                      {parseName(user?.name).firstName || "Not set"}
                    </span>
                  </div>
                  <div className="field-row">
                    <label>Last Name</label>
                    <span
                      className={
                        parseName(user?.name).lastName
                          ? "field-val"
                          : "field-empty"
                      }
                    >
                      {parseName(user?.name).lastName || "Not set"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══ DEFAULT DELIVERY ADDRESS ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>Default Delivery Address</h3>
              {!editAddress && (
                <button
                  className="edit-toggle"
                  onClick={() => setEditAddress(true)}
                >
                  Edit
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={addressMsg.type} msg={addressMsg.text} />
              {editAddress ? (
                <div className="profile-form">
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#52525b",
                      marginBottom: "16px",
                    }}
                  >
                    This address and map pin will be used as your default
                    delivery address during checkout.
                  </p>
                  <div
                    className="form-field full"
                    style={{
                      outline:
                        fieldErrors.address || fieldErrors.address_pin
                          ? "1px solid #dc2626"
                          : undefined,
                      outlineOffset: 2,
                      borderRadius: 4,
                    }}
                  >
                    <LocationPicker
                      label="Address"
                      addressValue={addressForm.address}
                      maxLength={MAX_ADDRESS_LENGTH}
                      onAddressChange={(text) => {
                        setAddressForm((p) => ({ ...p, address: text }));

                        setFieldErrors((prev) => ({
                          ...prev,
                          address: text.trim() ? "" : "Address is required.",
                        }));
                      }}
                      value={
                        addressForm.address_lat != null &&
                        addressForm.address_lng != null
                          ? {
                              lat: Number(addressForm.address_lat),
                              lng: Number(addressForm.address_lng),
                            }
                          : null
                      }
                      onChange={(latlng) => {
                        setAddressForm((p) => ({
                          ...p,
                          address_lat: latlng?.lat ?? null,
                          address_lng: latlng?.lng ?? null,
                        }));

                        setFieldErrors((prev) => ({
                          ...prev,
                          address_pin: latlng
                            ? ""
                            : "Please set a map pin for your default delivery address.",
                        }));
                      }}
                    />

                    <InlineFieldError
                      id="profile-address-error"
                      message={fieldErrors.address}
                    />

                    <InlineFieldError
                      id="profile-address-pin-error"
                      message={fieldErrors.address_pin}
                    />
                  </div>
                  <div className="profile-form-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={saveDefaultAddress}
                      disabled={addressLoading || !isAddressChanged}
                    >
                      {addressLoading ? (
                        "Saving…"
                      ) : (
                        <>Set as Default Delivery Address</>
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditAddress(false);
                        setAddressForm({
                          address: user?.address || "",
                          address_lat: user?.address_lat ?? null,
                          address_lng: user?.address_lng ?? null,
                        });
                        setAddressMsg({ type: "", text: "" });
                        setFieldErrors({});
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="field-display">
                  <div className="field-row">
                    <label>Address</label>
                    <span
                      className={user?.address ? "field-val" : "field-empty"}
                    >
                      {user?.address || "Not set"}
                    </span>
                  </div>
                  <div className="field-row">
                    <label>Default Pin</label>
                    <span
                      className={
                        user?.address_lat != null && user?.address_lng != null
                          ? "field-val"
                          : "field-empty"
                      }
                    >
                      {user?.address_lat != null && user?.address_lng != null
                        ? ` ${Number(user.address_lat).toFixed(5)}, ${Number(user.address_lng).toFixed(5)}`
                        : "Not set"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══ EMAIL ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>Email Address</h3>
              {!editEmail && (
                <button
                  className="edit-toggle"
                  onClick={() => setEditEmail(true)}
                >
                  Change
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={emailMsg.type} msg={emailMsg.text} />
              {!editEmail ? (
                <div className="field-display">
                  <div className="field-row">
                    <label>Current Email</label>
                    <span className="field-val">{user?.email}</span>
                  </div>
                </div>
              ) : emailStep === 1 ? (
                <div className="profile-form">
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#52525b",
                      marginBottom: "16px",
                    }}
                  >
                    To protect your account, please verify your identity before
                    changing your email address.
                  </p>
                  <div className="form-field" style={{ maxWidth: "380px" }}>
                    <label>Current Email</label>
                    <input type="email" value={user?.email || ""} readOnly />
                  </div>
                  <div className="profile-form-actions">
                    {/* Step 1: Request Current Auth */}
                    <button
                      className="btn btn-primary"
                      onClick={() => requestCurrentEmailAuth("email")}
                      disabled={emailLoading}
                    >
                      {emailLoading ? (
                        <>
                          <svg
                            className="spinner-icon"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Sending…
                        </>
                      ) : (
                        "Send Verification OTP"
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("email")}
                    >
                      Cancel
                    </button>
                  </div>
                  <div style={{ marginTop: "16px" }}>
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#111111",
                        fontSize: "13px",
                        textDecoration: "underline",
                        cursor: "pointer",
                        padding: 0,
                      }}
                      onClick={() => requestCurrentEmailAuth("sms")}
                      disabled={emailLoading}
                    >
                      I lost access to this email
                    </button>
                  </div>
                </div>
              ) : emailStep === 2 ? (
                <div className="verify-step">
                  <h4>Verify Identity</h4>
                  <p>
                    We sent a 6-digit verification code to your{" "}
                    <strong>
                      {emailAuthMethod === "email"
                        ? user?.email
                        : "registered phone"}
                    </strong>
                    . Enter it below to proceed.
                  </p>
                  <div
                    className="otp-input-row"
                    style={{ marginBottom: "20px", maxWidth: "380px" }}
                  >
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <input
                        type="text"
                        maxLength={OTP_LENGTH}
                        placeholder="000000"
                        value={currentEmailOtp}
                        aria-invalid={Boolean(fieldErrors.currentEmailOtp)}
                        aria-describedby={
                          fieldErrors.currentEmailOtp
                            ? "profile-current-email-otp-error"
                            : undefined
                        }
                        onChange={(e) => {
                          setCurrentEmailOtp(e.target.value.replace(/\D/g, ""));

                          setFieldErrors((prev) => ({
                            ...prev,
                            currentEmailOtp: "",
                          }));
                        }}
                        style={getInlineErrorInputStyle(
                          Boolean(fieldErrors.currentEmailOtp),
                        )}
                      />

                      <InlineFieldError
                        id="profile-current-email-otp-error"
                        message={fieldErrors.currentEmailOtp}
                      />
                    </div>

                    <button
                      className="resend-btn"
                      onClick={() => {
                        setEmailCooldown(60);
                        requestCurrentEmailAuth(emailAuthMethod);
                      }}
                      disabled={emailCooldown > 0}
                    >
                      {emailCooldown > 0
                        ? `Resend (${emailCooldown}s)`
                        : "Resend"}
                    </button>
                  </div>
                  <div
                    className="profile-form-actions"
                    style={{ marginTop: 14 }}
                  >
                    {/* Step 2: Verify Current Auth */}
                    <button
                      className="btn btn-primary"
                      onClick={verifyCurrentEmailAuth}
                      disabled={
                        emailLoading || currentEmailOtp.length < OTP_LENGTH
                      }
                    >
                      {emailLoading ? (
                        <>
                          <svg
                            className="spinner-icon"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Verifying…
                        </>
                      ) : (
                        "Verify"
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("email")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : emailStep === 3 ? (
                <div className="profile-form">
                  <div className="form-field">
                    <label>New Email Address</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => {
                        setNewEmail(e.target.value);

                        setFieldErrors((prev) => ({
                          ...prev,
                          newEmail: "",
                        }));
                      }}
                      placeholder="newemail@example.com"
                      maxLength={MAX_EMAIL_LENGTH}
                      aria-invalid={Boolean(fieldErrors.newEmail)}
                      aria-describedby={
                        fieldErrors.newEmail
                          ? "profile-new-email-error"
                          : undefined
                      }
                      style={getInlineErrorInputStyle(
                        Boolean(fieldErrors.newEmail),
                      )}
                    />

                    <InlineFieldError
                      id="profile-new-email-error"
                      message={fieldErrors.newEmail}
                    />
                  </div>
                  <div className="profile-form-actions">
                    {/* Step 3: Request New Email OTP */}
                    <button
                      className="btn btn-primary"
                      onClick={requestNewEmailOtp}
                      disabled={emailLoading || !newEmail.trim()}
                    >
                      {emailLoading ? (
                        <>
                          <svg
                            className="spinner-icon"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Sending…
                        </>
                      ) : (
                        "Send Verification OTP"
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("email")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="verify-step">
                  <h4>Verify New Email</h4>
                  <p>
                    We sent a 6-digit OTP to <strong>{newEmail}</strong>. Enter
                    it below to confirm and save.
                  </p>
                  <div
                    className="otp-input-row"
                    style={{ marginBottom: "20px" }}
                  >
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <input
                        type="text"
                        maxLength={OTP_LENGTH}
                        placeholder="000000"
                        value={newEmailOtp}
                        onChange={(e) => {
                          setNewEmailOtp(e.target.value.replace(/\D/g, ""));

                          setFieldErrors((prev) => ({
                            ...prev,
                            newEmailOtp: "",
                          }));
                        }}
                        aria-invalid={Boolean(fieldErrors.newEmailOtp)}
                        aria-describedby={
                          fieldErrors.newEmailOtp
                            ? "profile-new-email-otp-error"
                            : undefined
                        }
                        style={getInlineErrorInputStyle(
                          Boolean(fieldErrors.newEmailOtp),
                        )}
                      />

                      <InlineFieldError
                        id="profile-new-email-otp-error"
                        message={fieldErrors.newEmailOtp}
                      />
                    </div>

                    <button
                      className="resend-btn"
                      onClick={() => {
                        setEmailCooldown(60);
                        requestNewEmailOtp();
                      }}
                      disabled={emailCooldown > 0}
                    >
                      {emailCooldown > 0
                        ? `Resend (${emailCooldown}s)`
                        : "Resend"}
                    </button>
                  </div>
                  <div
                    className="profile-form-actions"
                    style={{ marginTop: 14 }}
                  >
                    {/* Step 4: Verify New Email OTP */}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={verifyNewEmailOtp}
                      disabled={
                        emailLoading || newEmailOtp.length !== OTP_LENGTH
                      }
                    >
                      {emailLoading ? "Verifying…" : <>Verify & Save</>}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setEmailStep(3);
                        setEmailMsg({ type: "", text: "" });
                      }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══ PHONE ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>Phone Number</h3>
              {!editPhone && (
                <button
                  className="edit-toggle"
                  onClick={() => {
                    setEditPhone(true);
                    // Smart skip: If they have no phone, jump straight to entering a new one (Step 3)
                    setPhoneStep(user?.phone ? 1 : 3);
                    setNewPhone("");
                    setShowPhone(false);
                    setPhoneMsg({ type: "", text: "" });
                  }}
                >
                  {user?.phone ? "Change" : "Add"}
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={phoneMsg.type} msg={phoneMsg.text} />

              {!editPhone ? (
                /* READ-ONLY VIEW */
                <div className="field-display">
                  <div className="field-row">
                    <label>Current Phone</label>
                    <span className={user?.phone ? "field-val" : "field-empty"}>
                      {user?.phone
                        ? `+63 ••••••••${String(user.phone).slice(-2)}`
                        : "Not set"}
                    </span>
                  </div>
                </div>
              ) : phoneStep === 1 ? (
                /* STEP 1: REQUEST AUTHENTICATION */
                <div className="profile-form">
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#52525b",
                      marginBottom: "16px",
                    }}
                  >
                    To protect your account, please verify your identity before
                    changing your phone number.
                  </p>
                  <div className="form-field" style={{ maxWidth: "380px" }}>
                    <label>Current Phone Number</label>
                    <div className="phone-input-group">
                      <div className="phone-prefix">
                        <span>🇵🇭</span> +63
                      </div>
                      <div className="phone-input-wrapper">
                        <input
                          type="text"
                          value={(() => {
                            const p = user?.phone
                              ? String(user.phone).replace(/^(\+?63|0)/, "")
                              : "";
                            if (showPhone) return p;
                            return p.length > 2
                              ? "•".repeat(p.length - 2) + p.slice(-2)
                              : p;
                          })()}
                          readOnly
                          style={{
                            letterSpacing:
                              showPhone || !user?.phone ? "normal" : "2px",
                            paddingRight: "40px",
                          }}
                        />
                        <button
                          type="button"
                          className="field-eye-btn"
                          onClick={() => setShowPhone((prev) => !prev)}
                        >
                          {showPhone ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="profile-form-actions">
                    {/* Step 1: Request Current Auth */}
                    <button
                      className="btn btn-primary"
                      onClick={() => requestCurrentPhoneAuth("sms")}
                      disabled={phoneLoading}
                    >
                      {phoneLoading ? (
                        <>
                          <svg
                            className="spinner-icon"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Sending OTP…
                        </>
                      ) : (
                        "Send SMS Verification Code"
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("phone")}
                    >
                      Cancel
                    </button>
                  </div>
                  <div style={{ marginTop: "16px" }}>
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#111111",
                        fontSize: "13px",
                        textDecoration: "underline",
                        cursor: "pointer",
                        padding: 0,
                      }}
                      onClick={() => requestCurrentPhoneAuth("email")}
                      disabled={phoneLoading}
                    >
                      I lost access to this number
                    </button>
                  </div>
                </div>
              ) : phoneStep === 2 ? (
                /* STEP 2: VERIFY AUTHENTICATION */
                <div className="verify-step">
                  <h4>Verify Identity</h4>
                  <p>
                    We sent a 6-digit verification code to your{" "}
                    <strong>
                      {phoneAuthMethod === "sms" ? "current phone" : "email"}
                    </strong>
                    . Enter it below to proceed.
                  </p>
                  <div
                    className="otp-input-row"
                    style={{ marginBottom: "20px", maxWidth: "380px" }}
                  >
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <input
                        type="text"
                        maxLength={OTP_LENGTH}
                        placeholder="000000"
                        value={currentPhoneOtp}
                        onChange={(e) => {
                          setCurrentPhoneOtp(e.target.value.replace(/\D/g, ""));

                          setFieldErrors((prev) => ({
                            ...prev,
                            currentPhoneOtp: "",
                          }));
                        }}
                        aria-invalid={Boolean(fieldErrors.currentPhoneOtp)}
                        aria-describedby={
                          fieldErrors.currentPhoneOtp
                            ? "profile-current-phone-otp-error"
                            : undefined
                        }
                        style={getInlineErrorInputStyle(
                          Boolean(fieldErrors.currentPhoneOtp),
                        )}
                      />

                      <InlineFieldError
                        id="profile-current-phone-otp-error"
                        message={fieldErrors.currentPhoneOtp}
                      />
                    </div>

                    <button
                      className="resend-btn"
                      onClick={() => {
                        setPhoneCooldown(60);
                        requestCurrentPhoneAuth(phoneAuthMethod);
                      }}
                      disabled={phoneCooldown > 0}
                    >
                      {phoneCooldown > 0
                        ? `Resend (${phoneCooldown}s)`
                        : "Resend"}
                    </button>
                  </div>
                  <div
                    className="profile-form-actions"
                    style={{ marginTop: 14 }}
                  >
                    {/* Step 2: Verify Current Auth */}
                    <button
                      className="btn btn-primary"
                      onClick={verifyCurrentPhoneAuth}
                      disabled={
                        phoneLoading || currentPhoneOtp.length < OTP_LENGTH
                      }
                    >
                      {phoneLoading ? (
                        <>
                          <svg
                            className="spinner-icon"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Verifying…
                        </>
                      ) : (
                        "Verify"
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("phone")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : phoneStep === 3 ? (
                /* STEP 3: ENTER NEW NUMBER */
                <div className="profile-form">
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#52525b",
                      marginBottom: "16px",
                    }}
                  >
                    Enter your new 10-digit mobile number. A 6-digit
                    verification code will be sent to verify ownership.
                  </p>
                  <div className="form-field" style={{ maxWidth: "380px" }}>
                    <label>New Phone Number</label>
                    <div className="phone-input-group">
                      <div className="phone-prefix">
                        <span>🇵🇭</span> +63
                      </div>
                      <div className="phone-input-wrapper">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="9[0-9]{9}"
                          value={
                            showPhone
                              ? newPhone
                              : newPhone.length > 2
                                ? "•".repeat(newPhone.length - 2) +
                                  newPhone.slice(-2)
                                : newPhone
                          }
                          placeholder="9XXXXXXXXX"
                          maxLength={10}
                          style={{
                            ...getInlineErrorInputStyle(
                              Boolean(fieldErrors.newPhone),
                              {
                                letterSpacing:
                                  showPhone || !newPhone ? "normal" : "2px",
                                paddingRight: "40px",
                              },
                            ),
                          }}
                          onFocus={() => {
                            if (!newPhone) setShowPhone(true);
                          }}
                          onChange={(e) => {
                            if (!showPhone) {
                              setShowPhone(true);
                              return;
                            }
                            let val = e.target.value.replace(/\D/g, "");
                            if (val.length > 0 && val[0] === "0")
                              val = val.slice(1);
                            if (val.length > 10) val = val.slice(0, 10);
                            setNewPhone(val);

                            setFieldErrors((prev) => ({
                              ...prev,
                              newPhone: "",
                            }));
                          }}
                          aria-invalid={Boolean(fieldErrors.newPhone)}
                          aria-describedby={
                            fieldErrors.newPhone
                              ? "profile-new-phone-error"
                              : undefined
                          }
                        />
                        <InlineFieldError
                          id="profile-new-phone-error"
                          message={fieldErrors.newPhone}
                        />
                        <button
                          type="button"
                          className="field-eye-btn"
                          onClick={() => setShowPhone((prev) => !prev)}
                        >
                          {showPhone ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="profile-form-actions">
                    {/* Step 3: Request New Phone OTP */}
                    <button
                      className="btn btn-primary"
                      onClick={() => requestPhoneOtp("0" + newPhone)}
                      disabled={phoneLoading || newPhone.length < 10}
                    >
                      {phoneLoading ? (
                        <>
                          <svg
                            className="spinner-icon"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Sending OTP…
                        </>
                      ) : (
                        "Send Verification OTP"
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("phone")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* STEP 4: VERIFY NEW NUMBER */
                <div className="verify-step">
                  <h4>Verify New Phone Number</h4>
                  <p>
                    We sent a 6-digit verification code to{" "}
                    <strong>
                      +63{" "}
                      {newPhone.length > 2
                        ? "••••••••" + newPhone.slice(-2)
                        : newPhone}
                    </strong>
                    . Enter it below to confirm.
                  </p>
                  <div
                    className="otp-input-row"
                    style={{ marginBottom: "20px", maxWidth: "380px" }}
                  >
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <input
                        type="text"
                        maxLength={OTP_LENGTH}
                        placeholder="000000"
                        value={phoneOtp}
                        onChange={(e) => {
                          setPhoneOtp(e.target.value.replace(/\D/g, ""));

                          setFieldErrors((prev) => ({
                            ...prev,
                            phoneOtp: "",
                          }));
                        }}
                        aria-invalid={Boolean(fieldErrors.phoneOtp)}
                        aria-describedby={
                          fieldErrors.phoneOtp
                            ? "profile-phone-otp-error"
                            : undefined
                        }
                        style={getInlineErrorInputStyle(
                          Boolean(fieldErrors.phoneOtp),
                        )}
                      />

                      <InlineFieldError
                        id="profile-phone-otp-error"
                        message={fieldErrors.phoneOtp}
                      />
                    </div>

                    <button
                      className="resend-btn"
                      onClick={() => {
                        setPhoneCooldown(60);
                        requestPhoneOtp("0" + newPhone);
                      }}
                      disabled={phoneCooldown > 0}
                    >
                      {phoneCooldown > 0
                        ? `Resend (${phoneCooldown}s)`
                        : "Resend"}
                    </button>
                  </div>
                  <div
                    className="profile-form-actions"
                    style={{ marginTop: 14 }}
                  >
                    {/* Step 4: Verify New Phone OTP */}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={(e) => verifyPhoneOtp("0" + newPhone, e)}
                      disabled={phoneLoading || phoneOtp.length !== OTP_LENGTH}
                    >
                      {phoneLoading ? (
                        "Verifying…"
                      ) : (
                        <> Verify & Update Phone </>
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setPhoneStep(3);
                        setPhoneMsg({ type: "", text: "" });
                      }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══ PASSWORD ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>Change Password</h3>
              {!editPass && (
                <button
                  className="edit-toggle"
                  onClick={() => setEditPass(true)}
                >
                  Change
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={passMsg.type} msg={passMsg.text} />
              {!editPass ? (
                <div className="field-display">
                  <div className="field-row">
                    <label>Password</label>
                    <span className="field-val">••••••••••</span>
                  </div>
                </div>
              ) : passStep === 1 ? (
                <div className="profile-form">
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#52525b",
                      marginBottom: "16px",
                    }}
                  >
                    For your security, please enter your current password to
                    receive a verification code.
                  </p>
                  <div className="form-field" style={{ maxWidth: "380px" }}>
                    <label>Current Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPass.current ? "text" : "password"}
                        placeholder="Enter current password"
                        value={passForm.current}
                        maxLength={MAX_PASSWORD_LENGTH}
                        onChange={(e) => {
                          setPassForm((p) => ({
                            ...p,
                            current: e.target.value,
                          }));

                          setFieldErrors((prev) => ({
                            ...prev,
                            currentPassword: "",
                          }));
                        }}
                        aria-invalid={Boolean(fieldErrors.currentPassword)}
                        aria-describedby={
                          fieldErrors.currentPassword
                            ? "profile-current-password-error"
                            : undefined
                        }
                        style={getInlineErrorInputStyle(
                          Boolean(fieldErrors.currentPassword),
                          {
                            width: "100%",
                            paddingRight: 40,
                          },
                        )}
                      />
                      <InlineFieldError
                        id="profile-current-password-error"
                        message={fieldErrors.currentPassword}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowPass((p) => ({ ...p, current: !p.current }))
                        }
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#aaa",
                        }}
                      >
                        {showPass.current ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="profile-form-actions">
                    {/* Step 1: Request Current Auth */}
                    <button
                      className="btn btn-primary"
                      onClick={requestPassOtp}
                      disabled={passLoading || !passForm.current.trim()}
                    >
                      {passLoading ? (
                        <>
                          <svg
                            className="spinner-icon"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Sending…
                        </>
                      ) : (
                        "Send Verification OTP"
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("pass")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : passStep === 2 ? (
                <div className="verify-step">
                  <h4>Verify Email OTP</h4>
                  <p>
                    We sent a 6-digit OTP to <strong>{user?.email}</strong>.
                    Enter it below to proceed.
                  </p>

                  <div
                    className="otp-input-row"
                    style={{ marginBottom: "20px" }}
                  >
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <input
                        type="text"
                        maxLength={OTP_LENGTH}
                        placeholder="000000"
                        value={passOtp}
                        onChange={(e) => {
                          setPassOtp(e.target.value.replace(/\D/g, ""));

                          setFieldErrors((prev) => ({
                            ...prev,
                            passOtp: "",
                          }));
                        }}
                        aria-invalid={Boolean(fieldErrors.passOtp)}
                        aria-describedby={
                          fieldErrors.passOtp
                            ? "profile-password-otp-error"
                            : undefined
                        }
                        style={getInlineErrorInputStyle(
                          Boolean(fieldErrors.passOtp),
                        )}
                      />

                      <InlineFieldError
                        id="profile-password-otp-error"
                        message={fieldErrors.passOtp}
                      />
                    </div>

                    <button
                      className="resend-btn"
                      onClick={() => {
                        setPassCooldown(60);
                        requestPassOtp();
                      }}
                      disabled={passCooldown > 0}
                    >
                      {passCooldown > 0
                        ? `Resend (${passCooldown}s)`
                        : "Resend"}
                    </button>
                  </div>

                  <div
                    className="profile-form-actions"
                    style={{ marginTop: 14 }}
                  >
                    <button
                      className="btn btn-primary"
                      disabled={passLoading || !passOtp.trim()}
                      onClick={() => {
                        if (!passOtp.trim() || passOtp.length < OTP_LENGTH) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            passOtp: "Please enter the full 6-digit OTP.",
                          }));
                          return;
                        }

                        setFieldErrors((prev) => ({
                          ...prev,
                          passOtp: "",
                        }));
                        setPassMsg({ type: "", text: "" });
                        setPassStep(3); // Moves to the New Password window!
                      }}
                    >
                      Verify
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("pass")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="verify-step">
                  <h4>Create New Password</h4>
                  <p>Enter and confirm your new password below.</p>

                  <div className="profile-form" style={{ marginTop: "16px" }}>
                    {[
                      {
                        key: "newPass",
                        label: "New Password",
                        ph: "Enter new password",
                      },
                      {
                        key: "confirm",
                        label: "Confirm New Password",
                        ph: "Repeat new password",
                      },
                    ].map((f) => (
                      <div
                        className="form-field"
                        key={f.key}
                        style={{ maxWidth: "380px" }}
                      >
                        <label>{f.label}</label>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showPass[f.key] ? "text" : "password"}
                            placeholder={f.ph}
                            value={passForm[f.key]}
                            maxLength={MAX_PASSWORD_LENGTH}
                            aria-invalid={Boolean(
                              f.key === "newPass"
                                ? fieldErrors.newPass
                                : fieldErrors.confirmPassword,
                            )}
                            aria-describedby={
                              (
                                f.key === "newPass"
                                  ? fieldErrors.newPass
                                  : fieldErrors.confirmPassword
                              )
                                ? `profile-${f.key}-error`
                                : undefined
                            }
                            onChange={(e) => {
                              setPassForm((p) => ({
                                ...p,
                                [f.key]: e.target.value,
                              }));

                              setFieldErrors((prev) => ({
                                ...prev,
                                [f.key === "newPass"
                                  ? "newPass"
                                  : "confirmPassword"]: "",
                              }));
                            }}
                            style={getInlineErrorInputStyle(
                              Boolean(
                                f.key === "newPass"
                                  ? fieldErrors.newPass
                                  : fieldErrors.confirmPassword,
                              ),
                              {
                                width: "100%",
                                paddingRight: 40,
                              },
                            )}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowPass((p) => ({ ...p, [f.key]: !p[f.key] }))
                            }
                            style={{
                              position: "absolute",
                              right: 10,
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#aaa",
                            }}
                          >
                            {showPass[f.key] ? (
                              <EyeOff size={16} />
                            ) : (
                              <Eye size={16} />
                            )}
                          </button>
                        </div>
                        {f.key === "newPass" && passForm.newPass && (
                          <StrengthBar password={passForm.newPass} />
                        )}

                        <InlineFieldError
                          id={`profile-${f.key}-error`}
                          message={
                            f.key === "newPass"
                              ? fieldErrors.newPass
                              : fieldErrors.confirmPassword
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div
                    className="profile-form-actions"
                    style={{ marginTop: 14 }}
                  >
                    {/* Step 3: Save New Password */}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={verifyPassOtp}
                      disabled={
                        passLoading || !passForm.newPass || !passForm.confirm
                      }
                    >
                      {passLoading ? "Saving…" : <>Save New Password</>}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setPassStep(2); // Allows them to go back to fix the OTP
                        setPassMsg({ type: "", text: "" });
                      }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <MotionFeedbackOverlay
        open={feedbackOpen}
        status={feedbackStatus}
        message={feedbackMsg}
        blocking
      />
    </div>
  );
}
