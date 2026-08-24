import { useCallback, useEffect, useState } from 'react';

/**
 * The address bar can only be got rid of two ways, and neither is something a
 * page can simply declare: the Fullscreen API, which needs a tap to be allowed,
 * and installing the app to the home screen, which the manifest asks for. This
 * is the first of those.
 */
export function useFullscreen(): {
  /** False where the browser refuses fullscreen outright, as iOS Safari does. */
  readonly supported: boolean;
  readonly active: boolean;
  readonly toggle: () => void;
} {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setSupported(document.fullscreenEnabled);
    const onChange = () => setActive(document.fullscreenElement !== null);
    onChange();
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // A rejected request is not a failure worth reporting: the browser has simply
  // decided the gesture did not earn it, and the game is unaffected.
  const toggle = useCallback(() => {
    if (document.fullscreenElement === null) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  return { supported, active, toggle };
}
