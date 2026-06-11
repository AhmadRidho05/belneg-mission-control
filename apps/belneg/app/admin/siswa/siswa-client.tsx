"use client";

import { useState } from "react";
import {
  ChevronDown, GraduationCap, Users, BookOpen, BarChart3,
  Award, TrendingUp, UserCheck, Sparkles, School,
} from "lucide-react";
import type { SiswaStats } from "./admin-stats";

// ─────────────────────────────────────────────────────────────────────────
// Accordion
// ─────────────────────────────────────────────────────────────────────────
function Accordion({
  icon: Icon, title, subtitle, defaultOpen = false, children,
}: {
  icon: any; title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-white/8 bg-[#0a1325]/60 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className="text-amber-400" />
          <div className="text-left">
            <div className="text-sm font-semibold text-ink">{title}</div>
            {subtitle && <div className="text-[11px] text-ink-subtle mt-0.5">{subtitle}</div>}
          </div>
        </div>
        <ChevronDown size={16} className={`text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5 border-t border-white/5 pt-5 space-y-6">{children}</div>}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────
const STAT_ACCENTS = {
  amber:   "bg-amber-500/10 text-amber-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
  sky:     "bg-sky-500/10 text-sky-400",
  violet:  "bg-violet-500/10 text-violet-400",
} as const;

function StatCard({
  icon: Icon, label, value, sub, accent = "amber",
}: {
  icon: any; label: string; value: string | number; sub?: string; accent?: keyof typeof STAT_ACCENTS;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#0a1325]/60 p-4 flex items-start gap-3 hover:border-white/15 transition">
      <div className={`shrink-0 rounded-lg p-2.5 ${STAT_ACCENTS[accent]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{label}</div>
        <div className="text-xl font-bold text-ink mt-0.5 truncate">
          {typeof value === "number" ? value.toLocaleString("id-ID") : value}
        </div>
        {sub && <div className="text-[11px] text-ink-subtle mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────
// Siswa LMS Terdaftar
// ─────────────────────────────────────────────────────────────────────────
function UsersSection({ stats }: { stats: SiswaStats }) {
  return (
    <div className="overflow-x-auto rounded border border-white/8">
      <table className="w-full text-xs">
        <thead className="bg-white/[0.02] text-ink-subtle uppercase text-[10px]">
          <tr>
            <th className="text-left px-3 py-2">Nama</th>
            <th className="text-left px-3 py-2">Email</th>
            <th className="text-left px-3 py-2">No. HP</th>
            <th className="px-3 py-2 text-center">Status</th>
            <th className="px-3 py-2 text-right">Enrollment</th>
            <th className="text-left px-3 py-2">Bergabung</th>
          </tr>
        </thead>
        <tbody>
          {stats.users.map(u => (
            <tr key={u.id} className="border-t border-white/5 hover:bg-white/[0.02]">
              <td className="px-3 py-2 text-ink font-medium">{u.fullname}</td>
              <td className="px-3 py-2 text-ink-muted">{u.email}</td>
              <td className="px-3 py-2 text-ink-muted">{u.phone ?? "—"}</td>
              <td className="px-3 py-2 text-center">
                <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border ${
                  u.isActive
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-white/5 text-ink-subtle border-white/10"
                }`}>
                  {u.isActive ? "Aktif" : "Nonaktif"}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-amber-400 font-mono">{u.n_enrollments}</td>
              <td className="px-3 py-2 text-ink-subtle">{formatDate(u.createdAt)}</td>
            </tr>
          ))}
          {stats.users.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-ink-subtle">Belum ada user LMS</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Program LMS
// ─────────────────────────────────────────────────────────────────────────
function ProgramSection({ stats }: { stats: SiswaStats }) {
  const now = new Date();

  function regStatus(start: string | null, end: string | null): "open" | "soon" | "closed" {
    if (!start || !end) return "closed";
    const s = new Date(start), e = new Date(end);
    if (now < s) return "soon";
    if (now > e) return "closed";
    return "open";
  }

  const REG_BADGE: Record<"open" | "soon" | "closed", string> = {
    open:   "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    soon:   "bg-sky-500/15 text-sky-300 border-sky-500/30",
    closed: "bg-white/5 text-ink-subtle border-white/10",
  };
  const REG_LABEL = { open: "Buka", soon: "Segera", closed: "Tutup" };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {stats.programs.map(p => {
        const st = regStatus(p.registrationStartDate, p.registrationEndDate);
        const fillPct = p.maxParticipants && p.maxParticipants > 0
          ? Math.round((p.n_accepted / p.maxParticipants) * 100)
          : null;
        return (
          <div key={p.id} className="rounded-lg border border-white/8 bg-white/[0.015] p-4 flex flex-col gap-2">
            <div className="flex justify-between items-start gap-2">
              <div className="text-xs font-semibold text-ink leading-tight">{p.name}</div>
              <div className="flex flex-col items-end gap-1">
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${REG_BADGE[st]}`}>
                  {REG_LABEL[st]}
                </span>
                {!p.isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-white/5 text-ink-subtle border-white/10">
                    Nonaktif
                  </span>
                )}
              </div>
            </div>
            <div className="text-[10px] text-ink-subtle space-y-0.5">
              {p.registrationEndDate && (
                <div>Reg. tutup: {formatDate(p.registrationEndDate)}</div>
              )}
              {p.programEndDate && (
                <div>Program s/d: {formatDate(p.programEndDate)}</div>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] flex-wrap">
              <span className="text-amber-400 font-mono">{p.n_pending}</span>
              <span className="text-ink-subtle">pending</span>
              <span className="text-emerald-400 font-mono">{p.n_accepted}</span>
              <span className="text-ink-subtle">diterima</span>
              <span className="text-red-400 font-mono">{p.n_rejected}</span>
              <span className="text-ink-subtle">ditolak</span>
              {p.maxParticipants && (
                <span className="ml-auto text-ink-subtle">
                  /{p.maxParticipants.toLocaleString("id-ID")} slot
                </span>
              )}
            </div>
            {fillPct !== null && (
              <div>
                <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400/70 rounded-full"
                    style={{ width: `${Math.min(100, fillPct)}%` }}
                  />
                </div>
                <div className="text-[10px] text-ink-subtle mt-0.5">{fillPct}% slot terisi</div>
              </div>
            )}
          </div>
        );
      })}
      {stats.programs.length === 0 && (
        <div className="col-span-3 text-center py-8 text-ink-subtle text-sm">Belum ada program</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Enrollment Kursus LMS
// ─────────────────────────────────────────────────────────────────────────
function EnrollmentSection({ stats }: { stats: SiswaStats }) {
  return (
    <div className="overflow-x-auto rounded border border-white/8">
      <table className="w-full text-xs">
        <thead className="bg-white/[0.02] text-ink-subtle uppercase text-[10px]">
          <tr>
            <th className="text-left px-3 py-2">Kursus</th>
            <th className="px-3 py-2 text-right">Terdaftar</th>
            <th className="px-3 py-2 text-right">Selesai</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right w-24">Completion</th>
          </tr>
        </thead>
        <tbody>
          {stats.enrollment_by_course.map(c => (
            <tr key={c.course_id} className="border-t border-white/5 hover:bg-white/[0.02]">
              <td className="px-3 py-2 text-ink truncate max-w-[320px]">{c.title}</td>
              <td className="px-3 py-2 text-right text-amber-400 font-mono">{c.n_enrolled}</td>
              <td className="px-3 py-2 text-right text-emerald-400 font-mono">{c.n_completed}</td>
              <td className="px-3 py-2 text-right text-ink-muted font-mono">{c.total_enrollments}</td>
              <td className="px-3 py-2 text-right">
                <span className={
                  c.completion_rate >= 50 ? "text-emerald-400"
                  : c.completion_rate >= 20 ? "text-amber-400"
                  : "text-ink-subtle"
                }>
                  {c.completion_rate}%
                </span>
              </td>
            </tr>
          ))}
          {stats.enrollment_by_course.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-ink-subtle">Belum ada enrollment</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Organisasi LMS
// ─────────────────────────────────────────────────────────────────────────
function OrgsSection({ stats }: { stats: SiswaStats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {stats.organizations.map(o => (
        <div key={o.id} className="rounded-lg border border-white/8 bg-white/[0.015] p-4 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-ink">{o.name}</div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
              o.isActive
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : "bg-white/5 text-ink-subtle border-white/10"
            }`}>
              {o.isActive ? "Aktif" : "Nonaktif"}
            </span>
          </div>
          <div className="flex gap-4 text-[11px]">
            <div>
              <span className="text-amber-400 font-mono">{o.n_courses}</span>
              {" "}<span className="text-ink-subtle">kursus</span>
            </div>
            <div>
              <span className="text-sky-400 font-mono">{o.n_programs}</span>
              {" "}<span className="text-ink-subtle">program</span>
            </div>
          </div>
        </div>
      ))}
      {stats.organizations.length === 0 && (
        <div className="col-span-3 text-center py-8 text-ink-subtle text-sm">Belum ada organisasi</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
export default function SiswaClient({ stats }: { stats: SiswaStats }) {
  const totalEnrollDisplay = stats.enrollment_by_course.reduce(
    (s, c) => s + c.total_enrollments, 0
  );

  return (
    <div className="px-5 py-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-center gap-3">
        <GraduationCap className="text-amber-400" size={26} />
        <div>
          <h1 className="text-xl font-bold text-ink">Siswa KKRI</h1>
          <p className="text-[11px] text-ink-subtle uppercase tracking-widest">
            Dashboard LMS · Manajemen Siswa &amp; Kursus
          </p>
        </div>
      </header>

      {/* Hero stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          icon={Users}     label="User LMS"      value={stats.hero.total_users}
          sub="Terdaftar di platform"
        />
        <StatCard
          icon={School}    label="Sekolah"        value={stats.hero.total_schools.toLocaleString("id-ID")}
          sub="Data referensi nasional"  accent="sky"
        />
        <StatCard
          icon={Sparkles}  label="Program Aktif"  value={stats.hero.active_programs}
          sub={`dari ${stats.programs.length} program`}  accent="violet"
        />
        <StatCard
          icon={BookOpen}  label="Total Kursus"   value={stats.hero.total_courses}
          sub="Semua kursus LMS"  accent="emerald"
        />
        <StatCard
          icon={UserCheck} label="Enrollment"     value={stats.hero.total_enrollments}
          sub={`${stats.hero.total_completed} selesai`}  accent="sky"
        />
        <StatCard
          icon={TrendingUp} label="Completion"    value={`${stats.hero.completion_rate}%`}
          sub={`${stats.hero.total_certificates} sertifikat`}  accent="violet"
        />
      </div>

      {/* Siswa LMS */}
      <Accordion
        icon={Users}
        title="Siswa LMS Terdaftar"
        subtitle={`${stats.users.length} user · ${stats.users.filter(u => u.isActive).length} aktif`}
        defaultOpen={true}
      >
        <UsersSection stats={stats} />
      </Accordion>

      {/* Program LMS */}
      <Accordion
        icon={BarChart3}
        title="Program LMS"
        subtitle={`${stats.hero.active_programs} aktif · ${stats.programs.reduce((s, p) => s + p.n_accepted, 0)} peserta diterima`}
        defaultOpen={true}
      >
        <ProgramSection stats={stats} />
      </Accordion>

      {/* Enrollment Kursus */}
      <Accordion
        icon={BookOpen}
        title="Enrollment Kursus LMS"
        subtitle={`${stats.enrollment_by_course.length} kursus dengan enrollment · ${totalEnrollDisplay} total`}
        defaultOpen={true}
      >
        <EnrollmentSection stats={stats} />
      </Accordion>

      {/* Organisasi */}
      <Accordion
        icon={Award}
        title="Organisasi LMS"
        subtitle={`${stats.organizations.length} organisasi`}
      >
        <OrgsSection stats={stats} />
      </Accordion>
    </div>
  );
}
