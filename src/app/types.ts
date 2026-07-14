import type { ComponentType, LazyExoticComponent } from "react";

export type SceneId =
  | "span"
  | "transform"
  | "eigen"
  | "inner-product"
  | "determinant"
  | "operator"
  | "decomposition";

export type ThemeMode = "light" | "dark";

export interface SceneProps {
  theme: ThemeMode;
}

export interface SceneMeta {
  id: SceneId;
  index: string;
  label: string;
  shortLabel: string;
  subtitle: string;
  component:
    ComponentType<SceneProps> | LazyExoticComponent<ComponentType<SceneProps>>;
}
