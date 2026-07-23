type ScrollWindow = Pick<
  Window,
  | "addEventListener"
  | "cancelAnimationFrame"
  | "history"
  | "matchMedia"
  | "performance"
  | "removeEventListener"
  | "requestAnimationFrame"
  | "scrollTo"
  | "scrollY"
>;

type ScrollTarget = Pick<HTMLElement, "focus" | "getBoundingClientRect">;

type ScrollOptions = {
  duration?: number;
};

const passiveCancelOptions = { capture: true, passive: true } as const;
const cancelOptions = { capture: true } as const;
const activeScrolls = new WeakMap<object, () => void>();

export function startCancellableScroll(
  window: ScrollWindow,
  target: ScrollTarget,
  hash: string,
  { duration = 640 }: ScrollOptions = {},
) {
  activeScrolls.get(window)?.();

  const startY = window.scrollY;
  const targetY = startY + target.getBoundingClientRect().top;
  const distance = targetY - startY;

  target.focus({ preventScroll: true });
  window.history.pushState(null, "", hash);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || distance === 0) {
    window.scrollTo(0, targetY);
    return () => undefined;
  }

  let animationFrame = 0;
  let cancelled = false;
  const startTime = window.performance.now();

  const cleanup = () => {
    window.removeEventListener("wheel", cancel, passiveCancelOptions);
    window.removeEventListener("touchstart", cancel, passiveCancelOptions);
    window.removeEventListener("keydown", cancel, cancelOptions);
    if (activeScrolls.get(window) === cancel) activeScrolls.delete(window);
  };

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    window.cancelAnimationFrame(animationFrame);
    cleanup();
  };

  const animate = (time: number) => {
    if (cancelled) return;

    const progress = Math.min(1, (time - startTime) / duration);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    window.scrollTo(0, startY + distance * easedProgress);

    if (progress < 1) {
      animationFrame = window.requestAnimationFrame(animate);
      return;
    }

    cleanup();
  };

  window.addEventListener("wheel", cancel, passiveCancelOptions);
  window.addEventListener("touchstart", cancel, passiveCancelOptions);
  window.addEventListener("keydown", cancel, cancelOptions);
  activeScrolls.set(window, cancel);
  animationFrame = window.requestAnimationFrame(animate);

  return cancel;
}
