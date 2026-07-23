import { startCancellableScroll } from "./cancellable-scroll.ts";

type ScrollWindow = Parameters<typeof startCancellableScroll>[0];
type ScrollTarget = Parameters<typeof startCancellableScroll>[1];

type HashNavigationDocument = {
  getElementById(id: string): ScrollTarget | null;
};

type HashNavigationEvent = {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault(): void;
};

export function createHashNavigation(
  window: ScrollWindow,
  document: HashNavigationDocument,
) {
  let cancelActiveScroll: () => void = () => undefined;

  const cancel = () => {
    cancelActiveScroll();
    cancelActiveScroll = () => undefined;
  };

  const navigate = (event: HashNavigationEvent, hash: string) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || !hash.startsWith("#")
      || hash.length === 1
    ) {
      return false;
    }

    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return false;
    }

    const target = document.getElementById(id);
    if (!target) return false;

    event.preventDefault();
    cancel();
    cancelActiveScroll = startCancellableScroll(window, target, hash);
    return true;
  };

  return { cancel, navigate };
}
