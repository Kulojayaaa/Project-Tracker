import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type StatusTone = "planned" | "success" | "warning" | "danger" | "neutral";

export type DashboardKpi = {
  label: string;
  value: string;
  detail: string;
  tone: StatusTone;
};

export type ActionItem = {
  title: string;
  meta: string;
  amount: string;
  tone: StatusTone;
};

export type AppPage =
  | "dashboard"
  | "projects-master"
  | "projects-tracker"
  | "projects-create"
  | "billing-invoices"
  | "billing-ra-schedule"
  | "billing-forecast"
  | "dispatch-dc-register"
  | "dispatch-dc-pending"
  | "sales-daily"
  | "sales-summary"
  | "sales-fy-comparison"
  | "reports-project-billing"
  | "reports-pending-billing"
  | "reports-ra-bill"
  | "reports-dc-pending"
  | "reports-sales"
  | "reports-hod"
  | "masters-clients"
  | "masters-project-managers"
  | "masters-project-status"
  | "masters-invoice-types"
  | "masters-billing-types"
  | "masters-locations"
  | "settings-users"
  | "settings-roles";

export type SidebarItem = {
  label: string;
  icon: LucideIcon;
  page?: AppPage;
  childPages?: { label: string; page: AppPage }[];
};

export type WithChildren = {
  children: ReactNode;
};

export type ProjectStatus = "planned" | "active" | "on_hold" | "near_completion" | "completed" | "cancelled";
export type BillStatus = "planned" | "due_soon" | "due" | "raised" | "delayed" | "cancelled" | "completed";

export type ClientOption = {
  id: string;
  name: string;
};

export type FinancialYearOption = {
  id: string;
  name: string;
  sales_target: number;
  active: boolean;
};

export type ProjectOption = {
  id: string;
  project_code: string;
  project_name: string;
  client_name: string | null;
  wo_number: string | null;
  total_wo_value: number;
  total_invoiced_amount: number;
  pending_billing_amount: number;
};

export type ProjectSummary = ProjectOption & {
  client_id: string | null;
  location: string | null;
  wo_date: string | null;
  project_start_date: string | null;
  expected_completion_date: string | null;
  project_status: ProjectStatus;
  base_wo_value: number;
  gst_value: number;
  billing_target: number;
  opening_invoiced_amount: number;
  current_invoiced_amount: number;
  billing_percentage: number;
  remarks: string | null;
};

export type ProjectFormValues = {
  project_name: string;
  client_id: string;
  location: string;
  wo_number: string;
  wo_date: string;
  project_start_date: string;
  expected_completion_date: string;
  project_status: ProjectStatus;
  base_wo_value: string;
  gst_value: string;
  billing_target: string;
  opening_invoiced_amount: string;
  remarks: string;
};

export type InvoiceRecord = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  client_name: string | null;
  invoice_type: string;
  invoice_description: string | null;
  billing_period_from: string | null;
  billing_period_to: string | null;
  amount_before_gst: number;
  gst_amount: number;
  total_amount: number;
  financial_year_id: string | null;
  financial_year_name: string | null;
};

export type InvoiceFormValues = {
  invoice_number: string;
  invoice_date: string;
  project_id: string;
  invoice_type: string;
  invoice_description: string;
  billing_period_from: string;
  billing_period_to: string;
  amount_before_gst: string;
  gst_amount: string;
  financial_year_id: string;
};

export type RaScheduleRecord = {
  id: string;
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  billing_period: string | null;
  billing_period_from: string | null;
  billing_period_to: string | null;
  proposed_bill_date: string;
  proposed_bill_amount: number;
  billing_type: string;
  work_status: string | null;
  bill_status: BillStatus;
  actual_invoice_id: string | null;
  actual_invoice_number: string | null;
  actual_invoice_date: string | null;
  actual_invoice_amount: number | null;
  reason_not_raised: string | null;
  remarks: string | null;
};

export type RaScheduleFormValues = {
  project_id: string;
  billing_period: string;
  billing_period_from: string;
  billing_period_to: string;
  proposed_bill_date: string;
  proposed_bill_amount: string;
  billing_type: string;
  work_status: string;
  bill_status: BillStatus;
  actual_invoice_id: string;
  reason_not_raised: string;
  remarks: string;
};

export type DcRecord = {
  id: string;
  dc_number: string;
  dc_date: string;
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  client_id: string | null;
  client_name: string | null;
  material_description: string;
  quantity: number;
  uom: string | null;
  dc_value: number;
  tax_invoice_required: boolean;
  tax_invoice_raised: boolean;
  invoice_id: string | null;
  invoice_number: string | null;
  expected_invoice_date: string | null;
  reason_pending: string | null;
  remarks: string | null;
  pending_days: number;
  status: string;
};

export type DcFormValues = {
  dc_number: string;
  dc_date: string;
  project_id: string;
  client_id: string;
  material_description: string;
  quantity: string;
  uom: string;
  dc_value: string;
  tax_invoice_required: boolean;
  invoice_id: string;
  expected_invoice_date: string;
  reason_pending: string;
  remarks: string;
};

export type SalesRecord = {
  id: string;
  report_date: string;
  financial_year_id: string;
  financial_year_name: string | null;
  sales_group: string;
  sales_target: number;
  sales_up_to_yesterday: number;
  today_sales: number;
  current_month_sales: number;
  cumulative_sales: number;
  achievement_percentage: number;
  balance_to_target: number;
  balance_percentage: number;
  source_reference: string | null;
  remarks: string | null;
};

export type SalesFormValues = {
  report_date: string;
  financial_year_id: string;
  sales_group: string;
  sales_target: string;
  sales_up_to_yesterday: string;
  today_sales: string;
  current_month_sales: string;
  cumulative_sales: string;
  source_reference: string;
  remarks: string;
};
