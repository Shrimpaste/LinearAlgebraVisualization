import { Check, X } from "lucide-react";
import { formatNumber } from "../../utils/format";

export interface AxiomCheckItem {
  id: string;
  label: string;
  passed: boolean;
  residual: number;
  detail: string;
}

export function AxiomChecklist({
  label,
  items,
}: {
  label: string;
  items: readonly AxiomCheckItem[];
}) {
  return (
    <ul className="axiom-checklist" aria-label={label}>
      {items.map((item) => {
        const Icon = item.passed ? Check : X;
        return (
          <li
            key={item.id}
            data-passed={item.passed}
            data-testid="axiom-check"
            data-axiom={item.id}
          >
            <Icon size={14} aria-hidden="true" />
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <output aria-label={`${item.label}残差`}>
              {formatNumber(item.residual)}
            </output>
          </li>
        );
      })}
    </ul>
  );
}
