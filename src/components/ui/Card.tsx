import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("rounded-3xl border border-line bg-surface p-5 shadow-card", className)}
      {...props}
    />
  );
}
