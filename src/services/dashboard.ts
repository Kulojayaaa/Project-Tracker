import { allRows } from "./data";
import { listProjectSummaries } from "./projects";
import {
  listDcs,
  listInvoices,
  listRaSchedules,
  listSales,
} from "./operations";
import { localDate, money } from "../utils/billing";
export type DashboardSummary = {
  financialYear: string;
  salesTarget: number;
  salesAchieved: number | null;
  currentMonthSales: number;
  todaySales: number;
  latestSalesReportDate: string | null;
  balanceToTarget: number;
  salesAchievementPercentage: number;
  totalWoValue: number;
  totalInvoicedAmount: number;
  pendingBillingAmount: number;
  projectBillingPercentage: number;
  currentMonthPlannedBilling: number;
  currentMonthActualBilling: number;
  currentMonthPendingPlanned: number;
  billingPlanShortfall: number;
  pendingDcInvoiceValue: number;
  projectCount: number;
  fullyBilledProjectCount: number;
  pendingProjectCount: number;
  futurePlannedBilling: number;
  raDueCount: number;
  raRaisedCount: number;
  raDelayedCount: number;
  pendingDcCount: number;
  overdueDcCount: number;
};

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  const years = await allRows<Record<string, unknown>>("financial_years");
  const fy = years
    .filter((y) => y.active)
    .sort((a, b) =>
      String(b.start_date).localeCompare(String(a.start_date)),
    )[0];
  if (!fy) return null;
  const [projects, invoices, plans, dcs, sales] = await Promise.all([
    listProjectSummaries(),
    listInvoices(),
    listRaSchedules(),
    listDcs(true),
    listSales(),
  ]);
  const snapshot = sales.find(
    (s) => s.financial_year_id === fy.id && s.sales_group === "Irrigation",
  );
  const target = snapshot?.sales_target ?? money(fy.sales_target);
  const today = localDate();
  const month = today.slice(0, 7);
  const monthPlans = plans.filter(
    (r) =>
      r.proposed_bill_date.startsWith(month) && r.bill_status !== "cancelled",
  );
  const open = plans.filter(
    (r) => !["raised", "completed", "cancelled"].includes(r.bill_status),
  );
  const sum = (values: number[]) => money(values.reduce((a, b) => a + b, 0));
  const pending = sum(projects.map((p) => p.pending_billing_amount));
  const future = sum(projects.map((p) => p.future_planned_billing));
  const fyTarget = sum(projects.map((p) => p.fy_billing_target));
  const fyInvoiced = sum(projects.map((p) => p.current_invoiced_amount));
  return {
    financialYear: String(fy.name),
    salesTarget: target,
    salesAchieved: snapshot?.cumulative_sales ?? null,
    currentMonthSales: snapshot?.current_month_sales ?? 0,
    todaySales: snapshot?.report_date === today ? snapshot.today_sales : 0,
    latestSalesReportDate: snapshot?.report_date ?? null,
    balanceToTarget: Math.max(target - (snapshot?.cumulative_sales ?? 0), 0),
    salesAchievementPercentage:
      target > 0 ? ((snapshot?.cumulative_sales ?? 0) / target) * 100 : 0,
    totalWoValue: sum(projects.map((p) => p.base_wo_value)),
    totalInvoicedAmount: fyInvoiced,
    pendingBillingAmount: pending,
    projectBillingPercentage: fyTarget > 0 ? (fyInvoiced / fyTarget) * 100 : 0,
    currentMonthPlannedBilling: sum(
      monthPlans.map((r) => r.proposed_bill_amount),
    ),
    currentMonthActualBilling: sum(
      invoices
        .filter(
          (i) =>
            i.invoice_date.startsWith(month) &&
            i.invoice_date >= String(fy.start_date) &&
            i.invoice_date <= String(fy.end_date),
        )
        .map((i) => i.amount_before_gst),
    ),
    currentMonthPendingPlanned: sum(
      monthPlans
        .filter((r) => open.some((o) => o.id === r.id))
        .map((r) => r.proposed_bill_amount),
    ),
    billingPlanShortfall: sum(
      projects.map((p) =>
        Math.max(p.pending_billing_amount - p.future_planned_billing, 0),
      ),
    ),
    pendingDcInvoiceValue: sum(dcs.map((d) => d.dc_value)),
    projectCount: projects.length,
    fullyBilledProjectCount: projects.filter(
      (p) => p.billing_status === "Fully Billed",
    ).length,
    pendingProjectCount: projects.filter((p) => p.pending_billing_amount > 0)
      .length,
    futurePlannedBilling: future,
    raDueCount: open.filter((r) => r.proposed_bill_date <= today).length,
    raRaisedCount: plans.filter((r) =>
      ["raised", "completed"].includes(r.bill_status),
    ).length,
    raDelayedCount: open.filter((r) => r.proposed_bill_date < today).length,
    pendingDcCount: dcs.length,
    overdueDcCount: dcs.filter((d) => d.status === "Overdue").length,
  };
}
