import { useEffect, useState, type FormEvent } from "react";
import { Plus, Check, RefreshCw } from "lucide-react";
import { Field, ModuleMessage } from "../components/FormBits";
import { supabase } from "../lib/supabase";
import { allRows, requireTracking } from "../services/data";
import { money } from "../utils/billing";
import { formatCurrencyCompact } from "../utils/formatting";
type Year = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  sales_target: number;
  active: boolean;
};
export function FinancialYearsPage() {
  const [years, setYears] = useState<Year[]>([]),
    [name, setName] = useState(""),
    [target, setTarget] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setYears((await allRows("financial_years")) as unknown as Year[]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load financial years.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requireTracking();
      if (
        !/^\d{4}-\d{2}$/.test(name) ||
        Number(name.slice(-2)) !== (Number(name.slice(0, 4)) + 1) % 100
      )
        throw new Error("Enter a financial year such as 2026-27.");
      const year = Number(name.slice(0, 4));
      const { error } = await supabase
        .from("financial_years")
        .insert({
          name,
          start_date: `${year}-04-01`,
          end_date: `${year + 1}-03-31`,
          sales_target: money(target),
          active: false,
        });
      if (error) throw error;
      setName("");
      setTarget("");
      await load();
      setNotice("Financial year created.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to create financial year.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function activate(id: string) {
    setBusy(true);
    setError("");
    try {
      await requireTracking();
      const { error } = await supabase.rpc("activate_financial_year", {
        year_id: id,
      });
      if (error) throw error;
      await load();
      setNotice("Active financial year updated.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to activate financial year.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-stack">
      {error && <ModuleMessage tone="error">{error}</ModuleMessage>}
      {notice && <ModuleMessage tone="success">{notice}</ModuleMessage>}
      <section className="panel">
        <div className="panel-header">
          <h2>Financial Years</h2>
          <button className="outline-button" onClick={() => void load()}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>FY</th>
                <th>Start</th>
                <th>End</th>
                <th>Sales Target</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {years
                .sort((a, b) => b.start_date.localeCompare(a.start_date))
                .map((y) => (
                  <tr key={y.id}>
                    <td>{y.name}</td>
                    <td>{y.start_date}</td>
                    <td>{y.end_date}</td>
                    <td>{formatCurrencyCompact(y.sales_target)}</td>
                    <td>
                      {y.active ? (
                        "Active"
                      ) : (
                        <button
                          className="outline-button"
                          disabled={busy}
                          onClick={() => void activate(y.id)}
                        >
                          <Check size={16} />
                          Set Active
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <form className="project-form" onSubmit={create}>
          <Field label="Financial Year *">
            <input
              required
              placeholder="2027-28"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Annual Sales Target">
            <input
              min="0"
              type="number"
              step="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </Field>
          <div className="form-actions full-span">
            <button className="primary-button" disabled={busy}>
              <Plus size={16} />
              Add Financial Year
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
