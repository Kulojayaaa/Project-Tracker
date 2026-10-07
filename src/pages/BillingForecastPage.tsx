import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ModuleMessage } from "../components/FormBits";
import { listProjectOptions, listRaSchedules } from "../services/operations";
import type { ProjectOption, RaScheduleRecord } from "../types/domain";
import { formatCurrencyCompact } from "../utils/formatting";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export function BillingForecastPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [schedules, setSchedules] = useState<RaScheduleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projectRows, scheduleRows] = await Promise.all([listProjectOptions(), listRaSchedules()]);
      setProjects(projectRows);
      setSchedules(scheduleRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load billing forecast.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const months = useMemo(() => {
    const now = new Date();
    return [0, 1, 2].map((offset) => new Date(now.getFullYear(), now.getMonth() + offset, 1));
  }, []);

  const monthRows = months.map((month) => {
    const key = monthKey(month);
    const rows = schedules.filter((schedule) => schedule.proposed_bill_date.startsWith(key));
    const planned = rows.reduce((total, row) => total + row.proposed_bill_amount, 0);
    const raised = rows.reduce((total, row) => total + (row.bill_status === "raised" || row.bill_status === "completed" ? row.actual_invoice_amount ?? row.proposed_bill_amount : 0), 0);
    return { label: monthLabel(month), planned, raised, pending: Math.max(planned - raised, 0) };
  });

  const futurePlansByProject = schedules.reduce<Record<string, number>>((map, schedule) => {
    if (!["raised", "completed", "cancelled"].includes(schedule.bill_status)) {
      map[schedule.project_id] = (map[schedule.project_id] ?? 0) + schedule.proposed_bill_amount;
    }
    return map;
  }, {});

  return (
    <div className="page-stack">
      {error ? <ModuleMessage tone="error">{error}</ModuleMessage> : null}
      <section className="panel">
        <div className="panel-header controls-header">
          <div><h2>Billing Forecast</h2><p>Current month, next month, following month, and project-level plan shortfall.</p></div>
          <button className="outline-button" onClick={() => void load()} type="button"><RefreshCw size={16} />Refresh</button>
        </div>
        {loading ? <div className="empty-state">Loading forecast...</div> : null}
        {!loading ? <section className="summary-strip">{monthRows.map((row) => <article key={row.label}><span>{row.label}</span><strong>{formatCurrencyCompact(row.planned)}</strong><span>Raised {formatCurrencyCompact(row.raised)} / Pending {formatCurrencyCompact(row.pending)}</span></article>)}</section> : null}
      </section>
      {!loading ? (
        <section className="panel">
          <div className="panel-header"><div><h2>Project Pending Billing vs Future Planned Billing</h2><p>Shortfall never goes below zero.</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>Project</th><th>Pending Billing</th><th>Future Planned</th><th>Shortfall</th><th>Status</th></tr></thead><tbody>
            {projects.map((project) => {
              const planned = futurePlansByProject[project.id] ?? 0;
              const shortfall = Math.max(project.pending_billing_amount - planned, 0);
              return <tr key={project.id}><td>{project.project_code} - {project.project_name}</td><td>{formatCurrencyCompact(project.pending_billing_amount)}</td><td>{formatCurrencyCompact(planned)}</td><td>{formatCurrencyCompact(shortfall)}</td><td>{shortfall > 0 ? "Plan Shortfall" : "Billing Fully Planned"}</td></tr>;
            })}
          </tbody></table></div>
        </section>
      ) : null}
    </div>
  );
}
