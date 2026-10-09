import { cx } from "./cx";

// Curated tones that read well on both light and dark surfaces. Picked by
// the order people were added, so the first eight people at a table always get distinct colors.
const TONES = [
  "bg-emerald-500 text-white",
  "bg-sky-500 text-white",
  "bg-violet-500 text-white",
  "bg-rose-500 text-white",
  "bg-amber-400 text-amber-950",
  "bg-teal-500 text-white",
  "bg-fuchsia-500 text-white",
  "bg-orange-500 text-white",
] as const;

/** Deterministic tone for a color slot (0, 1, 2, ...). */
export function avatarTone(seed: number): string {
  const i = ((Math.trunc(seed) % TONES.length) + TONES.length) % TONES.length;
  return TONES[i];
}

export function initialOf(name: string): string {
  const first = name.trim().codePointAt(0);
  return first === undefined ? "?" : String.fromCodePoint(first).toUpperCase();
}

const sizes = {
  xs: "h-6 w-6 text-[11px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

export function Avatar({
  name,
  seed,
  size = "md",
  ring = false,
  className,
}: {
  name: string;
  seed: number;
  size?: keyof typeof sizes;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        avatarTone(seed),
        sizes[size],
        ring && "ring-2 ring-surface",
        className,
      )}
    >
      {initialOf(name)}
    </span>
  );
}

/** Overlapping avatars, e.g. who claimed an item. Shows up to `max` then "+N". */
export function AvatarStack({
  people,
  max = 4,
  size = "xs",
}: {
  people: readonly { id: string; name: string; tone: number }[];
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} seed={p.tone} size={size} ring />
      ))}
      {extra > 0 ? (
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex items-center justify-center rounded-full bg-sunken font-semibold text-muted ring-2 ring-surface",
            sizes[size],
          )}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
