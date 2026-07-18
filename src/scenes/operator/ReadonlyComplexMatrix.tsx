import type { ComplexMatrix } from "../../math/nd";
import { formatComplex } from "../../utils/formatLinear";
import { compactOperatorDisplayNumber } from "./display";

interface Props {
  readonly label: string;
  readonly symbol: string;
  readonly matrix: ComplexMatrix;
  readonly testId?: string;
}

function displayEntry(entry: ComplexMatrix[number][number]) {
  return formatComplex({
    re: compactOperatorDisplayNumber(entry.re),
    im: compactOperatorDisplayNumber(entry.im),
  });
}

export function ReadonlyComplexMatrix({
  label,
  symbol,
  matrix,
  testId,
}: Props) {
  const columns = matrix[0]?.length ?? 0;
  return (
    <figure className="operator-math-matrix" aria-label={label}>
      <figcaption>{symbol} =</figcaption>
      <div className="operator-math-matrix__bracket" aria-hidden="true" />
      <div
        className="operator-math-matrix__grid"
        role="table"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {matrix.flatMap((row, rowIndex) =>
          row.map((entry, columnIndex) => (
            <span
              role="cell"
              key={`${rowIndex}-${columnIndex}`}
              data-testid={testId}
              data-row={rowIndex}
              data-column={columnIndex}
            >
              {displayEntry(entry)}
            </span>
          )),
        )}
      </div>
      <div
        className="operator-math-matrix__bracket operator-math-matrix__bracket--right"
        aria-hidden="true"
      />
    </figure>
  );
}
