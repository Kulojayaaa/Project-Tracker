import { Menu } from "lucide-react";
import { useMemo, useState } from "react";
import { AuthGate } from "./components/AuthGate";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { DashboardPage } from "./pages/DashboardPage";
import { DailySalesPage } from "./pages/DailySalesPage";
import { DcRegisterPage } from "./pages/DcRegisterPage";
import { InvoiceRegisterPage } from "./pages/InvoiceRegisterPage";
import { getPageLabel, PlaceholderPage } from "./pages/PlaceholderPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RaSchedulePage } from "./pages/RaSchedulePage";
import type { AppPage } from "./types/domain";

function pageTitle(page: AppPage) {
  if (page === "dashboard") return "Project Billing & Sales Dashboard";
  return getPageLabel(page);
}

function renderPage(page: AppPage, onNavigate: (page: AppPage) => void) {
  if (page === "dashboard") return <DashboardPage onNavigate={onNavigate} />;
  if (page === "projects-master" || page === "projects-create" || page === "projects-tracker") {
    return <ProjectsPage startInCreateMode={page === "projects-create"} />;
  }
  if (page === "billing-invoices") return <InvoiceRegisterPage />;
  if (page === "billing-ra-schedule") return <RaSchedulePage />;
  if (page === "dispatch-dc-register") return <DcRegisterPage />;
  if (page === "dispatch-dc-pending") return <DcRegisterPage pendingOnly />;
  if (page === "sales-daily" || page === "sales-summary" || page === "sales-fy-comparison") return <DailySalesPage />;
  return <PlaceholderPage page={page} />;
}

function App() {
  const [activePage, setActivePage] = useState<AppPage>("dashboard");
  const title = useMemo(() => pageTitle(activePage), [activePage]);

  return (
    <AuthGate>
      <div className="app-shell">
        <Sidebar activePage={activePage} onNavigate={setActivePage} />
        <main className="main-panel">
          <Header breadcrumb={`Dashboard / ${title}`} title={title} />
          <section className="mobile-toolbar">
            <button className="ghost-button" type="button">
              <Menu size={18} />
              Menu
            </button>
          </section>
          {renderPage(activePage, setActivePage)}
        </main>
      </div>
    </AuthGate>
  );
}

export default App;
