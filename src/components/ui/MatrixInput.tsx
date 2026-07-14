import type { Mat2 } from "../../math";
import { NumberField } from "./NumberField";

interface MatrixInputProps {
  label: string;
  value: Mat2;
  onChange: (matrix: Mat2) => void;
  symbol?: string;
  disabled?: boolean;
}

const cellLabels = [
  "第一行第一列",
  "第一行第二列",
  "第二行第一列",
  "第二行第二列",
];

export function MatrixInput({
  label,
  value,
  onChange,
  symbol = "A",
  disabled,
}: MatrixInputProps) {
  const update = (index: number, next: number) => {
    if (disabled) return;
    const matrix = [...value] as [number, number, number, number];
    matrix[index] = next;
    onChange(matrix);
  };

  return (
    <div
      className="matrix-editor"
      aria-label={label}
      data-disabled={disabled || undefined}
    >
      <span className="matrix-editor__symbol" aria-hidden="true">
        {symbol} =
      </span>
      <span
        className="matrix-bracket matrix-bracket--left"
        aria-hidden="true"
      />
      <div className="matrix-editor__grid">
        {value.map((entry, index) => (
          <NumberField
            key={index}
            label={`${label} ${cellLabels[index]}`}
            value={entry}
            onChange={(next) => update(index, next)}
            disabled={disabled}
            testId="matrix-cell"
            data={{ row: Math.floor(index / 2), column: index % 2 }}
          />
        ))}
      </div>
      <span
        className="matrix-bracket matrix-bracket--right"
        aria-hidden="true"
      />
    </div>
  );
}
