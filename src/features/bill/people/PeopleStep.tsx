import { useRef, useState, type Dispatch, type FormEvent } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="flex gap-2">
        <label htmlFor="person-name" className="sr-only">Friend&apos;s name</label>
        <Input
          ref={inputRef}
          id="person-name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Add a name"
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={name.trim() === ""} className="shrink-0 px-4">
          <Plus aria-hidden="true" /> Add
        </Button>
      </form>

      <section aria-labelledby="table-heading">
        <h2 id="table-heading" className="mb-2 flex items-baseline justify-between text-[13px] font-medium text-muted-foreground">
          At the table
          <span className="tabular-nums">{state.people.length}</span>
        </h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card" aria-live="polite">
          <li className="flex items-center gap-3 px-4 py-3">
            <Avatar name={hostName || host.name} seed={host.tone} size="lg" />
            <div className="min-w-0 flex-1">
              <label htmlFor="host-name" className="sr-only">Your name</label>
              <input
                id="host-name"
                className="-mx-1.5 w-full min-w-0 rounded-md bg-transparent px-1.5 py-0.5 text-base font-medium text-foreground outline-none hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                value={hostName}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="given-name"
                onChange={(e) => {
                  setHostName(e.target.value);
                  dispatch({ type: "setHostName", name: e.target.value });
                }}
              />
              <p className="text-[13px] text-muted-foreground">Paid the bill · tap to rename</p>
            </div>
            <Badge variant="outline">Host</Badge>
          </li>
          {guests.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2 pl-4 pr-2">
              <Avatar name={p.name} seed={p.tone} size="lg" />
              <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground">{p.name}</span>
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => dispatch({ type: "removePerson", id: p.id })}
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        {guests.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-input px-4 py-4 text-sm text-muted-foreground">
            <UserPlus aria-hidden="true" className="size-4 shrink-0" />
            Add everyone who&apos;s splitting with you. No accounts needed.
          </div>
        ) : null}
      </section>
    </div>
  );
}
