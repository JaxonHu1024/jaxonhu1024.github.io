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
  onSettled?: (result: "finished" | "cancelled") => void;
};

const passiveCancelOptions = { capture: true, passive: true } as const;
const cancelOptions = { capture: true } as const;
const activeScrolls = new WeakMap<object, () => void>();

export function startCancellableScroll(
  window: ScrollWindow,
  target: ScrollTarget,
  hash: string,
  { duration = 640, onSettled }: ScrollOptions = {},
) {
  activeScrolls.get(window)?.();

  const startY = window.scrollY;
  const targetY = startY + target.getBoundingClientRect().top;
  const distance = targetY - startY;

  target.focus({ preventScroll: true });
  window.history.pushState(null, "", hash);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || distance === 0) {
    window.scrollTo(0, targetY);
    onSettled?.("finished");
    return () => undefined;
  }

  let animationFrame = 0;
  let settled = false;
  const startTime = window.performance.now();

  const cleanup = () => {
    window.removeEventListener("wheel", cancel, passiveCancelOptions);
    window.removeEventListener("touchstart", cancel, passiveCancelOptions);
    window.removeEventListener("keydown", cancel, cancelOptions);
    if (activeScrolls.get(window) === cancel) activeScrolls.delete(window);
  };

  const settle = (result: "finished" | "cancelled") => {
    if (settled) return;
    settled = true;
    cleanup();
    onSettled?.(result);
  };

  const cancel = () => {
    if (settled) return;
    window.cancelAnimationFrame(animationFrame);
    settle("cancelled");
  };

  const animate = (time: number) => {
    if (settled) return;

    const progress = Math.min(1, (time - startTime) / duration);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    window.scrollTo(0, startY + distance * easedProgress);

    if (progress < 1) {
      animationFrame = window.requestAnimationFrame(animate);
      return;
    }

    settle("finished");
  };

  window.addEventListener("wheel", cancel, passiveCancelOptions);
  window.addEventListener("touchstart", cancel, passiveCancelOptions);
  window.addEventListener("keydown", cancel, cancelOptions);
  activeScrolls.set(window, cancel);
  animationFrame = window.requestAnimationFrame(animate);

  return cancel;
}
