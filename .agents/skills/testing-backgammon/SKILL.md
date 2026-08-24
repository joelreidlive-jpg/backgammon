---
name: testing-backgammon
description: How to bring up and browser-test the Backgammon app (Cloudflare Worker API + React SPA), including the single-origin wrangler setup needed to verify security headers/CSP, forcing engine cube doubles, deterministic trainer answers, board/dice/theme geometry checks, and landscape-viewport checks.
---

# Testing the Backgammon app end-to-end

## Two ways to run it

1. **Split dev servers (fast iteration, UI work)**
   ```bash
   corepack enable && pnpm install
   (cd apps/api && npx wrangler d1 migrations apply backgammon --local)   # required, else /api/me/progress and reviews 500
   pnpm dev:api    # wrangler on :8787
   pnpm dev:web    # vite on :5173, proxies /api -> :8787
   ```
   Use `localhost`, not `127.0.0.1`.

2. **Single origin via wrangler assets (REQUIRED for header/CSP testing)**
   ```bash
   pnpm --filter @bg/web build            # generates apps/web/dist/_headers
   cd apps/api && npx wrangler dev --port 8788 --local
   ```
   The Worker then serves both the SPA and `/api/*` on `http://localhost:8788`.
   `apps/web/public/_headers` only takes effect through wrangler's asset server, so document/asset
   headers must be verified against this origin — the Vite dev server is NOT authoritative.
   Compare both sources of headers:
   ```bash
   curl -sD- -o /dev/null http://localhost:8788/          # asset headers from _headers
   curl -sD- -o /dev/null http://localhost:8788/api/...   # Worker headers from secureHeaders()
   ```
   They must agree on the CSP string; only API responses carry `x-request-id`.

## Auth / state

- Anonymous play: the browser stores `bg.playerToken` in `localStorage`; API calls send it as
  `x-player-token`. You can reuse the browser's token from a shell/console script to drive the same
  player's matches. Note the SPA keeps the token in memory after load, so swapping localStorage
  mid-session does not change requests already in flight — reload to apply.
- `POST /api/matches` returns `{playerToken, match:{matchId, ...}}` — the id field is `match.matchId`,
  not `id`.

## Useful test tricks

- **Force an engine cube double**: play the weakest legal turn repeatedly through the API until
  `state.phase === 'respond-to-double'` (engine only doubles at difficulty != beginner and win prob
  >= ~0.68). Helpers live in `/home/ubuntu/tools/pw/play_bad*.py`, `play_out*.py`.
- **Deterministic trainer answers**: hook `window.fetch` once to capture `/api/trainer/next`, then look
  up `best`/`margin`/`answer` for that problem id in
  `packages/trainer/src/problems.generated.ts` (and `cube-problems.generated.ts` on branches that have
  cube problems) to choose a deliberately right or wrong answer. Cube trainer problems only exist on
  branches that include the cube-problems PR — check the file exists before hunting for them in the UI.
- **Trigger a UI-visible API error** (to check error text rendering): with a match open in `roll` phase,
  `POST /api/matches/<id>/roll` from the page console, then click **Roll** in the UI — the stale client
  gets `409 {"error":"cannot roll during \"move\"","code":"conflict"}` and renders the sentence in the
  red `.error` paragraph.
- **Landscape phone viewport (844x390)**: browser chrome eats ~32px width / ~129px height, so
  `xdotool getactivewindow windowsize 876 519` yields `innerWidth/innerHeight = 844/390` on this box.
  Assert `document.documentElement.scrollHeight === clientHeight` and `scrollWidth === clientWidth`.
  The in-game and trainer screens are landscape-first and should not scroll; the **setup/new-match
  screen does scroll vertically at that height** and that is pre-existing, not a regression.
- **CSP checking**: keep the devtools console open (or poll it via CDP) and treat any
  `Refused to ...` entry as a defect. Reloads clear any `securitypolicyviolation` listener you install,
  so re-install after each navigation or just read the console log.

## Board click coordinates (maximized 1024x768 screenshot space)

Top row (points 13..24) y≈143-262, bottom row (12..1) y≈298-453. Approx x by point:
13/12 ≈112, 14/11 ≈156, 15/10 ≈199, 16/9 ≈242, 17/8 ≈286, 18/7 ≈329,
19/6 ≈419, 20/5 ≈462, 21/4 ≈506, 22/3 ≈549, 23/2 ≈592, 24/1 ≈636.
Tap source point then destination; a complete turn auto-submits.

## On-board dice (Dice.tsx / Board.tsx)

- Geometry comes from constants at the top of `apps/web/src/Board.tsx`
  (`WIDTH 1120`, `HEIGHT 640`, `DICE_X = (BAR_X + BAR_WIDTH + MARGIN + FELT_WIDTH)/2`). In a maximized
  1024x768 screenshot space this puts **your ROLL cup / dice at ≈(527, 340)** and the **engine dice at
  ≈(527, 259)**. Re-derive from the constants if the board layout changes rather than hard-coding.
- Handy DOM selectors: `.dice-pair.clickable` is the interactive cup/your dice (`role=button`,
  `tabIndex=0`, Enter/Space roll); `.dice-pair:not(.clickable)` is the engine's; `.board-die.spent`
  carries `opacity: .35` for a die already consumed by a pending move. Doubles render **four** dice.
- To assert "dice do not overlap checkers / bar / trays", intersect the `.dice-pair` bounding rect with
  the SVG `circle` rects — but **filter out `.pip` circles first**, otherwise the dice's own pips count
  as overlaps and give a false failure.
- Tumble animation is ~700ms with faces re-randomised every 90ms (`ROLL_MS` / `TUMBLE_MS` in `App.tsx`),
  so a screenshot within ~300ms of the click catches the rolling state.
- Double-roll protection is only "`onRoll` is undefined while `busy`" — verify spam-clicking by counting
  `POST /api/matches/<id>/roll` lines in the wrangler request log, not in devtools.
- Die size at 844x390 is a moving target and worth re-measuring on any board/layout change:
  `document.querySelector('.board-die').getBoundingClientRect()`. It was 24px (SIZE 54), then 33px
  (SIZE 68), then 32px once the landscape `main` reserve grew to `calc(100dvh - 3.7rem)`. Anything under
  ~44px is below the usual tap-target guidance and worth flagging.
- The landscape breakpoint is `@media (orientation: landscape) and (max-height: 480px)`; the game screen's
  fit is driven by `main { height: calc(100dvh - <reserve>) }`. A few px of `scrollHeight` over
  `clientHeight` means the reserve is too small. Note that CSS written against a `.topbar` class does
  **not** apply — the in-game header element carries no class, so check
  `document.querySelectorAll('.topbar').length` before trusting such a rule.

## Board themes (theme.ts / ThemePicker.tsx / styles.css)

- Four themes, ids `tangerine`, `claret` (**default**), `harbour`, `classic`; swatch `aria-label`s are
  `Tangerine`, `Walnut & claret`, `Navy & rose`, `Classic green` and the buttons are
  `button.swatch` (`role`/`aria-label` set, `.chosen` marks the selection).
- Persisted in `localStorage['bg.boardTheme']`, applied as `document.documentElement.dataset.boardTheme`.
  A quick way to confirm the applied theme without screenshots is `document.documentElement.dataset.boardTheme`,
  but a colour claim still needs a screenshot.
- The picker is rendered **twice**: on the setup screen inside a `Board` fieldset (near
  `Train on problems`) and in the in-game header next to `New match`. Test persistence by choosing a
  theme, reloading, and also opening the trainer — the trainer board must inherit it.
- Every board colour is a CSS variable on `[data-board-theme='…']`. For a contrast read, pull the
  *computed* variables off `<html>` (`--felt`, `--point-even`, `--point-odd`, `--white`, `--black`,
  `--die-white`, `--die-black`, `--die-black-pip`, `--slot-label`, `--stack-count`) and compute WCAG
  ratios. Check at least: black checker vs felt and vs point-even, slot label vs felt, black die vs felt,
  die pips vs their die body, and **white checker vs black checker** (a darkening fix can make the two
  sides converge). Warm/low-chroma palettes are where this bites: `tangerine` shipped at one point with
  a 1.25:1 checker-on-felt ratio.
- Only **one** pair of dice is ever on the felt (`App.tsx`: `engineDice = yourDice === null ? … : null`),
  so to see *both* die colours you must screenshot two different moments: the engine's dice appear on the
  **left** (`ENGINE_DICE_X = MARGIN + 3*POINT_WIDTH` = 245) before you roll, and yours on the **right**
  (`YOUR_DICE_X = BAR_X + BAR_WIDTH + 3*POINT_WIDTH` = 555) after.

## Board geometry constants (measure in viewBox units, not screen pixels)

`apps/web/src/Board.tsx`: `WIDTH 1120`, `HEIGHT 640`, `MARGIN 20`, `POINT_HEIGHT 250`, `MAX_VISIBLE 5`,
`CHECKER_RADIUS = min(POINT_WIDTH/2 - 4, POINT_HEIGHT/(2*MAX_VISIBLE))`. A five-checker stack is therefore
`2*R*5` and must not exceed `POINT_HEIGHT`; on a fresh board the stacks measure `y 20..270` (top row) and
`370..620` (bottom row), and the dice band sits at `y 286..354` — clear of both. Bar stacks are anchored at
the **outer** edges (`baseY = MARGIN + 20` growing down for black, `HEIGHT - MARGIN - 20` growing up for
white), so a big stack must never grow toward the middle. Points with 6+ checkers draw five discs plus an
overflow count at the fifth position.

### Overlap-script gotcha (and why to still click for real)

When intersecting `.dice-pair` rects with board geometry, **exclude `rect.felt` and every `rect.hit-area`**
(and `.pip` circles) — the felt and the per-point hit areas span whole halves of the board and will report
~13 bogus intersections. But do not conclude "nothing is under the dice, so the click-through test is not
applicable": those same invisible `rect.hit-area` columns really are under the dice, which is exactly why
`.dice-pair { pointer-events: none }` exists. **Exercise it for real**: click a screen pixel that lands on a
settled die and sits inside a point column that has your checkers, and assert the point gets selected and
its destination highlights (e.g. clicking on a die over point 21 with a 6 must highlight point 15).

## Known pre-existing issues (not caused by the branch under test)

- `GET /favicon.ico` returns **500** with `Can't modify immutable headers.` from `secureHeaders()`
  (introduced by the API-boundary-hardening PR). It appears in the wrangler log on every fresh page load;
  disclose it but do not attribute it to unrelated feature branches.

## Devin Secrets Needed

None — the app is fully local and anonymous.
