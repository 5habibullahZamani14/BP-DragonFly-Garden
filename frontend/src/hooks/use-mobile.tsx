/*
 * use-mobile.tsx — Reactive viewport width hook.
 *
 * Returns true when the browser window is narrower than the MOBILE_BREAKPOINT
 * (768 px, the standard tablet/mobile boundary). Components use this to swap
 * between mobile and desktop layouts without relying on CSS alone.
 *
 * The hook uses the MediaQueryList API rather than a resize event listener
 * because MediaQueryList fires only when the threshold is crossed, not on every
 * pixel change. This is more efficient than listening to window "resize" and
 * comparing window.innerWidth on each event.
 *
 * The initial state is undefined (not false) so that server-side-rendered or
 * first-paint output does not assume a desktop layout before the browser has
 * had a chance to measure the window. The !! double-negation in the return
 * converts undefined → false so callers always receive a boolean.
 */

import * as React from "react";

/* Matches Tailwind's `md` breakpoint — below this width the UI is considered mobile. */
const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    /* Set the initial value synchronously so the component renders correctly on mount. */
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
