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

function useHeroMediaVisibility() {
  useEffect(() => {
    const heroMedia = document.querySelector<HTMLElement>(".hero-media");
    if (!heroMedia) return;

    const setVisibility = (visible: boolean) => {
      heroMedia.dataset.heroVisible = visible ? "true" : "false";
    };
    const rect = heroMedia.getBoundingClientRect();
    setVisibility(rect.bottom > 0 && rect.top < window.innerHeight);

    const observer = new IntersectionObserver(
      ([entry]) => setVisibility(Boolean(entry?.isIntersecting)),
      { threshold: 0.05 },
    );
    observer.observe(heroMedia);

    return () => {
      observer.disconnect();
      delete heroMedia.dataset.heroVisible;
    };
  }, []);
}

export function HeroInteractionController() {
  useHeroExperienceNavigation();
  useHeroMediaVisibility();
  return null;
}
