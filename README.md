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
| `packages/coach` | Equity-loss classification, board-concept diffs, escalating hints, cube grading, skill tiers, end-of-game review. |
| `packages/protocol` | Wire types shared by Worker and client. Type-only, so it compiles away. |
| `packages/bench` | Benchmark positions with known-best plays, and the harness that measures how often the evaluator agrees. |
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

## Measuring the engine

Coaching quality is capped by evaluator quality, so the evaluator needs a number
rather than an opinion. `packages/bench` holds positions with a known best play
and reports how often the engine's first choice agrees:

```
npx vitest run packages/bench/src/report.test.ts

15 positions · agreement 53% · reference in top 3 100%
mean equity gap on disagreement 0.043
```

The seed set is the fifteen opening rolls, which are the most analysed positions
in the game and whose answers are public knowledge rather than any author's
work. Positions are stored as XGID strings — the format every bot and problem
collection can emit — so a set can be assembled from any source. Only facts are
stored: position, roll, play, and our own concept tags. Never someone else's
prose.

The first run of this harness scored **40%**, and said exactly why: 100% on
making points, 0% on splitting and anchoring. The engine was paid a flat bonus
for the 24-point "anchor" it starts with, charged a near-catastrophic penalty
for a checker on the bar, and given nothing for builders, so its cheapest way to
avoid all three was to bury both dice in one safe checker. Fixing those three
terms took it to 53% with the consensus play always in its top three, and it
wins by 169 points over 2000 self-play games against the old weights — a real
gain over the board, not an artefact of tuning on fifteen positions.

`packages/bench/src/bench.test.ts` locks those figures in as a ratchet, so the
evaluator cannot quietly get worse. `sweep.test.ts` and `selfplay.test.ts` are
skipped by default: they are the tools for the next round of tuning, not checks.

The harness also grades difficulty, which is what makes a training ladder
possible: a problem is hard when the best play barely beats the runner-up, and
easy when it wins by a mile. That grade comes from the engine, so it re-grades
itself as the evaluator improves, and can be combined with a player's own leak
profile to serve problems that target their actual weaknesses.

### Strategy, phases and the cube

Every decision is filed under a phase — opening, middlegame, holding game, race,
bearoff — because the right *plan* changes completely between them, and a player
can be sound in the race while leaking badly in holding games. Guidance is
phase-specific for that reason rather than a single global tip list.

Cube decisions are graded as first-class decisions, not as an afterthought to
checker play, since one bad take can cost more than a whole game of small
inaccuracies. `analyseCubeDecision` prices the cube properly: a take is *not*
worth `2 · equity`, because the taker now owns the cube, so doubling breaks even
at the engine's doubling threshold instead of at any small edge. Only positions
inside the doubling window count as decisions, so hundreds of trivially correct
no-doubles do not dilute the error rate.

### Levelling up

A player's record accumulates in D1 as millipoints of equity lost per decision,
broken down per phase and per concept, and bands into `novice` → `improver` →
`intermediate` → `strong` → `expert`. The band drives how the coach behaves: the
live-alert threshold, how explicit a plain "help me" hint is, whether take-backs
are still offered and which engine level is suggested. As the error rate in a
phase falls, the coach stops explaining what the player has already mastered.

Every finished game produces a `GameReview`: the phase that cost the most, the
recurring concept leaks ranked by equity, cube mistakes by kind, the worst
individual moments, and what to work on next — drawn from the cumulative record
rather than the single game, so one clean game does not erase a habit.

### Progress and identity

Progress is keyed to an opaque bearer token held in `localStorage` and stored in
D1 under a SHA-256 digest of it, so the database never holds the secret. It
survives across matches with no login, and is lost if the browser is cleared.
Accounts map onto the same key later without changing anything beneath it.

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

Live at https://backgammon.joelreidlive.workers.dev.

```sh
# The D1 database already exists; its id is committed in wrangler.jsonc.
# To recreate it from scratch: wrangler d1 create backgammon

cd apps/api
wrangler d1 migrations apply backgammon --remote  # drop --remote for wrangler dev

cd ../..
pnpm --filter @bg/web build   # the Worker serves apps/web/dist
pnpm --filter @bg/api run deploy
```

`run` is not optional on the last line: pnpm has its own `deploy` command that
would otherwise shadow the script.

**The Workers Paid plan is required.** A 2-ply search is a few tens of
milliseconds of CPU; the free plan's limit is 10 ms per request. Paid allows up
to 5 minutes, and `wrangler.jsonc` asks for 60 s.

Match state lives in the Durable Object's SQLite storage; only cross-match
player progress and finished-game summaries go to D1, because they outlive any
one match.

## What is deliberately not here yet

- **WebSockets.** Solo play is strictly turn-based, so REST is honest. The
  hibernation API slots in behind the same `applyTurn` path when a second human
  is seated.
- **Accounts.** Identity is an anonymous device token, so progress does not
  follow a player to another browser.
- **A neural evaluator.** `Evaluator` is a single function type; a TD-Gammon
  style network can replace the heuristic without touching search, coaching or
  the API.
- **Server-side hint policy for two humans.** `MatchDO` already decides hint
  availability rather than the client, so this stays a one-line check — but it
  is untested until there is a second seat.
