import { Menu } from "lucide-react";
import { useMemo, useState } from "react";
import { AuthGate } from "./components/AuthGate";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { BillingForecastPage } from "./pages/BillingForecastPage";
import { ClientsPage } from "./pages/ClientsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DailySalesPage } from "./pages/DailySalesPage";
import { DcRegisterPage } from "./pages/DcRegisterPage";
import { InvoiceRegisterPage } from "./pages/InvoiceRegisterPage";
import { getPageLabel, PlaceholderPage } from "./pages/PlaceholderPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RaSchedulePage } from "./pages/RaSchedulePage";
import { ReportsPage } from "./pages/ReportsPage";
import type { AppPage } from "./types/domain";

function pageTitle(page: AppPage, selectedProjectId: string | null) {
  if (selectedProjectId) return "Project Detail";
  if (page === "dashboard") return "Project Billing & Sales Dashboard";
  return getPageLabel(page);
}

function renderPage(page: AppPage, onNavigate: (page: AppPage) => void, selectedProjectId: string | null, onOpenProject: (projectId: string) => void, onBackToProjects: () => void) {
  if (selectedProjectId) return <ProjectDetailPage onBack={onBackToProjects} onNavigate={onNavigate} projectId={selectedProjectId} />;
  if (page === "dashboard") return <DashboardPage onNavigate={onNavigate} />;
  if (page === "masters-clients") return <ClientsPage />;
  if (page === "projects-master" || page === "projects-create" || page === "projects-tracker") {
    return <ProjectsPage onOpenProject={onOpenProject} startInCreateMode={page === "projects-create"} />;
  }
  if (page === "billing-invoices") return <InvoiceRegisterPage />;
  if (page === "billing-ra-schedule") return <RaSchedulePage />;
  if (page === "billing-forecast") return <BillingForecastPage />;
  if (page === "dispatch-dc-register") return <DcRegisterPage />;
  if (page === "dispatch-dc-pending") return <DcRegisterPage pendingOnly />;
  if (page === "sales-daily" || page === "sales-summary" || page === "sales-fy-comparison") return <DailySalesPage />;
  if (page.startsWith("reports-")) return <ReportsPage page={page} />;
  return <PlaceholderPage page={page} />;
}

function App() {
  const [activePage, setActivePage] = useState<AppPage>("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const title = useMemo(() => pageTitle(activePage, selectedProjectId), [activePage, selectedProjectId]);

  function navigate(page: AppPage) {
    setSelectedProjectId(null);
    setActivePage(page);
  }

  return (
    <AuthGate>
      <div className="app-shell">
        <Sidebar activePage={activePage} onNavigate={navigate} />
        <main className="main-panel">
          <Header breadcrumb={`Dashboard / ${title}`} title={title} />
          <section className="mobile-toolbar">
            <button className="ghost-button" type="button">
              <Menu size={18} />
              Menu
            </button>
          </section>
          {renderPage(activePage, navigate, selectedProjectId, setSelectedProjectId, () => { setSelectedProjectId(null); setActivePage("projects-tracker"); })}
        </main>
      </div>
    </AuthGate>
  );
}

export default App;



