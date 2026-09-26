import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Scroll position of every visited history entry, for the Back button.
const positions = new Map<string, number>();
const RESTORE_TIMEOUT_MS = 1500;

/**
 * A new page opens at the top; «Назад» returns to where the buyer was in
 * the catalog. BrowserRouter does neither by itself.
 */
export function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const currentKey = useRef(location.key);
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const save = () => positions.set(currentKey.current, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, []);

  useLayoutEffect(() => {
    currentKey.current = location.key;
    const pathChanged = previousPath.current !== location.pathname;
    previousPath.current = location.pathname;

    if (navigationType !== "POP") {
      // Filters and search only change the query: stay where you are.
      if (pathChanged) window.scrollTo(0, 0);
      return;
    }

    // The page may still be loading: retry until it's tall enough.
    const target = positions.get(location.key) ?? 0;
    const startedAt = performance.now();
    let frame = 0;
    const stop = () => cancelAnimationFrame(frame);
    const restore = () => {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) > 1 && performance.now() - startedAt < RESTORE_TIMEOUT_MS) {
        frame = requestAnimationFrame(restore);
      }
    };
    restore();
    // Don't fight a buyer who already started scrolling.
    window.addEventListener("wheel", stop, { once: true, passive: true });
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    return () => {
      stop();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
  }, [location.key, location.pathname, navigationType]);

  return null;
}
