import {
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  symbol?: string;
  testId?: string;
  data?: Record<string, string | number>;
  disabled?: boolean;
}

function formatDraftValue(value: number) {
  return String(value);
}

function isCompleteNumber(text: string) {
  const trimmed = text.trim();
  return (
    trimmed !== "" &&
    Number.isFinite(Number(trimmed)) &&
    !/[.eE+-]$/.test(trimmed)
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  symbol,
  testId,
  data,
  disabled,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(() => formatDraftValue(value));

  useEffect(() => {
    setDraft(formatDraftValue(value));
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d*)?(?:[eE][+-]?\d*)?$/.test(nextDraft)) {
      return;
    }
    setDraft(nextDraft);
    if (isCompleteNumber(nextDraft)) onChange(Number(nextDraft));
  };

  const commitDraft = () => {
    if (isCompleteNumber(draft)) {
      const next = Number(draft);
      const bounded = Math.min(
        max ?? Infinity,
        Math.max(min ?? -Infinity, next),
      );
      onChange(bounded);
      setDraft(formatDraftValue(bounded));
    } else {
      setDraft(formatDraftValue(value));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      setDraft(formatDraftValue(value));
      event.currentTarget.blur();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const base = isCompleteNumber(draft) ? Number(draft) : value;
    const next = Math.min(
      max ?? Infinity,
      Math.max(min ?? -Infinity, base + direction * step),
    );
    const stableNext = Number(next.toPrecision(12));
    onChange(stableNext);
    setDraft(formatDraftValue(stableNext));
  };

  const dataAttributes = Object.fromEntries(
    Object.entries(data ?? {}).map(([key, entry]) => [`data-${key}`, entry]),
  );

  return (
    <label className="number-field">
      <span className="sr-only">{label}</span>
      {symbol && (
        <span className="number-field__symbol" aria-hidden="true">
          {symbol}
        </span>
      )}
      <input
        type="text"
        role="spinbutton"
        inputMode="decimal"
        aria-label={label}
        aria-valuenow={isCompleteNumber(draft) ? Number(draft) : undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft}
        onChange={handleChange}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        data-testid={testId}
        {...dataAttributes}
      />
    </label>
  );
}
