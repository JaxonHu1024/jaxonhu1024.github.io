"use client";

import { useEffect } from "react";

import { createHashNavigation } from "../lib/hash-navigation";

function useHeroExperienceNavigation() {
  useEffect(() => {
    const navigation = createHashNavigation(window, document);

    const handleClick = (event: MouseEvent) => {
      const origin = event.target;
      if (!(origin instanceof Element)) return;

      const link = origin.closest<HTMLAnchorElement>('a.hero-cta[href^="#"]');
      if (!link) return;

      navigation.navigate(event, link.hash);
    };

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      navigation.cancel();
    };
  }, []);
}

function useSectionMotionVisibility() {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".section"));
    if (sections.length === 0) return;

    const setVisibility = (section: HTMLElement, visible: boolean) => {
      section.dataset.sectionVisible = visible ? "true" : "false";
    };

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      setVisibility(section, rect.bottom > 0 && rect.top < window.innerHeight);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setVisibility(entry.target as HTMLElement, entry.isIntersecting);
        });
      },
      { rootMargin: "18% 0px", threshold: 0.01 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => {
      observer.disconnect();
      sections.forEach((section) => delete section.dataset.sectionVisible);
    };
  }, []);
}

export function HeroInteractionController() {
  useHeroExperienceNavigation();
  useSectionMotionVisibility();
  return null;
}
