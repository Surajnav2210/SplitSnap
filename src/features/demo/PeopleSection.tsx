import { useState, type Dispatch, type FormEvent } from "react";
import type { DemoAction, DemoPerson } from "./state";
import { EmptyNote, FieldError, Section, inputClass, primaryButtonClass } from "./ui";

const MAX_NAME_LENGTH = 40;

export function PeopleSection({
  people,
  dispatch,
}: {
  people: readonly DemoPerson[];
  dispatch: Dispatch<DemoAction>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === "") {
      setError("Enter a name.");
      return;
    }
    dispatch({ type: "addPerson", name });
    setName("");
    setError(null);
  }

  return (
    <Section id="people" title="People" description="Who's at the table?">
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="person-name" className="sr-only">
          Name
        </label>
        <div className="flex gap-2">
          <input
            id="person-name"
            className={inputClass}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Name"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "person-name-error" : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          <button type="submit" className={primaryButtonClass}>
            Add
          </button>
        </div>
        <FieldError id="person-name-error" message={error} />
      </form>

      {people.length === 0 ? (
        <div className="mt-3">
          <EmptyNote>No one yet. Add at least one person.</EmptyNote>
        </div>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="People at the table">
          {people.map((p) => (
            <li
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pl-3 pr-1 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <span>{p.name}</span>
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                onClick={() => dispatch({ type: "removePerson", id: p.id })}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
