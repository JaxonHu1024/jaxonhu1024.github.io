"use client";

import { useEffect, useState } from "react";

const links = [
  ["experience", "EXPERIENCE"],
  ["research", "RESEARCH"],
  ["foundations", "FOUNDATIONS"],
  ["contact", "CONTACT"],
] as const;

export function Navigation() {
  const [active, setActive] = useState("hero");

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

  return (
    <header className="site-header">
      <a className="wordmark" href="#hero" aria-label="Jaxon, back to top">
        <span aria-hidden="true">›_</span> JAXON
      </a>
      <nav className="nav-scroll" aria-label="Primary navigation">
        {links.map(([id, label]) => (
          <a href={`#${id}`} className={active === id ? "is-active" : ""} aria-current={active === id ? "location" : undefined} key={id}>
            {label}
          </a>
        ))}
      </nav>
      <span className="system-mark" aria-hidden="true"><i /><i /><i /><i /></span>
    </header>
  );
}
