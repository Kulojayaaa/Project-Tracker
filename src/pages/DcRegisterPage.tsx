import { FormEvent, useEffect, useState } from "react";
import { Edit3, Plus, RefreshCw, X } from "lucide-react";
import { Field, ModuleMessage } from "../components/FormBits";
import { StatusBadge } from "../components/StatusBadge";
import {
  createEmptyDcForm,
  dcToForm,
  listClientOptions,
  listDcs,
  listInvoiceOptions,
  listProjectOptions,
  saveDc
} from "../services/operations";
import type { ClientOption, DcFormValues, DcRecord, ProjectOption, StatusTone } from "../types/domain";
import { formatCurrencyCompact } from "../utils/formatting";

function statusTone(status: string): StatusTone {
  if (status === "Invoiced") return "success";
  if (status === "Overdue") return "danger";
  if (status === "Due") return "warning";
  return "planned";
}

export function DcRegisterPage({ pendingOnly = false }: { pendingOnly?: boolean }) {
  const [records, setRecords] = useState<DcRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string; total_amount: number; invoice_date: string }[]>([]);
  const [form, setForm] = useState<DcFormValues>(() => createEmptyDcForm());
  const [editing, setEditing] = useState<DcRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projectRows, clientRows, invoiceRows, dcRows] = await Promise.all([listProjectOptions(), listClientOptions(), listInvoiceOptions(), listDcs(pendingOnly)]);
      setProjects(projectRows);
      setClients(clientRows);
      setInvoices(invoiceRows);
      setRecords(dcRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load DC records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [pendingOnly]);

  function update<Key extends keyof DcFormValues>(key: Key, value: DcFormValues[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function openCreate() {
    setNotice(null);
    setError(null);
    const [projectRows, clientRows, invoiceRows] = await Promise.all([listProjectOptions(), listClientOptions(), listInvoiceOptions()]);
    setProjects(projectRows);
    setClients(clientRows);
    setInvoices(invoiceRows);
    setEditing(null);
    setForm(createEmptyDcForm());
    setFormOpen(true);
  }

  function openEdit(record: DcRecord) {
    setEditing(record);
    setForm(dcToForm(record));
    setFormOpen(true);
    setNotice(null);
    setError(null);
  }

  function selectProject(projectId: string) {
    const selectedProject = projects.find((project) => project.id === projectId);
    setForm((current) => ({
      ...current,
      project_id: projectId,
      client_id: selectedProject?.client_id ?? current.client_id
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveDc(form, editing?.id);
      await load();
      setFormOpen(false);
      setNotice(editing ? "DC updated successfully." : "DC created successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save DC.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      {notice ? <ModuleMessage tone="success">{notice}</ModuleMessage> : null}
      {error ? <ModuleMessage tone="error">{error}</ModuleMessage> : null}
      <section className="panel">
        <div className="panel-header controls-header">
          <div><h2>{pendingOnly ? "DC Pending Tax Invoice" : "DC Register"}</h2><p>{pendingOnly ? "Dispatches where tax invoice is still pending." : "Create and link delivery challans to tax invoices."}</p></div>
          <div className="button-row"><button className="outline-button" onClick={() => void load()} type="button"><RefreshCw size={16} />Refresh</button>{!pendingOnly ? <button className="primary-button" onClick={() => void openCreate()} type="button"><Plus size={16} />New DC</button> : null}</div>
        </div>
        {loading ? <div className="empty-state">Loading DC records...</div> : null}
        {!loading && !records.length ? <div className="empty-state">No DC records found.</div> : null}
        {!loading && records.length ? (
          <div className="table-wrap"><table><thead><tr><th>DC No.</th><th>Date</th><th>Project</th><th>Client</th><th>Material</th><th>Value</th><th>Expected Invoice</th><th>Pending Days</th><th>Status</th><th>Linked Invoice</th><th>Actions</th></tr></thead><tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td><strong>{record.dc_number}</strong></td><td>{record.dc_date}</td><td>{record.project_code} - {record.project_name}</td><td>{record.client_name ?? "-"}</td><td>{record.material_description}</td><td>{formatCurrencyCompact(record.dc_value)}</td><td>{record.expected_invoice_date ?? "-"}</td><td>{record.pending_days}</td><td><StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge></td><td>{record.invoice_number ?? "-"}</td><td><button className="icon-button" onClick={() => openEdit(record)} type="button"><Edit3 size={16} /></button></td>
              </tr>
            ))}
          </tbody></table></div>
        ) : null}
      </section>
      {formOpen ? <section className="panel form-panel"><div className="panel-header"><div><h2>{editing ? "Edit DC" : "New DC"}</h2><p>Linking an invoice marks the DC as invoiced.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} type="button"><X size={18} /></button></div>
        <form className="project-form" onSubmit={(event) => void submit(event)}>
          <Field label="DC Number *"><input required value={form.dc_number} onChange={(event) => update("dc_number", event.target.value)} /></Field>
          <Field label="DC Date *"><input required type="date" value={form.dc_date} onChange={(event) => update("dc_date", event.target.value)} /></Field>
          <Field label="Project *"><select required value={form.project_id} onChange={(event) => selectProject(event.target.value)}><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.project_code} - {project.project_name}</option>)}</select></Field>
          <Field label="Client"><select value={form.client_id} onChange={(event) => update("client_id", event.target.value)}><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
          <Field label="Material *"><input required value={form.material_description} onChange={(event) => update("material_description", event.target.value)} /></Field>
          <Field label="Quantity"><input min="0" step="0.001" type="number" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} /></Field>
          <Field label="UOM"><input value={form.uom} onChange={(event) => update("uom", event.target.value)} /></Field>
          <Field label="DC Value"><input min="0" step="0.01" type="number" value={form.dc_value} onChange={(event) => update("dc_value", event.target.value)} /></Field>
          <Field label="Expected Invoice Date"><input type="date" value={form.expected_invoice_date} onChange={(event) => update("expected_invoice_date", event.target.value)} /></Field>
          <Field label="Linked Invoice"><select value={form.invoice_id} onChange={(event) => update("invoice_id", event.target.value)}><option value="">Not linked</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} - {formatCurrencyCompact(invoice.total_amount)}</option>)}</select></Field>
          <label className="checkbox-field"><input checked={form.tax_invoice_required} type="checkbox" onChange={(event) => update("tax_invoice_required", event.target.checked)} />Tax invoice required</label>
          <label className="form-field full-span"><span>Reason Pending</span><textarea value={form.reason_pending} onChange={(event) => update("reason_pending", event.target.value)} /></label>
          <label className="form-field full-span"><span>Remarks</span><textarea value={form.remarks} onChange={(event) => update("remarks", event.target.value)} /></label>
          <div className="form-actions full-span"><button className="ghost-button" onClick={() => setFormOpen(false)} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : "Save DC"}</button></div>
        </form>
      </section> : null}
    </div>
  );
}

