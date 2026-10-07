import type { ActionItem, DashboardKpi } from "../types/domain";

export const dashboardKpis: DashboardKpi[] = [
  { label: "Sales Target", value: "₹25.00 Cr", detail: "FY 2026-27 default target", tone: "planned" },
  { label: "Sales Achieved", value: "No sales data", detail: "Awaiting accounts entry", tone: "neutral" },
  { label: "Project Billing Pending", value: "No project data", detail: "Calculated after project entry", tone: "warning" },
  { label: "DC Pending Invoice", value: "No DC data", detail: "Pending DCs will appear after entry", tone: "success" }
];

export const actionItems: ActionItem[] = [
  {
    title: "RA bills due",
    meta: "No live schedules loaded yet",
    amount: "No items",
    tone: "neutral"
  },
  {
    title: "DC invoice pending",
    meta: "Pending DCs will appear here",
    amount: "No items",
    tone: "success"
  },
  {
    title: "Billing plan shortfall",
    meta: "Calculated from pending billing and future plans",
    amount: "Pending setup",
    tone: "planned"
  }
];
