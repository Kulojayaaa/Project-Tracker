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

export type ClientOption = {
  id: string;
  name: string;
};

export type ProjectSummary = {
  id: string;
  project_code: string;
  project_name: string;
  client_id: string | null;
  client_name: string | null;
  location: string | null;
  wo_number: string | null;
  wo_date: string | null;
  project_start_date: string | null;
  expected_completion_date: string | null;
  project_status: ProjectStatus;
  base_wo_value: number;
  gst_value: number;
  total_wo_value: number;
  billing_target: number;
  opening_invoiced_amount: number;
  current_invoiced_amount: number;
  total_invoiced_amount: number;
  pending_billing_amount: number;
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
