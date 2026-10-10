import { CalendarDays, FileSpreadsheet, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import {
  getDashboardSummary,
  type DashboardSummary,
} from "../services/dashboard";
import type { AppPage, DashboardKpi } from "../types/domain";
import { formatCurrencyCompact, percentage } from "../utils/formatting";

type DashboardPageProps = {
  onNavigate: (page: AppPage) => void;
};

function emptyValue(label: string) {
  return label;
}

function buildKpis(summary: DashboardSummary | null): DashboardKpi[] {
  if (!summary) {
    return [
      {
        label: "Sales Target",
        value: "No FY configured",
        detail: "Create an active financial year",
        tone: "neutral",
      },
      {
        label: "Sales Achieved",
        value: "No sales data",
        detail: "Awaiting accounts entry",
        tone: "neutral",
      },
      {
        label: "Project Billing Pending",
        value: "No project data",
        detail: "Calculated after project entry",
        tone: "warning",
      },
      {
        label: "DC Pending Invoice",
        value: "No DC data",
        detail: "Pending DCs will appear after entry",
        tone: "success",
      },
    ];
  }

  return [
    {
      label: "Sales Target",
      value: formatCurrencyCompact(summary.salesTarget),
      detail: summary.financialYear,
      tone: "planned",
    },
    {
      label: "Sales Achieved",
      value:
        summary.salesAchieved === null
          ? emptyValue("No sales data")
          : formatCurrencyCompact(summary.salesAchieved),
      detail: summary.latestSalesReportDate
        ? `${percentage(summary.salesAchievementPercentage)} achieved`
        : "Awaiting accounts entry",
      tone: summary.salesAchieved === null ? "neutral" : "success",
    },
    {
      label: "Project Billing Pending",
      value:
        summary.totalWoValue > 0
          ? formatCurrencyCompact(summary.pendingBillingAmount)
          : emptyValue("No project data"),
      detail:
        summary.totalWoValue > 0
          ? `${percentage(summary.projectBillingPercentage)} billed`
          : "Create projects to calculate",
      tone: "warning",
    },
    {
      label: "DC Pending Invoice",
      value:
        summary.pendingDcCount > 0
          ? formatCurrencyCompact(summary.pendingDcInvoiceValue)
          : emptyValue("No pending DCs"),
      detail: `${summary.pendingDcCount} pending, ${summary.overdueDcCount} overdue`,
      tone: summary.overdueDcCount > 0 ? "danger" : "success",
    },
  ];
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dashboardKpis = useMemo(() => buildKpis(summary), [summary]);
  const pipelineRows = useMemo(
    () => [
      {
        label: "Current Month Planned",
        value: summary
          ? formatCurrencyCompact(summary.currentMonthPlannedBilling)
          : "No live billing plan yet",
        progress: summary?.currentMonthPlannedBilling ? 100 : 0,
        tone: "planned" as const,
      },
      {
        label: "Current Month Raised",
        value: summary
          ? formatCurrencyCompact(summary.currentMonthActualBilling)
          : "No invoices entered yet",
        progress: summary?.currentMonthPlannedBilling
          ? Math.min(
              (summary.currentMonthActualBilling /
                summary.currentMonthPlannedBilling) *
                100,
              100,
            )
          : 0,
        tone: "success" as const,
      },
      {
        label: "Pending Planned Billing",
        value: summary
          ? formatCurrencyCompact(summary.currentMonthPendingPlanned)
          : "No schedules entered yet",
        progress: summary?.currentMonthPlannedBilling
          ? Math.min(
              (summary.currentMonthPendingPlanned /
                summary.currentMonthPlannedBilling) *
                100,
              100,
            )
          : 0,
        tone: "warning" as const,
      },
      {
        label: "Billing Shortfall",
        value: summary
          ? formatCurrencyCompact(summary.billingPlanShortfall)
          : "Calculated after projects and RA plans",
        progress: summary?.pendingBillingAmount
          ? Math.min(
              (summary.billingPlanShortfall / summary.pendingBillingAmount) *
                100,
              100,
            )
          : 0,
        tone: "danger" as const,
      },
    ],
    [summary],
  );

  async function loadSummary() {
    setLoading(true);
    setError(null);

    try {
      setSummary(await getDashboardSummary());
    } catch (summaryError) {
      setError(
        summaryError instanceof Error
          ? summaryError.message
          : "Unable to load dashboard summary.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

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
        <button onClick={() => void loadSummary()} type="button">
          <RefreshCw size={17} />
          Refresh
        </button>
      </section>

      {loading ? (
        <div className="alert">Loading dashboard summary...</div>
      ) : null}
      {error ? <div className="alert error-alert">{error}</div> : null}

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
            <StatusBadge tone="planned">
              {summary?.financialYear ?? "No active FY"}
            </StatusBadge>
          </div>
          <div className="pipeline-list">
            {pipelineRows.map((row) => (
              <div className="pipeline-row" key={row.label}>
                <div>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
                <div className="progress-track">
                  <span
                    className={`progress-fill tone-${row.tone}`}
                    style={{ width: `${row.progress}%` }}
                  />
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
            <button
              className="action-item"
              onClick={() => onNavigate("billing-ra-schedule")}
              type="button"
            >
              <div>
                <strong>RA bills due</strong>
                <span>
                  {summary
                    ? `${summary.raDueCount} due, ${summary.raDelayedCount} delayed`
                    : "Loading RA bills"}
                </span>
              </div>
              <StatusBadge tone={summary?.raDueCount ? "warning" : "success"}>
                {summary?.raDueCount ?? 0}
              </StatusBadge>
            </button>
            <button
              className="action-item"
              onClick={() => onNavigate("dispatch-dc-pending")}
              type="button"
            >
              <div>
                <strong>DC invoice pending</strong>
                <span>
                  {summary
                    ? `${summary.pendingDcCount} pending, ${summary.overdueDcCount} overdue`
                    : "No DC data loaded"}
                </span>
              </div>
              <StatusBadge
                tone={summary?.overdueDcCount ? "danger" : "success"}
              >
                {summary
                  ? formatCurrencyCompact(summary.pendingDcInvoiceValue)
                  : "Pending setup"}
              </StatusBadge>
            </button>
            <button
              className="action-item"
              onClick={() => onNavigate("billing-forecast")}
              type="button"
            >
              <div>
                <strong>Billing plan shortfall</strong>
                <span>Pending billing minus FY planned billing</span>
              </div>
              <StatusBadge
                tone={summary?.billingPlanShortfall ? "warning" : "planned"}
              >
                {summary
                  ? formatCurrencyCompact(summary.billingPlanShortfall)
                  : "Pending setup"}
              </StatusBadge>
            </button>
          </div>
        </article>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Project Tracker</h2>
            <p>
              {summary
                ? `${summary.projectCount} main projects / ${summary.woScopeCount} WO scopes / ${summary.unassignedScopeCount} unassigned scopes`
                : "No project data loaded"}
            </p>
          </div>
          <button
            className="outline-button"
            onClick={() => onNavigate("projects-master")}
            type="button"
          >
            Open Projects
          </button>
        </div>
      </section>
    </>
  );
}
