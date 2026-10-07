import { FormEvent, useEffect, useState } from "react";
import { Edit3, Plus, RefreshCw, X } from "lucide-react";
import { Field, ModuleMessage } from "../components/FormBits";
import { StatusBadge } from "../components/StatusBadge";
import {
  createEmptyRaForm,
  listInvoiceOptions,
  listProjectOptions,
  listRaSchedules,
  raToForm,
  saveRaSchedule
} from "../services/operations";
import type { BillStatus, ProjectOption, RaScheduleFormValues, RaScheduleRecord, StatusTone } from "../types/domain";
import { formatCurrencyCompact } from "../utils/formatting";

const statuses: { value: BillStatus; label: string; tone: StatusTone }[] = [
  { value: "planned", label: "Planned", tone: "planned" },
  { value: "due_soon", label: "Due Soon", tone: "warning" },
  { value: "due", label: "Due", tone: "warning" },
  { value: "raised", label: "Raised", tone: "success" },
  { value: "delayed", label: "Delayed", tone: "danger" },
  { value: "cancelled", label: "Cancelled", tone: "neutral" },
  { value: "completed", label: "Completed", tone: "success" }
];

function meta(status: BillStatus) {
  return statuses.find((item) => item.value === status) ?? statuses[0];
}

export function RaSchedulePage() {
  const [records, setRecords] = useState<RaScheduleRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string; total_amount: number; invoice_date: string }[]>([]);
  const [form, setForm] = useState<RaScheduleFormValues>(() => createEmptyRaForm());
  const [editing, setEditing] = useState<RaScheduleRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projectRows, invoiceRows, scheduleRows] = await Promise.all([listProjectOptions(), listInvoiceOptions(), listRaSchedules()]);
      setProjects(projectRows);
      setInvoices(invoiceRows);
      setRecords(scheduleRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load RA schedules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function update<Key extends keyof RaScheduleFormValues>(key: Key, value: RaScheduleFormValues[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function openCreate() {
    setNotice(null);
    setError(null);
    const [projectRows, invoiceRows] = await Promise.all([listProjectOptions(), listInvoiceOptions()]);
    setProjects(projectRows);
    setInvoices(invoiceRows);
    setEditing(null);
    setForm(createEmptyRaForm());
    setFormOpen(true);
  }

  function openEdit(record: RaScheduleRecord) {
    setEditing(record);
    setForm(raToForm(record));
    setFormOpen(true);
    setNotice(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveRaSchedule(form, editing?.id);
      await load();
      setFormOpen(false);
      setNotice(editing ? "RA schedule updated successfully." : "RA schedule created successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save RA schedule.");
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
          <div><h2>RA Bill Schedule</h2><p>Plan, track, and link RA bills to actual invoices.</p></div>
          <div className="button-row"><button className="outline-button" onClick={() => void load()} type="button"><RefreshCw size={16} />Refresh</button><button className="primary-button" onClick={() => void openCreate()} type="button"><Plus size={16} />Plan RA Bill</button></div>
        </div>
        {loading ? <div className="empty-state">Loading RA schedules...</div> : null}
        {!loading && !records.length ? <div className="empty-state">No RA bills planned yet.</div> : null}
        {!loading && records.length ? (
          <div className="table-wrap"><table><thead><tr><th>Project</th><th>Period</th><th>Proposed Date</th><th>Proposed Amount</th><th>Type</th><th>Status</th><th>Invoice</th><th>Reason Pending</th><th>Actions</th></tr></thead><tbody>
            {records.map((record) => { const status = meta(record.bill_status); return (
              <tr key={record.id}>
                <td>{record.project_code} - {record.project_name}</td><td>{record.billing_period ?? "-"}</td><td>{record.proposed_bill_date}</td><td>{formatCurrencyCompact(record.proposed_bill_amount)}</td><td>{record.billing_type}</td><td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td><td>{record.actual_invoice_number ?? "-"}</td><td>{record.reason_not_raised ?? "-"}</td><td><button className="icon-button" onClick={() => openEdit(record)} type="button"><Edit3 size={16} /></button></td>
              </tr>
            );})}
          </tbody></table></div>
        ) : null}
      </section>
      {formOpen ? <section className="panel form-panel"><div className="panel-header"><div><h2>{editing ? "Edit RA Schedule" : "Plan RA Bill"}</h2><p>Use status and invoice linking to keep billing forecasts accurate.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} type="button"><X size={18} /></button></div>
        <form className="project-form" onSubmit={(event) => void submit(event)}>
          <Field label="Project *"><select required value={form.project_id} onChange={(event) => update("project_id", event.target.value)}><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.project_code} - {project.project_name}</option>)}</select></Field>
          <Field label="Billing Period"><input value={form.billing_period} onChange={(event) => update("billing_period", event.target.value)} placeholder="Apr 2026" /></Field>
          <Field label="Period From"><input type="date" value={form.billing_period_from} onChange={(event) => update("billing_period_from", event.target.value)} /></Field>
          <Field label="Period To"><input type="date" value={form.billing_period_to} onChange={(event) => update("billing_period_to", event.target.value)} /></Field>
          <Field label="Proposed Date *"><input required type="date" value={form.proposed_bill_date} onChange={(event) => update("proposed_bill_date", event.target.value)} /></Field>
          <Field label="Proposed Amount"><input min="0" step="0.01" type="number" value={form.proposed_bill_amount} onChange={(event) => update("proposed_bill_amount", event.target.value)} /></Field>
          <Field label="Billing Type"><input value={form.billing_type} onChange={(event) => update("billing_type", event.target.value)} /></Field>
          <Field label="Work Status"><input value={form.work_status} onChange={(event) => update("work_status", event.target.value)} /></Field>
          <Field label="Bill Status"><select value={form.bill_status} onChange={(event) => update("bill_status", event.target.value as BillStatus)}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></Field>
          <Field label="Actual Invoice"><select value={form.actual_invoice_id} onChange={(event) => update("actual_invoice_id", event.target.value)}><option value="">Not linked</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} - {formatCurrencyCompact(invoice.total_amount)}</option>)}</select></Field>
          <label className="form-field full-span"><span>Reason Not Raised</span><textarea value={form.reason_not_raised} onChange={(event) => update("reason_not_raised", event.target.value)} /></label>
          <label className="form-field full-span"><span>Remarks</span><textarea value={form.remarks} onChange={(event) => update("remarks", event.target.value)} /></label>
          <div className="form-actions full-span"><button className="ghost-button" onClick={() => setFormOpen(false)} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : "Save RA Schedule"}</button></div>
        </form>
      </section> : null}
    </div>
  );
}

