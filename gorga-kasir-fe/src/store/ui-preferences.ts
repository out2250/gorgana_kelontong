import { defineStore } from "pinia";
import { computed, ref } from "vue";

type ThemeMode = "light" | "dark" | "system";
type FontMode = "inter" | "poppins" | "nunito" | "system";

const THEME_KEY = "ui_theme_mode";
const FONT_KEY = "ui_font_mode";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const useUiPreferencesStore = defineStore("ui-preferences", () => {
  const themeMode = ref<ThemeMode>((localStorage.getItem(THEME_KEY) as ThemeMode) || "system");
  const fontMode = ref<FontMode>((localStorage.getItem(FONT_KEY) as FontMode) || "inter");

  const resolvedTheme = computed<"light" | "dark">(() => {
    if (themeMode.value === "system") {
      return getSystemTheme();
    }
    return themeMode.value;
  });

  function applyToDocument() {
    const root = document.documentElement;
    const body = document.body;

    root.classList.remove("app-theme-light", "app-theme-dark", "font-inter", "font-poppins", "font-nunito", "font-system");
    body.classList.remove("app-theme-light", "app-theme-dark", "font-inter", "font-poppins", "font-nunito", "font-system");

    const themeClass = resolvedTheme.value === "dark" ? "app-theme-dark" : "app-theme-light";
    const fontClass = `font-${fontMode.value}`;

    root.classList.add(themeClass, fontClass);
    body.classList.add(themeClass, fontClass);
  }

  function setThemeMode(next: ThemeMode) {
    themeMode.value = next;
    localStorage.setItem(THEME_KEY, next);
    applyToDocument();
  }

  function setFontMode(next: FontMode) {
    fontMode.value = next;
    localStorage.setItem(FONT_KEY, next);
    applyToDocument();
  }

  if (typeof window !== "undefined") {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", () => {
      if (themeMode.value === "system") {
        applyToDocument();
      }
    });
  }

  return {
    themeMode,
    fontMode,
    resolvedTheme,
    applyToDocument,
    setThemeMode,
    setFontMode
  };
});
