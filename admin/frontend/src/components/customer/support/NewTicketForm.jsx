import { useEffect, useState } from "react";
import supportService from "../../../services/supportService";

const CATEGORY_OPTIONS = [
  { value: "inquiry", label: "General Inquiry" },
  { value: "complaint", label: "Complaint" },
  { value: "order_assistance", label: "Order Assistance" },
  { value: "blueprint_support", label: "Blueprint Support" },
  { value: "other", label: "Other" },
];

export default function NewTicketForm({ onCreated }) {
  const [orders, setOrders] = useState([]);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("inquiry");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");

  const [loadingOrders, setLoadingOrders] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await supportService.getOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (!subject.trim()) {
      return setError("Subject is required.");
    }

    if (!message.trim()) {
      return setError("Please enter your concern.");
    }

    setSubmitting(true);

    try {
      await supportService.createTicket({
        subject,
        category,
        order_id: orderId || null,
        message,
      });

      setSubject("");
      setCategory("inquiry");
      setOrderId("");
      setMessage("");

      if (onCreated) {
        onCreated();
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to create ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="support-form-card" onSubmit={handleSubmit}>
      <h2>Create Support Ticket</h2>

      <div className="support-field">
        <label>Subject</label>

        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="support-input"
          placeholder="Describe your concern"
        />
      </div>

      <div className="support-field">
        <label>Category</label>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="support-input"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="support-field">
        <label>Related Order (Optional)</label>

        <select
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="support-input"
          disabled={loadingOrders}
        >
          <option value="">None</option>

          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.order_number}
            </option>
          ))}
        </select>
      </div>

      <div className="support-field">
        <label>Message</label>

        <textarea
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="support-input support-textarea"
          placeholder="Explain your concern"
        />
      </div>

      {error && <div className="support-error">{error}</div>}

      <button
        type="submit"
        className="support-submit-btn"
        disabled={submitting}
      >
        {submitting ? "Submitting..." : "Create Ticket"}
      </button>
    </form>
  );
}
