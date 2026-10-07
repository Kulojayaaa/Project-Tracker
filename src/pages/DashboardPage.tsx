import { CalendarDays, FileSpreadsheet, Plus, RefreshCw } from "lucide-react";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { actionItems, dashboardKpis } from "../data/dashboard";
import type { AppPage } from "../types/domain";

const pipelineRows = [
  { label: "Current Month Planned", value: "No live billing plan yet", progress: 0, tone: "planned" as const },
  { label: "Current Month Raised", value: "No invoices entered yet", progress: 0, tone: "success" as const },
  { label: "Pending Planned Billing", value: "No schedules entered yet", progress: 0, tone: "warning" as const },
  { label: "Billing Shortfall", value: "Calculated after projects and RA plans", progress: 0, tone: "danger" as const }
];

type DashboardPageProps = {
  onNavigate: (page: AppPage) => void;
};

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  return (
    <>
      <section className="quick-actions">
        <button onClick={() => onNavigate("projects-create")} type="button">
          <Plus size={17} />
          New Project
        </button>
        <button onClick={() => onNavigate("projects-master")} type="button">
          <FileSpreadsheet size={17} />
          Project Master
        </button>
        <button onClick={() => onNavigate("billing-ra-schedule")} type="button">
          <CalendarDays size={17} />
          RA Calendar
        </button>
        <button type="button">
          <RefreshCw size={17} />
          Refresh
        </button>
      </section>
      <section className="kpi-grid">
        {dashboardKpis.map((kpi) => (
          <StatCard kpi={kpi} key={kpi.label} />
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Billing Pipeline</h2>
              <p>Planned, raised, pending, and shortfall position</p>
            </div>
            <StatusBadge tone="planned">FY 2026-27</StatusBadge>
          </div>
          <div className="pipeline-list">
            {pipelineRows.map((row) => (
              <div className="pipeline-row" key={row.label}>
                <div>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
                <div className="progress-track">
                  <span className={`progress-fill tone-${row.tone}`} style={{ width: `${row.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Action Required</h2>
              <p>Due bills, pending DC invoices, and shortfalls</p>
            </div>
          </div>
          <div className="action-list">
            {actionItems.map((item) => (
              <button className="action-item" key={item.title} type="button">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.meta}</span>
                </div>
                <StatusBadge tone={item.tone}>{item.amount}</StatusBadge>
              </button>
            ))}
          </div>
        </article>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Project Tracker Preview</h2>
            <p>Open Project Master to enter live project records from Supabase.</p>
          </div>
          <button className="outline-button" onClick={() => onNavigate("projects-master")} type="button">
            Open Projects
          </button>
        </div>
      </section>
    </>
  );
}
