import { supabase } from "../lib/supabase";
import { allRows, requireTracking } from "./data";
import { money } from "../utils/billing";
export type Order = {
  id: string;
  order_code: string;
  project_id: string;
  order_number: string;
  order_date: string | null;
  description: string | null;
  order_type: "original" | "additional" | "revision";
  order_group: string;
  version: number;
  previous_order_id: string | null;
  base_value: number;
  gst_value: number;
  status: "active" | "superseded" | "cancelled";
  remarks: string | null;
};
export type OrderForm = {
  order_code: string;
  project_id: string;
  order_number: string;
  order_date: string;
  description: string;
  order_type: Order["order_type"];
  previous_order_id: string;
  base_value: string;
  gst_value: string;
  status: Order["status"];
  remarks: string;
};
export const emptyOrder = (): OrderForm => ({
  order_code: "",
  project_id: "",
  order_number: "",
  order_date: "",
  description: "",
  order_type: "original",
  previous_order_id: "",
  base_value: "",
  gst_value: "",
  status: "active",
  remarks: "",
});
export async function listOrders(): Promise<Order[]> {
  await requireTracking();
  return (await allRows<Record<string, unknown>>("project_orders")).map(
    (o) =>
      ({
        ...o,
        base_value: money(o.base_value),
        gst_value: money(o.gst_value),
      }) as Order,
  );
}
export async function saveOrder(v: OrderForm, id?: string) {
  await requireTracking();
  if (!v.order_code.trim() || !v.project_id || !v.order_number.trim())
    throw new Error("Order ID, project and WO/PO number are required.");
  const { error } = await supabase.rpc("save_project_order", {
    record_id: id ?? null,
    payload: {
      ...v,
      order_code: v.order_code.trim(),
      order_number: v.order_number.trim(),
      base_value: money(v.base_value),
      gst_value: money(v.gst_value),
    },
  });
  if (error) throw new Error(error.message);
}
