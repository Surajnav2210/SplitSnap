# Architecture

<!-- Write this yourself, in your own words. If you can't explain it, you don't own it yet.
     Claude may propose edits; you approve them. Keep it to one or two pages. -->

## What the product does (and doesn't)
<2–3 sentences. Include what it never does, e.g. "never holds customer funds".>

## How a request flows
<e.g. User uploads holdings CSV → API → validate → core/rebalance → trade list → UI>

## Main pieces
| Piece | Where | Responsibility |
|---|---|---|
| UI | | |
| API / services | | |
| Core logic (pure, tested) | | Money math, rules, state transitions |
| Adapters (I/O) | | Broker, payments, market data, DB |
| Jobs / queues | | Reconciliation, data refresh |

## Money flow and state
<If money or orders move: the states (pending → submitted → filled | failed),
where idempotency keys are created, and how reconciliation works.>

## Data model
<Main tables, especially anything ledger- or audit-related.>

## External services
| Service | Used for | Sandbox available? | What happens if it's down |
|---|---|---|---|

## Decisions log
<!-- One line per decision: date — decision — why — alternatives considered -->
- YYYY-MM-DD — ... — because ...
