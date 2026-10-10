import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import { ModuleMessage } from "../components/FormBits";
import { getPageLabel } from "./PlaceholderPage";
import {
  listDcs,
  listInvoices,
  listRaSchedules,
  listSales,
} from "../services/operations";
import type { AppPage } from "../types/domain";
import { listProjectSummaries } from "../services/projects";
import { localDate } from "../utils/billing";
import { formatCurrencyCompact, percentage } from "../utils/formatting";

type ReportRow = Record<string, string | number>;

type ReportsPageProps = {
  page: AppPage;
};

async function downloadExcelWorkbook(title: string, rows: ReportRow[]) {
  if (!rows.length) return;
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.min(Math.max(header.length + 4, 18), 40),
  }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: headers.length },
  };
  const metadata = workbook.addWorksheet("Metadata");
  metadata.addRows([
    ["Report", title],
    [
      "Generated",
      new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    ],
    ["Billing Basis", "Base amounts excluding GST; credit notes deducted"],
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".xlsx";
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
        const projects = await listProjectSummaries();
        setRows(
          projects.map((project) => ({
            "Project ID": project.project_code,
            Project: project.project_name,
            Client: project.client_name ?? "-",
            "WO Number": project.wo_number ?? "-",
            "WO Base Value": project.base_wo_value,
            "Prior FY / Opening Base": project.opening_invoiced_amount,
            "FY Target Base": project.fy_billing_target,
            "FY Net Invoiced": project.current_invoiced_amount,
            "Lifetime Net Invoiced": project.total_invoiced_amount,
            "Unbilled / Credit Balance": project.raw_remaining_amount,
            "Billing Status": project.billing_status,
            "Pending Billing": project.pending_billing_amount,
          })),
        );
      } else if (page === "reports-pending-billing") {
        const projects = await listProjectSummaries();
        setRows(
          projects
            .filter((project) => project.pending_billing_amount > 0)
            .sort((a, b) => b.pending_billing_amount - a.pending_billing_amount)
            .map((project) => ({
              Project: `${project.project_code} - ${project.project_name}`,
              Client: project.client_name ?? "-",
              "WO Base Value": project.base_wo_value,
              Invoiced: project.total_invoiced_amount,
              Pending: project.pending_billing_amount,
              Status: "Pending Billing",
            })),
        );
      } else if (page === "reports-ra-bill") {
        const schedules = await listRaSchedules();
        setRows(
          schedules.map((schedule) => ({
            Project: `${schedule.project_code} - ${schedule.project_name}`,
            "Billing Period": schedule.billing_period ?? "-",
            "Proposed Date": schedule.proposed_bill_date,
            "Proposed Amount": schedule.proposed_bill_amount,
            "Raised?": schedule.actual_invoice_id ? "Yes" : "No",
            "Invoice No.": schedule.actual_invoice_number ?? "-",
            "Actual Amount": schedule.actual_invoice_amount ?? 0,
            Status: schedule.bill_status,
            "Reason Pending": schedule.reason_not_raised ?? "-",
          })),
        );
      } else if (page === "reports-dc-pending") {
        const dcs = await listDcs(true);
        setRows(
          dcs
            .sort((a, b) => b.pending_days - a.pending_days)
            .map((dc) => ({
              "DC No.": dc.dc_number,
              "DC Date": dc.dc_date,
              Project: `${dc.project_code} - ${dc.project_name}`,
              Client: dc.client_name ?? "-",
              "DC Value": dc.dc_value,
              "Expected Invoice Date": dc.expected_invoice_date ?? "-",
              "Pending Days": dc.pending_days,
              Status: dc.status,
            })),
        );
      } else if (page === "reports-sales") {
        const sales = await listSales();
        setRows(
          sales.map((sale) => ({
            FY: sale.financial_year_name ?? "-",
            "Report Date": sale.report_date,
            "Sales Target": sale.sales_target,
            "Sales Achieved": sale.cumulative_sales,
            "Achievement %": percentage(sale.achievement_percentage),
            Balance: sale.balance_to_target,
            "Today's Sales": sale.today_sales,
            "Current Month Sales": sale.current_month_sales,
          })),
        );
      } else {
        const [projects, schedules, dcs, sales, invoices] = await Promise.all([
          listProjectSummaries(),
          listRaSchedules(),
          listDcs(true),
          listSales(),
          listInvoices(),
        ]);
        const latestSales = sales[0];
        setRows([
          {
            Section: "Sales Performance",
            Metric: "Sales Achieved",
            Value: latestSales
              ? formatCurrencyCompact(latestSales.cumulative_sales)
              : "No sales data",
          },
          {
            Section: "Sales Performance",
            Metric: "Balance",
            Value: latestSales
              ? formatCurrencyCompact(latestSales.balance_to_target)
              : "No sales data",
          },
          {
            Section: "Project Billing",
            Metric: "WO Base Value",
            Value: formatCurrencyCompact(
              projects.reduce((sum, project) => sum + project.base_wo_value, 0),
            ),
          },
          {
            Section: "Project Billing",
            Metric: "Pending Billing",
            Value: formatCurrencyCompact(
              projects.reduce(
                (sum, project) => sum + project.pending_billing_amount,
                0,
              ),
            ),
          },
          {
            Section: "Current Month Billing",
            Metric: "Invoices Entered",
            Value: invoices.filter((i) =>
              i.invoice_date.startsWith(localDate().slice(0, 7)),
            ).length,
          },
          {
            Section: "Upcoming RA Bills",
            Metric: "Open Schedules",
            Value: schedules.filter(
              (schedule) =>
                !["raised", "completed", "cancelled"].includes(
                  schedule.bill_status,
                ),
            ).length,
          },
          {
            Section: "DC Pending Tax Invoices",
            Metric: "Pending DCs",
            Value: dcs.length,
          },
          {
            Section: "Key Actions",
            Metric: "Top Attention",
            Value:
              "Review pending billing, delayed RA bills, and overdue DC invoices",
          },
        ]);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load report.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page]);

  const headers = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  return (
    <div className="page-stack report-page">
      {error ? <ModuleMessage tone="error">{error}</ModuleMessage> : null}
      <section className="panel">
        <div className="panel-header controls-header">
          <div>
            <h2>{title}</h2>
            <p></p>
          </div>
          <div className="button-row">
            <button
              className="outline-button"
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              className="outline-button"
              onClick={() =>
                void downloadExcelWorkbook(title, rows).catch((e) =>
                  setError(e instanceof Error ? e.message : "Export failed."),
                )
              }
              type="button"
            >
              <Download size={16} />
              Export Excel
            </button>
            <button
              className="outline-button"
              onClick={() => window.print()}
              type="button"
            >
              <Printer size={16} />
              Print / PDF
            </button>
          </div>
        </div>
        {loading ? <div className="empty-state">Loading report...</div> : null}
        {!loading && !rows.length ? (
          <div className="empty-state">
            No report data found for the current records.
          </div>
        ) : null}
        {!loading && rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    {headers.map((header) => (
                      <td key={header}>
                        {typeof row[header] === "number" &&
                        !header.includes("%") &&
                        !header.includes("Days") &&
                        header !== "Value"
                          ? formatCurrencyCompact(row[header] as number)
                          : row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
