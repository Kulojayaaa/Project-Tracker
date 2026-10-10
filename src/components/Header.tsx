import { CalendarDays, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { listFinancialYears } from "../services/operations";
import type { AppPage } from "../types/domain";
type HeaderProps = {
  breadcrumb: string;
  title: string;
  onNavigate: (page: AppPage) => void;
};
export function Header({ breadcrumb, title, onNavigate }: HeaderProps) {
  const [fy, setFy] = useState("Financial Years"),
    [email, setEmail] = useState("");
  useEffect(() => {
    let active = true;
    void listFinancialYears()
      .then((rows) => {
        if (active)
          setFy(rows.find((r) => r.active)?.name ?? "Financial Years");
      })
      .catch(() => {});
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? "");
    });
    return () => {
      active = false;
    };
  }, [title]);
  return (
    <header className="top-header">
      <div>
        <p className="breadcrumb">{breadcrumb}</p>
        <h1>{title}</h1>
      </div>
      <div className="header-actions">
        <button
          className="outline-button"
          onClick={() => onNavigate("settings-financial-years")}
        >
          <CalendarDays size={16} />
          {fy}
        </button>
        <span className="account-email" title={email}>
          {email}
        </span>
        <button
          title="Sign out"
          aria-label="Sign out"
          className="icon-button"
          onClick={() => void supabase.auth.signOut()}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
