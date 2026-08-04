import type { ProgressResponse } from '@bg/protocol';

const PHASE_NAMES: Readonly<Record<string, string>> = {
  opening: 'the opening',
  middlegame: 'the middlegame',
  holding: 'holding games',
  race: 'races',
  bearoff: 'the bear-off',
};

/** Error rates arrive from the server already in millipoints per decision. */
function millipoints(rate: number): string {
  return `${Math.round(rate)}`;
}

/** The player's standing record, which is what the coach calibrates against. */
export function ProgressPanel({ progress }: { progress: ProgressResponse }) {
  const { progress: totals } = progress;
  if (totals.games === 0) {
    return (
      <section className="progress">
        <h2>Your progress</h2>
        <p className="muted">No games yet. The coach starts explicit and eases off as you improve.</p>
      </section>
    );
  }

  const won = progress.recentGames.filter((game) => game.won).length;

  return (
    <section className="progress">
      <header>
        <h2>Your progress</h2>
        <span className={`tier ${progress.tier}`}>{progress.tier}</span>
        <span className="muted">{progress.trend}</span>
      </header>

      <p className="muted">
        {totals.games} game{totals.games === 1 ? '' : 's'} · {won} of the last{' '}
        {progress.recentGames.length} won · {millipoints(progress.errorRate)} millipoints lost per decision
      </p>
      <p className="muted">
        {totals.checker.decisions} checker plays · {totals.cube.decisions} cube decisions
      </p>

      {progress.weakestPhase && (
        <p>
          Your weakest area is <strong>{PHASE_NAMES[progress.weakestPhase] ?? progress.weakestPhase}</strong>.
        </p>
      )}

      {progress.focus.length > 0 && (
        <ul className="focus">
          {progress.focus.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
