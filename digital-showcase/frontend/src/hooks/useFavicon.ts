import { useEffect } from "react";

// An uploaded image has a 400px copy next to it (see backend imageService): enough for a tab icon.
const UPLOADED = /^\/uploads\/[0-9a-f-]{36}\.webp$/;

/**
 * The browser tab's icon: `url` (a store's logo on its storefront) while the
 * page is open, the service's own icon again on leave. No url — the default
 * stays. The icon changes only once the image has loaded, so a missing file
 * never leaves the tab without one.
 */
export function useFavicon(url?: string | null) {
  useEffect(() => {
    const current = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!url || !current) return;
    let replacement: HTMLLinkElement | null = null;
    let cancelled = false;

    function apply(href: string) {
      if (cancelled || !current) return;
      // A new element, not a new href: some browsers don't redraw the tab for a changed href.
      replacement = document.createElement("link");
      replacement.rel = "icon";
      replacement.href = href;
      current.replaceWith(replacement);
    }

    const small = UPLOADED.test(url) ? url.replace(/\.webp$/, "-400.webp") : url;
    const probe = new Image();
    probe.onload = () => apply(small);
    // Very old uploads have no copy: the original then.
    probe.onerror = () => (small === url ? undefined : apply(url));
    probe.src = small;

    return () => {
      cancelled = true;
      probe.onload = probe.onerror = null;
      replacement?.replaceWith(current);
    };
  }, [url]);
}
