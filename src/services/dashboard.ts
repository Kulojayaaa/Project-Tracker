import { supabase } from "../lib/supabase";

type DashboardSummaryRow = {
  financial_year: string;
  sales_target: number | string;
  sales_achieved: number | string | null;
  current_month_sales: number | string;
  today_sales: number | string;
  latest_sales_report_date: string | null;
  balance_to_target: number | string;
  sales_achievement_percentage: number | string;
  total_wo_value: number | string;
  total_invoiced_amount: number | string;
  pending_billing_amount: number | string;
  project_billing_percentage: number | string;
  current_month_planned_billing: number | string;
  current_month_actual_billing: number | string;
  current_month_pending_planned: number | string;
  billing_plan_shortfall: number | string;
  pending_dc_invoice_value: number | string;
  project_count: number | string;
  fully_billed_project_count: number | string;
  pending_project_count: number | string;
  future_planned_billing: number | string;
  ra_due_count: number | string;
  ra_raised_count: number | string;
  ra_delayed_count: number | string;
  pending_dc_count: number | string;
  overdue_dc_count: number | string;
};

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

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function mapSummary(row: DashboardSummaryRow): DashboardSummary {
  return {
    financialYear: row.financial_year,
    salesTarget: toNumber(row.sales_target),
    salesAchieved: row.sales_achieved === null ? null : toNumber(row.sales_achieved),
    currentMonthSales: toNumber(row.current_month_sales),
    todaySales: toNumber(row.today_sales),
    latestSalesReportDate: row.latest_sales_report_date,
    balanceToTarget: toNumber(row.balance_to_target),
    salesAchievementPercentage: toNumber(row.sales_achievement_percentage),
    totalWoValue: toNumber(row.total_wo_value),
    totalInvoicedAmount: toNumber(row.total_invoiced_amount),
    pendingBillingAmount: toNumber(row.pending_billing_amount),
    projectBillingPercentage: toNumber(row.project_billing_percentage),
    currentMonthPlannedBilling: toNumber(row.current_month_planned_billing),
    currentMonthActualBilling: toNumber(row.current_month_actual_billing),
    currentMonthPendingPlanned: toNumber(row.current_month_pending_planned),
    billingPlanShortfall: toNumber(row.billing_plan_shortfall),
    pendingDcInvoiceValue: toNumber(row.pending_dc_invoice_value),
    projectCount: toNumber(row.project_count),
    fullyBilledProjectCount: toNumber(row.fully_billed_project_count),
    pendingProjectCount: toNumber(row.pending_project_count),
    futurePlannedBilling: toNumber(row.future_planned_billing),
    raDueCount: toNumber(row.ra_due_count),
    raRaisedCount: toNumber(row.ra_raised_count),
    raDelayedCount: toNumber(row.ra_delayed_count),
    pendingDcCount: toNumber(row.pending_dc_count),
    overdueDcCount: toNumber(row.overdue_dc_count)
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  const { data, error } = await supabase.from("dashboard_summary").select("*").maybeSingle();

  if (error) {
    throw new Error("Unable to load dashboard summary. Please check Supabase permissions and migrations.");
  }

  return data ? mapSummary(data as DashboardSummaryRow) : null;
}

