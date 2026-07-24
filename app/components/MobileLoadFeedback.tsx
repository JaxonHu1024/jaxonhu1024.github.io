"use client";

import { useEffect, useState } from "react";

type FeedbackState = "loading" | "complete" | "error";

const MINIMUM_LOADING_VISIBILITY_MS = 500;
const COMPLETE_VISIBILITY_MS = 900;

const feedbackCopy: Record<FeedbackState, string> = {
  loading: "Loading visual assets…",
  complete: "Interface ready.",
  error: "Some visuals failed. Content remains available.",
};

export function MobileLoadFeedback() {
  const [state, setState] = useState<FeedbackState>("loading");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let failed = false;
    const shownAt = performance.now();
    let minimumVisibilityTimer: number | undefined;
    let hideTimer: number | undefined;
    const imageDisposers: Array<() => void> = [];

    const showError = () => {
      if (cancelled || failed) {
        return;
      }

      failed = true;
      window.clearTimeout(minimumVisibilityTimer);
      window.clearTimeout(hideTimer);
      setState("error");
      setVisible(true);
    };

    const handleResourceError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) {
        showError();
      }
    };

    const waitForImage = (image: HTMLImageElement) => {
      if (image.complete) {
        return image.naturalWidth > 0
          ? Promise.resolve()
          : Promise.reject(new Error(`Failed to load ${image.currentSrc || image.src}`));
      }

      return new Promise<void>((resolveImage, rejectImage) => {
        const cleanup = () => {
          image.removeEventListener("load", handleLoad);
          image.removeEventListener("error", handleError);
        };
        const handleLoad = () => {
          cleanup();
          resolveImage();
        };
        const handleError = () => {
          cleanup();
          rejectImage(new Error(`Failed to load ${image.currentSrc || image.src}`));
        };

        image.addEventListener("load", handleLoad, { once: true });
        image.addEventListener("error", handleError, { once: true });
        imageDisposers.push(cleanup);
      });
    };

    const showComplete = () => {
      if (cancelled || failed) {
        return;
      }

      setState("complete");
      setVisible(true);
      hideTimer = window.setTimeout(() => {
        if (!cancelled && !failed) {
          setVisible(false);
        }
      }, COMPLETE_VISIBILITY_MS);
    };

    const finishSuccessfully = () => {
      if (cancelled || failed) {
        return;
      }

      const remainingVisibility = Math.max(
        0,
        MINIMUM_LOADING_VISIBILITY_MS - (performance.now() - shownAt),
      );

      if (remainingVisibility > 0) {
        minimumVisibilityTimer = window.setTimeout(showComplete, remainingVisibility);
      } else {
        showComplete();
      }
    };

    window.addEventListener("error", handleResourceError, true);

    const fontReadiness = document.fonts?.ready ?? Promise.resolve();
    const imageReadiness = Array.from(document.images)
      .filter((image) => image.loading !== "lazy")
      .map(waitForImage);

    void Promise.all([fontReadiness, ...imageReadiness])
      .then(finishSuccessfully)
      .catch(showError);

    return () => {
      cancelled = true;
      window.clearTimeout(minimumVisibilityTimer);
      window.clearTimeout(hideTimer);
      window.removeEventListener("error", handleResourceError, true);
      imageDisposers.forEach((dispose) => dispose());
    };
  }, []);

  const isError = state === "error";

  return (
    <>
      <div
        className="mobile-load-feedback"
        data-state={state}
        data-testid="mobile-load-feedback"
        data-visible={String(visible)}
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
        aria-atomic="true"
        aria-hidden={!visible}
      >
        <span className="mobile-load-feedback__indicator" aria-hidden="true" />
        <span className="mobile-load-feedback__copy">{feedbackCopy[state]}</span>
        {isError ? (
          <button
            className="mobile-load-feedback__retry"
            type="button"
            aria-label="Retry loading page"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        ) : null}
      </div>
      <noscript>
        <style>{".mobile-load-feedback { display: none !important; }"}</style>
      </noscript>
    </>
  );
}
