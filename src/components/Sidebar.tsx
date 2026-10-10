import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { adminNavigation, mainNavigation } from "../data/navigation";
import type { AppPage, SidebarItem } from "../types/domain";

type SidebarProps = {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
};

function NavigationGroup({
  activePage,
  onNavigate,
  title,
  items,
}: SidebarProps & { title: string; items: SidebarItem[] }) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  return (
    <section className="nav-section">
      <p className="nav-title">{title}</p>
      <div className="nav-list">
        {items.map((item) => {
          const Icon = item.icon;
          const hasChildren = Boolean(item.childPages?.length);
          const isActive =
            item.page === activePage ||
            item.childPages?.some((child) => child.page === activePage);

          return (
            <div className="nav-group" key={item.label}>
              <button
                className={`nav-item ${isActive ? "active" : ""}`}
                aria-expanded={
                  hasChildren ? !collapsed.includes(item.label) : undefined
                }
                onClick={() =>
                  item.page
                    ? onNavigate(item.page)
                    : setCollapsed((current) =>
                        current.includes(item.label)
                          ? current.filter((label) => label !== item.label)
                          : [...current, item.label],
                      )
                }
                type="button"
              >
                <span className="nav-item-main">
                  <Icon size={18} strokeWidth={2.2} />
                  <span>{item.label}</span>
                </span>
                {hasChildren ? <ChevronDown size={15} /> : null}
              </button>
              {hasChildren && !collapsed.includes(item.label) ? (
                <div className="nav-children">
                  {item.childPages?.map((child) => (
                    <button
                      className={`nav-child ${child.page === activePage ? "active" : ""}`}
                      key={child.page}
                      onClick={() => onNavigate(child.page)}
                      type="button"
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside id="app-sidebar" className="sidebar">
      <div className="brand">
        <div className="brand-mark">IPI</div>
        <div>
          <strong>IPI Billing & Sales</strong>
          <span>Irrigation Department</span>
        </div>
      </div>
      <NavigationGroup
        activePage={activePage}
        onNavigate={onNavigate}
        title="Main"
        items={mainNavigation}
      />
      <NavigationGroup
        activePage={activePage}
        onNavigate={onNavigate}
        title="Admin"
        items={adminNavigation}
      />
    </aside>
  );
}
