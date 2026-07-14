import type { Vec2 } from "../../math";
import { NumberField } from "./NumberField";

interface VectorInputProps {
  label: string;
  name: string;
  value: Vec2;
  onChange: (vector: Vec2) => void;
  tone?: "cyan" | "red" | "yellow" | "blue";
}

export function VectorInput({
  label,
  name,
  value,
  onChange,
  tone = "cyan",
}: VectorInputProps) {
  const update = (index: 0 | 1, next: number) => {
    const vector: [number, number] = [value[0], value[1]];
    vector[index] = next;
    onChange(vector);
  };

  return (
    <div className="vector-editor" data-tone={tone}>
      <span className="vector-editor__label">{label}</span>
      <NumberField
        label={`${label} x 分量`}
        value={value[0]}
        onChange={(next) => update(0, next)}
        testId="vector-component"
        data={{ vector: name, axis: "x" }}
      />
      <NumberField
        label={`${label} y 分量`}
        value={value[1]}
        onChange={(next) => update(1, next)}
        testId="vector-component"
        data={{ vector: name, axis: "y" }}
      />
    </div>
  );
}
