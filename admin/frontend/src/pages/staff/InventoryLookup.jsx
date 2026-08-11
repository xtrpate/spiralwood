// WISDOM INDOOR INVENTORY LOOKUP UI V1.0.1
import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { AlertTriangle, Package, Search } from "lucide-react";

const FILTERS = [
  ["all", "All"],
  ["in_stock", "In Stock"],
  ["low_stock", "Low Stock"],
  ["out_of_stock", "Out of Stock"],
];

const normalize = (value) => String(value || "").trim().toLowerCase();

const formatText = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getStockStatus = (product) => {
  const stock = Number(product?.stock || 0);
  const reorderLevel = Number(product?.reorder_point || 0);

  if (stock <= 0) return "out_of_stock";
  if (stock <= reorderLevel) return "low_stock";
  return "in_stock";
};

const getStockStatusLabel = (status) => {
  if (status === "out_of_stock") return "Out of Stock";
  if (status === "low_stock") return "Low Stock";
  return "In Stock";
};

export default function InventoryLookup() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    api
      .get("/pos/products/all")
      .then((response) => {
        if (active) {
          setProducts(Array.isArray(response.data) ? response.data : []);
        }
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(
    () => ({
      in_stock: products.filter((item) => getStockStatus(item) === "in_stock")
        .length,
      low_stock: products.filter((item) => getStockStatus(item) === "low_stock")
        .length,
      out_of_stock: products.filter(
        (item) => getStockStatus(item) === "out_of_stock",
      ).length,
      total: products.length,
    }),
    [products],
  );

  const filtered = useMemo(() => {
    const searchValue = normalize(query);

    return products.filter((item) => {
      const searchMatch =
        !searchValue ||
        normalize(item?.name).includes(searchValue) ||
        normalize(item?.barcode).includes(searchValue);

      const filterMatch =
        filter === "all" || getStockStatus(item) === filter;

      return searchMatch && filterMatch;
    });
  }, [products, query, filter]);

  return (
    <div className="indoor-inventory-page">
      <header className="indoor-inventory-header">
        <h1>Inventory Lookup</h1>
        <p>Check stock availability for current work.</p>
      </header>

      <section className="indoor-inventory-summary">
        <SummaryCard icon={Package} value={counts.in_stock} label="In Stock" />
        <SummaryCard icon={Package} value={counts.low_stock} label="Low Stock" />
        <SummaryCard
          icon={AlertTriangle}
          value={counts.out_of_stock}
          label="Out of Stock"
          danger={counts.out_of_stock > 0}
        />
        <SummaryCard
          icon={Package}
          value={counts.total}
          label="Total Items"
          emphasized
        />
      </section>

      <section className="indoor-inventory-toolbar">
        <label className="indoor-inventory-search">
          <Search size={15} strokeWidth={1.8} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search product or barcode"
            aria-label="Search inventory"
          />
        </label>

        <div className="indoor-inventory-filters">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? "is-active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {!loading ? (
          <div className="indoor-inventory-count">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
          </div>
        ) : null}
      </section>

      <section className="indoor-inventory-table-panel">
        {loading ? (
          <div className="indoor-inventory-empty">Loading inventory...</div>
        ) : filtered.length === 0 ? (
          <div className="indoor-inventory-empty">
            No inventory items match this view.
          </div>
        ) : (
          <div className="indoor-inventory-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Stock</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((item) => {
                  const status = getStockStatus(item);
                  const stock = Number(item?.stock || 0);

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="indoor-inventory-product">
                          {item.name || "Unnamed Item"}
                        </div>
                        <div className="indoor-inventory-barcode">
                          {item.barcode ? `Barcode ${item.barcode}` : "No barcode"}
                        </div>
                      </td>

                      <td className="is-muted">{item.category || "—"}</td>
                      <td className="is-muted">{formatText(item.type)}</td>

                      <td
                        className={
                          stock <= 0
                            ? "indoor-inventory-stock is-empty"
                            : "indoor-inventory-stock"
                        }
                      >
                        {stock}
                      </td>

                      <td className="is-muted">
                        {Number(item?.reorder_point || 0)}
                      </td>

                      <td>
                        <span
                          className={`indoor-inventory-status ${status}`}
                        >
                          {getStockStatusLabel(status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style>{`
        .indoor-inventory-page {
          width: 100%;
          box-sizing: border-box;
          padding-bottom: 36px;
          color: #18181b;
        }

        .indoor-inventory-header {
          margin-bottom: 18px;
        }

        .indoor-inventory-header h1 {
          margin: 0;
          color: #0a0a0a;
          font-size: 24px;
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.025em;
        }

        .indoor-inventory-header p {
          margin: 6px 0 0;
          color: #696a70;
          font-size: 12.5px;
          font-weight: 400;
          line-height: 1.5;
        }

        .indoor-inventory-summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .indoor-inventory-summary-card {
          min-height: 78px;
          padding: 15px 16px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 13px;
          background: #ffffff;
          border: 1px solid #dcdde1;
          border-radius: 0;
        }

        .indoor-inventory-summary-icon {
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #dedee2;
          border-radius: 0;
          background: #fafafa;
          color: #18181b;
        }

        .indoor-inventory-summary-icon.is-emphasized {
          background: #18181b;
          color: #ffffff;
        }

        .indoor-inventory-summary-icon.is-danger {
          border-color: #d8a3a3;
          color: #991b1b;
        }

        .indoor-inventory-summary-value {
          color: #18181b;
          font-size: 23px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.025em;
        }

        .indoor-inventory-summary-value.is-danger {
          color: #991b1b;
        }

        .indoor-inventory-summary-label {
          margin-top: 6px;
          color: #77787e;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.075em;
          text-transform: uppercase;
        }

        .indoor-inventory-toolbar {
          margin-bottom: 14px;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          background: #ffffff;
          border: 1px solid #dcdde1;
          border-radius: 0;
        }

        .indoor-inventory-search {
          position: relative;
          flex: 0 1 360px;
          min-width: 250px;
          display: block;
        }

        .indoor-inventory-search svg {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          color: #77787e;
          pointer-events: none;
        }

        .indoor-inventory-search input {
          width: 100%;
          height: 35px;
          padding: 0 11px 0 35px;
          box-sizing: border-box;
          border: 1px solid #d7d8dc;
          border-radius: 0;
          background: #ffffff;
          color: #18181b;
          font-size: 11.5px;
          font-weight: 400;
          outline: none;
        }

        .indoor-inventory-filters {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .indoor-inventory-filters button {
          min-height: 32px;
          padding: 6px 10px;
          border: 1px solid #d7d8dc;
          border-radius: 0;
          background: #ffffff;
          color: #52525b;
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
        }

        .indoor-inventory-filters button.is-active {
          border-color: #18181b;
          background: #18181b;
          color: #ffffff;
        }

        .indoor-inventory-count {
          margin-left: auto;
          color: #85868b;
          font-size: 10px;
          font-weight: 500;
          white-space: nowrap;
        }

        .indoor-inventory-table-panel {
          background: #ffffff;
          border: 1px solid #dcdde1;
          border-radius: 0;
          overflow: hidden;
        }

        .indoor-inventory-table-wrap {
          overflow-x: auto;
        }

        .indoor-inventory-table-panel table {
          width: 100%;
          min-width: 880px;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .indoor-inventory-table-panel th {
          padding: 10px 13px;
          background: #fafafa;
          border-bottom: 1px solid #e4e4e7;
          color: #77787e;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.075em;
          text-align: left;
          text-transform: uppercase;
        }

        .indoor-inventory-table-panel th:nth-child(1) { width: 31%; }
        .indoor-inventory-table-panel th:nth-child(2) { width: 20%; }
        .indoor-inventory-table-panel th:nth-child(3) { width: 13%; }
        .indoor-inventory-table-panel th:nth-child(4) { width: 11%; }
        .indoor-inventory-table-panel th:nth-child(5) { width: 13%; }
        .indoor-inventory-table-panel th:nth-child(6) { width: 12%; }

        .indoor-inventory-table-panel td {
          padding: 12px 13px;
          border-bottom: 1px solid #ededf0;
          color: #2b2b2f;
          font-size: 10.5px;
          font-weight: 500;
          line-height: 1.4;
          vertical-align: middle;
        }

        .indoor-inventory-table-panel td.is-muted {
          color: #5f6066;
          font-weight: 400;
        }

        .indoor-inventory-product {
          color: #18181b;
          font-size: 11.5px;
          font-weight: 700;
          line-height: 1.35;
        }

        .indoor-inventory-barcode {
          margin-top: 4px;
          color: #96979c;
          font-family: monospace;
          font-size: 9px;
          font-weight: 400;
          letter-spacing: 0.02em;
        }

        .indoor-inventory-stock {
          color: #18181b !important;
          font-weight: 750 !important;
        }

        .indoor-inventory-stock.is-empty {
          color: #991b1b !important;
        }

        .indoor-inventory-status {
          min-height: 24px;
          padding: 4px 8px;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #d8d8dc;
          border-radius: 0;
          background: #f4f4f5;
          color: #18181b;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .indoor-inventory-status.low_stock {
          background: #ffffff;
          color: #52525b;
          border-color: #cfcfd4;
        }

        .indoor-inventory-status.out_of_stock {
          background: #ffffff;
          color: #991b1b;
          border-color: #d8a3a3;
        }

        .indoor-inventory-empty {
          padding: 32px;
          color: #77787e;
          font-size: 11.5px;
          font-weight: 500;
          text-align: center;
        }

        @media (max-width: 980px) {
          .indoor-inventory-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .indoor-inventory-summary {
            grid-template-columns: 1fr;
          }

          .indoor-inventory-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .indoor-inventory-search {
            flex-basis: auto;
            min-width: 0;
          }

          .indoor-inventory-count {
            margin-left: 0;
          }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  value,
  label,
  emphasized = false,
  danger = false,
}) {
  return (
    <div className="indoor-inventory-summary-card">
      <div
        className={[
          "indoor-inventory-summary-icon",
          emphasized ? "is-emphasized" : "",
          danger ? "is-danger" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Icon size={18} strokeWidth={1.8} />
      </div>

      <div>
        <div
          className={
            danger
              ? "indoor-inventory-summary-value is-danger"
              : "indoor-inventory-summary-value"
          }
        >
          {value}
        </div>
        <div className="indoor-inventory-summary-label">{label}</div>
      </div>
    </div>
  );
}
