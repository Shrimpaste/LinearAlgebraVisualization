import type { CSSProperties } from "react";
import { NumberField } from "./NumberField";
import { PrecisionDetails } from "./PrecisionDetails";

export type DynamicInputDimension = 1 | 2 | 3;

export interface DynamicMatrixValue {
  readonly rows: DynamicInputDimension;
  readonly columns: DynamicInputDimension;
  readonly entries: readonly number[];
}

export interface DynamicMatrixInputProps {
  label: string;
  value: DynamicMatrixValue;
  onChange: (matrix: DynamicMatrixValue) => void;
  symbol?: string;
  disabled?: boolean;
  testId?: string;
}

const rowLabels = ["第一行", "第二行", "第三行"] as const;
const columnLabels = ["第一列", "第二列", "第三列"] as const;

type MatrixStyle = CSSProperties & {
  "--matrix-columns": DynamicInputDimension;
};

function matrixCellLabel(label: string, row: number, column: number) {
  return `${label} ${rowLabels[row]!}${columnLabels[column]!}`;
}

export function DynamicMatrixInput({
  label,
  value,
  onChange,
  symbol = "A",
  disabled,
  testId = "matrix-cell",
}: DynamicMatrixInputProps) {
  const cellCount = value.rows * value.columns;
  const entries = Array.from(
    { length: cellCount },
    (_, index) => value.entries[index] ?? 0,
  );
  const matrixStyle: MatrixStyle = {
    "--matrix-columns": value.columns,
  };

  const update = (index: number, next: number) => {
    if (disabled) return;
    const nextEntries = entries.map((entry, entryIndex) =>
      entryIndex === index ? next : entry,
    );
    onChange({ ...value, entries: nextEntries });
  };

  return (
    <div
      className="matrix-editor"
      aria-label={label}
      data-disabled={disabled || undefined}
      data-rows={value.rows}
      data-columns={value.columns}
      style={matrixStyle}
    >
      <span className="matrix-editor__symbol" aria-hidden="true">
        {symbol} =
      </span>
      <span
        className="matrix-bracket matrix-bracket--left"
        aria-hidden="true"
        style={{ alignSelf: "stretch", height: "auto" }}
      />
      <div
        className="matrix-editor__grid"
        style={{
          gridTemplateColumns: "repeat(var(--matrix-columns), minmax(0, 1fr))",
        }}
      >
        {entries.map((entry, index) => {
          const row = Math.floor(index / value.columns);
          const column = index % value.columns;
          return (
            <NumberField
              key={`${row}-${column}`}
              label={matrixCellLabel(label, row, column)}
              value={entry}
              onChange={(next) => update(index, next)}
              disabled={disabled}
              testId={testId}
              data={{ row, column }}
            />
          );
        })}
      </div>
      <span
        className="matrix-bracket matrix-bracket--right"
        aria-hidden="true"
        style={{ alignSelf: "stretch", height: "auto" }}
      />
      {disabled && <PrecisionDetails values={entries} />}
    </div>
  );
}
