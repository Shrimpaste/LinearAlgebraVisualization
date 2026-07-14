import type { ReactNode } from "react";

interface ControlSectionProps {
  title: string;
  caption?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function ControlSection({
  title,
  caption,
  children,
  action,
}: ControlSectionProps) {
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
