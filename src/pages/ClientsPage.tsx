import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, Search, X } from "lucide-react";
import { Field, ModuleMessage } from "../components/FormBits";
import { StatusBadge } from "../components/StatusBadge";
import {
  clientToForm,
  createEmptyClientForm,
  listClientsMaster,
  saveClient
} from "../services/operations";
import type { ClientFormValues, ClientRecord } from "../types/domain";

type ClientsPageProps = {
  startInCreateMode?: boolean;
};

export function ClientsPage({ startInCreateMode = false }: ClientsPageProps) {
  const [records, setRecords] = useState<ClientRecord[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ClientFormValues>(() => createEmptyClientForm());
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [formOpen, setFormOpen] = useState(startInCreateMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = useMemo(() => ({
    total: records.length,
    active: records.filter((client) => client.active).length,
    inactive: records.filter((client) => !client.active).length
  }), [records]);

  async function load(nextSearch = search) {
    setLoading(true);
    setError(null);
    try {
      setRecords(await listClientsMaster(nextSearch));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load clients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(""); }, []);

  function update<Key extends keyof ClientFormValues>(key: Key, value: ClientFormValues[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(createEmptyClientForm());
    setFormOpen(true);
    setError(null);
    setNotice(null);
  }

  function openEdit(record: ClientRecord) {
    setEditing(record);
    setForm(clientToForm(record));
    setFormOpen(true);
    setError(null);
    setNotice(null);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(createEmptyClientForm());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveClient(form, editing?.id);
      await load(search);
      closeForm();
      setNotice(editing ? "Client updated successfully." : "Client created successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save client.");
    } finally {
      setSaving(false);
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load(search);
  }

  return (
    <div className="page-stack">
      <section className="summary-strip">
        <article><span>Total Clients</span><strong>{summary.total}</strong></article>
        <article><span>Active Clients</span><strong>{summary.active}</strong></article>
        <article><span>Inactive Clients</span><strong>{summary.inactive}</strong></article>
      </section>

      {notice ? <ModuleMessage tone="success">{notice}</ModuleMessage> : null}
      {error ? <ModuleMessage tone="error">{error}</ModuleMessage> : null}

      <section className="panel">
        <div className="panel-header controls-header">
          <div>
            <h2>Clients</h2>
            <p>Maintain client master data used by projects, DCs, and reports.</p>
          </div>
          <div className="button-row">
            <button className="outline-button" onClick={() => void load(search)} type="button"><RefreshCw size={16} />Refresh</button>
            <button className="primary-button" onClick={openCreate} type="button"><Plus size={16} />New Client</button>
          </div>
        </div>

        <form className="filter-row" onSubmit={(event) => void submitSearch(event)}>
          <label className="search-box wide-search">
            <Search size={16} />
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Search client, contact, email, phone, GSTIN" value={search} />
          </label>
          <button className="outline-button" type="submit">Search</button>
          <button className="ghost-button" onClick={() => { setSearch(""); void load(""); }} type="button">Clear</button>
        </form>

        {loading ? <div className="empty-state">Loading clients...</div> : null}
        {!loading && !records.length ? <div className="empty-state">No clients found. Create a client or adjust your search.</div> : null}
        {!loading && records.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Client</th><th>Contact</th><th>Email</th><th>Phone</th><th>GSTIN</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td><strong>{record.name}</strong></td>
                    <td>{record.contact_person ?? "-"}</td>
                    <td>{record.email ?? "-"}</td>
                    <td>{record.phone ?? "-"}</td>
                    <td>{record.gstin ?? "-"}</td>
                    <td><StatusBadge tone={record.active ? "success" : "neutral"}>{record.active ? "Active" : "Inactive"}</StatusBadge></td>
                    <td><button aria-label="Edit client" className="icon-button" onClick={() => openEdit(record)} type="button"><Edit3 size={16} /></button></td>
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
              <h2>{editing ? "Edit Client" : "Create Client"}</h2>
              <p>Client names are kept unique in the database.</p>
            </div>
            <button aria-label="Close form" className="icon-button" onClick={closeForm} type="button"><X size={18} /></button>
          </div>
          <form className="project-form" onSubmit={(event) => void submit(event)}>
            <Field label="Client Name *"><input required value={form.name} onChange={(event) => update("name", event.target.value)} /></Field>
            <Field label="Contact Person"><input value={form.contact_person} onChange={(event) => update("contact_person", event.target.value)} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(event) => update("phone", event.target.value)} /></Field>
            <Field label="GSTIN"><input value={form.gstin} onChange={(event) => update("gstin", event.target.value.toUpperCase())} /></Field>
            <label className="checkbox-field"><input checked={form.active} type="checkbox" onChange={(event) => update("active", event.target.checked)} />Active client</label>
            <div className="form-actions full-span"><button className="ghost-button" onClick={closeForm} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : "Save Client"}</button></div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
