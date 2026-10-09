import { cx } from "./cx";

/** Top progress indicator: "1 Receipt · 2 People · 3 Claim · 4 Settle". */
export function Stepper({
  steps,
  current,
  canGoTo,
  onSelect,
}: {
  steps: readonly string[];
  current: number;
  canGoTo: (index: number) => boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Progress">
      <ol className="grid grid-cols-4 gap-1.5">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          const enabled = canGoTo(i) && !active;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!enabled}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(i)}
                className="group flex min-h-11 w-full flex-col justify-end gap-1.5 rounded-lg text-left disabled:cursor-default"
              >
                <span
                  className={cx(
                    "text-[11px] font-semibold uppercase tracking-wide transition-colors",
                    active ? "text-fg" : done ? "text-brand" : "text-muted",
                    enabled && "group-hover:text-fg",
                  )}
                >
                  <span className="tabular-nums">{i + 1}</span> {label}
                </span>
                <span
                  aria-hidden="true"
                  className={cx(
                    "h-1 rounded-full transition-colors duration-300",
                    done || active ? "bg-brand" : "bg-line",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
