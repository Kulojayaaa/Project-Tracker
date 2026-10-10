import { cloneElement, isValidElement, type ReactNode } from "react";

export function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {isValidElement<{ "aria-label"?: string }>(children)
        ? cloneElement(children, {
            "aria-label": children.props["aria-label"] ?? label,
          })
        : children}
    </label>
  );
}

export function ModuleMessage({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "error";
}) {
  const className =
    tone === "success"
      ? "alert success-alert"
      : tone === "error"
        ? "alert error-alert"
        : "alert";
  return <div className={className}>{children}</div>;
}
