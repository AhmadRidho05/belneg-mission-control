"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopActions } from "./top-actions";

// Routes that render their own full-page layout (landing, auth) and should
// not get the Mission Control sidebar/top bar chrome.
const NO_CHROME_PREFIXES = ["/auth"];

function hasChrome(pathname: string): boolean {
  if (pathname === "/") return false;
  return !NO_CHROME_PREFIXES.some((p) => pathname.startsWith(p));
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!hasChrome(pathname)) {
    return (
      <main id="main-content" tabIndex={-1} className="min-w-0 focus:outline-none">
        {children}
      </main>
    );
  }

  return (
    <>
      <Sidebar />
      <TopActions />

      <main id="main-content" tabIndex={-1} className="min-w-0 focus:outline-none lg:ml-64">
        {children}
      </main>
    </>
  );
}
