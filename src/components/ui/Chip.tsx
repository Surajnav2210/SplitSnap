import type { ReactNode } from "react";
import { cx } from "./cx";

export type ChipTone = "neutral" | "brand" | "warning" | "danger";

const tones: Record<ChipTone, string> = {
  neutral: "bg-sunken text-muted",
  brand: "bg-brand-soft text-brand-soft-fg",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
