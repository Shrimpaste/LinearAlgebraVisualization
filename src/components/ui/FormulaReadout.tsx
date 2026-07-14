import type { ReactNode } from "react";

interface FormulaReadoutProps {
  label: string;
  children: ReactNode;
  status?: string;
  tone?: "neutral" | "positive" | "warning" | "negative";
}

export function FormulaReadout({
  label,
  children,
  status,
  tone = "neutral",
}: FormulaReadoutProps) {
  return (
    <div
      className="formula-readout"
      data-testid="formula-readout"
      data-tone={tone}
    >
      <span className="formula-readout__label">{label}</span>
      <strong>{children}</strong>
      {status && <span className="formula-readout__status">{status}</span>}
    </div>
  );
}
