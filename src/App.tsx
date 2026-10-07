import { Menu } from "lucide-react";
import { useMemo, useState } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { DashboardPage } from "./pages/DashboardPage";
import { getPageLabel, PlaceholderPage } from "./pages/PlaceholderPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import type { AppPage } from "./types/domain";

function pageTitle(page: AppPage) {
  if (page === "dashboard") {
    return "Project Billing & Sales Dashboard";
  }

  return getPageLabel(page);
}

function renderPage(page: AppPage, onNavigate: (page: AppPage) => void) {
  if (page === "dashboard") {
    return <DashboardPage onNavigate={onNavigate} />;
  }

  if (page === "projects-master" || page === "projects-create") {
    return <ProjectsPage startInCreateMode={page === "projects-create"} />;
  }

  return <PlaceholderPage page={page} />;
}

function App() {
  const [activePage, setActivePage] = useState<AppPage>("dashboard");
  const title = useMemo(() => pageTitle(activePage), [activePage]);

  return (
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
  );
}

export default App;
