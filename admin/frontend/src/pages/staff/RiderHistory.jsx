// WISDOM RIDER HISTORY UI V2.2
import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  FileText,
  MapPin,
  Navigation,
  X,
} from "lucide-react";
import api, { buildAssetUrl } from "../../services/api";
import "./RiderScreen.css";

const normalize = (value) => String(value || "").trim().toLowerCase();

const isSuccessfulDeliveryResult = (status) =>
  ["delivered", "completed"].includes(normalize(status));

const getHistoryResult = (record = {}) =>
  normalize(record.history_result || record.status);

const parseCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPinnedMapHref = (record = {}) => {
  const lat = parseCoordinate(record.delivery_lat);
  const lng = parseCoordinate(record.delivery_lng);

  if (
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

const formatDateTime = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getRecordDate = (record) =>
  isSuccessfulDeliveryResult(getHistoryResult(record))
    ? record.delivered_date || record.updated_at
    : record.updated_at;

const sortableTime = (record) => {
  const value =
    record.assigned_at ||
    record.updated_at ||
    record.delivered_date ||
    null;

  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

export default function RiderHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/pos/deliveries/history"),
      api.get("/pos/deliveries"),
    ])
      .then(([historyRes, deliveriesRes]) => {
        const historyList = Array.isArray(historyRes.data)
          ? historyRes.data
          : [];
        const deliveryList = Array.isArray(deliveriesRes.data)
          ? deliveriesRes.data
          : [];

        const deliveryById = new Map(
          deliveryList.map((delivery) => [
            Number(delivery.id),
            delivery,
          ]),
        );

        const enriched = historyList.map((record) => {
          const liveRecord =
            deliveryById.get(Number(record.delivery_id)) || {};

          return {
            ...record,
            ...liveRecord,
            delivery_id: record.delivery_id,
            order_number:
              liveRecord.order_number || record.order_number,
            customer_name:
              liveRecord.customer_name || record.customer_name,
            address: liveRecord.address || record.address,
            status: liveRecord.status || record.status,
            delivered_date:
              liveRecord.delivered_date || record.delivered_date,
            updated_at: liveRecord.updated_at || record.updated_at,
          };
        });

        setHistory(enriched);
      })
      .catch((err) => {
        console.error("Failed to load delivery history", err);
        setHistory([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredHistory = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return history
      .filter((record) => {
        const status = getHistoryResult(record);

        if (
          statusFilter === "delivered" &&
          !isSuccessfulDeliveryResult(status)
        ) {
          return false;
        }

        if (
          statusFilter !== "all" &&
          statusFilter !== "delivered" &&
          status !== statusFilter
        ) {
          return false;
        }

        const recordDate = new Date(getRecordDate(record));
        if (!Number.isNaN(recordDate.getTime())) {
          recordDate.setHours(0, 0, 0, 0);

          if (startDate) {
            const start = new Date(`${startDate}T00:00:00`);
            start.setHours(0, 0, 0, 0);
            if (recordDate < start) return false;
          }

          if (endDate) {
            const end = new Date(`${endDate}T00:00:00`);
            end.setHours(0, 0, 0, 0);
            if (recordDate > end) return false;
          }
        }

        if (!keyword) return true;

        return [
          record.order_number,
          record.customer_name,
          record.address,
          record.history_result,
          record.status,
        ].some((field) =>
          String(field || "")
            .toLowerCase()
            .includes(keyword),
        );
      })
      .sort((a, b) => {
        const timeDifference = sortableTime(b) - sortableTime(a);
        if (timeDifference !== 0) return timeDifference;

        return Number(b.delivery_id || 0) - Number(a.delivery_id || 0);
      });
  }, [history, search, statusFilter, startDate, endDate]);

  const filters = [
    { value: "all", label: "All" },
    { value: "delivered", label: "Delivered" },
    { value: "failed", label: "Failed" },
  ];

  const selectedMapHref = selectedRecord
    ? getPinnedMapHref(selectedRecord)
    : null;

  return (
    <div className="rider-page-shell rider-history-v2">
      <header className="rider-v2-page-header">
        <div>
          <h2 className="rider-header-title">Delivery History</h2>
          <p className="rider-header-subtitle">
            Review completed and failed delivery records.
          </p>
        </div>
      </header>

      <section className="rider-card rider-history-filters rider-history-filters-v22">
        <div className="rider-history-tabs">
          {filters.map((filter) => (
            <button
              type="button"
              key={filter.value}
              className={`rider-history-tab ${
                statusFilter === filter.value ? "is-active" : ""
              }`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="rider-history-filter-grid rider-history-filter-grid-v22">
          <label className="rider-history-search-field">
            <span>Search</span>
            <input
              type="text"
              placeholder="Order, customer, or address"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label>
            <span>From</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label>
            <span>To</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="rider-card rider-history-records">
        <div className="rider-history-records-head">
          <div>
            <h3>Records</h3>
            <p>Newest assignments are shown first.</p>
          </div>
          <span>{filteredHistory.length} shown</span>
        </div>

        {loading ? (
          <div className="rider-history-empty">Loading history...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="rider-history-empty">
            No delivery records match these filters.
          </div>
        ) : (
          <div className="rider-table-scroll">
            <table className="rider-table rider-mobile-table rider-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Destination</th>
                  <th>Result</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((record) => (
                  <tr key={record.delivery_id}>
                    <td data-label="Date">
                      {formatDateTime(getRecordDate(record))}
                    </td>
                    <td
                      data-label="Order"
                      className="rider-history-order"
                    >
                      {record.order_number || "—"}
                    </td>
                    <td data-label="Customer">
                      {record.customer_name || "Customer"}
                    </td>
                    <td
                      data-label="Destination"
                      className="rider-history-destination"
                    >
                      {record.address || "Address unavailable"}
                    </td>
                    <td data-label="Result">
                      <span
                        className={`rider-history-result ${
                          isSuccessfulDeliveryResult(getHistoryResult(record))
                            ? "is-delivered"
                            : ""
                        }`}
                      >
                        {isSuccessfulDeliveryResult(getHistoryResult(record))
                          ? "Delivered"
                          : "Failed"}
                      </span>
                    </td>
                    <td data-label="Action" className="rider-history-action-cell">
                      <button
                        type="button"
                        className="rider-v2-row-action"
                        onClick={() => setSelectedRecord(record)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRecord ? (
        <div
          className="rider-history-detail-overlay"
          onClick={() => setSelectedRecord(null)}
        >
          <aside
            className="rider-history-detail-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rider-history-detail-head">
              <div>
                <span>Delivery Record</span>
                <h3>{selectedRecord.order_number || "Order"}</h3>
                <p>{selectedRecord.customer_name || "Customer"}</p>
              </div>
              <button
                type="button"
                className="rider-history-close"
                aria-label="Close details"
                onClick={() => setSelectedRecord(null)}
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>

            <div className="rider-history-detail-status">
              <span
                className={`rider-history-result ${
                  isSuccessfulDeliveryResult(
                    getHistoryResult(selectedRecord),
                  )
                    ? "is-delivered"
                    : ""
                }`}
              >
                {isSuccessfulDeliveryResult(
                  getHistoryResult(selectedRecord),
                )
                  ? "Delivered"
                  : "Failed"}
              </span>
            </div>

            <div className="rider-history-detail-grid">
              <div className="rider-history-detail-item">
                <span>Destination</span>
                <strong>
                  {selectedRecord.address || "Address unavailable"}
                </strong>
              </div>

              <div className="rider-history-detail-item">
                <span>Scheduled</span>
                <strong>
                  {formatDateTime(selectedRecord.scheduled_date)}
                </strong>
              </div>

              <div className="rider-history-detail-item">
                <span>Assigned</span>
                <strong>
                  {formatDateTime(selectedRecord.assigned_at)}
                </strong>
              </div>

              <div className="rider-history-detail-item">
                <span>
                  {isSuccessfulDeliveryResult(
                    getHistoryResult(selectedRecord),
                  )
                    ? "Completed"
                    : "Attempted"}
                </span>
                <strong>
                  {formatDateTime(getRecordDate(selectedRecord))}
                </strong>
              </div>
            </div>

            <section className="rider-history-detail-section">
              <div className="rider-history-detail-section-title">
                <MapPin size={15} strokeWidth={1.8} />
                Location
              </div>
              <p>
                {selectedMapHref
                  ? "A saved delivery pin is available for this record."
                  : "No saved delivery pin is available for this older record."}
              </p>

              {selectedMapHref ? (
                <a
                  href={selectedMapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rider-v2-btn rider-v2-btn-secondary rider-history-detail-button"
                >
                  <Navigation size={15} strokeWidth={2} />
                  Open Map
                </a>
              ) : null}
            </section>

            <section className="rider-history-detail-section">
              <div className="rider-history-detail-section-title">
                <FileText size={15} strokeWidth={1.8} />
                Proof of Delivery
              </div>
              <p>
                {selectedRecord.signed_receipt
                  ? "Proof was uploaded for this delivery."
                  : "No proof file is available for this record."}
              </p>

              {selectedRecord.signed_receipt ? (
                <a
                  href={buildAssetUrl(selectedRecord.signed_receipt)}
                  target="_blank"
                  rel="noreferrer"
                  className="rider-v2-btn rider-v2-btn-secondary rider-history-detail-button"
                >
                  View Proof
                </a>
              ) : null}
            </section>

            {selectedRecord.notes ? (
              <section className="rider-history-detail-section">
                <div className="rider-history-detail-section-title">
                  <Clock3 size={15} strokeWidth={1.8} />
                  Notes
                </div>
                <p className="rider-history-notes">
                  {selectedRecord.notes}
                </p>
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
