import { Bell, LogOut, Search, UserRound } from "lucide-react";

type HeaderProps = {
  breadcrumb: string;
  title: string;
};

export function Header({ breadcrumb, title }: HeaderProps) {
  return (
    <header className="top-header">
      <div>
        <p className="breadcrumb">{breadcrumb}</p>
        <h1>{title}</h1>
      </div>
      <div className="header-actions">
        <select aria-label="Financial year">
          <option>FY 2026-27</option>
          <option>FY 2025-26</option>
          <option>FY 2024-25</option>
        </select>
        <label className="search-box">
          <Search size={16} />
          <input placeholder="Search project, client, WO, invoice" />
        </label>
        <button aria-label="Notifications" className="icon-button" type="button">
          <Bell size={18} />
        </button>
        <button aria-label="User profile" className="icon-button" type="button">
          <UserRound size={18} />
        </button>
        <button aria-label="Logout" className="icon-button" type="button">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
