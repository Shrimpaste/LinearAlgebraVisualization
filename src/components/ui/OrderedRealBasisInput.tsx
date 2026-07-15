import type { Dimension, RealMatrix } from "../../math/nd";
import { DynamicVectorInput } from "./DynamicVectorInput";

export interface OrderedRealBasisInputProps {
  readonly label: string;
  readonly symbol: "v" | "w" | "q";
  readonly basis: RealMatrix;
  readonly dimension: Dimension;
  readonly onChange: (basis: RealMatrix) => void;
  readonly testId?: string;
  readonly disabled?: boolean;
}

/** Edits an ordered real basis as vector columns rather than matrix rows. */
export function OrderedRealBasisInput({
  label,
  symbol,
  basis,
  dimension,
  onChange,
  testId,
  disabled = false,
}: OrderedRealBasisInputProps) {
  const updateColumn = (column: number, entries: readonly number[]) => {
    if (disabled) return;
    onChange(
      Array.from({ length: dimension }, (_, row) =>
        Array.from({ length: dimension }, (_, currentColumn) =>
          currentColumn === column
            ? (entries[row] ?? 0)
            : (basis[row]?.[currentColumn] ?? 0),
        ),
      ),
    );
  };

  return (
    <fieldset
      className="ordered-basis-editor"
      aria-label={label}
      disabled={disabled}
      data-basis-space={symbol}
      data-disabled={disabled || undefined}
    >
      <legend className="ordered-basis-editor__label">{label}</legend>
      <div className="ordered-basis-editor__columns">
        {Array.from({ length: dimension }, (_, column) => {
          const entries = Array.from(
            { length: dimension },
            (_, row) => basis[row]?.[column] ?? 0,
          );
          return (
            <DynamicVectorInput
              key={column}
              label={`${symbol}${column + 1}`}
              name={`${symbol}${column + 1}`}
              value={{ dimension, entries }}
              onChange={(value) => updateColumn(column, value.entries)}
              tone={symbol === "w" ? "yellow" : "cyan"}
              testId={testId ?? `${symbol}-basis-component`}
              disabled={disabled}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
