export default function SummaryCard({ title, value }) {
  return (
    <div className="support-summary-card">
      <span>{title}</span>

      <h2>{value}</h2>
    </div>
  );
}
