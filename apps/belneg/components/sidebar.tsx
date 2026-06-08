"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  BarChart3,
  Map,
  Menu,
  X,
  Flame,
  ClipboardList,
  UserCheck,
  Shield,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_QUERY_PARAM, resolveRole, withRole, type WebRole } from "@/lib/roles";

// `roles` restricts a nav entry to specific simulated roles — omit it for
// items every role can see (Home, Visualisasi, Mapping, Assignment, ...).
const NAV: Array<{ href: string; label: string; icon: any; sub: string; roles?: WebRole[] }> = [
  { href: "/dashboard", label: "Home", icon: Home, sub: "Mission Briefing" },
  { href: "/visualisasi", label: "Visualisasi", icon: BarChart3, sub: "Chart Gallery" },
  { href: "/mapping", label: "Mapping", icon: Map, sub: "Tactical Map" },
  { href: "/assignment", label: "Assignment", icon: Flame, sub: "Penugasan Petugas" },
  { href: "/admin/reports", label: "Laporan KKRI", icon: ClipboardList, sub: "Mobile App" },
  { href: "/admin/users", label: "Manage User", icon: UserCheck, sub: "Web Mission Control", roles: ["admin"] },
  { href: "/admin/pembina", label: "Manage Pembina", icon: Shield, sub: "Approval APK", roles: ["admin"] },
  { href: "/admin/siswa", label: "Siswa KKRI", icon: GraduationCap, sub: "Pencari Arah" },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawRole = searchParams.get(ROLE_QUERY_PARAM);
  const role = resolveRole(rawRole);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const NavList = (
    <nav aria-label="Primary" className="space-y-1">
      {NAV.filter(({ roles }) => !roles || roles.includes(role)).map(({ href, label, icon: Icon, sub }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={withRole(href, rawRole)}
            className={cn("nav-link", active && "nav-link-active")}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={16} className="shrink-0" />

            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-medium">{label}</span>
              <span className="text-[10px] uppercase tracking-widest text-ink-subtle">
                {sub}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-bg/80 px-4 py-3 backdrop-blur lg:hidden"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Brand compact />

        <button
          aria-label={open ? "Tutup menu" : "Buka menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md border border-white/10 bg-white/5 p-2 text-ink"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-white/5 bg-bg-soft/60 backdrop-blur-sm lg:flex">
        <div className="shrink-0 border-b border-white/5 p-5">
          <Brand />
        </div>

        <div className="flex-1 overflow-y-auto p-3">{NavList}</div>

        <Footer />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <aside
            className="absolute bottom-0 left-0 top-0 flex w-[80vw] max-w-[18rem] flex-col overflow-y-auto border-r border-white/10 bg-bg-soft p-5"
            style={{
              paddingTop: "max(1.25rem, env(safe-area-inset-top))",
              paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
            }}
          >
            <Brand />

            <div className="mt-6 flex-1">{NavList}</div>

            <Footer />
          </aside>
        </div>
      )}
    </>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white/5 shadow-glow">
        <Image
          src="/logo.png"
          alt="BELNEG Logo"
          width={32}
          height={32}
          className="h-8 w-8 object-contain"
          priority
        />
      </span>

      <div className="leading-tight">
        <div className="font-display text-[13px] font-bold uppercase tracking-[0.18em] text-ink">
          BELNEG
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-accent-glow/80">
          {compact ? "Control" : "Mission Control"}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="shrink-0 border-t border-white/5 p-4 text-[10px] uppercase tracking-widest text-ink-subtle">
      <div>SEKBER DIKMEN 2025</div>
      <div className="mt-0.5 normal-case tracking-normal text-ink-muted">
        Bela Negara Intelligence
      </div>
    </div>
  );
}