"use client";

import { useEffect, useState } from "react";

type FeedbackState = "loading" | "complete" | "error";

const LOADING_REVEAL_DELAY_MS = 300;
const COMPLETE_VISIBILITY_MS = 600;

const feedbackCopy: Record<FeedbackState, string> = {
  loading: "Loading visual assets…",
  complete: "Interface ready.",
  error: "Some visuals failed. Content remains available.",
};

const isCriticalImage = (image: HTMLImageElement) => (
  image.getAttribute("fetchpriority")?.toLowerCase() === "high"
);

export function MobileLoadFeedback() {
  const [state, setState] = useState<FeedbackState>("loading");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let failed = false;
    let loadingWasShown = false;
    let hideTimer: number | undefined;
    const imageDisposers: Array<() => void> = [];

    const revealLoading = () => {
      if (cancelled || failed) {
        return;
      }

      loadingWasShown = true;
      setState("loading");
      setVisible(true);
    };

    const revealTimer = window.setTimeout(
      revealLoading,
      LOADING_REVEAL_DELAY_MS,
    );

    const showError = () => {
      if (cancelled || failed) {
        return;
      }

      failed = true;
      window.clearTimeout(revealTimer);
      window.clearTimeout(hideTimer);
      setState("error");
      setVisible(true);
    };

    const handleResourceError = (event: Event) => {
      if (event.target instanceof HTMLImageElement && isCriticalImage(event.target)) {
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

      window.clearTimeout(revealTimer);

      if (!loadingWasShown) {
        setVisible(false);
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

    window.addEventListener("error", handleResourceError, true);

    const fontReadiness = document.fonts?.ready ?? Promise.resolve();
    const imageReadiness = Array.from(document.images)
      .filter(isCriticalImage)
      .map(waitForImage);

    void Promise.all([fontReadiness, ...imageReadiness])
      .then(showComplete)
      .catch(showError);

    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
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
