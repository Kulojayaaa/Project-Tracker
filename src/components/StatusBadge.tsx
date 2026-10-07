import type { StatusTone, WithChildren } from "../types/domain";

export function StatusBadge({ children, tone }: WithChildren & { tone: StatusTone }) {
  return <span className={`status-badge tone-${tone}`}>{children}</span>;
}
