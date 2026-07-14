interface Preset<T> {
  label: string;
  value: T;
}

interface PresetGridProps<T> {
  label: string;
  presets: readonly Preset<T>[];
  onSelect: (value: T) => void;
}

export function PresetGrid<T>({
  label,
  presets,
  onSelect,
}: PresetGridProps<T>) {
  return (
    <div className="preset-grid" aria-label={label}>
      {presets.map((preset) => (
        <button
          type="button"
          key={preset.label}
          onClick={() => onSelect(preset.value)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
