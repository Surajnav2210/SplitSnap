import { cn } from "@/lib/utils";

// Eight muted tones (CSS variables --av-N-bg / --av-N-fg in globals.css) that
// read on both themes. Picked by the order people were added, so the first
// eight people at a table always get distinct colors.
export const AVATAR_TONES = 8;

/** Deterministic tone slot (0..7) for a seed (0, 1, 2, ...). */
export function avatarTone(seed: number): number {
  return ((Math.trunc(seed) % AVATAR_TONES) + AVATAR_TONES) % AVATAR_TONES;
}

export function initialOf(name: string): string {
  const first = name.trim().codePointAt(0);
  return first === undefined ? "?" : String.fromCodePoint(first).toUpperCase();
}

const sizes = {
  xs: "size-5 text-[10px]",
  sm: "size-7 text-xs",
  md: "size-9 text-sm",
  lg: "size-11 text-[15px]",
} as const;

export type AvatarSize = keyof typeof sizes;

export function Avatar({
  name,
  seed,
  size = "md",
  ring = false,
  className,
}: {
  name: string;
  seed: number;
  size?: AvatarSize;
  /** Separates overlapping avatars with a ring in the surface color. */
  ring?: boolean;
  className?: string;
}) {
  const tone = avatarTone(seed);
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: `var(--av-${tone}-bg)`, color: `var(--av-${tone}-fg)` }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        sizes[size],
        ring && "ring-2 ring-card",
        className,
      )}
    >
      {initialOf(name)}
    </span>
  );
}

/** Overlapping avatars, e.g. who claimed an item. Shows up to `max`, then "+N". */
export function AvatarStack({
  people,
  max = 3,
  size = "xs",
}: {
  people: readonly { id: string; name: string; tone: number }[];
  max?: number;
  size?: AvatarSize;
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
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-2 ring-card",
            sizes[size],
          )}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
