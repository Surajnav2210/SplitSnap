"use client";

// Client entry for /demo. All bill state lives in memory in this reducer;
// nothing is saved or sent anywhere.

import { useMemo, useReducer } from "react";
import { AdjustmentsSection } from "./AdjustmentsSection";
import { ClaimGrid } from "./ClaimGrid";
import { ItemsSection } from "./ItemsSection";
import { PeopleSection } from "./PeopleSection";
import { TotalsSection } from "./TotalsSection";
import { demoReducer, initialDemoState, selectSplit } from "./state";
import { primaryButtonClass, secondaryButtonClass } from "./ui";

export function DemoApp() {
  const [state, dispatch] = useReducer(demoReducer, initialDemoState);
  const outcome = useMemo(() => selectSplit(state), [state]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={`${primaryButtonClass} flex-1`}
          onClick={() => dispatch({ type: "loadSample" })}
        >
          Load sample dinner
        </button>
        <button
          type="button"
          className={`${secondaryButtonClass} flex-1`}
          onClick={() => dispatch({ type: "reset" })}
        >
          Reset
        </button>
      </div>

      <PeopleSection people={state.people} dispatch={dispatch} />
      <ItemsSection items={state.items} dispatch={dispatch} />
      <ClaimGrid
        items={state.items}
        people={state.people}
        claims={state.claims}
        dispatch={dispatch}
      />
      <AdjustmentsSection
        key={state.session}
        taxCents={state.taxCents}
        tip={state.tip}
        discountCents={state.discountCents}
        dispatch={dispatch}
      />
      <TotalsSection outcome={outcome} people={state.people} items={state.items} />
    </div>
  );
}
