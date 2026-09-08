import { createContext, useContext } from "react";
export type LearningMode = "explore" | "guided";
export const LearningContext = createContext<LearningMode>("explore");
export const useLearningMode = () => useContext(LearningContext);
