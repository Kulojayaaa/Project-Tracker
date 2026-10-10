import ExcelJS from "exceljs";
import { workbookGroups, type ImportGroup } from "../utils/projectGrouping";
import {
  financialYearFor,
  money,
  billingFigures,
  type Closure,
} from "../utils/billing";

type Issue = {
  severity: "warning" | "error";
  location: string;
  message: string;
};
export type ImportProject = {
  project_code: string;
  project_name: string;
  client_name: string;
  project_description: string;
  wo_number: string;
  wo_date: string;
  project_start_date: string;
  expected_completion_date: string;
  project_status: string;
  base_wo_value: number;
  gst_value: number;
  carry_forward: boolean;
  billing_closure: Closure;
  closure_remarks: string;
  remarks: string;
};
export type ImportOrder = {
  order_type?: "original" | "additional";
  order_code: string;
  project_code: string;
  order_number: string;
  order_date: string;
  description: string;
  base_value: number;
  gst_value: number;
  remarks: string;
};
export type ImportInvoice = {
  invoice_number: string;
  invoice_date: string;
  project_code: string;
  invoice_type: string;
  invoice_description: string;
  amount_before_gst: number;
  gst_amount: number;
  financial_year: string;
  document_type: string;
  order_code: string;
  remarks: string;
};
export type ImportSales = {
  report_date: string;
  financial_year: string;
  sales_group: string;
  sales_target: number;
  sales_up_to_yesterday: number;
  today_sales: number;
  current_month_sales: number;
  cumulative_sales: number;
  remarks: string;
};
export type TrackerPayload = {
  groups?: ImportGroup[];
  projects: ImportProject[];
  orders: ImportOrder[];
  invoices: ImportInvoice[];
  sales: ImportSales[];
  financialYears: {
    name: string;
    start_date: string;
    end_date: string;
    sales_target: number;
  }[];
};
export type TrackerPreview = {
  payload: TrackerPayload;
  issues: Issue[];
  checks: {
    metric: string;
    source: number;
    calculated: number;
    tolerance: number;
  }[];
  clientCount: number;
  creditCount: number;
};

function value(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v && typeof v === "object" && ("formula" in v || "sharedFormula" in v)) {
    if (!("result" in v) || v.result == null)
      throw new Error(
        `${cell.address}: formula has no saved result. Recalculate and save the workbook in Excel.`,
      );
    return v.result;
  }
  if (v && typeof v === "object" && "error" in v)
    throw new Error(`${cell.address}: Excel error ${v.error}`);
  if (v && typeof v === "object" && "richText" in v)
    return v.richText.map((t) => t.text).join("");
  return v;
}
const text = (row: ExcelJS.Row, col: number) =>
  String(value(row.getCell(col)) ?? "").trim();
function amount(row: ExcelJS.Row, col: number) {
  const v = value(row.getCell(col));
  if (v == null || v === "") return 0;
  if (typeof v !== "number")
    throw new Error(`${row.getCell(col).address}: expected a numeric amount.`);
  return money(v);
}
function date(row: ExcelJS.Row, col: number): string {
  const v = value(row.getCell(col));
  if (v == null || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number")
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000)
      .toISOString()
      .slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) return s;
  throw new Error(
    `${row.getCell(col).address}: date must be an Excel date or YYYY-MM-DD.`,
  );
}
export async function readTrackerWorkbook(
  buffer: ArrayBuffer,
): Promise<TrackerPreview> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const issues: Issue[] = [];
  const checks: TrackerPreview["checks"] = [];
  const payload: TrackerPayload = {
    projects: [],
    orders: [],
    invoices: [],
    sales: [],
    financialYears: [],
  };
  const sheet = (name: string, headers: Record<number, string>) => {
    const s = book.getWorksheet(name);
    if (!s) throw new Error(`Missing sheet: ${name}`);
    for (const [col, header] of Object.entries(headers))
      if (text(s.getRow(1), Number(col)) !== header)
        throw new Error(`${name}: expected column ${col} to be "${header}".`);
    return s;
  };
  const master = sheet("Project Master", {
    1: "Project ID",
    2: "Project / WO Name",
    3: "Client Name",
    8: "Base WO Value (Excl. GST)",
    11: "FY 2025-26 Net Invoiced Base",
    16: "FY 2026-27 Billing Target (Base)",
  });
  const tracker = sheet("Project Tracker", {
    1: "Project ID",
    15: "Billing Closure Decision",
  });
  const invoices = sheet("Project Invoice Master", {
    2: "Invoice Date",
    3: "Invoice No.",
    4: "Project ID",
    9: "Invoice Before GST",
    12: "FY",
  });
  const orders = sheet("WO_PO Register", {
    1: "WO/PO ID",
    3: "Assigned Project ID (Manual Dropdown)",
    22: "Base Order Value (Excl. GST)",
  });
  const closures = new Map<string, { closure: Closure; remarks: string }>();
  const closureMap: Record<string, Closure> = {
    Open: "open",
    "Closed - No Further Supply/Billing": "closed",
    "Cancelled Balance": "cancelled_balance",
    "Pending Client Confirmation": "pending_confirmation",
    "": "open",
  };
  tracker.eachRow((r, i) => {
    if (i === 1 || !text(r, 1)) return;
    const id = text(r, 1);
    const label = text(r, 15);
    if (!(label in closureMap))
      issues.push({
        severity: "error",
        location: `Project Tracker row ${i}`,
        message: `Unknown closure decision: ${label}`,
      });
    if (closures.has(id))
      issues.push({
        severity: "error",
        location: id,
        message: "Duplicate tracker project ID.",
      });
    closures.set(id, {
      closure: closureMap[label] ?? "open",
      remarks: text(r, 16),
    });
  });
  master.eachRow((r, i) => {
    if (i === 1 || !text(r, 1)) return;
    const id = text(r, 1),
      status = text(r, 7),
      carry = text(r, 12),
      closure = closures.get(id);
    if (
      !["Ongoing", "Completed", "Planned", "On Hold", "Cancelled"].includes(
        status,
      )
    )
      issues.push({
        severity: "error",
        location: id,
        message: `Unknown project status: ${status}`,
      });
    if (!["Yes", "No"].includes(carry))
      issues.push({
        severity: "error",
        location: id,
        message: "Carry-forward must be Yes or No.",
      });
    if (!text(r, 2) || !text(r, 3))
      issues.push({
        severity: "error",
        location: id,
        message: "Project name and client are required.",
      });
    if (!closure)
      issues.push({
        severity: "error",
        location: id,
        message: "Missing tracker closure record.",
      });
    if (
      closure &&
      ["closed", "cancelled_balance"].includes(closure.closure) &&
      !closure.remarks
    )
      issues.push({
        severity: "error",
        location: id,
        message: "Closed projects need closure remarks.",
      });
    const base = amount(r, 8),
      gst = amount(r, 9);
    if (base < 0 || gst < 0)
      issues.push({
        severity: "error",
        location: id,
        message: "WO base and GST cannot be negative.",
      });
    if (text(r, 15))
      issues.push({
        severity: "warning",
        location: id,
        message: `Assign project owner "${text(r, 15)}" to an existing user after import.`,
      });
    payload.projects.push({
      project_code: id,
      project_name: text(r, 2),
      client_name: text(r, 3),
      project_description: text(r, 4),
      wo_number: text(r, 5),
      wo_date: date(r, 6),
      project_start_date: date(r, 13),
      expected_completion_date: date(r, 14),
      project_status:
        (
          {
            Ongoing: "active",
            Completed: "completed",
            Planned: "planned",
            "On Hold": "on_hold",
            Cancelled: "cancelled",
          } as Record<string, string>
        )[status] ?? "planned",
      base_wo_value: base,
      gst_value: gst,
      carry_forward: carry === "Yes",
      billing_closure: closure?.closure ?? "open",
      closure_remarks: closure?.remarks ?? "",
      remarks: text(r, 17),
    });
  });
  const projectMap = new Map(payload.projects.map((p) => [p.project_code, p]));
  if (projectMap.size !== payload.projects.length)
    issues.push({
      severity: "error",
      location: "Project Master",
      message: "Duplicate project IDs.",
    });
  const usedOrders = new Set<string>();
  let derivedOrders = 0;
  orders.eachRow((r, i) => {
    if (i === 1 || !text(r, 1)) return;
    const code = text(r, 1),
      id = text(r, 3),
      p = projectMap.get(id);
    if (!p) {
      issues.push({
        severity: "error",
        location: code,
        message: "Order refers to an unknown project.",
      });
      return;
    }
    if (usedOrders.has(code))
      issues.push({
        severity: "error",
        location: code,
        message: "Duplicate order ID.",
      });
    usedOrders.add(code);
    if (
      text(r, 9) !== "Original" ||
      text(r, 12) !== "Active" ||
      text(r, 10) ||
      text(r, 25)
    )
      issues.push({
        severity: "error",
        location: code,
        message:
          "Revised or inactive orders need manual mapping before import.",
      });
    const missing = value(r.getCell(22)) == null || value(r.getCell(22)) === "";
    if (missing) derivedOrders++;
    payload.orders.push({
      order_code: code,
      order_type:
        p.project_name === "Prestige Lake Additional Works"
          ? "additional"
          : "original",
      project_code: id,
      order_number: text(r, 6) || p.wo_number,
      order_date: date(r, 7) || p.wo_date,
      description: text(r, 8) || p.project_description,
      base_value: missing ? p.base_wo_value : amount(r, 22),
      gst_value: value(r.getCell(23)) == null ? p.gst_value : amount(r, 23),
      remarks: text(r, 18),
    });
  });
  for (const p of payload.projects)
    if (
      payload.orders.filter((o) => o.project_code === p.project_code).length >
        1 &&
      derivedOrders
    )
      issues.push({
        severity: "error",
        location: p.project_code,
        message: "Multiple orders require verified order-level base amounts.",
      });
  if (derivedOrders)
    issues.push({
      severity: "warning",
      location: "WO/PO Register",
      message: `${derivedOrders} blank order base values will use their Project Master base amounts; GST-inclusive source values are not used for billing.`,
    });
  let inferredLinks = 0,
    creditCount = 0;
  const seenInvoices = new Set<string>();
  invoices.eachRow((r, i) => {
    if (i === 1) return;
    // Template formula rows are not transaction records.
    if (value(r.getCell(2)) == null && !text(r, 3)) return;
    const number = text(r, 3),
      id = text(r, 4),
      d = date(r, 2),
      base = amount(r, 9),
      gst = amount(r, 10);
    if (!number || !d || !projectMap.has(id))
      issues.push({
        severity: "error",
        location: `Invoice row ${i}`,
        message: "Invoice number, date and a valid Project ID are required.",
      });
    if (seenInvoices.has(number))
      issues.push({
        severity: "error",
        location: number,
        message: "Duplicate invoice number.",
      });
    seenInvoices.add(number);
    const fy = financialYearFor(d);
    if (text(r, 12).replace(/^FY\s*/i, "") !== fy)
      issues.push({
        severity: "error",
        location: number,
        message: "Saved financial year differs from invoice date.",
      });
    const credit = base < 0;
    if (
      (credit && gst > 0) ||
      (!credit && gst < 0) ||
      (text(r, 16) === "Credit Note" && !credit)
    )
      issues.push({
        severity: "error",
        location: number,
        message: "Credit-note and GST signs must agree.",
      });
    if (credit) creditCount++;
    const candidates = payload.orders.filter((o) => o.project_code === id);
    let order = text(r, 15);
    if (!order && candidates.length === 1) {
      order = candidates[0].order_code;
      inferredLinks++;
    }
    if (!order || !candidates.some((o) => o.order_code === order))
      issues.push({
        severity: "error",
        location: number,
        message: "Invoice needs a valid WO/PO in its project.",
      });
    payload.invoices.push({
      invoice_number: number,
      invoice_date: d,
      project_code: id,
      invoice_type: text(r, 7),
      invoice_description: text(r, 8),
      amount_before_gst: base,
      gst_amount: gst,
      financial_year: fy,
      document_type: credit ? "credit_note" : "tax_invoice",
      order_code: order,
      remarks: text(r, 14),
    });
  });
  if (inferredLinks)
    issues.push({
      severity: "warning",
      location: "Invoice Register",
      message: `${inferredLinks} missing WO/PO links will use the single order belonging to each project.`,
    });
  if (creditCount)
    issues.push({
      severity: "warning",
      location: "Invoice Register",
      message: `${creditCount} negative entries will become credit notes. Their original tax invoices must be verified and linked after import.`,
    });
  const sales = sheet("Daily Sales", {
    1: "Report Date",
    2: "Sales Group",
    7: "Cumulative FY Sales",
  });
  sales.eachRow((r, i) => {
    if (i === 1 || value(r.getCell(1)) == null) return;
    const d = date(r, 1);
    const yesterday = amount(r, 4),
      today = amount(r, 5),
      cumulative = amount(r, 7);
    if (Math.abs(money(yesterday + today - cumulative)) > 0.01)
      issues.push({
        severity: "error",
        location: `Daily Sales row ${i}`,
        message: "Cumulative sales differs from yesterday plus today.",
      });
    payload.sales.push({
      report_date: d,
      financial_year: financialYearFor(d),
      sales_group: text(r, 2),
      sales_target: amount(r, 3),
      sales_up_to_yesterday: yesterday,
      today_sales: today,
      current_month_sales: amount(r, 6),
      cumulative_sales: cumulative,
      remarks: text(r, 12),
    });
  });
  const fys = new Set([
    ...payload.invoices.map((i) => i.financial_year),
    ...payload.sales.map((s) => s.financial_year),
    "2026-27",
  ]);
  payload.financialYears = [...fys].sort().map((name) => ({
    name,
    start_date: `${name.slice(0, 4)}-04-01`,
    end_date: `${Number(name.slice(0, 4)) + 1}-03-31`,
    sales_target:
      payload.sales.find((s) => s.financial_year === name)?.sales_target ?? 0,
  }));
  const summaries = payload.projects.map((p) => {
    const inv = payload.invoices.filter(
      (i) => i.project_code === p.project_code,
    );
    const prior = inv
      .filter((i) => i.invoice_date < "2026-04-01")
      .reduce((s, i) => s + i.amount_before_gst, 0);
    const current = inv
      .filter(
        (i) => i.invoice_date >= "2026-04-01" && i.invoice_date <= "2027-03-31",
      )
      .reduce((s, i) => s + i.amount_before_gst, 0);
    const figures = billingFigures(
      p.base_wo_value,
      0,
      prior,
      current,
      p.carry_forward,
      p.billing_closure,
    );
    if (figures.fyTarget < 0)
      issues.push({
        severity: "warning",
        location: p.project_code,
        message:
          "Prior billing exceeds the order base; the signed FY target is retained. Verify order revisions and credit notes.",
      });
    return figures;
  });
  const summary = book.getWorksheet("Summary");
  if (summary) {
    checks.push({
      metric: "FY 2026-27 net invoicing (base)",
      source: amount(summary.getRow(15), 3),
      calculated: money(
        payload.invoices
          .filter((i) => i.financial_year === "2026-27")
          .reduce((s, i) => s + i.amount_before_gst, 0),
      ),
      tolerance: 0.01,
    });
    checks.push({
      metric: "FY 2026-27 target (Excel rounds each project)",
      source: amount(summary.getRow(14), 3),
      calculated: summaries.reduce((s, f) => s + Math.round(f.fyTarget), 0),
      tolerance: 1,
    });
    checks.push({
      metric: "Pending billing (Excel rounds each project)",
      source: amount(summary.getRow(16), 3),
      calculated: summaries.reduce((s, f) => s + Math.round(f.pending), 0),
      tolerance: 1,
    });
    for (const c of checks)
      if (Math.abs(c.source - c.calculated) > c.tolerance)
        issues.push({
          severity: "error",
          location: "Summary",
          message: `${c.metric} does not reconcile. Difference: ${money(c.calculated - c.source)}.`,
        });
  }
  if (!payload.projects.length || !payload.invoices.length)
    issues.push({
      severity: "error",
      location: "Workbook",
      message: "No projects or invoice records found.",
    });
  payload.groups = workbookGroups(payload.projects);
  for (const order of payload.orders) {
    if (/\bAMD[-\s]?\d+/i.test(order.order_number))
      issues.push({
        severity: "warning",
        location: order.order_code,
        message:
          "Amended WO reference: the supplied current value is counted once. The previous order value/version is not provided and must not be added again.",
      });
  }
  return {
    payload,
    issues,
    checks,
    clientCount: new Set(payload.projects.map((p) => p.client_name)).size,
    creditCount,
  };
}
