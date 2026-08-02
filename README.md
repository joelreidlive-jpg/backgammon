# Backgammon

Cloud-hosted backgammon against an engine, with a coach. Runs entirely on
Cloudflare: a Worker serves the API and the static client, and one Durable
Object per match holds the authoritative game state.

## Why it is shaped this way

- **The server owns the rules and the dice.** The client never rolls and never
  decides legality; it submits a proposed turn and receives the new state.
- **One Durable Object per match** is both the state and the concurrency
  control. There is no lock and no optimistic retry, because there is only one
  writer.
- **The AI submits turns through the same path as a human.** `MatchDO` calls
  the same `playTurn` for both, so seating a second human later adds a
  transport, not a second game loop.
- **The evaluator never reaches the browser.** It would hand a player the
  engine's own analysis of the position. ESLint enforces this, and the client
  imports only `@bg/rules` and wire types.

## Layout

| Package | Contents |
| --- | --- |
| `packages/rules` | Board, legal *full turns*, cube, match scoring, Crawford, notation. Pure and dependency-free — the one package shared with the browser. |
| `packages/ai` | Heuristic evaluator, 2-ply expectimax over the 21 distinct rolls, cube decisions, difficulty profiles. |
| `packages/coach` | Equity-loss classification, board-concept diffs, escalating hints, performance aggregation. |
| `packages/protocol` | Wire types shared by Worker and client. Type-only, so it compiles away. |
| `apps/api` | Hono Worker plus the `MatchDO` Durable Object. |
| `apps/web` | React + Vite client with an SVG board. |

Legality is a property of a *whole turn* — the maximum-dice and higher-die
rules cannot be checked one checker at a time — so `legalTurns` enumerates
complete turns and everything else works from that list: the AI ranks it, the
coach diffs against its best entry, and the UI's `TurnBuilder` walks it so a
partial turn can never dead-end into something the server would reject.

## Difficulty and coaching

Difficulty is *not* a weaker evaluator, which produces incoherent play. Every
level uses the same evaluator and picks from the same ranked list; weaker levels
just choose a lower-ranked turn more often.

That ranking is also the whole coaching mechanism:

```
equityLoss = equity(bestTurn) − equity(playedTurn)
```

banded into `fine` / `inaccuracy` / `error` / `blunder`. Explanations are
deterministic diffs of named board concepts ("the better play makes a home
board point"), never a language model deciding what the mistake was.

## Running it

```sh
pnpm install
pnpm test           # rules, AI, coach
pnpm typecheck
pnpm lint

pnpm --filter @bg/web build   # the Worker serves apps/web/dist
pnpm dev:api                  # wrangler dev on :8787
pnpm dev:web                  # vite on :5173, /api proxied to :8787
```

## Deploying

```sh
pnpm --filter @bg/web build
pnpm --filter @bg/api deploy
```

**The Workers Paid plan is required.** A 2-ply search is a few tens of
milliseconds of CPU; the free plan's limit is 10 ms per request. Paid allows up
to 5 minutes, and `wrangler.jsonc` asks for 60 s.

Cross-match history and aggregate stats are meant to live in D1 — create it
with `wrangler d1 create backgammon` and uncomment the binding. Match state
itself stays in the Durable Object's SQLite storage.

## What is deliberately not here yet

- **WebSockets.** Solo play is strictly turn-based, so REST is honest. The
  hibernation API slots in behind the same `applyTurn` path when a second human
  is seated.
- **Accounts.** A match is held by an opaque player token in `localStorage`.
- **A neural evaluator.** `Evaluator` is a single function type; a TD-Gammon
  style network can replace the heuristic without touching search, coaching or
  the API.
- **Server-side hint policy for two humans.** `MatchDO` already decides hint
  availability rather than the client, so this stays a one-line check — but it
  is untested until there is a second seat.
