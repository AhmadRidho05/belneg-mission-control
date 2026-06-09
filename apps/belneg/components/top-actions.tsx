"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Globe, Sun, Moon, Bell, LogOut, UserPlus, FileText, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { simulateLogout } from "@/lib/auth-sim";
import type { NotifItem, NotifType } from "@/app/api/notifications/route";

type NotifState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; count: number; items: NotifItem[] };

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

function typeIcon(type: NotifType) {
  if (type === "user_pending") return <UserPlus size={11} className="text-warn shrink-0 mt-px" />;
  if (type === "report_new")   return <FileText  size={11} className="text-accent-glow shrink-0 mt-px" />;
  return                              <Shield    size={11} className="text-ok shrink-0 mt-px" />;
}

const ICON_BTN =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-bg-soft/60 text-ink-muted backdrop-blur-sm transition hover:bg-white/5 hover:text-ink";

export const THEME_STORAGE_KEY = "belneg-theme";
type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function TopActions() {
  const [lang, setLang] = useState<"ID" | "EN">("ID");
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  });
  const [notifOpen, setNotifOpen]   = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notifState, setNotifState] = useState<NotifState>({ status: "loading" });

  const notifRef  = useRef<HTMLDivElement>(null);
  const logoutRef = useRef<HTMLDivElement>(null);

  // Fetch on mount and whenever the dropdown is opened.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (notifState.status !== "ready") {
        setNotifState({ status: "loading" });
      }
      try {
        const res  = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { ok?: boolean; count?: number; items?: NotifItem[] };
        if (!cancelled) {
          setNotifState({
            status: "ready",
            count:  typeof data.count === "number" ? data.count : 0,
            items:  Array.isArray(data.items) ? data.items : [],
          });
        }
      } catch {
        if (!cancelled) setNotifState({ status: "error", message: "Gagal memuat notifikasi." });
      }
    };

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  useEffect(() => {
    if (!notifOpen && !logoutOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (notifOpen  && !notifRef.current?.contains(e.target as Node))  setNotifOpen(false);
      if (logoutOpen && !logoutRef.current?.contains(e.target as Node)) setLogoutOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setNotifOpen(false); setLogoutOpen(false); }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifOpen, logoutOpen]);

  const handleLogout = () => {
    simulateLogout();
    window.location.href = "/";
  };

  const toggleTheme = () => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      applyTheme(next);
      try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* private browsing */ }
      return next;
    });
  };

  const badgeCount = notifState.status === "ready" ? notifState.count : 0;

  return (
    <div className="fixed right-4 top-4 z-30 hidden items-center gap-1.5 lg:right-6 lg:flex">

      {/* Language toggle */}
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

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
        title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
        className={ICON_BTN}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Notifications bell */}
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
          {badgeCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-glow px-1 text-[9px] font-bold leading-none text-bg">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-[calc(100%+0.5rem)] w-80 overflow-hidden rounded-lg border border-white/10 bg-bg-surface shadow-tactical">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-ink">
                Notifikasi
              </span>
              <span className="text-[10px] uppercase tracking-wider text-ink-subtle">
                {notifState.status === "ready"
                  ? `${notifState.count} item`
                  : "Memuat…"}
              </span>
            </div>

            {/* Loading */}
            {notifState.status === "loading" && (
              <div className="px-3.5 py-6 text-center text-[11px] text-ink-subtle">
                Memuat notifikasi…
              </div>
            )}

            {/* Error */}
            {notifState.status === "error" && (
              <div className="px-3.5 py-6 text-center text-[11px] leading-snug text-ink-muted">
                {notifState.message}
                <br />Coba lagi beberapa saat.
              </div>
            )}

            {/* Empty */}
            {notifState.status === "ready" && notifState.items.length === 0 && (
              <div className="px-3.5 py-6 text-center text-[11px] leading-snug text-ink-muted">
                Tidak ada notifikasi aktif.
              </div>
            )}

            {/* Items */}
            {notifState.status === "ready" && notifState.items.length > 0 && (
              <ul className="max-h-80 overflow-y-auto divide-y divide-white/5">
                {notifState.items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => setNotifOpen(false)}
                      className="flex items-start gap-2.5 px-3.5 py-2.5 transition hover:bg-white/5"
                    >
                      {typeIcon(n.type)}
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-ink">{n.title}</div>
                        <div className="mt-0.5 text-[11px] leading-snug text-ink-muted line-clamp-2">
                          {n.message}
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-subtle">
                          {relativeTime(n.created_at)}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Logout */}
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
              Sesi akan dihapus dan kamu akan kembali ke beranda.
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
