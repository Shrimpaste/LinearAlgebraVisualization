import { useState } from "react";
export function Prediction({
  question,
  options,
  correct,
  explanation,
}: {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}) {
  const [answer, setAnswer] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  return (
    <div className="prediction">
      <strong>{question}</strong>
      <div role="group" aria-label={question}>
        {options.map((option, i) => (
          <button
            type="button"
            key={option}
            className="text-button"
            aria-pressed={answer === i}
            onClick={() => {
              setAnswer(i);
              setChecked(false);
            }}
          >
            {option}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="text-button"
        disabled={answer === null}
        onClick={() => setChecked(true)}
      >
        检查预测
      </button>
      {checked && (
        <p role="status">
          {answer === correct ? "预测正确。" : "再观察一次。"}
          {explanation}
        </p>
      )}
    </div>
  );
}
