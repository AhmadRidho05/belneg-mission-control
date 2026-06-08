import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AppChrome } from "@/components/app-chrome";
import { THEME_STORAGE_KEY } from "@/components/top-actions";

// Runs before hydration so the saved theme applies on first paint (no flash of
// the wrong theme). Keep THEME_STORAGE_KEY in sync with components/top-actions.tsx.
const THEME_BOOTSTRAP_SCRIPT = `(function () {
  try {
    var stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = stored === "light" ? "light" : "dark";
    var root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  } catch (e) {}
})();`;

export const metadata: Metadata = {
  title: "BELNEG Mission Control",
  description:
    "Bela Negara Mission Control · Cross-domain intelligence dashboard untuk Pendidikan Menengah & Komando TNI AD.",
  applicationName: "BELNEG",
  appleWebApp: {
    capable: true,
    title: "BELNEG",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#2a1300",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>

        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-bg focus:shadow-glow focus:font-semibold"
        >
          Lompat ke konten utama
        </a>

        <div className="min-h-[100dvh] lg:min-h-screen">
          <AppChrome>{children}</AppChrome>
        </div>
      </body>
    </html>
  );
}