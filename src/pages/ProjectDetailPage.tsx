import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, FileText, Plus, Receipt, Truck } from "lucide-react";
import { ModuleMessage } from "../components/FormBits";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { getProject } from "../services/projects";
import { listDcs, listInvoices, listRaSchedules } from "../services/operations";
import type { AppPage, DcRecord, InvoiceRecord, ProjectSummary, RaScheduleRecord } from "../types/domain";
import { formatCurrencyCompact, percentage } from "../utils/formatting";

type ProjectDetailPageProps = {
  projectId: string;
  onBack: () => void;
  onNavigate: (page: AppPage) => void;
};

type TabKey = "overview" | "invoices" | "ra" | "forecast" | "dcs" | "documents" | "activity";

const tabs: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "invoices", label: "Invoices" },
  { key: "ra", label: "RA Bills" },
  { key: "forecast", label: "Billing Forecast" },
  { key: "dcs", label: "DCs" },
  { key: "documents", label: "Documents" },
  { key: "activity", label: "Activity / Audit" }
];

function billingTone(status: string) {
  if (status === "Fully Billed" || status === "Billing Fully Planned") return "success";
  if (status === "Completed Project - Billing Pending") return "danger";
  return "warning";
}

export function ProjectDetailPage({ projectId, onBack, onNavigate }: ProjectDetailPageProps) {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [raSchedules, setRaSchedules] = useState<RaScheduleRecord[]>([]);
  const [dcs, setDcs] = useState<DcRecord[]>([]);
  const [tab, setTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projectRow, invoiceRows, raRows, dcRows] = await Promise.all([getProject(projectId), listInvoices(), listRaSchedules(), listDcs(false)]);
      setProject(projectRow);
      setInvoices(invoiceRows.filter((invoice) => invoice.project_id === projectId));
      setRaSchedules(raRows.filter((schedule) => schedule.project_id === projectId));
      setDcs(dcRows.filter((dc) => dc.project_id === projectId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load project detail.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [projectId]);

  const openRaTotal = useMemo(() => raSchedules.filter((row) => !["raised", "completed", "cancelled"].includes(row.bill_status)).reduce((sum, row) => sum + row.proposed_bill_amount, 0), [raSchedules]);
  const pendingDcValue = useMemo(() => dcs.filter((dc) => dc.tax_invoice_required && !dc.tax_invoice_raised).reduce((sum, dc) => sum + dc.dc_value, 0), [dcs]);

  if (loading) return <div className="empty-state">Loading project details...</div>;
  if (error) return <ModuleMessage tone="error">{error}</ModuleMessage>;
  if (!project) return <ModuleMessage tone="error">Project not found.</ModuleMessage>;

  return (
    <div className="page-stack project-detail-page">
      <section className="panel project-detail-header">
        <button className="ghost-button" onClick={onBack} type="button"><ArrowLeft size={16} />Back to tracker</button>
        <div>
          <h2>{project.project_name}</h2>
          <p>{project.project_code} / {project.client_name ?? "No client"} / WO {project.wo_number ?? "-"}</p>
        </div>
        <StatusBadge tone={billingTone(project.billing_status)}>{project.billing_status}</StatusBadge>
      </section>

      <section className="quick-actions">
        <button onClick={() => onNavigate("billing-invoices")} type="button"><Receipt size={17} />Add Invoice</button>
        <button onClick={() => onNavigate("billing-ra-schedule")} type="button"><CalendarDays size={17} />Plan RA Bill</button>
        <button onClick={() => onNavigate("dispatch-dc-register")} type="button"><Truck size={17} />Add DC</button>
        <button onClick={() => setTab("documents")} type="button"><FileText size={17} />Documents</button>
      </section>

      <section className="kpi-grid">
        <StatCard kpi={{ label: "WO Value", value: formatCurrencyCompact(project.total_wo_value), detail: "Total work order value", tone: "planned" }} />
        <StatCard kpi={{ label: "Total Invoiced", value: formatCurrencyCompact(project.total_invoiced_amount), detail: `${formatCurrencyCompact(project.opening_invoiced_amount)} opening + ${formatCurrencyCompact(project.current_invoiced_amount)} current FY`, tone: "success" }} />
        <StatCard kpi={{ label: "Pending Billing", value: formatCurrencyCompact(project.pending_billing_amount), detail: "Billing target minus total invoiced", tone: project.pending_billing_amount > 0 ? "warning" : "success" }} />
        <StatCard kpi={{ label: "Billing %", value: percentage(project.billing_percentage), detail: `${formatCurrencyCompact(project.future_planned_billing)} future planned`, tone: "neutral" }} />
      </section>

      <section className="panel">
        <div className="tabs-row">
          {tabs.map((item) => <button className={tab === item.key ? "tab-button active" : "tab-button"} key={item.key} onClick={() => setTab(item.key)} type="button">{item.label}</button>)}
        </div>

        {tab === "overview" ? (
          <div className="detail-grid">
            <article><span>Location</span><strong>{project.location ?? "-"}</strong></article>
            <article><span>Project Manager</span><strong>{project.project_manager_name ?? "-"}</strong></article>
            <article><span>WO Date</span><strong>{project.wo_date ?? "-"}</strong></article>
            <article><span>Expected Completion</span><strong>{project.expected_completion_date ?? "-"}</strong></article>
            <article><span>Last Invoice</span><strong>{project.last_invoice_date ?? "-"}</strong></article>
            <article><span>Next Proposed Billing</span><strong>{project.next_proposed_billing_date ?? "-"}</strong></article>
            <article><span>Open RA Plan</span><strong>{formatCurrencyCompact(openRaTotal)}</strong></article>
            <article><span>Pending DC Invoice</span><strong>{formatCurrencyCompact(pendingDcValue)}</strong></article>
          </div>
        ) : null}

        {tab === "invoices" ? <DetailTable empty="No invoices linked to this project." rows={invoices.map((row) => ({ Number: row.invoice_number, Date: row.invoice_date, Type: row.invoice_type, Total: formatCurrencyCompact(row.total_amount), FY: row.financial_year_name ?? "-" }))} /> : null}
        {tab === "ra" ? <DetailTable empty="No RA bills planned for this project." rows={raSchedules.map((row) => ({ Period: row.billing_period ?? "-", Proposed: row.proposed_bill_date, Amount: formatCurrencyCompact(row.proposed_bill_amount), Status: row.bill_status, Invoice: row.actual_invoice_number ?? "-" }))} /> : null}
        {tab === "forecast" ? <DetailTable empty="No forecast rows for this project." rows={[{ "Pending Billing": formatCurrencyCompact(project.pending_billing_amount), "Future Planned": formatCurrencyCompact(project.future_planned_billing), Shortfall: formatCurrencyCompact(Math.max(project.pending_billing_amount - project.future_planned_billing, 0)), Status: project.billing_status }]} /> : null}
        {tab === "dcs" ? <DetailTable empty="No DCs linked to this project." rows={dcs.map((row) => ({ "DC No.": row.dc_number, Date: row.dc_date, Material: row.material_description, Value: formatCurrencyCompact(row.dc_value), Status: row.status, Invoice: row.invoice_number ?? "-" }))} /> : null}
        {tab === "documents" ? <div className="empty-state">Document metadata and private Supabase Storage policies are in the database layer. Upload UI is pending in the next phase.</div> : null}
        {tab === "activity" ? <div className="empty-state">Audit logging is active for core tables. A readable activity timeline is pending in the next phase.</div> : null}
      </section>
    </div>
  );
}

function DetailTable({ empty, rows }: { empty: string; rows: Record<string, string | number>[] }) {
  if (!rows.length) return <div className="empty-state">{empty}</div>;
  const headers = Object.keys(rows[0]);
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map((header) => <td key={header}>{row[header]}</td>)}</tr>)}</tbody></table></div>;
}
