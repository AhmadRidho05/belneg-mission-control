"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Globe, Sun, Moon, Bell, LogOut, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { simulateLogout, listSimAccounts, WEB_ACCOUNTS_STORAGE_KEY } from "@/lib/auth-sim";

// Mirrors the shape returned by GET /api/notifications (app/api/notifications/route.ts).
// TODO(integration): once the APK/LMS notification API exists, point this fetch at it
// (or proxy it through that route) — the shape here is designed to match 1:1.
type NotificationItem = {
  id: string;
  title: string;
  body: string;
  category: "report" | "approval" | "siswa" | "system";
  severity: "info" | "warning" | "critical";
  createdAt: string;
  readAt: string | null;
};

type NotifState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: NotificationItem[] };

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  return `${days} hari lalu`;
}

const ICON_BTN =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-bg-soft/60 text-ink-muted backdrop-blur-sm transition hover:bg-white/5 hover:text-ink";

// Keep in sync with the no-flash bootstrap script in app/layout.tsx.
export const THEME_STORAGE_KEY = "belneg-theme";
type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * Top-right utility action cluster for the dashboard content area.
 * Theme (light/dark) is fully wired to CSS variables in globals.css + localStorage.
 * Language/notification/logout remain UI-only for now (see inline TODOs).
 */
export function TopActions() {
  const [lang, setLang] = useState<"ID" | "EN">("ID");
  // Mirrors whatever the no-flash bootstrap script already applied to <html>,
  // so the icon matches on first paint instead of always assuming "dark".
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notifState, setNotifState] = useState<NotifState>({ status: "loading" });
  const [pendingRegistrations, setPendingRegistrations] = useState(0);

  const notifRef = useRef<HTMLDivElement>(null);
  const logoutRef = useRef<HTMLDivElement>(null);

  // Real signal (not placeholder/dummy data): how many self-registered Web
  // Mission Control accounts are waiting for admin approval, sourced straight
  // from the localStorage simulation in lib/auth-sim.ts (see Manage User).
  useEffect(() => {
    const refresh = () => setPendingRegistrations(listSimAccounts().filter((a) => a.status === "pending").length);
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === WEB_ACCOUNTS_STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [notifOpen]);

  // Fetch on mount, and again whenever the dropdown is opened (placeholder store
  // can be seeded manually via POST /api/notifications while the dashboard is open).
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setNotifState((s) => (s.status === "ready" ? s : { status: "loading" }));
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setNotifState({ status: "ready", items: Array.isArray(data?.notifications) ? data.notifications : [] });
      } catch {
        if (!cancelled) setNotifState({ status: "error", message: "Gagal memuat notifikasi." });
      }
    };

    load();
    return () => { cancelled = true; };
  }, [notifOpen]);

  useEffect(() => {
    if (!notifOpen && !logoutOpen) return;

    const onDocClick = (e: MouseEvent) => {
      if (notifOpen && !notifRef.current?.contains(e.target as Node)) setNotifOpen(false);
      if (logoutOpen && !logoutRef.current?.contains(e.target as Node)) setLogoutOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNotifOpen(false);
        setLogoutOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifOpen, logoutOpen]);

  // TEMPORARY AUTH SIMULATION (see lib/auth-sim.ts) — clears the localStorage
  // session and sends the visitor to the landing page with a clean URL (no
  // `?role=` left over from the simulated dashboard view).
  const handleLogout = () => {
    simulateLogout();
    window.location.href = "/";
  };

  const toggleTheme = () => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // localStorage can throw in private-browsing/sandboxed contexts — theme still
        // applies for this session, it just won't persist across reloads.
      }
      return next;
    });
  };

  return (
    <div className="fixed right-4 top-4 z-30 hidden items-center gap-1.5 lg:right-6 lg:flex">
      {/* Language switch (ID/EN dummy) */}
      <button
        type="button"
        onClick={() => setLang((l) => (l === "ID" ? "EN" : "ID"))}
        aria-label="Ganti bahasa"
        title={lang === "ID" ? "Bahasa Indonesia" : "English"}
        className={cn(ICON_BTN, "w-auto gap-1.5 px-2.5")}
      >
        <Globe size={16} />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{lang}</span>
      </button>

      {/* Light/dark mode toggle — wired to CSS vars in globals.css + localStorage */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
        title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
        className={ICON_BTN}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Notifications — backed by GET/POST /api/notifications (placeholder store
          until the APK/LMS notification API exists; see TODO in that route). */}
      <div className="relative" ref={notifRef}>
        <button
          type="button"
          onClick={() => { setNotifOpen((v) => !v); setLogoutOpen(false); }}
          aria-label="Notifikasi"
          aria-expanded={notifOpen}
          title="Notifikasi"
          className={cn(ICON_BTN, "relative")}
        >
          <Bell size={16} />
          {(pendingRegistrations > 0 || (notifState.status === "ready" && notifState.items.some(n => !n.readAt))) && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-glow" />
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-[calc(100%+0.5rem)] w-72 overflow-hidden rounded-lg border border-white/10 bg-bg-surface shadow-tactical">
            <div className="border-b border-white/5 px-3.5 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-ink">Notifikasi</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-subtle">
                {notifState.status === "ready"
                  ? `${notifState.items.length + (pendingRegistrations > 0 ? 1 : 0)} item`
                  : "Memuat…"}
              </div>
            </div>

            {/* Real signal — sourced live from the localStorage web-account
                registry (lib/auth-sim.ts), NOT placeholder/dummy data. Shown
                whenever a self-registered account is awaiting admin review. */}
            {pendingRegistrations > 0 && (
              <Link
                href="/admin/users"
                onClick={() => setNotifOpen(false)}
                className="block border-b border-white/5 bg-warn/5 px-3.5 py-2.5 transition hover:bg-warn/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                    <UserPlus size={12} className="text-warn" /> User baru menunggu approval
                  </span>
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-glow" />
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-ink-muted">
                  {pendingRegistrations} akun menunggu persetujuan di Manage User.
                </div>
              </Link>
            )}

            {notifState.status === "loading" && (
              <div className="px-3.5 py-6 text-center text-[11px] text-ink-subtle">Memuat notifikasi…</div>
            )}

            {notifState.status === "error" && (
              <div className="px-3.5 py-6 text-center text-[11px] leading-snug text-ink-muted">
                {notifState.message}
                <br />Coba lagi beberapa saat lagi.
              </div>
            )}

            {notifState.status === "ready" && notifState.items.length === 0 && pendingRegistrations === 0 && (
              <div className="px-3.5 py-6 text-center text-[11px] leading-snug text-ink-muted">
                Belum ada notifikasi.
              </div>
            )}

            {notifState.status === "ready" && notifState.items.length > 0 && (
              <ul className="max-h-72 overflow-y-auto">
                {notifState.items.map((n) => (
                  <li key={n.id} className="border-b border-white/5 px-3.5 py-2.5 last:border-0 hover:bg-white/5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink">{n.title}</span>
                      {!n.readAt && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-glow" />}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-ink-muted">{n.body}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-subtle">{relativeTime(n.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Logout — clears the simulated auth session, see handleLogout */}
      <div className="relative" ref={logoutRef}>
        <button
          type="button"
          onClick={() => { setLogoutOpen((v) => !v); setNotifOpen(false); }}
          aria-label="Logout"
          aria-expanded={logoutOpen}
          title="Logout"
          className={ICON_BTN}
        >
          <LogOut size={16} />
        </button>

        {logoutOpen && (
          <div className="absolute right-0 top-[calc(100%+0.5rem)] w-60 overflow-hidden rounded-lg border border-white/10 bg-bg-surface p-3.5 shadow-tactical">
            <div className="text-[12px] font-medium text-ink">Keluar dari BELNEG?</div>
            <div className="mt-1 text-[11px] leading-snug text-ink-muted">
              Sesi simulasi akan dihapus dan kamu akan kembali ke beranda.
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLogoutOpen(false)}
                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-ink-muted transition hover:text-ink"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-glow transition hover:bg-accent/20"
              >
                Keluar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
