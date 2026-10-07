import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import { ModuleMessage } from "../components/FormBits";
import { getPageLabel } from "./PlaceholderPage";
import {
  listDcs,
  listInvoices,
  listProjectOptions,
  listRaSchedules,
  listSales
} from "../services/operations";
import type { AppPage } from "../types/domain";
import { formatCurrencyCompact, percentage } from "../utils/formatting";

type ReportRow = Record<string, string | number>;

type ReportsPageProps = {
  page: AppPage;
};

function downloadCsv(title: string, rows: ReportRow[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage({ page }: ReportsPageProps) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const title = getPageLabel(page);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (page === "reports-project-billing") {
        const projects = await listProjectOptions();
        setRows(projects.map((project) => ({
          "Project ID": project.project_code,
          Project: project.project_name,
          Client: project.client_name ?? "-",
          "WO Number": project.wo_number ?? "-",
          "WO Value": project.total_wo_value,
          "Total Invoiced": project.total_invoiced_amount,
          "Pending Billing": project.pending_billing_amount
        })));
      } else if (page === "reports-pending-billing") {
        const projects = await listProjectOptions();
        setRows(projects.filter((project) => project.pending_billing_amount > 0).sort((a, b) => b.pending_billing_amount - a.pending_billing_amount).map((project) => ({
          Project: `${project.project_code} - ${project.project_name}`,
          Client: project.client_name ?? "-",
          "WO Value": project.total_wo_value,
          Invoiced: project.total_invoiced_amount,
          Pending: project.pending_billing_amount,
          Status: "Pending Billing"
        })));
      } else if (page === "reports-ra-bill") {
        const schedules = await listRaSchedules();
        setRows(schedules.map((schedule) => ({
          Project: `${schedule.project_code} - ${schedule.project_name}`,
          "Billing Period": schedule.billing_period ?? "-",
          "Proposed Date": schedule.proposed_bill_date,
          "Proposed Amount": schedule.proposed_bill_amount,
          "Raised?": schedule.actual_invoice_id ? "Yes" : "No",
          "Invoice No.": schedule.actual_invoice_number ?? "-",
          "Actual Amount": schedule.actual_invoice_amount ?? 0,
          Status: schedule.bill_status,
          "Reason Pending": schedule.reason_not_raised ?? "-"
        })));
      } else if (page === "reports-dc-pending") {
        const dcs = await listDcs(true);
        setRows(dcs.sort((a, b) => b.pending_days - a.pending_days).map((dc) => ({
          "DC No.": dc.dc_number,
          "DC Date": dc.dc_date,
          Project: `${dc.project_code} - ${dc.project_name}`,
          Client: dc.client_name ?? "-",
          "DC Value": dc.dc_value,
          "Expected Invoice Date": dc.expected_invoice_date ?? "-",
          "Pending Days": dc.pending_days,
          Status: dc.status
        })));
      } else if (page === "reports-sales") {
        const sales = await listSales();
        setRows(sales.map((sale) => ({
          FY: sale.financial_year_name ?? "-",
          "Report Date": sale.report_date,
          "Sales Target": sale.sales_target,
          "Sales Achieved": sale.cumulative_sales,
          "Achievement %": percentage(sale.achievement_percentage),
          Balance: sale.balance_to_target,
          "Today's Sales": sale.today_sales,
          "Current Month Sales": sale.current_month_sales
        })));
      } else {
        const [projects, schedules, dcs, sales, invoices] = await Promise.all([listProjectOptions(), listRaSchedules(), listDcs(true), listSales(), listInvoices()]);
        const latestSales = sales[0];
        setRows([
          { Section: "Sales Performance", Metric: "Sales Achieved", Value: latestSales ? formatCurrencyCompact(latestSales.cumulative_sales) : "No sales data" },
          { Section: "Sales Performance", Metric: "Balance", Value: latestSales ? formatCurrencyCompact(latestSales.balance_to_target) : "No sales data" },
          { Section: "Project Billing", Metric: "Total WO Value", Value: formatCurrencyCompact(projects.reduce((sum, project) => sum + project.total_wo_value, 0)) },
          { Section: "Project Billing", Metric: "Pending Billing", Value: formatCurrencyCompact(projects.reduce((sum, project) => sum + project.pending_billing_amount, 0)) },
          { Section: "Current Month Billing", Metric: "Invoices Entered", Value: invoices.length },
          { Section: "Upcoming RA Bills", Metric: "Open Schedules", Value: schedules.filter((schedule) => !["raised", "completed", "cancelled"].includes(schedule.bill_status)).length },
          { Section: "DC Pending Tax Invoices", Metric: "Pending DCs", Value: dcs.length },
          { Section: "Key Actions", Metric: "Top Attention", Value: "Review pending billing, delayed RA bills, and overdue DC invoices" }
        ]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [page]);

  const headers = useMemo(() => rows[0] ? Object.keys(rows[0]) : [], [rows]);

  return (
    <div className="page-stack report-page">
      {error ? <ModuleMessage tone="error">{error}</ModuleMessage> : null}
      <section className="panel">
        <div className="panel-header controls-header">
          <div><h2>{title}</h2><p>Exports use the currently loaded report rows. Use print for a PDF-ready report.</p></div>
          <div className="button-row"><button className="outline-button" onClick={() => void load()} type="button"><RefreshCw size={16} />Refresh</button><button className="outline-button" onClick={() => downloadCsv(title, rows)} type="button"><Download size={16} />Export Excel CSV</button><button className="outline-button" onClick={() => window.print()} type="button"><Printer size={16} />Print / PDF</button></div>
        </div>
        {loading ? <div className="empty-state">Loading report...</div> : null}
        {!loading && !rows.length ? <div className="empty-state">No report data found for the current records.</div> : null}
        {!loading && rows.length ? <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map((header) => <td key={header}>{typeof row[header] === "number" && !header.includes("%") && !header.includes("Days") && header !== "Value" ? formatCurrencyCompact(row[header] as number) : row[header]}</td>)}</tr>)}</tbody></table></div> : null}
      </section>
    </div>
  );
}
