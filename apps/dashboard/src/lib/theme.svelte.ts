export type Theme = "light" | "dark" | "system";

function createTheme() {
  let theme = $state<Theme>("system");

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("runcanon-theme") ?? localStorage.getItem("skillsmith-theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      theme = stored;
    }
  }

  const resolved = $derived.by(() => {
    if (theme !== "system") return theme;
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  function apply() {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  }

  function set(value: Theme) {
    theme = value;
    if (typeof window !== "undefined") {
      localStorage.setItem("runcanon-theme", value);
    }
    apply();
  }

  function init() {
    if (typeof window === "undefined") return;
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") apply();
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }

  return {
    get theme() {
      return theme;
    },
    get resolved() {
      return resolved;
    },
    set,
    init,
  };
}

export const theme = createTheme();
