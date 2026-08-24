import { useFullscreen } from './fullscreen.js';

/**
 * Hides the phone's address bar for the length of the game. Absent where the
 * browser has no Fullscreen API — iOS Safari, chiefly, where adding the game to
 * the home screen is the way there instead.
 */
export function FullscreenButton() {
  const { supported, active, toggle } = useFullscreen();
  if (!supported) return null;

  return (
    <button type="button" className="link" onClick={toggle}>
      {active ? 'Exit full screen' : 'Full screen'}
    </button>
  );
}
