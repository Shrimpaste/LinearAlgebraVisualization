import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  active?: boolean;
}

export function IconButton({
  label,
  children,
  active,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      aria-pressed={active}
      data-tooltip={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
