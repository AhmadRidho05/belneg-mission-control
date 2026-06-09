"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { TopActions } from "./top-actions";

const NO_CHROME_PREFIXES = ["/auth"];

function hasChrome(pathname: string): boolean {
  if (pathname === "/") return false;
  return !NO_CHROME_PREFIXES.some((p) => pathname.startsWith(p));
}

export function AppChrome({ children, role }: { children: React.ReactNode; role?: "admin" | "user" | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Sync with localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    if (localStorage.getItem("sidebar-collapsed") === "true") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  if (!hasChrome(pathname)) {
    return (
      <main id="main-content" tabIndex={-1} className="min-w-0 focus:outline-none">
        {children}
      </main>
    );
  }

  return (
    <>
      <Sidebar role={role} collapsed={collapsed} onToggle={toggle} />
      <TopActions />
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "min-w-0 focus:outline-none transition-[margin-left] duration-200 ease-in-out",
          collapsed ? "lg:ml-20" : "lg:ml-64"
        )}
      >
        {children}
      </main>
    </>
  );
}
