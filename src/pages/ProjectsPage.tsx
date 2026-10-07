import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, Edit3, Plus, RefreshCw, Search, X } from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import {
  archiveProject,
  createEmptyProjectForm,
  listClients,
  listProjects,
  projectToForm,
  saveProject
} from "../services/projects";
import type { ClientOption, ProjectFormValues, ProjectStatus, ProjectSummary, StatusTone } from "../types/domain";
import { formatCurrencyCompact, percentage } from "../utils/formatting";

const statusOptions: { value: ProjectStatus; label: string; tone: StatusTone }[] = [
  { value: "planned", label: "Planned", tone: "planned" },
  { value: "active", label: "Active", tone: "success" },
  { value: "on_hold", label: "On Hold", tone: "warning" },
  { value: "near_completion", label: "Near Completion", tone: "warning" },
  { value: "completed", label: "Completed", tone: "success" },
  { value: "cancelled", label: "Archived", tone: "neutral" }
];

function statusMeta(status: ProjectStatus) {
  return statusOptions.find((option) => option.value === status) ?? statusOptions[0];
}

function totalWoFromForm(form: ProjectFormValues) {
  return Number(form.base_wo_value || 0) + Number(form.gst_value || 0);
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

type ProjectsPageProps = {
  startInCreateMode?: boolean;
};

export function ProjectsPage({ startInCreateMode = false }: ProjectsPageProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(startInCreateMode);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [form, setForm] = useState<ProjectFormValues>(() => createEmptyProjectForm());

  const totals = useMemo(() => {
    return projects.reduce(
      (summary, project) => ({
        woValue: summary.woValue + project.total_wo_value,
        invoiced: summary.invoiced + project.total_invoiced_amount,
        pending: summary.pending + project.pending_billing_amount
      }),
      { woValue: 0, invoiced: 0, pending: 0 }
    );
  }, [projects]);

  async function loadData(nextSearch = search) {
    setLoading(true);
    setError(null);

    try {
      const [clientRows, projectRows] = await Promise.all([listClients(), listProjects(nextSearch)]);
      setClients(clientRows);
      setProjects(projectRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load project data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData("");
  }, []);

  useEffect(() => {
    if (startInCreateMode) {
      openCreateForm();
    }
  }, [startInCreateMode]);

  function updateForm<Key extends keyof ProjectFormValues>(key: Key, value: ProjectFormValues[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateForm() {
    setEditingProject(null);
    setForm(createEmptyProjectForm());
    setFormOpen(true);
    setNotice(null);
    setError(null);
  }

  function openEditForm(project: ProjectSummary) {
    setEditingProject(project);
    setForm(projectToForm(project));
    setFormOpen(true);
    setNotice(null);
    setError(null);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingProject(null);
    setForm(createEmptyProjectForm());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await saveProject(form, editingProject?.id);
      await loadData(search);
      setNotice(editingProject ? "Project updated successfully." : "Project created successfully with an internal project code.");
      closeForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(project: ProjectSummary) {
    const confirmed = window.confirm(`Archive ${project.project_code} - ${project.project_name}?`);

    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      await archiveProject(project.id);
      await loadData(search);
      setNotice("Project archived successfully.");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unable to archive project.");
    }
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadData(search);
  }

  return (
    <div className="page-stack">
      <section className="summary-strip">
        <article>
          <span>Total WO Value</span>
          <strong>{formatCurrencyCompact(totals.woValue)}</strong>
        </article>
        <article>
          <span>Total Invoiced</span>
          <strong>{formatCurrencyCompact(totals.invoiced)}</strong>
        </article>
        <article>
          <span>Pending Billing</span>
          <strong>{formatCurrencyCompact(totals.pending)}</strong>
        </article>
      </section>

      {notice ? <div className="alert success-alert">{notice}</div> : null}
      {error ? <div className="alert error-alert">{error}</div> : null}

      <section className="panel">
        <div className="panel-header controls-header">
          <div>
            <h2>Project Master</h2>
            <p>Create, update, search, and archive project records.</p>
          </div>
          <div className="button-row">
            <button className="outline-button" onClick={() => void loadData(search)} type="button">
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="primary-button" onClick={openCreateForm} type="button">
              <Plus size={16} />
              New Project
            </button>
          </div>
        </div>

        <form className="filter-row" onSubmit={(event) => void handleSearchSubmit(event)}>
          <label className="search-box wide-search">
            <Search size={16} />
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search project ID, project name, or WO number"
              value={search}
            />
          </label>
          <button className="outline-button" type="submit">Search</button>
          <button
            className="ghost-button"
            onClick={() => {
              setSearch("");
              void loadData("");
            }}
            type="button"
          >
            Clear
          </button>
        </form>

        {loading ? <div className="empty-state">Loading projects...</div> : null}
        {!loading && !projects.length ? (
          <div className="empty-state">No projects found. Create the first project or adjust your search.</div>
        ) : null}

        {!loading && projects.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project ID</th>
                  <th>Project</th>
                  <th>Client</th>
                  <th>WO Number</th>
                  <th>WO Value</th>
                  <th>Total Invoiced</th>
                  <th>Pending</th>
                  <th>Billing %</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const status = statusMeta(project.project_status);

                  return (
                    <tr key={project.id}>
                      <td><strong>{project.project_code}</strong></td>
                      <td>{project.project_name}</td>
                      <td>{project.client_name ?? "-"}</td>
                      <td>{project.wo_number ?? "-"}</td>
                      <td>{formatCurrencyCompact(project.total_wo_value)}</td>
                      <td>{formatCurrencyCompact(project.total_invoiced_amount)}</td>
                      <td>{formatCurrencyCompact(project.pending_billing_amount)}</td>
                      <td>{percentage(project.billing_percentage)}</td>
                      <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                      <td>
                        <div className="table-actions">
                          <button aria-label="Edit project" className="icon-button" onClick={() => openEditForm(project)} type="button">
                            <Edit3 size={16} />
                          </button>
                          <button aria-label="Archive project" className="icon-button" onClick={() => void handleArchive(project)} type="button">
                            <Archive size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <section className="panel form-panel">
          <div className="panel-header">
            <div>
              <h2>{editingProject ? `Edit ${editingProject.project_code}` : "Create Project"}</h2>
              <p>Project ID is generated by the database and remains separate from the WO number.</p>
            </div>
            <button aria-label="Close form" className="icon-button" onClick={closeForm} type="button">
              <X size={18} />
            </button>
          </div>

          <form className="project-form" onSubmit={(event) => void handleSubmit(event)}>
            <Field label="Project Name *">
              <input required value={form.project_name} onChange={(event) => updateForm("project_name", event.target.value)} />
            </Field>
            <Field label="Client">
              <select value={form.client_id} onChange={(event) => updateForm("client_id", event.target.value)}>
                <option value="">Select client</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </Field>
            <Field label="Location">
              <input value={form.location} onChange={(event) => updateForm("location", event.target.value)} />
            </Field>
            <Field label="WO Number">
              <input value={form.wo_number} onChange={(event) => updateForm("wo_number", event.target.value)} />
            </Field>
            <Field label="WO Date">
              <input type="date" value={form.wo_date} onChange={(event) => updateForm("wo_date", event.target.value)} />
            </Field>
            <Field label="Start Date">
              <input type="date" value={form.project_start_date} onChange={(event) => updateForm("project_start_date", event.target.value)} />
            </Field>
            <Field label="Expected Completion">
              <input type="date" value={form.expected_completion_date} onChange={(event) => updateForm("expected_completion_date", event.target.value)} />
            </Field>
            <Field label="Status">
              <select value={form.project_status} onChange={(event) => updateForm("project_status", event.target.value as ProjectStatus)}>
                {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </Field>
            <Field label="Base WO Value">
              <input min="0" step="0.01" type="number" value={form.base_wo_value} onChange={(event) => updateForm("base_wo_value", event.target.value)} />
            </Field>
            <Field label="GST Value">
              <input min="0" step="0.01" type="number" value={form.gst_value} onChange={(event) => updateForm("gst_value", event.target.value)} />
            </Field>
            <Field label="Billing Target">
              <input
                min="0"
                placeholder={`Default ${formatCurrencyCompact(totalWoFromForm(form))}`}
                step="0.01"
                type="number"
                value={form.billing_target}
                onChange={(event) => updateForm("billing_target", event.target.value)}
              />
            </Field>
            <Field label="Opening / Historical Invoiced">
              <input min="0" step="0.01" type="number" value={form.opening_invoiced_amount} onChange={(event) => updateForm("opening_invoiced_amount", event.target.value)} />
            </Field>
            <label className="form-field full-span">
              <span>Remarks</span>
              <textarea value={form.remarks} onChange={(event) => updateForm("remarks", event.target.value)} />
            </label>
            <div className="form-actions full-span">
              <button className="ghost-button" onClick={closeForm} type="button">Cancel</button>
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? "Saving..." : editingProject ? "Save Changes" : "Create Project"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
