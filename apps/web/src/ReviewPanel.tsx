import type { GameReview } from '@bg/protocol';
import { Glossed } from './Glossary.js';

const PHASE_NAMES: Readonly<Record<string, string>> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  holding: 'Holding game',
  race: 'Race',
  bearoff: 'Bear-off',
};

const MISTAKE_NAMES: Readonly<Record<string, string>> = {
  'missed-double': 'missed doubles',
  'premature-double': 'premature doubles',
  'too-good-to-double': 'doubled when too good',
  'wrong-take': 'takes that should have been drops',
  'wrong-drop': 'drops that should have been takes',
};

/** Error rates arrive from the server already in millipoints per decision. */
function millipoints(rate: number): string {
  return `${Math.round(rate)}`;
}

/**
 * The end-of-game debrief. Ordered so the player reads what to change before
 * the detail behind it: headline, then the phase that cost most, then leaks.
 */
export function ReviewPanel({ review }: { review: GameReview }) {
  return (
    <section className="review">
      <header>
        <h2>Game review</h2>
        <span className={`tier ${review.tier}`}>{review.tier}</span>
        {review.levelledUp && <span className="levelled">levelled up</span>}
        <span className="muted">{review.trend}</span>
      </header>

      <p className="headline">
        <Glossed>{review.headline}</Glossed>
      </p>
      <p className="muted">
        {review.decisions} decision{review.decisions === 1 ? '' : 's'} · {millipoints(review.errorRate)}{' '}
        millipoints lost per decision
      </p>

      {review.byPhase.length > 0 && (
        <>
          <h3>By phase</h3>
          <ul className="phases">
            {review.byPhase.map((phase) => (
              <li key={phase.phase}>
                <div className="phase-head">
                  <strong>{PHASE_NAMES[phase.phase] ?? phase.phase}</strong>
                  <span className="muted">
                    {phase.decisions} · {millipoints(phase.errorRate)}
                  </span>
                </div>
                <p>
                  <Glossed>{phase.guidance}</Glossed>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {review.leaks.length > 0 && (
        <>
          <h3>Recurring leaks</h3>
          <ul className="leaks">
            {review.leaks.map((leak) => (
              <li key={leak.concept}>
                <strong>×{leak.occurrences}</strong> <Glossed>{leak.advice}</Glossed>
              </li>
            ))}
          </ul>
        </>
      )}

      {review.cube.decisions > 0 && (
        <>
          <h3>Cube</h3>
          <p className="muted">
            {review.cube.decisions} decision{review.cube.decisions === 1 ? '' : 's'} ·{' '}
            {millipoints(review.cube.errorRate)} millipoints each
          </p>
          {Object.entries(review.cube.mistakes).length > 0 && (
            <p>
              {Object.entries(review.cube.mistakes)
                .filter(([name]) => name !== 'none')
                .map(([name, count]) => `${count} ${MISTAKE_NAMES[name] ?? name}`)
                .join(', ')}
            </p>
          )}
          <ul className="cube-advice">
            {review.cube.advice.map((line) => (
              <li key={line}>
                <Glossed>{line}</Glossed>
              </li>
            ))}
          </ul>
        </>
      )}

      {review.worstMoments.length > 0 && (
        <>
          <h3>Worst moments</h3>
          <ul className="worst">
            {review.worstMoments.map((moment, index) => (
              <li key={`${moment.played}-${index}`}>
                <span className={`severity ${moment.severity}`}>{moment.severity}</span> {moment.played} —
                best was {moment.best}. <Glossed>{moment.explanation}</Glossed>
              </li>
            ))}
          </ul>
        </>
      )}

      {review.focus.length > 0 && (
        <>
          <h3>Work on this next</h3>
          <ul className="focus">
            {review.focus.map((line) => (
              <li key={line}>
                <Glossed>{line}</Glossed>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
