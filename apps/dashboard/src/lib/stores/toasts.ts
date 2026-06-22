import { writable } from "svelte/store";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function push(message: string, variant: ToastVariant = "info", durationMs = 4000): void {
    const id = crypto.randomUUID();
    update((items) => [...items, { id, message, variant }]);
    setTimeout(() => dismiss(id), durationMs);
  }

  function dismiss(id: string): void {
    update((items) => items.filter((t) => t.id !== id));
  }

  return {
    subscribe,
    push,
    dismiss,
    success: (m: string) => push(m, "success"),
    error: (m: string) => push(m, "error"),
    info: (m: string, ms = 8000) => push(m, "info", ms),
    warning: (m: string, ms = 6000) => push(m, "warning", ms),
  };
}

export const toasts = createToastStore();
