import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { supabase } from "../lib/supabase";
import { allRows } from "../services/data";
import { ModuleMessage } from "../components/FormBits";
import { getPageLabel } from "./PlaceholderPage";
import type { AppPage } from "../types/domain";
const roles = [
  "admin",
  "project_admin",
  "project_manager",
  "accounts_finance",
  "hod_management",
];
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
export function ReferenceMastersPage({ page }: { page: AppPage }) {
  const [users, setUsers] = useState<User[]>([]),
    [locations, setLocations] = useState<string[]>([]),
    [admin, setAdmin] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getUser();
      const rows = await allRows<Record<string, unknown>>("users");
      setUsers(rows as unknown as User[]);
      setAdmin(rows.find((r) => r.id === data.user?.id)?.role === "admin");
      if (page === "masters-locations")
        setLocations(
          [
            ...new Set(
              (await allRows<Record<string, unknown>>("projects"))
                .map((p) => String(p.location ?? "").trim())
                .filter(Boolean),
            ),
          ].sort(),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load master data.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [page]);
  async function save(u: User) {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase
        .from("users")
        .update({ name: u.name, role: u.role, active: u.active })
        .eq("id", u.id);
      if (error) throw error;
      setNotice("User updated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update user.");
    } finally {
      setBusy(false);
    }
  }
  const list =
    page === "masters-project-status"
      ? [
          "planned",
          "active",
          "on_hold",
          "near_completion",
          "completed",
          "cancelled",
        ]
      : page === "masters-invoice-types"
        ? ["Material", "Service", "RA Bill", "Final Bill", "Other"]
        : page === "masters-billing-types"
          ? ["RA Bill", "Final Bill", "Material", "Service", "Other"]
          : locations;
  const userPage = ["settings-users", "masters-project-managers"].includes(
    page,
  );
  return (
    <div className="page-stack">
      {error && <ModuleMessage tone="error">{error}</ModuleMessage>}
      {notice && <ModuleMessage tone="success">{notice}</ModuleMessage>}
      <section className="panel">
        <div className="panel-header">
          <h2>{getPageLabel(page)}</h2>
          <button
            className="outline-button"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        {userPage ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Active</th>
                  {admin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users
                  .filter(
                    (u) =>
                      page !== "masters-project-managers" ||
                      ["admin", "project_admin", "project_manager"].includes(
                        u.role,
                      ),
                  )
                  .map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        {admin ? (
                          <select
                            aria-label={`Role for ${u.name}`}
                            value={u.role}
                            onChange={(e) =>
                              setUsers((rows) =>
                                rows.map((r) =>
                                  r.id === u.id
                                    ? { ...r, role: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          >
                            {roles.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        ) : (
                          u.role
                        )}
                      </td>
                      <td>
                        <input
                          aria-label={`Active account for ${u.name}`}
                          type="checkbox"
                          disabled={!admin}
                          checked={u.active}
                          onChange={(e) =>
                            setUsers((rows) =>
                              rows.map((r) =>
                                r.id === u.id
                                  ? { ...r, active: e.target.checked }
                                  : r,
                              ),
                            )
                          }
                        />
                      </td>
                      {admin && (
                        <td>
                          <button
                            title="Save user"
                            aria-label="Save user"
                            className="icon-button"
                            disabled={busy}
                            onClick={() => void save(u)}
                          >
                            <Save size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : page === "settings-roles" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Operational Records</th>
                  <th>Excel Import / FY</th>
                  <th>Manage Users</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r}>
                    <td>{r}</td>
                    <td>{r === "hod_management" ? "View" : "Create / Edit"}</td>
                    <td>
                      {["admin", "project_admin", "accounts_finance"].includes(
                        r,
                      )
                        ? "Create / Edit"
                        : "View"}
                    </td>
                    <td>{r === "admin" ? "Manage" : "View"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{page === "masters-locations" ? "Location" : "Value"}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => (
                  <tr key={v}>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && (
              <div className="empty-state">
                No locations assigned to projects.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
