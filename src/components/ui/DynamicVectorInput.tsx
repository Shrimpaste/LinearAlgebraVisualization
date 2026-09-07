import { NumberField } from "./NumberField";
import { PrecisionDetails } from "./PrecisionDetails";
import type { DynamicInputDimension } from "./DynamicMatrixInput";

export interface DynamicVectorValue {
  readonly dimension: DynamicInputDimension;
  readonly entries: readonly number[];
}

export interface DynamicVectorInputProps {
  label: string;
  name: string;
  value: DynamicVectorValue;
  onChange: (vector: DynamicVectorValue) => void;
  tone?: "cyan" | "red" | "yellow" | "blue";
  disabled?: boolean;
  testId?: string;
}

const axisLabels = ["x", "y", "z"] as const;

export function DynamicVectorInput({
  label,
  name,
  value,
  onChange,
  tone = "cyan",
  disabled,
  testId = "vector-component",
}: DynamicVectorInputProps) {
  const entries = Array.from(
    { length: value.dimension },
    (_, index) => value.entries[index] ?? 0,
  );

  const update = (index: number, next: number) => {
    if (disabled) return;
    const nextEntries = entries.map((entry, entryIndex) =>
      entryIndex === index ? next : entry,
    );
    onChange({ ...value, entries: nextEntries });
  };

  return (
    <div
      className="vector-editor"
      data-tone={tone}
      data-disabled={disabled || undefined}
      onFocusCapture={() =>
        window.dispatchEvent(new CustomEvent("basis-focus", { detail: name }))
      }
      onBlurCapture={() =>
        window.dispatchEvent(new CustomEvent("basis-focus", { detail: null }))
      }
      onPointerEnter={() =>
        window.dispatchEvent(new CustomEvent("basis-focus", { detail: name }))
      }
      onPointerLeave={() =>
        window.dispatchEvent(new CustomEvent("basis-focus", { detail: null }))
      }
      style={{
        gridTemplateColumns: `42px repeat(${value.dimension}, minmax(0, 1fr))`,
      }}
    >
      <span className="vector-editor__label">{label}</span>
      {entries.map((entry, index) => {
        const axis = axisLabels[index]!;
        return (
          <NumberField
            key={axis}
            label={`${label} ${axis} 分量`}
            value={entry}
            onChange={(next) => update(index, next)}
            disabled={disabled}
            testId={testId}
            data={{ vector: name, axis, component: index }}
          />
        );
      })}
      {disabled && <PrecisionDetails values={entries} />}
    </div>
  );
}
