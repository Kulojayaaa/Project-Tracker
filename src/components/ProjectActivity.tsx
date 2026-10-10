import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ModuleMessage } from "./FormBits";
export function ProjectActivity({ recordIds }: { recordIds: string[] }) {
  const [rows, setRows] = useState<
      { id: string; action: string; module: string; created_at: string }[]
    >([]),
    [error, setError] = useState("");
  const ids = recordIds.join(",");
  useEffect(() => {
    let active = true;
    setError("");
    void supabase
      .from("audit_logs")
      .select("id,action,module,created_at")
      .or(
        `record_id.in.(${ids}),new_value->>project_id.eq.${recordIds[0]},old_value->>project_id.eq.${recordIds[0]}`,
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setRows(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [ids]);
  return (
    <div>
      {error && <ModuleMessage tone="error">{error}</ModuleMessage>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Record Type</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString("en-IN")}</td>
                <td>{r.module.replace(/_/g, " ")}</td>
                <td>{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-state">
            No recorded activity available for this account.
          </div>
        )}
      </div>
    </div>
  );
}
