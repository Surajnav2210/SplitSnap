// Small presentational building blocks shared by the demo sections.
// No state here; imported by client components only.

import type { ReactNode } from "react";

export const inputClass =
  "w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 " +
  "placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 " +
  "aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export const primaryButtonClass =
  "inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold " +
  "text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";

export const secondaryButtonClass =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold " +
  "text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 " +
  "dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 id={headingId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      {description ? (
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-500 dark:text-zinc-400">{children}</p>;
}

/** Message from an error thrown by our parsers (they always throw Error). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Invalid input.";
}
