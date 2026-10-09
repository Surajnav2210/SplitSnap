import { useRef, useState, type Dispatch, type FormEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { inputClass } from "../fields";
import { MAX_NAME_LENGTH, hostOf, type BillAction, type BillState } from "../state";

export function PeopleStep({ state, dispatch }: { state: BillState; dispatch: Dispatch<BillAction> }) {
  const host = hostOf(state);
  const [name, setName] = useState("");
  const [hostName, setHostName] = useState(host.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const guests = state.people.filter((p) => p.id !== state.hostId);

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === "") return;
    dispatch({ type: "addPerson", name });
    setName("");
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-card" aria-labelledby="host-heading">
        <h2 id="host-heading" className="text-sm font-semibold text-muted">Who paid</h2>
        <div className="mt-3 flex items-center gap-3">
          <Avatar name={hostName || host.name} seed={host.tone} size="lg" />
          <div className="min-w-0 flex-1">
            <label htmlFor="host-name" className="sr-only">Your name</label>
            <input
              id="host-name"
              className={`${inputClass} font-semibold`}
              value={hostName}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="given-name"
              onChange={(e) => {
                setHostName(e.target.value);
                dispatch({ type: "setHostName", name: e.target.value });
              }}
            />
            <p className="mt-1 text-xs text-muted">You paid the bill, so everyone else pays you back.</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5 shadow-card" aria-labelledby="guests-heading">
        <h2 id="guests-heading" className="text-sm font-semibold text-muted">
          Friends <span className="tabular-nums">({guests.length})</span>
        </h2>
        <form onSubmit={handleAdd} className="mt-3 flex gap-2">
          <label htmlFor="person-name" className="sr-only">Friend&apos;s name</label>
          <input
            ref={inputRef}
            id="person-name"
            className={inputClass}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Add a name, press Enter"
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            aria-label="Add person"
            disabled={name.trim() === ""}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg disabled:opacity-40"
          >
            <Icon name="plus" />
          </button>
        </form>

        {guests.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Add everyone who&apos;s splitting with you.</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="People at the table" aria-live="polite">
            {guests.map((p) => (
              <li key={p.id} className="inline-flex animate-pop items-center gap-2 rounded-full border border-line bg-elevated py-1 pl-1 pr-1 text-sm font-medium text-fg">
                <Avatar name={p.name} seed={p.tone} size="sm" />
                <span className="max-w-[10rem] truncate">{p.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => dispatch({ type: "removePerson", id: p.id })}
                  className="-my-1.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-fg"
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
