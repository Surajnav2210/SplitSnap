// The sample bill shown on the landing page, built with the real reducer and
// split engine so every number on the page is what the app would show.

import { billReducer, initialBillState, selectBillSplit, type BillAction, type BillState } from "@/features/bill/state";

/** Who claimed what, by item name, in the sample. Caesar salad stays unclaimed on purpose. */
const CLAIMS: Record<string, readonly string[]> = {
  "Truffle fries": ["Alex", "Sam", "Priya"],
  "Margherita pizza": ["Alex"],
  "Smash burger": ["Sam"],
  "Chicken tikka bowl": ["Jordan"],
  "Draft IPA": ["Sam", "Priya"],
};

function build(): BillState {
  let s = billReducer(initialBillState, { type: "setHostName", name: "Alex" });
  s = billReducer(s, { type: "loadSample" });
  const actions: BillAction[] = [];
  for (const item of s.items) {
    for (const name of CLAIMS[item.name] ?? []) {
      const person = s.people.find((p) => p.name === name);
      if (person) actions.push({ type: "toggleClaim", itemId: item.id, personId: person.id });
    }
  }
  return actions.reduce(billReducer, s);
}

export const SAMPLE_STATE: BillState = build();

const outcome = selectBillSplit(SAMPLE_STATE);
if (!outcome.ok) throw new Error(`Sample bill does not split: ${outcome.error}`);
export const SAMPLE_RESULT = outcome.result;

export function samplePerson(name: string) {
  const person = SAMPLE_STATE.people.find((p) => p.name === name);
  if (!person) throw new Error(`No sample person named ${name}`);
  const share = SAMPLE_RESULT.participants.find((p) => p.participantId === person.id);
  if (!share) throw new Error(`No share for ${name}`);
  return { ...person, totalCents: share.total.cents };
}
