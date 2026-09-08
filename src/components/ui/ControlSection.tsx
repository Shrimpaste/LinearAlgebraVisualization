import type { ReactNode } from "react";
import { useLearningMode } from "../../app/learning";

interface ControlSectionProps {
  title: string;
  caption?: string;
  children: ReactNode;
  action?: ReactNode;
  advanced?: boolean;
}

export function ControlSection({
  title,
  caption,
  children,
  action,
  advanced = false,
}: ControlSectionProps) {
  const mode = useLearningMode();
  if (advanced && mode === "guided")
    return (
      <details className="control-section control-section--advanced">
        <summary>
          {title}
          <span>进阶 · 展开</span>
        </summary>
        {caption && <p>{caption}</p>}
        {action}
        <div className="control-section__body">{children}</div>
      </details>
    );
  return (
    <section className="control-section">
      <header className="control-section__header">
        <div>
          <h2>{title}</h2>
          {caption && <p>{caption}</p>}
        </div>
        {action}
      </header>
      <div className="control-section__body">{children}</div>
    </section>
  );
}
