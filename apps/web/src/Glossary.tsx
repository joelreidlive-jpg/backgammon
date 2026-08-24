import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { GLOSSARY, splitOnTerms } from './glossary.js';

type ShowGlossary = (term?: string) => void;

const GlossaryContext = createContext<ShowGlossary>(() => undefined);

export function useGlossary(): ShowGlossary {
  return useContext(GlossaryContext);
}

/** Term ids are used as element ids, so they have to survive being one. */
function slug(term: string): string {
  return `glossary-${term.toLowerCase().replace(/[^a-z]+/g, '-')}`;
}

export function GlossaryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ readonly term: string | null } | null>(null);
  const show = useCallback<ShowGlossary>((term) => setOpen({ term: term ?? null }), []);

  return (
    <GlossaryContext.Provider value={show}>
      {children}
      {open && <GlossaryDialog focus={open.term} onClose={() => setOpen(null)} />}
    </GlossaryContext.Provider>
  );
}

/**
 * Coaching text with its jargon linked.
 *
 * The coach's words are passed through untouched; only the rendering differs,
 * so advice never has to be written twice — once for the player who knows what
 * a prime is and once for the player who does not.
 */
export function Glossed({ children }: { children: string }) {
  const show = useGlossary();

  return (
    <>
      {splitOnTerms(children).map((part, index) => {
        const entry = part.entry;
        if (entry === undefined) return <span key={index}>{part.text}</span>;
        return (
          <button
            key={index}
            type="button"
            className="term"
            title={`What is a ${entry.term}?`}
            onClick={() => show(entry.term)}
          >
            {part.text}
          </button>
        );
      })}
    </>
  );
}

export function GlossaryButton() {
  const show = useGlossary();
  return (
    <button type="button" className="link" onClick={() => show()}>
      Glossary
    </button>
  );
}

function GlossaryDialog({ focus, onClose }: { focus: string | null; onClose: () => void }) {
  const target = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Opened from a word in the coaching, the definition of that word is what
  // the player came for, so it is what they land on.
  useEffect(() => {
    target.current?.scrollIntoView({ block: 'start' });
  }, [focus]);

  return (
    <div className="glossary-backdrop" onClick={onClose}>
      <aside
        className="glossary"
        role="dialog"
        aria-modal="true"
        aria-label="Backgammon glossary"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Glossary</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </header>

        <dl>
          {GLOSSARY.map((entry) => (
            <div
              key={entry.term}
              id={slug(entry.term)}
              ref={entry.term === focus ? target : undefined}
              className={entry.term === focus ? 'entry focused' : 'entry'}
            >
              <dt>{entry.term}</dt>
              <dd>{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
