import { useEffect, useState } from 'react';

/**
 * A phone held sideways. Keyed on height, as the stylesheet is: that is the
 * axis that runs out, and it is what decides whether the board can afford any
 * furniture around it.
 */
export const COMPACT_QUERY = '(orientation: landscape) and (max-height: 34rem)';

/**
 * True while the viewport is a landscape phone.
 *
 * The board-first layout is mostly CSS, but two parts of it are not: what the
 * header shows, and whether the coach is a column or a drawer. Both are
 * structure rather than style, so they are decided here.
 */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return compact;
}
