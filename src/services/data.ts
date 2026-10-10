import { supabase } from "../lib/supabase";
export async function allRows<T extends Record<string, unknown>>(
  table: string,
  columns = "*",
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(offset, offset + 999);
    if (error)
      throw new Error(
        `Unable to load ${table.replace(/_/g, " ")}: ${error.message}`,
      );
    rows.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < 1000) return rows;
  }
}
export async function trackingReady(): Promise<boolean> {
  const { error } = await supabase.from("project_orders").select("id").limit(0);
  if (!error) return true;
  if (["42P01", "PGRST205"].includes(error.code)) return false;
  throw new Error(error.message);
}
export async function requireTracking() {
  if (!(await trackingReady()))
    throw new Error(
      "The billing upgrade must be applied to the live database before saving this record.",
    );
}
