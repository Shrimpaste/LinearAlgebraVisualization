import { NumberField } from "./NumberField";
import type { ComplexValue } from "./ComplexMatrixInput";
import type { DynamicInputDimension } from "./DynamicMatrixInput";

export interface ComplexVectorValue {
  readonly dimension: DynamicInputDimension;
  readonly entries: readonly ComplexValue[];
}

interface ComplexVectorInputProps {
  label: string;
  name: string;
  value: ComplexVectorValue;
  onChange: (vector: ComplexVectorValue) => void;
  tone?: "cyan" | "red" | "yellow" | "blue";
  disabled?: boolean;
}

const axes = ["x", "y", "z"] as const;

export function ComplexVectorInput({
  label,
  name,
  value,
  onChange,
  tone = "cyan",
  disabled,
}: ComplexVectorInputProps) {
  const entries = Array.from(
    { length: value.dimension },
    (_, index) => value.entries[index] ?? { real: 0, imag: 0 },
  );

  const update = (index: number, part: keyof ComplexValue, next: number) => {
    if (disabled) return;
    onChange({
      ...value,
      entries: entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [part]: next } : entry,
      ),
    });
  };

  return (
    <div
      className="complex-vector-editor"
      data-tone={tone}
      data-disabled={disabled || undefined}
    >
      <span className="complex-vector-editor__label">{label}</span>
      <div className="complex-vector-editor__grid">
        {entries.map((entry, index) => {
          const axis = axes[index]!;
          return (
            <div className="complex-vector-editor__component" key={axis}>
              <span aria-hidden="true">{axis}</span>
              <NumberField
                label={`${label} ${axis} 分量实部`}
                value={entry.real}
                onChange={(next) => update(index, "real", next)}
                disabled={disabled}
                testId="complex-vector-component"
                data={{ vector: name, axis, part: "real" }}
              />
              <NumberField
                label={`${label} ${axis} 分量虚部`}
                value={entry.imag}
                onChange={(next) => update(index, "imag", next)}
                disabled={disabled}
                testId="complex-vector-component"
                data={{ vector: name, axis, part: "imag" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
