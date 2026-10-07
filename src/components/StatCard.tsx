import type { DashboardKpi } from "../types/domain";

export function StatCard({ kpi }: { kpi: DashboardKpi }) {
  return (
    <article className={`stat-card tone-${kpi.tone}`}>
      <p>{kpi.label}</p>
      <strong>{kpi.value}</strong>
      <span>{kpi.detail}</span>
    </article>
  );
}
