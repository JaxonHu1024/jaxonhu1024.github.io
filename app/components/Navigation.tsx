"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { startCancellableScroll } from "../lib/cancellable-scroll";

const links = [
  ["about", "ABOUT"],
  ["experience", "EXPERIENCE"],
  ["foundations", "FOUNDATIONS"],
  ["research", "RESEARCH"],
  ["contact", "CONTACT"],
] as const;

const sectionIds = ["hero", ...links.map(([id]) => id)];
const mobileNavigationMedia = "(max-width: 900px)";

type VinextNavigate = (
  href: string,
  redirectDepth?: number,
  navigationKind?: string,
  ...args: unknown[]
) => Promise<unknown>;

type NavigationProps = {
  homePath?: "/";
};

export function Navigation({ homePath }: NavigationProps = {}) {
  const [active, setActive] = useState("hero");
  const [menuOpen, setMenuOpen] = useState(false);
  const cancelScrollRef = useRef<() => void>(() => undefined);
  const navigationTargetRef = useRef<string | null>(null);
  const navigationRunRef = useRef(0);
  const mountedRef = useRef(true);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstNavLinkRef = useRef<HTMLAnchorElement>(null);
  const focusFirstLinkOnOpenRef = useRef(false);

  const syncActiveFromViewport = useCallback(() => {
    if (navigationTargetRef.current) return;

    const marker = window.innerHeight * 0.3;
    let current = "hero";

    for (const id of sectionIds) {
      const section = document.getElementById(id);
      if (!section) continue;

      const rect = section.getBoundingClientRect();
      if (rect.top <= marker) current = id;
      if (rect.top <= marker && rect.bottom > marker) break;
    }

    setActive(current);
  }, []);

  const navigateToSection = useCallback((event: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }

    const target = document.getElementById(id);
    if (!target) return;

    event.preventDefault();
    const run = navigationRunRef.current + 1;
    navigationRunRef.current = run;
    cancelScrollRef.current();
    navigationTargetRef.current = id;
    setActive(id);
    setMenuOpen(false);
    cancelScrollRef.current = startCancellableScroll(window, target, `#${id}`, {
      onSettled: (result) => {
        if (!mountedRef.current || navigationRunRef.current !== run) return;

        navigationTargetRef.current = null;
        if (result === "finished") {
          setActive(id);
          return;
        }
        syncActiveFromViewport();
      },
    });
  }, [syncActiveFromViewport]);

  useEffect(() => {
    const header = headerRef.current;
    header?.setAttribute("data-navigation-ready", "true");

    return () => header?.removeAttribute("data-navigation-ready");
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      syncActiveFromViewport();
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [syncActiveFromViewport]);

  useEffect(() => {
    const mountedLocation = `${window.location.pathname}${window.location.search}`;
    const appWindow = window as Window & {
      __VINEXT_RSC_NAVIGATE__?: VinextNavigate;
    };
    const originalVinextNavigate = appWindow.__VINEXT_RSC_NAVIGATE__;
    const navigateWithoutHashReload: VinextNavigate = (
      href,
      redirectDepth,
      navigationKind,
      ...args
    ) => {
      const targetUrl = new URL(href, window.location.href);
      const isSameDocumentTraversal = navigationKind === "traverse"
        && `${targetUrl.pathname}${targetUrl.search}` === mountedLocation;

      if (isSameDocumentTraversal) {
        return Promise.resolve();
      }

      return originalVinextNavigate?.(
        href,
        redirectDepth,
        navigationKind,
        ...args,
      ) ?? Promise.resolve();
    };
    if (originalVinextNavigate) {
      appWindow.__VINEXT_RSC_NAVIGATE__ = navigateWithoutHashReload;
    }

    const restoreHashNavigation = () => {
      if (`${window.location.pathname}${window.location.search}` !== mountedLocation) {
        return;
      }

      // Vinext 0.0.50 treats same-document hash traversal as an RSC route
      // navigation. The narrow wrapper above keeps Back/Forward local and
      // avoids a missing `/.rsc` payload on the static export.
      navigationRunRef.current += 1;
      cancelScrollRef.current();
      navigationTargetRef.current = null;
      setMenuOpen(false);

      const hash = window.location.hash;
      if (!hash || hash.length === 1) {
        setActive("hero");
        const hero = document.getElementById("hero");
        if (hero) {
          window.scrollTo(0, 0);
          window.requestAnimationFrame(() => hero.focus({ preventScroll: true }));
        }
        return;
      }

      let id: string;
      try {
        id = decodeURIComponent(hash.slice(1));
      } catch {
        syncActiveFromViewport();
        return;
      }

      if (!sectionIds.includes(id as (typeof sectionIds)[number])) {
        syncActiveFromViewport();
        return;
      }

      const target = document.getElementById(id);
      if (!target) {
        syncActiveFromViewport();
        return;
      }

      setActive(id);
      target.scrollIntoView({ block: "start" });
      window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
    };

    window.addEventListener("popstate", restoreHashNavigation);
    if (window.location.hash) {
      restoreHashNavigation();
    }
    return () => {
      window.removeEventListener("popstate", restoreHashNavigation);
      if (appWindow.__VINEXT_RSC_NAVIGATE__ === navigateWithoutHashReload) {
        appWindow.__VINEXT_RSC_NAVIGATE__ = originalVinextNavigate;
      }
    };
  }, [syncActiveFromViewport]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      navigationRunRef.current += 1;
      cancelScrollRef.current();
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(mobileNavigationMedia);
    const closeAtDesktopBreakpoint = (event: MediaQueryListEvent) => {
      if (event.matches) return;
      focusFirstLinkOnOpenRef.current = false;
      setMenuOpen(false);
    };

    mediaQuery.addEventListener("change", closeAtDesktopBreakpoint);
    return () => mediaQuery.removeEventListener("change", closeAtDesktopBreakpoint);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const openedAtScrollY = window.scrollY;
    const closeOnPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnScroll = () => {
      if (Math.abs(window.scrollY - openedAtScrollY) > 1) {
        const navigation = document.getElementById("primary-navigation");
        const shouldRestoreFocus = focusFirstLinkOnOpenRef.current
          || Boolean(navigation?.contains(document.activeElement));
        focusFirstLinkOnOpenRef.current = false;
        setMenuOpen(false);
        if (shouldRestoreFocus) {
          menuButtonRef.current?.focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("scroll", closeOnScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("scroll", closeOnScroll);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !focusFirstLinkOnOpenRef.current) return;
    const frame = window.requestAnimationFrame(() => firstNavLinkRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen]);

  const toggleMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const nextOpen = !menuOpen;
    // Keyboard and assistive-technology clicks report detail=0. Pointer users
    // keep their current focus instead of receiving a synthetic link focus.
    focusFirstLinkOnOpenRef.current = nextOpen && event.detail === 0;
    setMenuOpen(nextOpen);
  }, [menuOpen]);

  return (
    <header ref={headerRef} className={`site-header${menuOpen ? " is-menu-open" : ""}`}>
      <a
        className="wordmark"
        href={homePath ?? "#hero"}
        aria-label="Jaxon, back to top"
        translate="no"
        onClick={homePath ? undefined : (event) => navigateToSection(event, "hero")}
      >
        <span aria-hidden="true">›_</span> JAXON
      </a>
      <nav
        className="nav-scroll"
        id="primary-navigation"
        aria-label="Primary navigation"
      >
        {links.map(([id, label], index) => (
          <a
            ref={index === 0 ? firstNavLinkRef : undefined}
            href={homePath ? `${homePath}#${id}` : `#${id}`}
            className={active === id ? "is-active" : ""}
            aria-current={active === id ? "location" : undefined}
            onClick={homePath ? undefined : (event) => navigateToSection(event, id)}
            key={id}
          >
            <span className="nav-link-cursor" aria-hidden="true">[</span>
            <span className="nav-link-label">{label}</span>
            <span className="nav-link-cursor" aria-hidden="true">]</span>
          </a>
        ))}
      </nav>
      <span className="system-mark system-mark-static" aria-hidden="true">
        <span className="system-mark-dots"><i /><i /><i /><i /></span>
      </span>
      <button
        ref={menuButtonRef}
        type="button"
        className="system-mark system-mark-trigger"
        aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={menuOpen}
        aria-controls="primary-navigation"
        onClick={toggleMenu}
      >
        <span className="system-mark-dots" aria-hidden="true"><i /><i /><i /><i /></span>
      </button>
    </header>
  );
}
