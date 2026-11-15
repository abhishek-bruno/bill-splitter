import { useEffect } from "react";

// Applies "system" | "light" | "dark" to <html> and keeps the browser/status bar colour matched
export function useTheme(theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const surface = getComputedStyle(root).getPropertyValue("--surface").trim();
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", surface));
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);
}
