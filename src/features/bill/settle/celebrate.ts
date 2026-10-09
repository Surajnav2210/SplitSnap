// One short confetti burst in the brand's ink + blue. Skipped entirely when the
// user prefers reduced motion. The library is loaded only when needed.

const LIGHT = ["#0c0a09", "#78716c", "#d6d3d1", "#2563eb"];
const DARK = ["#fafaf9", "#a8a29e", "#57534e", "#3b82f6"];

export async function celebrate(): Promise<void> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { default: confetti } = await import("canvas-confetti");
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  await confetti({
    particleCount: 70,
    spread: 70,
    startVelocity: 36,
    gravity: 1.15,
    ticks: 150,
    scalar: 0.85,
    origin: { x: 0.5, y: 0.9 },
    colors: dark ? DARK : LIGHT,
    disableForReducedMotion: true,
  });
}
