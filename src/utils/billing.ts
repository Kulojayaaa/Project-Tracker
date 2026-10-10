export function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed))
    throw new Error("Amount must be a finite number.");
  return Math.round((parsed + Math.sign(parsed) * Number.EPSILON) * 100) / 100;
}
export function financialYearFor(date: string): string {
  const year = Number(date.slice(0, 4));
  const first = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${first}-${String(first + 1).slice(-2)}`;
}
export function localDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export type Closure =
  "open" | "closed" | "cancelled_balance" | "pending_confirmation";
export function billingFigures(
  base: number,
  opening: number,
  prior: number,
  current: number,
  carry: boolean,
  closure: Closure,
  planned = 0,
) {
  const historical = money(opening + prior);
  const total = money(historical + current);
  const fyTarget = carry ? money(base - historical) : 0;
  const rawRemaining = money(base - total);
  const pending =
    closure === "closed" || closure === "cancelled_balance"
      ? 0
      : carry
        ? Math.max(money(fyTarget - current), 0)
        : 0;
  const percentage = base > 0 ? (total / base) * 100 : 0;
  const status =
    closure === "closed"
      ? "Closed - Final Billing Closed"
      : closure === "cancelled_balance"
        ? "Closed - Balance Cancelled"
        : closure === "pending_confirmation"
          ? "Awaiting Client Confirmation"
          : !carry
            ? "Not Carried Forward"
            : pending === 0
              ? "Fully Billed"
              : pending > planned
                ? "Billing Plan Shortfall"
                : "Billing Fully Planned";
  return {
    historical,
    total,
    fyTarget,
    rawRemaining,
    pending,
    percentage,
    status,
  };
}

export function dcBillingStatus(
  raised: boolean,
  required: boolean,
  dcDate: string,
  expectedDate: string | null,
  overdueDays: number,
  today = localDate(),
): string {
  if (raised) return "Invoiced";
  if (!required) return "Not Required";
  const pendingDays = Math.max(
    Math.floor((Date.parse(today) - Date.parse(dcDate)) / 86400000),
    0,
  );
  if (pendingDays > overdueDays) return "Overdue";
  if (expectedDate && expectedDate <= today) return "Due";
  return "Pending";
}
