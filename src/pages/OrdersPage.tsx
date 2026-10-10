import { useEffect, useState, type FormEvent } from "react";
import { Edit3, Plus, RefreshCw, X } from "lucide-react";
import { Field, ModuleMessage } from "../components/FormBits";
import {
  emptyOrder,
  listOrders,
  saveOrder,
  type Order,
  type OrderForm,
} from "../services/orders";
import { listProjectOptions } from "../services/operations";
import type { ProjectOption } from "../types/domain";
import { formatCurrencyCompact } from "../utils/formatting";
export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]),
    [projects, setProjects] = useState<ProjectOption[]>([]);
  const [form, setForm] = useState<OrderForm>(emptyOrder),
    [editing, setEditing] = useState<string | undefined>(),
    [open, setOpen] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [o, p] = await Promise.all([listOrders(), listProjectOptions()]);
      setOrders(o);
      setProjects(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const update = (key: keyof OrderForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveOrder(form, editing);
      setOpen(false);
      setNotice("WO/PO saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save order.");
    } finally {
      setBusy(false);
    }
  }
  function edit(o: Order) {
    setEditing(o.id);
    setForm({
      ...o,
      order_date: o.order_date ?? "",
      description: o.description ?? "",
      previous_order_id: o.previous_order_id ?? "",
      base_value: String(o.base_value),
      gst_value: String(o.gst_value),
      remarks: o.remarks ?? "",
    });
    setOpen(true);
  }
  return (
    <div className="page-stack">
      {error && <ModuleMessage tone="error">{error}</ModuleMessage>}
      {notice && <ModuleMessage tone="success">{notice}</ModuleMessage>}
      <section className="panel">
        <div className="panel-header controls-header">
          <h2>WO/PO Register</h2>
          <div className="button-row">
            <button className="outline-button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setEditing(undefined);
                setForm(emptyOrder());
                setOpen(true);
              }}
            >
              <Plus size={16} />
              New Order
            </button>
          </div>
        </div>
        <Field label="WO Scope">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option value={p.id} key={p.id}>
                {p.project_code} - {p.project_name}
              </option>
            ))}
          </select>
        </Field>
        {loading ? (
          <div className="empty-state">Loading orders...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>WO Scope</th>
                  <th>WO/PO Number</th>
                  <th>Date</th>
                  <th>Type / Version</th>
                  <th>Base</th>
                  <th>GST</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders
                  .filter((o) => !filter || o.project_id === filter)
                  .map((o) => (
                    <tr key={o.id}>
                      <td>{o.order_code}</td>
                      <td>
                        {
                          projects.find((p) => p.id === o.project_id)
                            ?.project_code
                        }
                      </td>
                      <td>{o.order_number}</td>
                      <td>{o.order_date ?? "-"}</td>
                      <td>
                        {o.order_type} / {o.version}
                      </td>
                      <td>{formatCurrencyCompact(o.base_value)}</td>
                      <td>{formatCurrencyCompact(o.gst_value)}</td>
                      <td>{o.status}</td>
                      <td>
                        <button
                          title="Edit order"
                          aria-label="Edit order"
                          className="icon-button"
                          onClick={() => edit(o)}
                        >
                          <Edit3 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!orders.length && (
              <div className="empty-state">No orders recorded.</div>
            )}
          </div>
        )}
      </section>
      {open && (
        <section className="panel form-panel">
          <div className="panel-header">
            <h2>{editing ? "Edit WO/PO" : "New WO/PO"}</h2>
            <button
              title="Close form"
              aria-label="Close form"
              className="icon-button"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <form className="project-form" onSubmit={submit}>
            <Field label="Order ID *">
              <input
                required
                disabled={!!editing}
                value={form.order_code}
                onChange={(e) => update("order_code", e.target.value)}
              />
            </Field>
            <Field label="WO Scope *">
              <select
                required
                disabled={!!editing}
                value={form.project_id}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    project_id: e.target.value,
                    previous_order_id: "",
                  }))
                }
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code} - {p.project_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="WO/PO Number *">
              <input
                required
                value={form.order_number}
                onChange={(e) => update("order_number", e.target.value)}
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={form.order_date}
                onChange={(e) => update("order_date", e.target.value)}
              />
            </Field>
            <Field label="Order Type">
              <select
                disabled={!!editing}
                value={form.order_type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    order_type: e.target.value as Order["order_type"],
                    previous_order_id: "",
                  }))
                }
              >
                {["original", "additional", "revision"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            {form.order_type === "revision" && (
              <Field label="Previous Order *">
                <select
                  required
                  disabled={!!editing}
                  value={form.previous_order_id}
                  onChange={(e) => update("previous_order_id", e.target.value)}
                >
                  <option value="">Select order</option>
                  {orders
                    .filter(
                      (o) =>
                        o.project_id === form.project_id &&
                        (o.status === "active" ||
                          o.id === form.previous_order_id),
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.order_code} - {o.order_number}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="Base Value (Excl. GST) *">
              <input
                required
                min="0"
                step="0.01"
                type="number"
                value={form.base_value}
                onChange={(e) => update("base_value", e.target.value)}
              />
            </Field>
            <Field label="GST Value">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.gst_value}
                onChange={(e) => update("gst_value", e.target.value)}
              />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
              >
                {["active", "superseded", "cancelled"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </Field>
            <Field label="Remarks">
              <textarea
                value={form.remarks}
                onChange={(e) => update("remarks", e.target.value)}
              />
            </Field>
            <div className="form-actions full-span">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? "Saving..." : "Save Order"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
