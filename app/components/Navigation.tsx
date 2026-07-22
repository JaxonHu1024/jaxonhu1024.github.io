"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { startCancellableScroll } from "../lib/cancellable-scroll";

const links = [
  ["experience", "EXPERIENCE"],
  ["foundations", "FOUNDATIONS"],
  ["research", "RESEARCH"],
  ["contact", "CONTACT"],
] as const;

export function Navigation() {
  const [active, setActive] = useState("hero");
  const [menuOpen, setMenuOpen] = useState(false);
  const cancelScrollRef = useRef<() => void>(() => undefined);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstNavLinkRef = useRef<HTMLAnchorElement>(null);

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
    setMenuOpen(false);
    cancelScrollRef.current();
    cancelScrollRef.current = startCancellableScroll(window, target, `#${id}`);
  }, []);

  useEffect(() => {
    const sections = ["hero", ...links.map(([id]) => id)]
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-18% 0px -58% 0px", threshold: [0, 0.15, 0.35, 0.6] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => cancelScrollRef.current(), []);

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
    if (!menuOpen) return;
    const frame = window.requestAnimationFrame(() => firstNavLinkRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen]);

  return (
    <header className={`site-header${menuOpen ? " is-menu-open" : ""}`}>
      <a className="wordmark" href="#hero" aria-label="Jaxon, back to top" onClick={(event) => navigateToSection(event, "hero")}>
        <span aria-hidden="true">›_</span> JAXON
      </a>
      <nav className="nav-scroll" id="primary-navigation" aria-label="Primary navigation">
        {links.map(([id, label], index) => (
          <a
            ref={index === 0 ? firstNavLinkRef : undefined}
            href={`#${id}`}
            className={active === id ? "is-active" : ""}
            aria-current={active === id ? "location" : undefined}
            onClick={(event) => navigateToSection(event, id)}
            key={id}
          >
            {label}
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
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="system-mark-dots" aria-hidden="true"><i /><i /><i /><i /></span>
      </button>
    </header>
  );
}
