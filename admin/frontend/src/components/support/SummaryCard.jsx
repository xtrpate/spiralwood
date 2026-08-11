export default function SummaryCard({
  title,
  value,
  icon = null,
  tone = "neutral",
}) {
  return (
    <div className={`support-summary-card admin-support-stat tone-${tone}`}>
      <div>
        <span>{title}</span>
        <h2>{value}</h2>
      </div>

      {icon && (
        <div className="admin-support-stat-icon" aria-hidden="true">
          {icon}
        </div>
      )}
    </div>
  );
}
