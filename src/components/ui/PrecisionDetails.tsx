import { formatReadoutNumber } from "../../utils/format";

export function PrecisionDetails({ values }: { values: readonly number[] }) {
  if (values.every((value) => formatReadoutNumber(value) === String(value)))
    return null;
  return (
    <details className="precision-details">
      <summary>展开完整精度</summary>
      <code>{values.map(String).join(" · ")}</code>
    </details>
  );
}
