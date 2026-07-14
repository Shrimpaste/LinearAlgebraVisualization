import type { ReactNode } from "react";
import type { SceneId } from "../app/types";
import { FormulaReadout } from "./ui/FormulaReadout";

interface SceneLayoutProps {
  id: SceneId;
  index: string;
  title: string;
  subtitle: string;
  formulaLabel: string;
  formula: ReactNode;
  formulaStatus?: string;
  formulaTone?: "neutral" | "positive" | "warning" | "negative";
  stage: ReactNode;
  inspector: ReactNode;
  insight: ReactNode;
}

export function SceneLayout({
  id,
  index,
  title,
  subtitle,
  formulaLabel,
  formula,
  formulaStatus,
  formulaTone,
  stage,
  inspector,
  insight,
}: SceneLayoutProps) {
  return (
    <main className="scene-layout" data-module={id}>
      <section className="stage-column">
        <header className="scene-header">
          <div className="scene-heading">
            <span>{index}</span>
            <div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
          </div>
          <FormulaReadout
            label={formulaLabel}
            status={formulaStatus}
            tone={formulaTone}
          >
            {formula}
          </FormulaReadout>
        </header>
        <div className="stage-slot">{stage}</div>
        <footer className="insight-strip">
          <span>GEOMETRIC NOTE</span>
          <div>{insight}</div>
        </footer>
      </section>
      <aside className="inspector" aria-label={`${title}参数面板`}>
        {inspector}
      </aside>
    </main>
  );
}
