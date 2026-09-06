import type { ReactNode } from "react";
import type { SceneId } from "../app/types";
import { FormulaReadout } from "./ui/FormulaReadout";
import { LearningContext, type LearningMode } from "../app/learning";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { LearningGuide } from "./LearningGuide";
import { SegmentedControl } from "./ui/SegmentedControl";
import { useMediaQuery } from "../hooks/useMediaQuery";

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
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [mode, setMode] = useLocalStorage<LearningMode>(
    "basis-lab:learning-mode",
    "explore",
  );
  return (
    <LearningContext.Provider value={mode}>
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
          {!isMobile && (
            <footer className="insight-strip">
              <span>观察与解释</span>
              <div>{insight}</div>
            </footer>
          )}
        </section>
        <aside className="inspector" aria-label={`${title}参数面板`}>
          <div className="workspace-mode">
            <SegmentedControl
              label="学习模式"
              value={mode}
              onChange={setMode}
              options={[
                { value: "explore", label: "自由实验" },
                { value: "guided", label: "入门引导" },
              ]}
            />
          </div>
          {mode === "guided" && <LearningGuide key={id} scene={id} />}
          {isMobile && (
            <details className="mobile-note">
              <summary>当前观察说明</summary>
              <p>{insight}</p>
            </details>
          )}
          {inspector}
        </aside>
      </main>
    </LearningContext.Provider>
  );
}
