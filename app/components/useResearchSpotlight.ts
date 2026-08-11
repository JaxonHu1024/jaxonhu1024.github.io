"use client";

import { useEffect, type RefObject } from "react";

const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type PointerPosition = Readonly<{ x: number; y: number }>;

// Site-specific adaptation of React Bits SpotlightCard; see THIRD_PARTY_NOTICES.md.
export function useResearchSpotlight(canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const packet = canvasRef.current?.closest<HTMLElement>(".research-packet");
    if (!packet) return;

    const paperLink = packet.querySelector<HTMLElement>(".paper-link");
    const pointerQuery = window.matchMedia(FINE_POINTER_QUERY);
    const motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    let pointerFrame = 0;
    let focusFrame = 0;
    let pointerInside = false;
    let latestPointer: PointerPosition | null = null;

    const cancelPointerFrame = () => {
      window.cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
    };

    const writeSpotlightPosition = (clientX: number, clientY: number) => {
      const rect = packet.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
      const y = Math.min(rect.height, Math.max(0, clientY - rect.top));
      packet.style.setProperty("--research-spotlight-x", `${x}px`);
      packet.style.setProperty("--research-spotlight-y", `${y}px`);
    };

    const clearSpotlight = () => {
      cancelPointerFrame();
      packet.removeAttribute("data-research-spotlight");
      packet.style.removeProperty("--research-spotlight-x");
      packet.style.removeProperty("--research-spotlight-y");
    };

    const canTrackPointer = () => pointerQuery.matches && !motionQuery.matches;

    const showFocusSpotlight = () => {
      if (!paperLink?.matches(":focus-visible")) return false;
      cancelPointerFrame();
      const linkRect = paperLink.getBoundingClientRect();
      writeSpotlightPosition(
        linkRect.left + linkRect.width / 2,
        linkRect.top + linkRect.height / 2,
      );
      packet.dataset.researchSpotlight = "focus";
      return true;
    };

    const showPointerSpotlight = () => {
      if (!pointerInside || !latestPointer || !canTrackPointer()) return false;
      cancelPointerFrame();
      writeSpotlightPosition(latestPointer.x, latestPointer.y);
      packet.dataset.researchSpotlight = "pointer";
      return true;
    };

    const restoreSpotlight = () => {
      if (showFocusSpotlight()) return;
      if (showPointerSpotlight()) return;
      clearSpotlight();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        pointerInside = false;
        latestPointer = null;
        restoreSpotlight();
        return;
      }
      if (!canTrackPointer()) {
        restoreSpotlight();
        return;
      }

      pointerInside = true;
      latestPointer = { x: event.clientX, y: event.clientY };
      if (pointerFrame !== 0) return;
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0;
        if (!showPointerSpotlight()) restoreSpotlight();
      });
    };

    const handlePointerLeave = () => {
      pointerInside = false;
      latestPointer = null;
      restoreSpotlight();
    };

    const handleFocusIn = () => {
      window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(() => {
        focusFrame = 0;
        restoreSpotlight();
      });
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && packet.contains(event.relatedTarget)) return;
      window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(() => {
        focusFrame = 0;
        restoreSpotlight();
      });
    };

    const handleEnvironmentChange = () => restoreSpotlight();

    packet.addEventListener("pointermove", handlePointerMove);
    packet.addEventListener("pointerleave", handlePointerLeave);
    packet.addEventListener("focusin", handleFocusIn);
    packet.addEventListener("focusout", handleFocusOut);
    pointerQuery.addEventListener("change", handleEnvironmentChange);
    motionQuery.addEventListener("change", handleEnvironmentChange);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      pointerInside = false;
      latestPointer = null;
      clearSpotlight();
      packet.removeEventListener("pointermove", handlePointerMove);
      packet.removeEventListener("pointerleave", handlePointerLeave);
      packet.removeEventListener("focusin", handleFocusIn);
      packet.removeEventListener("focusout", handleFocusOut);
      pointerQuery.removeEventListener("change", handleEnvironmentChange);
      motionQuery.removeEventListener("change", handleEnvironmentChange);
    };
  }, [canvasRef]);
}
