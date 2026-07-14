import type { CSSProperties } from "react";
import { NumberField } from "./NumberField";
import type { DynamicInputDimension } from "./DynamicMatrixInput";

export interface ComplexValue {
  readonly real: number;
  readonly imag: number;
}

export interface ComplexMatrixValue {
  readonly rows: DynamicInputDimension;
  readonly columns: DynamicInputDimension;
  readonly entries: readonly ComplexValue[];
}

export interface ComplexMatrixInputProps {
  label: string;
  value: ComplexMatrixValue;
  onChange: (matrix: ComplexMatrixValue) => void;
  symbol?: string;
  disabled?: boolean;
  testId?: string;
}

type MatrixStyle = CSSProperties & {
  "--matrix-columns": DynamicInputDimension;
};

const emptyComplexValue: ComplexValue = { real: 0, imag: 0 };
const rowLabels = ["第一行", "第二行", "第三行"] as const;
const columnLabels = ["第一列", "第二列", "第三列"] as const;

function matrixCellLabel(label: string, row: number, column: number) {
  return `${label} ${rowLabels[row]!}${columnLabels[column]!}`;
}

export function ComplexMatrixInput({
  label,
  value,
  onChange,
  symbol = "A",
  disabled,
  testId = "matrix-cell",
}: ComplexMatrixInputProps) {
  const cellCount = value.rows * value.columns;
  const entries = Array.from(
    { length: cellCount },
    (_, index) => value.entries[index] ?? emptyComplexValue,
  );
  const matrixStyle: MatrixStyle = {
    "--matrix-columns": value.columns,
  };

  const update = (index: number, part: keyof ComplexValue, next: number) => {
    if (disabled) return;
    const nextEntries = entries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, [part]: next } : entry,
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
      data-scalar-field="complex"
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
          const cellLabel = matrixCellLabel(label, row, column);
          return (
            <div
              key={`${row}-${column}`}
              role="group"
              aria-label={cellLabel}
              data-row={row}
              data-column={column}
              style={{ display: "grid", gap: 4, minWidth: 0 }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px minmax(0, 1fr)",
                  alignItems: "center",
                  gap: 3,
                  minWidth: 0,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    color: "var(--ink-faint)",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                  }}
                >
                  Re
                </span>
                <NumberField
                  label={`${cellLabel} 实部`}
                  value={entry.real}
                  onChange={(next) => update(index, "real", next)}
                  disabled={disabled}
                  testId={testId}
                  data={{ row, column, part: "real" }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px minmax(0, 1fr)",
                  alignItems: "center",
                  gap: 3,
                  minWidth: 0,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    color: "var(--ink-faint)",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                  }}
                >
                  Im
                </span>
                <NumberField
                  label={`${cellLabel} 虚部`}
                  value={entry.imag}
                  onChange={(next) => update(index, "imag", next)}
                  disabled={disabled}
                  testId={testId}
                  data={{ row, column, part: "imag" }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <span
        className="matrix-bracket matrix-bracket--right"
        aria-hidden="true"
        style={{ alignSelf: "stretch", height: "auto" }}
      />
    </div>
  );
}
