import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, X } from "lucide-react";
import { Field, ModuleMessage } from "../components/FormBits";
import {
  createEmptyInvoiceForm,
  invoiceToForm,
  listFinancialYears,
  listInvoices,
  listProjectOptions,
  saveInvoice,
} from "../services/operations";
import type {
  FinancialYearOption,
  InvoiceFormValues,
  InvoiceRecord,
  ProjectOption,
} from "../types/domain";
import { listOrders, type Order } from "../services/orders";
import { trackingReady } from "../services/data";
import { financialYearFor } from "../utils/billing";
import { formatCurrencyCompact } from "../utils/formatting";

const invoiceTypes = ["Material", "Service", "RA Bill", "Final Bill", "Other"];

export function InvoiceRegisterPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [fyFilter, setFyFilter] = useState("");
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYearOption[]>(
    [],
  );
  const [form, setForm] = useState<InvoiceFormValues>(() =>
    createEmptyInvoiceForm(),
  );
  const [editing, setEditing] = useState<InvoiceRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === form.project_id) ?? null,
    [form.project_id, projects],
  );
  const invoiceBase = Number(form.amount_before_gst || 0);
  const editingBase =
    editing?.project_id === form.project_id ? editing.amount_before_gst : 0;
  const exceedsPending =
    form.document_type === "tax_invoice" && selectedProject
      ? invoiceBase > selectedProject.pending_billing_amount + editingBase
      : false;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [fyRows, projectRows, invoiceRows] = await Promise.all([
        listFinancialYears(),
        listProjectOptions(),
        listInvoices(),
      ]);
      setOrders((await trackingReady()) ? await listOrders() : []);
      setFinancialYears(fyRows);
      setProjects(projectRows);
      setRecords(invoiceRows);
      const activeFy = fyRows.find((fy) => fy.active) ?? fyRows[0];
      setForm((current) => ({
        ...current,
        financial_year_id: current.financial_year_id || activeFy?.id || "",
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load invoices.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function update<Key extends keyof InvoiceFormValues>(
    key: Key,
    value: InvoiceFormValues[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "project_id"
        ? { order_id: "", original_invoice_id: "" }
        : {}),
      ...(key === "invoice_date"
        ? {
            financial_year_id:
              financialYears.find(
                (f) =>
                  f.name.replace(/^FY\s*/i, "") ===
                  financialYearFor(String(value)),
              )?.id ?? "",
          }
        : {}),
      ...(key === "document_type" ? { original_invoice_id: "" } : {}),
    }));
  }

  async function openCreate() {
    setNotice(null);
    setError(null);
    const [fyRows, projectRows] = await Promise.all([
      listFinancialYears(),
      listProjectOptions(),
    ]);
    setFinancialYears(fyRows);
    setProjects(projectRows);
    setOrders((await trackingReady()) ? await listOrders() : []);
    const activeFy = fyRows.find((fy) => fy.active) ?? fyRows[0];
    setEditing(null);
    setForm(createEmptyInvoiceForm(activeFy?.id));
    setFormOpen(true);
  }

  function openEdit(record: InvoiceRecord) {
    setEditing(record);
    setForm(invoiceToForm(record));
    setFormOpen(true);
    setNotice(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      exceedsPending &&
      !window.confirm(
        "Invoice amount exceeds current pending project billing. Please verify before saving. Continue?",
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveInvoice(form, editing?.id);
      await load();
      setFormOpen(false);
      setNotice(
        editing
          ? "Invoice updated successfully."
          : "Invoice created successfully.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save invoice.",
      );
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
          <div>
            <h2>Invoice Register</h2>
            <p>
              Enter project invoices and update project billing automatically.
            </p>
          </div>
          <div className="button-row">
            <button
              className="outline-button"
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              className="primary-button"
              onClick={() =>
                void openCreate().catch((e) =>
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Unable to open invoice form.",
                  ),
                )
              }
              type="button"
            >
              <Plus size={16} />
              New Invoice
            </button>
          </div>
        </div>
        <div className="filter-row">
          <input
            aria-label="Search invoices"
            placeholder="Search invoice, project or client"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Financial year filter"
            value={fyFilter}
            onChange={(e) => setFyFilter(e.target.value)}
          >
            <option value="">All financial years</option>
            {financialYears.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="empty-state">Loading invoices...</div>
        ) : null}
        {!loading && !records.length ? (
          <div className="empty-state">No invoices entered yet.</div>
        ) : null}
        {!loading && records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice No.</th>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Document</th>
                  <th>Before GST</th>
                  <th>GST</th>
                  <th>Total</th>
                  <th>FY</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records
                  .filter(
                    (r) =>
                      (!fyFilter || r.financial_year_id === fyFilter) &&
                      [
                        r.invoice_number,
                        r.project_code,
                        r.project_name,
                        r.client_name,
                      ]
                        .join(" ")
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.invoice_number}</strong>
                      </td>
                      <td>{record.invoice_date}</td>
                      <td>
                        {record.project_code} - {record.project_name}
                      </td>
                      <td>{record.client_name ?? "-"}</td>
                      <td>{record.invoice_type}</td>
                      <td>
                        {record.document_type === "credit_note"
                          ? "Credit Note"
                          : "Tax Invoice"}
                      </td>
                      <td>{formatCurrencyCompact(record.amount_before_gst)}</td>
                      <td>{formatCurrencyCompact(record.gst_amount)}</td>
                      <td>{formatCurrencyCompact(record.total_amount)}</td>
                      <td>{record.financial_year_name ?? "-"}</td>
                      <td>
                        <button
                          className="icon-button"
                          onClick={() => openEdit(record)}
                          type="button"
                        >
                          <Edit3 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {formOpen ? (
        <section className="panel form-panel">
          <div className="panel-header">
            <div>
              <h2>{editing ? "Edit Invoice" : "New Invoice"}</h2>
              <p>
                Project context and pending billing are shown before saving.
              </p>
            </div>
            <button
              className="icon-button"
              onClick={() => setFormOpen(false)}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
          {selectedProject ? (
            <div className="context-box">
              <strong>
                {selectedProject.project_code} - {selectedProject.project_name}
              </strong>
              <span>Client: {selectedProject.client_name ?? "-"}</span>
              <span>WO: {selectedProject.wo_number ?? "-"}</span>
              <span>
                WO Value (Incl. GST):{" "}
                {formatCurrencyCompact(selectedProject.total_wo_value)}
              </span>
              <span>
                Net Invoiced (Base):{" "}
                {formatCurrencyCompact(selectedProject.total_invoiced_amount)}
              </span>
              <span>
                Pending Billing (Base):{" "}
                {formatCurrencyCompact(selectedProject.pending_billing_amount)}
              </span>
            </div>
          ) : null}
          {exceedsPending ? (
            <ModuleMessage tone="error">
              Invoice amount exceeds current pending project billing. Please
              verify before saving.
            </ModuleMessage>
          ) : null}
          <form
            className="project-form"
            onSubmit={(event) => void submit(event)}
          >
            <Field label="Invoice Number *">
              <input
                required
                value={form.invoice_number}
                onChange={(event) =>
                  update("invoice_number", event.target.value)
                }
              />
            </Field>
            <Field label="Invoice Date *">
              <input
                required
                type="date"
                value={form.invoice_date}
                onChange={(event) => update("invoice_date", event.target.value)}
              />
            </Field>
            <Field label="Project *">
              <select
                required
                value={form.project_id}
                onChange={(event) => update("project_id", event.target.value)}
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_code} - {project.project_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Invoice Type">
              <select
                value={form.invoice_type}
                onChange={(event) => update("invoice_type", event.target.value)}
              >
                {invoiceTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </Field>
            <Field label="Document">
              <select
                value={form.document_type}
                onChange={(e) =>
                  update(
                    "document_type",
                    e.target.value as InvoiceFormValues["document_type"],
                  )
                }
              >
                <option value="tax_invoice">Tax Invoice</option>
                <option value="credit_note">Credit Note</option>
              </select>
            </Field>
            <Field label="WO/PO">
              <select
                value={form.order_id}
                onChange={(e) => update("order_id", e.target.value)}
              >
                <option value="">Unassigned</option>
                {orders
                  .filter((o) => o.project_id === form.project_id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_code} - {o.order_number}
                    </option>
                  ))}
              </select>
            </Field>
            {form.document_type === "credit_note" && (
              <Field label="Original Tax Invoice">
                <select
                  value={form.original_invoice_id}
                  onChange={(e) =>
                    update("original_invoice_id", e.target.value)
                  }
                >
                  <option value="">Pending verification</option>
                  {records
                    .filter(
                      (r) =>
                        r.project_id === form.project_id &&
                        r.document_type === "tax_invoice" &&
                        r.id !== editing?.id,
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.invoice_number}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="Remarks">
              <textarea
                value={form.remarks}
                onChange={(e) => update("remarks", e.target.value)}
              />
            </Field>
            <Field label="Billing From">
              <input
                type="date"
                value={form.billing_period_from}
                onChange={(event) =>
                  update("billing_period_from", event.target.value)
                }
              />
            </Field>
            <Field label="Billing To">
              <input
                type="date"
                value={form.billing_period_to}
                onChange={(event) =>
                  update("billing_period_to", event.target.value)
                }
              />
            </Field>
            <Field
              label={
                form.document_type === "credit_note"
                  ? "Credit Base Amount (Positive)"
                  : "Amount Before GST"
              }
            >
              <input
                required
                min="0"
                step="0.01"
                type="number"
                value={form.amount_before_gst}
                onChange={(event) =>
                  update("amount_before_gst", event.target.value)
                }
              />
            </Field>
            <Field label="GST">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.gst_amount}
                onChange={(event) => update("gst_amount", event.target.value)}
              />
            </Field>
            <Field label="Financial Year">
              <select
                value={form.financial_year_id}
                onChange={(event) =>
                  update("financial_year_id", event.target.value)
                }
              >
                <option value="">Select FY</option>
                {financialYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="form-field full-span">
              <span>Description</span>
              <textarea
                value={form.invoice_description}
                onChange={(event) =>
                  update("invoice_description", event.target.value)
                }
              />
            </label>
            <div className="form-actions full-span">
              <button
                className="ghost-button"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={saving}
                type="submit"
              >
                {saving ? "Saving..." : "Save Invoice"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
