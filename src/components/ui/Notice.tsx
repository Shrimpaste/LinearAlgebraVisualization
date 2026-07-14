import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

interface NoticeProps {
  tone: "info" | "success" | "warning";
  children: ReactNode;
}

export function Notice({ tone, children }: NoticeProps) {
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? AlertTriangle
        : Info;
  return (
    <p
      className="inline-notice"
      data-tone={tone}
      role={tone === "warning" ? "alert" : "status"}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
