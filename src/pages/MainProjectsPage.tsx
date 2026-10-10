import { useEffect, useState, type FormEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  X,
  Download,
} from "lucide-react";
import { Field, ModuleMessage } from "../components/FormBits";
import { listClients } from "../services/projects";
import {
  assignMainProject,
  listMainProjectSummaries,
  mainProjectsReady,
  saveMainProject,
  type MainSummary,
} from "../services/mainProjects";
import type { AppPage, ClientOption, ProjectSummary } from "../types/domain";
import { formatCurrencyCompact as currency } from "../utils/formatting";
import groupingSql from "../../docs/MAIN_PROJECT_GROUPING_UPGRADE.sql?raw";
const blank = {
  project_name: "",
  client_id: "",
  location: "",
  description: "",
};
export function MainProjectsPage({
  onOpenScope,
  onNavigate,
  startInCreateMode = false,
}: {
  onOpenScope: (id: string) => void;
  onNavigate: (page: AppPage) => void;
  startInCreateMode?: boolean;
}) {
  const [groups, setGroups] = useState<MainSummary[]>([]),
    [unassigned, setUnassigned] = useState<ProjectSummary[]>([]),
    [clients, setClients] = useState<ClientOption[]>([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [expanded, setExpanded] = useState<string[]>([]),
    [open, setOpen] = useState(startInCreateMode),
    [editing, setEditing] = useState<string>(),
    [form, setForm] = useState(blank),
    [assignments, setAssignments] = useState<Record<string, string>>({});
  async function load() {
    setBusy(true);
    setError("");
    try {
      const available = await mainProjectsReady();
      setReady(available);
      setClients(await listClients());
      if (available) {
        const result = await listMainProjectSummaries();
        setGroups(result.groups);
        setUnassigned(result.unassigned);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load main projects.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (startInCreateMode) {
      setForm(blank);
      setEditing(undefined);
      setOpen(true);
    }
  }, [startInCreateMode]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveMainProject(form, editing);
      setOpen(false);
      setNotice("Main project saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save main project.");
      setBusy(false);
    }
  }
  async function assign(scope: ProjectSummary) {
    const id = assignments[scope.id];
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await assignMainProject([scope.id], id);
      setNotice("WO scope assigned. Existing records preserved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to assign WO scope.");
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([groupingSql], { type: "text/plain" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "MAIN_PROJECT_GROUPING_UPGRADE.sql";
    a.click();
    URL.revokeObjectURL(url);
  }
  const visible = groups.filter((g) =>
    [
      g.project_code,
      g.project_name,
      g.client_name,
      ...g.scopes.map((s) => s.wo_number ?? ""),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="page-stack">
      {error && <ModuleMessage tone="error">{error}</ModuleMessage>}
      {notice && <ModuleMessage tone="success">{notice}</ModuleMessage>}
      {!ready && !busy && (
        <section className="panel">
          <h2>Main-Project Upgrade Required</h2>
          <p>
            WO records remain unchanged. Main-project grouping is not active
            yet.
          </p>
          <button className="outline-button" onClick={download}>
            <Download size={16} />
            Download Grouping Upgrade
          </button>
          <button
            className="outline-button"
            onClick={() => onNavigate("projects-scopes")}
          >
            WO Scopes
          </button>
        </section>
      )}
      <div className="summary-strip">
        <article>
          <span>Main Projects</span>
          <strong>{groups.length}</strong>
        </article>
        <article>
          <span>WO Scopes</span>
          <strong>{groups.reduce((n, g) => n + g.scopes.length, 0)}</strong>
        </article>
        <article>
          <span>Unassigned WO Scopes</span>
          <strong>{unassigned.length}</strong>
        </article>
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>Main Projects</h2>
          <div className="button-row">
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void load()}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              className="primary-button"
              disabled={!ready || busy}
              onClick={() => {
                setForm(blank);
                setEditing(undefined);
                setOpen(true);
              }}
            >
              <Plus size={16} />
              New Project
            </button>
            <button
              className="outline-button"
              onClick={() => onNavigate("projects-scopes")}
            >
              WO Scopes
            </button>
          </div>
        </div>
        <Field label="Search projects">
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        {busy && <div className="empty-state">Loading...</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>WO Scopes</th>
                <th>WO Base Value</th>
                <th>Prior FY / Opening</th>
                <th>FY Target Base</th>
                <th>FY Net Invoiced</th>
                <th>Lifetime Net Invoiced</th>
                <th>Pending Billing</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((g) => (
                <tr key={g.id}>
                  <td>
                    <button
                      className="link-button"
                      aria-expanded={expanded.includes(g.id)}
                      onClick={() =>
                        setExpanded((ids) =>
                          ids.includes(g.id)
                            ? ids.filter((id) => id !== g.id)
                            : [...ids, g.id],
                        )
                      }
                    >
                      {expanded.includes(g.id) ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}{" "}
                      {g.project_code} - {g.project_name}
                    </button>
                  </td>
                  <td>{g.client_name}</td>
                  <td>{g.scopes.length}</td>
                  <td>{currency(g.base)}</td>
                  <td>{currency(g.historical)}</td>
                  <td>{currency(g.fyTarget)}</td>
                  <td>{currency(g.current)}</td>
                  <td>{currency(g.total)}</td>
                  <td>{currency(g.pending)}</td>
                  <td>
                    <button
                      className="icon-button"
                      title="Edit main project"
                      aria-label={"Edit " + g.project_name}
                      onClick={() => {
                        setEditing(g.id);
                        setForm({
                          project_name: g.project_name,
                          client_id: g.client_id,
                          location: g.location ?? "",
                          description: g.description ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      <Edit3 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!busy && ready && !visible.length && (
          <div className="empty-state">No main projects.</div>
        )}
      </section>
      {visible
        .filter((g) => expanded.includes(g.id))
        .map((g) => (
          <section className="panel" key={g.id}>
            <div className="panel-header">
              <h2>{g.project_name}: WO Scopes</h2>
              <button
                className="icon-button"
                title="Close WO scopes"
                aria-label="Close WO scopes"
                onClick={() =>
                  setExpanded((ids) => ids.filter((id) => id !== g.id))
                }
              >
                <X size={16} />
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Source ID</th>
                    <th>Scope</th>
                    <th>WO Number</th>
                    <th>Base Value</th>
                    <th>Net Invoiced</th>
                    <th>Pending Billing</th>
                    <th>Billing Status</th>
                  </tr>
                </thead>
                <tbody>
                  {g.scopes.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <button
                          className="link-button"
                          onClick={() => onOpenScope(s.id)}
                        >
                          {s.project_code}
                        </button>
                      </td>
                      <td className="wrap-cell">
                        {s.project_description || s.project_name}
                      </td>
                      <td>{s.wo_number}</td>
                      <td>{currency(s.base_wo_value)}</td>
                      <td>{currency(s.total_invoiced_amount)}</td>
                      <td>{currency(s.pending_billing_amount)}</td>
                      <td>{s.billing_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      {!!unassigned.length && (
        <section className="panel">
          <h2>Unassigned WO Scopes</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source ID</th>
                  <th>Scope</th>
                  <th>Client</th>
                  <th>Main Project</th>
                  <th>Assign</th>
                </tr>
              </thead>
              <tbody>
                {unassigned.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <button
                        className="link-button"
                        onClick={() => onOpenScope(s.id)}
                      >
                        {s.project_code}
                      </button>
                    </td>
                    <td>{s.project_name}</td>
                    <td>{s.client_name}</td>
                    <td>
                      <select
                        aria-label={"Main project for " + s.project_code}
                        value={assignments[s.id] ?? ""}
                        onChange={(e) =>
                          setAssignments((a) => ({
                            ...a,
                            [s.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select main project</option>
                        {groups
                          .filter((g) => g.client_id === s.client_id)
                          .map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.project_name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        disabled={busy || !assignments[s.id]}
                        title="Assign WO scope"
                        aria-label={"Assign " + s.project_code}
                        onClick={() => void assign(s)}
                      >
                        <Save size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {open && ready && (
        <section className="panel form-panel">
          <div className="panel-header">
            <h2>{editing ? "Edit Main Project" : "New Main Project"}</h2>
            <button
              className="icon-button"
              title="Close form"
              aria-label="Close form"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <form className="project-form" onSubmit={submit}>
            <Field label="Main Project Name">
              <input
                required
                value={form.project_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, project_name: e.target.value }))
                }
              />
            </Field>
            <Field label="Client">
              <select
                required
                disabled={
                  !!editing &&
                  !!groups.find((g) => g.id === editing)?.scopes.length
                }
                value={form.client_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, client_id: e.target.value }))
                }
              >
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <input
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
              />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </Field>
            <div className="form-actions">
              <button className="primary-button" disabled={busy}>
                <Save size={16} />
                Save Project
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
