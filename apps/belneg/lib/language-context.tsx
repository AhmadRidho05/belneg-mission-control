"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Language = "id" | "en";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("id");
  const [mounted, setMounted] = useState(false);

  // Initialize language from localStorage on mount
  useEffect(() => {
    const savedLang = localStorage.getItem("belneg_language") as Language | null;
    if (savedLang && (savedLang === "id" || savedLang === "en")) {
      setLangState(savedLang);
    } else {
      setLangState("id"); // Default to Indonesian
    }
    setMounted(true);
  }, []);

  // Save language to localStorage whenever it changes
  const setLang = (newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("belneg_language", newLang);
    }
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  // Fallback for when context is not available (e.g., SSR, server components)
  if (context === undefined) {
    return {
      lang: "id" as const,
      setLang: () => {},
    };
  }

  return context;
}
