"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "paper" | "dark";

const KEY = "launchpad.theme";

/** Runs before paint so the page never flashes the wrong ground. */
export const THEME_BOOT_SCRIPT = `(()=>{try{var t=localStorage.getItem(${JSON.stringify(KEY)});if(t!=="paper"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"paper"}document.documentElement.dataset.theme=t==="dark"?"dark":"paper"}catch(e){}})()`;

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "paper",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("paper");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "dark" : "paper");
  }, []);

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next = previous === "dark" ? "paper" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Private mode — the choice just won't persist.
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
