"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, User, FileText, Target, Map, GraduationCap, Clock } from "lucide-react";

const TABS = [
  { id: "profile",   label: "Profile",         icon: User },
  { id: "assessment", label: "Assessment",     icon: FileText },
  { id: "gaps",      label: "Skill Gaps",      icon: Target },
  { id: "path",      label: "Learning Path",   icon: Map },
  { id: "progress",  label: "Progress",        icon: GraduationCap },
  { id: "timeline",  label: "Activity Timeline", icon: Clock },
] as const;

export default function SiswaDetailClient({ user, latestAssessment, selfAssessments, learningPath, learningPhases, courseProgress, activityLog, badges }: any) {
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("profile");

  const completed = courseProgress.filter((p: any) => p.status === "selesai").length;
  const total = courseProgress.length;

  return (
    <div className="px-5 py-6 space-y-5 max-w-7xl mx-auto">
      <Link href="/admin/siswa" className="text-[11px] text-ink-subtle hover:text-amber-400 flex items-center gap-1"><ChevronLeft size={14}/> kembali ke daftar</Link>

      <header className="rounded-lg border border-white/8 bg-[#0a1325]/60 p-5">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">{user.full_name}</h1>
            <div className="text-xs text-ink-muted mt-1">{user.email}</div>
            <div className="flex flex-wrap gap-3 mt-3 text-[11px]">
              <Chip>{user.school_nama || "(belum ada sekolah)"}</Chip>
              {user.school_class && <Chip>Kelas {user.school_class}</Chip>}
              {user.gender && <Chip>{user.gender === "L" ? "Laki-laki" : "Perempuan"}</Chip>}
              {user.riasec_top_code && <Chip className="text-amber-300">{user.riasec_top_code}</Chip>}
              {user.primary_career_title && <Chip className="text-emerald-300">→ {user.primary_career_title}</Chip>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-ink-subtle">Progress</div>
            <div className="text-2xl font-bold text-amber-400">{completed}<span className="text-sm text-ink-subtle">/{total}</span></div>
            <div className="text-[10px] text-ink-subtle">kursus selesai</div>
          </div>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-white/8 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition ${active ? "border-amber-400 text-amber-300" : "border-transparent text-ink-muted hover:text-ink"}`}>
              <Icon size={13}/> {t.label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-4">
        {tab === "profile"    && <ProfileTab user={user} badges={badges} />}
        {tab === "assessment" && <AssessmentTab latest={latestAssessment} />}
        {tab === "gaps"       && <GapsTab gaps={selfAssessments} />}
        {tab === "path"       && <PathTab path={learningPath} phases={learningPhases} courses={courseProgress} />}
        {tab === "progress"   && <ProgressTab courses={courseProgress} />}
        {tab === "timeline"   && <TimelineTab log={activityLog} />}
      </div>
    </div>
  );
}

function Chip({ children, className = "" }: { children: any; className?: string }) {
  return <span className={`px-2 py-1 rounded border border-white/10 bg-white/[0.02] text-ink-muted ${className}`}>{children}</span>;
}

function ProfileTab({ user, badges }: any) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-white/8 p-4 space-y-2 text-xs">
        <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Profil</h3>
        <Row label="ID">{user.id}</Row>
        <Row label="Tahun Lahir">{user.birth_year}</Row>
        <Row label="Sekolah">{user.school_nama || "—"}</Row>
        <Row label="NPSN">{user.school_npsn || "—"}</Row>
        <Row label="Kab/Kota">{user.kab_kota || "—"}</Row>
        <Row label="Provinsi">{user.provinsi || "—"}</Row>
        <Row label="Created">{user.created_at}</Row>
        <Row label="Last Active">{user.last_active_at || "—"}</Row>
      </div>
      <div className="rounded-lg border border-white/8 p-4">
        <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Badges ({badges.length})</h3>
        {badges.length === 0 ? <div className="text-xs text-ink-subtle">Belum ada badge.</div> : (
          <div className="flex flex-wrap gap-2">
            {badges.map((b: any) => (
              <div key={b.badge_code} className="px-2 py-1 text-[10px] rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">
                {b.badge_code}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssessmentTab({ latest }: { latest: any }) {
  if (!latest) return <Empty>Belum ada asesmen RIASEC.</Empty>;
  const dims = [
    { label: "Realistic (R)",     v: latest.r, color: "#3b82f6" },
    { label: "Investigative (I)", v: latest.i, color: "#10b981" },
    { label: "Artistic (A)",      v: latest.a, color: "#a78bfa" },
    { label: "Social (S)",        v: latest.s, color: "#ec4899" },
    { label: "Enterprising (E)",  v: latest.e, color: "#f59e0b" },
    { label: "Conventional (C)",  v: latest.c, color: "#0ea5e9" },
  ];
  return (
    <div className="rounded-lg border border-white/8 p-4 space-y-3 text-xs">
      <div className="flex justify-between items-baseline">
        <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle">Skor RIASEC</h3>
        <span className="font-mono text-amber-300 text-sm">{latest.top_code}</span>
      </div>
      <div className="space-y-2">
        {dims.map(d => (
          <div key={d.label}>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-ink-muted">{d.label}</span>
              <span className="font-mono text-ink">{d.v}/100</span>
            </div>
            <div className="h-2 bg-white/[0.03] rounded overflow-hidden">
              <div className="h-full rounded" style={{ width: `${d.v}%`, background: d.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-ink-subtle pt-2">Submitted: {latest.submitted_at}</div>
    </div>
  );
}

function GapsTab({ gaps }: { gaps: any[] }) {
  if (gaps.length === 0) return <Empty>Belum ada self-assessment.</Empty>;
  const grouped = { critical: [] as any[], moderate: [] as any[], minimal: [] as any[] };
  for (const g of gaps) grouped[g.gap_category as keyof typeof grouped]?.push(g);
  return (
    <div className="space-y-4">
      {(["critical","moderate","minimal"] as const).map(cat => (
        <div key={cat} className="rounded-lg border border-white/8 p-4">
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">
            {cat === "critical" ? "Kritis" : cat === "moderate" ? "Sedang" : "Minim"} ({grouped[cat].length})
          </h3>
          <div className="space-y-1">
            {grouped[cat].map((g, i) => (
              <div key={i} className="flex justify-between text-xs py-1.5 border-b border-white/5">
                <span className="text-ink-muted">{g.element_name} <span className="text-ink-subtle">[{g.kind}]</span></span>
                <span className="font-mono text-ink">{g.current_level}→{g.target_level} <span className="text-ink-subtle">(gap {g.target_level - g.current_level})</span></span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PathTab({ path, phases, courses }: { path: any; phases: any[]; courses: any[] }) {
  if (!path) return <Empty>Belum ada learning path.</Empty>;
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-ink-subtle">Generated {path.generated_at} · target karier {path.target_career_onet}</div>
      {phases.map(ph => {
        const phCourses = courses.filter(c => c.phase_id === ph.id);
        const done = phCourses.filter(c => c.status === "selesai").length;
        return (
          <div key={ph.id} className="rounded-lg border border-white/8 p-4 space-y-2">
            <div className="flex justify-between items-baseline">
              <h3 className="text-sm font-semibold text-ink">Fase {ph.phase_number} — {ph.title}</h3>
              <span className="text-[11px] text-ink-subtle">{done}/{phCourses.length} selesai · {ph.estimated_weeks}w</span>
            </div>
            <ul className="text-xs space-y-1">
              {phCourses.map(c => (
                <li key={c.course_id} className="flex justify-between gap-3 py-1 border-b border-white/5">
                  <span className="text-ink-muted">{c.title}</span>
                  <span className={`text-[10px] ${c.status === "selesai" ? "text-emerald-400" : c.status === "berproses" ? "text-amber-400" : "text-ink-subtle"}`}>{c.status}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ProgressTab({ courses }: { courses: any[] }) {
  if (courses.length === 0) return <Empty>Belum ada kursus.</Empty>;
  const byStatus = { selesai: 0, berproses: 0, belum: 0, lompati: 0 } as Record<string, number>;
  for (const c of courses) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Selesai"  value={byStatus.selesai}  color="text-emerald-400" />
        <SummaryCard label="Berproses" value={byStatus.berproses} color="text-amber-400" />
        <SummaryCard label="Belum"     value={byStatus.belum}     color="text-ink-muted" />
        <SummaryCard label="Lompati"   value={byStatus.lompati}   color="text-ink-subtle" />
      </div>
      <div className="rounded-lg border border-white/8 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-white/[0.02] text-ink-subtle uppercase text-[10px]">
            <tr><th className="text-left px-3 py-2">Title</th><th className="text-left px-3 py-2">Provider</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Selesai</th></tr>
          </thead>
          <tbody>
            {courses.map(c => (
              <tr key={c.course_id} className="border-t border-white/5">
                <td className="px-3 py-1.5 text-ink-muted truncate max-w-[280px]" title={c.title}>{c.title}</td>
                <td className="px-3 py-1.5 text-ink-subtle truncate max-w-[160px]" title={c.provider}>{c.provider}</td>
                <td className={`px-3 py-1.5 text-center text-[11px] ${c.status === "selesai" ? "text-emerald-400" : c.status === "berproses" ? "text-amber-400" : "text-ink-subtle"}`}>{c.status}</td>
                <td className="px-3 py-1.5 text-ink-subtle text-[10px]">{c.completed_at?.slice(0,10) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimelineTab({ log }: { log: any[] }) {
  if (log.length === 0) return <Empty>Belum ada aktivitas.</Empty>;
  return (
    <div className="rounded-lg border border-white/8 p-4">
      <ul className="text-xs space-y-1.5">
        {log.map((l, i) => (
          <li key={i} className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-ink-muted">{l.activity_type} {l.ref_id ? <span className="text-ink-subtle">· {l.ref_id}</span> : null}</span>
            <span className="text-[10px] text-ink-subtle">{l.created_at}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-ink text-right truncate max-w-[60%]">{children}</span>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded border border-white/8 p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-ink-subtle mt-1">{label}</div>
    </div>
  );
}

function Empty({ children }: { children: any }) {
  return <div className="text-center py-12 text-ink-subtle text-xs">{children}</div>;
}
