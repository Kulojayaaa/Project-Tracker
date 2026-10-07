import type { AppPage } from "../types/domain";

const pageLabels: Record<AppPage, string> = {
  dashboard: "Dashboard",
  "projects-master": "Project Master",
  "projects-tracker": "Project Tracker",
  "projects-create": "Create Project",
  "billing-invoices": "Invoice Register",
  "billing-ra-schedule": "RA Bill Schedule",
  "billing-forecast": "Billing Forecast",
  "dispatch-dc-register": "DC Register",
  "dispatch-dc-pending": "DC Pending Invoice",
  "sales-daily": "Daily Sales",
  "sales-summary": "Sales Summary",
  "sales-fy-comparison": "FY Comparison",
  "reports-project-billing": "Project Billing Report",
  "reports-pending-billing": "Pending Billing Report",
  "reports-ra-bill": "RA Bill Report",
  "reports-dc-pending": "DC Pending Invoice Report",
  "reports-sales": "Sales Report",
  "reports-hod": "Management / HOD Report",
  "masters-clients": "Clients",
  "masters-project-managers": "Project Managers",
  "masters-project-status": "Project Status",
  "masters-invoice-types": "Invoice Types",
  "masters-billing-types": "Billing Types",
  "masters-locations": "Locations",
  "settings-users": "User Management",
  "settings-roles": "Roles & Permissions"
};

type PlaceholderPageProps = {
  page: AppPage;
};

export function getPageLabel(page: AppPage) {
  return pageLabels[page];
}

export function PlaceholderPage({ page }: PlaceholderPageProps) {
  return (
    <section className="panel placeholder-panel">
      <h2>{pageLabels[page]}</h2>
      <p>
        This module is queued for the next implementation step. Navigation now reaches this page, so the feature can be built
        incrementally without dead sidebar buttons.
      </p>
    </section>
  );
}
