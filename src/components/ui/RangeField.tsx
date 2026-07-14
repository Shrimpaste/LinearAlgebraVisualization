interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  tone?: "cyan" | "red" | "yellow" | "blue";
}

export function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (next) => next.toFixed(2),
  tone = "cyan",
}: RangeFieldProps) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="range-field" data-tone={tone}>
      <span>{label}</span>
      <output>{format(value)}</output>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--range-progress": `${progress}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
