/** Focus trap for modal drawers - traps Tab and closes on Escape. */
export function focusTrap(node: HTMLElement, onEscape?: () => void) {
  const focusable = () =>
    [...node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute("disabled")
    );

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onEscape?.();
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusable();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }

  node.addEventListener("keydown", onKeydown);
  focusable()[0]?.focus();

  return {
    destroy() {
      node.removeEventListener("keydown", onKeydown);
    },
  };
}
