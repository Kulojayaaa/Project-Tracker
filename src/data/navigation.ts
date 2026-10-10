import {
  FileText,
  FolderKanban,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  TrendingUp,
  Truck,
} from "lucide-react";
import type { SidebarItem } from "../types/domain";

export const mainNavigation: SidebarItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, page: "dashboard" },
  {
    label: "Projects",
    icon: FolderKanban,
    childPages: [
      { label: "Project Master", page: "projects-master" },
      { label: "Project Tracker", page: "projects-tracker" },
      { label: "Create Project", page: "projects-create" },
      { label: "WO/PO Register", page: "projects-orders" },
    ],
  },
  {
    label: "Billing",
    icon: Receipt,
    childPages: [
      { label: "Invoice Register", page: "billing-invoices" },
      { label: "RA Bill Schedule", page: "billing-ra-schedule" },
      { label: "Billing Forecast", page: "billing-forecast" },
    ],
  },
  {
    label: "Dispatch & Invoicing",
    icon: Truck,
    childPages: [
      { label: "DC Register", page: "dispatch-dc-register" },
      { label: "DC Pending Invoice", page: "dispatch-dc-pending" },
    ],
  },
  {
    label: "Sales",
    icon: TrendingUp,
    childPages: [
      { label: "Daily Sales", page: "sales-daily" },
      { label: "Sales Summary", page: "sales-summary" },
      { label: "FY Comparison", page: "sales-fy-comparison" },
    ],
  },
  {
    label: "Reports",
    icon: FileText,
    childPages: [
      { label: "Project Billing Report", page: "reports-project-billing" },
      { label: "Pending Billing Report", page: "reports-pending-billing" },
      { label: "RA Bill Report", page: "reports-ra-bill" },
      { label: "DC Pending Invoice Report", page: "reports-dc-pending" },
      { label: "Sales Report", page: "reports-sales" },
      { label: "Management / HOD Report", page: "reports-hod" },
    ],
  },
];

export const adminNavigation: SidebarItem[] = [
  {
    label: "Masters",
    icon: ShieldCheck,
    childPages: [
      { label: "Clients", page: "masters-clients" },
      { label: "Project Managers", page: "masters-project-managers" },
      { label: "Project Status", page: "masters-project-status" },
      { label: "Invoice Types", page: "masters-invoice-types" },
      { label: "Billing Types", page: "masters-billing-types" },
      { label: "Locations", page: "masters-locations" },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    childPages: [
      { label: "Excel Import", page: "settings-import" },
      { label: "Financial Years", page: "settings-financial-years" },
      { label: "User Management", page: "settings-users" },
      { label: "Roles & Permissions", page: "settings-roles" },
    ],
  },
];
