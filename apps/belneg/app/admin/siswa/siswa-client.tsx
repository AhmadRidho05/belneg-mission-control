"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ChevronDown, GraduationCap, Sparkles, Users, BarChart3, Search, Loader2, RefreshCw,
  UserCheck, Award, TrendingUp, AlertCircle, Inbox, X,
} from "lucide-react";
import {
  DoughnutChart, HBarChart, ProvinsiBarChart, TrendLaporanPesertaChart,
} from "../users/admin-charts";
import { fmt, prettyProv } from "@/lib/utils";
import type { SiswaStats } from "./admin-stats";

// ─────────────────────────────────────────────────────────────────────────
// Accordion primitive — native <details> with custom chevron
// ─────────────────────────────────────────────────────────────────────────
function Accordion({ icon: Icon, title, subtitle, defaultOpen = false, children }: { icon: any; title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode }) {
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
// Hero KPI grid
// ─────────────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/8 p-4">
      <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{label}</div>
      <div className="text-2xl font-bold text-amber-400 mt-1.5">{typeof value === "number" ? value.toLocaleString("id-ID") : value}</div>
      {sub && <div className="text-[11px] text-ink-subtle mt-1">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Top-level stat card — kkri.id-style at-a-glance KPI tile
// ─────────────────────────────────────────────────────────────────────────
const STAT_ACCENTS = {
  amber:   "bg-amber-500/10 text-amber-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
  sky:     "bg-sky-500/10 text-sky-400",
  violet:  "bg-violet-500/10 text-violet-400",
} as const;

function StatCard({ icon: Icon, label, value, sub, accent = "amber" }: { icon: any; label: string; value: string | number; sub?: string; accent?: keyof typeof STAT_ACCENTS }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#0a1325]/60 p-4 flex items-start gap-3 hover:border-white/15 transition">
      <div className={`shrink-0 rounded-lg p-2.5 ${STAT_ACCENTS[accent]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{label}</div>
        <div className="text-xl font-bold text-ink mt-0.5 truncate">{value}</div>
        {sub && <div className="text-[11px] text-ink-subtle mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Simple radar chart — 6-dim RIASEC, supports multi-series
// ─────────────────────────────────────────────────────────────────────────
function RiasecRadar({ series, max = 100 }: { series: { name: string; color: string; values: { R: number; I: number; A: number; S: number; E: number; C: number } }[]; max?: number }) {
  const dims: (keyof typeof series[0]["values"])[] = ["R", "I", "A", "S", "E", "C"];
  const labels = { R: "Realistic", I: "Investigative", A: "Artistic", S: "Social", E: "Enterprising", C: "Conventional" };
  const cx = 150, cy = 150, R = 100;
  const angleFor = (i: number) => (Math.PI * 2 * i) / 6 - Math.PI / 2;
  const point = (i: number, v: number) => {
    const a = angleFor(i);
    const r = (v / max) * R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  return (
    <div className="flex flex-col items-center">
      <svg width={300} height={300} viewBox="0 0 300 300">
        {/* Grid rings */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <polygon key={f} fill="none" stroke="#5d6a85" strokeWidth={0.5} opacity={0.4}
            points={dims.map((_, i) => point(i, max * f).join(",")).join(" ")} />
        ))}
        {/* Axis lines */}
        {dims.map((_, i) => {
          const [x, y] = point(i, max);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#5d6a85" strokeWidth={0.5} opacity={0.4} />;
        })}
        {/* Dim labels */}
        {dims.map((d, i) => {
          const [x, y] = point(i, max * 1.18);
          return <text key={d} x={x} y={y} fill="#9aa6bd" fontSize={10} textAnchor="middle" dy={4}>{d}</text>;
        })}
        {/* Series polygons */}
        {series.map((s, si) => (
          <g key={si}>
            <polygon fill={s.color} fillOpacity={0.20} stroke={s.color} strokeWidth={1.5}
              points={dims.map((d, i) => point(i, s.values[d]).join(",")).join(" ")} />
          </g>
        ))}
      </svg>
      <div className="flex gap-3 mt-2 flex-wrap justify-center text-[10px]">
        {series.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} />
            <span className="text-ink-muted">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Funnel chart — vertical bars with conversion %
// ─────────────────────────────────────────────────────────────────────────
function FunnelChart({ steps }: { steps: { label: string; n: number }[] }) {
  const max = steps[0]?.n || 1;
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const pct = (s.n / max) * 100;
        const prev = i > 0 ? steps[i - 1].n : null;
        const conv = prev != null && prev > 0 ? Math.round((s.n / prev) * 100) : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-44 text-xs text-ink-muted text-right">{s.label}</div>
            <div className="flex-1 h-7 bg-white/[0.03] rounded relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-amber-400/70 rounded" style={{ width: `${pct}%` }} />
              <div className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white">{s.n.toLocaleString("id-ID")}</div>
            </div>
            <div className="w-14 text-[11px] text-right">
              {conv != null && <span className={conv > 50 ? "text-emerald-400" : conv > 25 ? "text-amber-400" : "text-red-400"}>{conv}%</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Heatmap — generic for RIASEC×provinsi
// ─────────────────────────────────────────────────────────────────────────
function HeatmapRiasecProvince({ rows }: { rows: { provinsi: string; R: number; I: number; A: number; S: number; E: number; C: number; n: number }[] }) {
  const dims = ["R", "I", "A", "S", "E", "C"] as const;
  const cellColor = (v: number) => {
    const f = Math.min(1, v / 80);
    const r = Math.round(245 * f + 22 * (1 - f));
    const g = Math.round(166 * f + 30 * (1 - f));
    const b = Math.round(35  * f + 50 * (1 - f));
    return `rgb(${r},${g},${b})`;
  };
  return (
    <div className="text-xs overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left text-ink-subtle font-medium pb-2 pr-3">Provinsi</th>
            {dims.map(d => <th key={d} className="text-ink-subtle font-medium pb-2 px-1.5">{d}</th>)}
            <th className="text-right text-ink-subtle font-medium pb-2 pl-3">n</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.provinsi}>
              <td className="py-1 pr-3 text-ink-muted truncate max-w-[180px]" title={r.provinsi}>{r.provinsi}</td>
              {dims.map(d => (
                <td key={d} className="px-1.5 py-1">
                  <div className="w-9 h-7 rounded flex items-center justify-center text-[10px] text-white"
                       style={{ background: cellColor(Number(r[d])) }}>
                    {r[d]}
                  </div>
                </td>
              ))}
              <td className="text-right pl-3 text-ink-subtle">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main client
// ─────────────────────────────────────────────────────────────────────────
export default function SiswaClient({ stats }: { stats: SiswaStats }) {
  return (
    <div className="px-5 py-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-center gap-3">
        <GraduationCap className="text-amber-400" size={26} />
        <div>
          <h1 className="text-xl font-bold text-ink">Siswa KKRI</h1>
          <p className="text-[11px] text-ink-subtle uppercase tracking-widest">Pencari Arah · Manajemen Akun Siswa</p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users}      label="Total Siswa"     value={fmt(stats.hero.total_users)} sub={`+${fmt(stats.hero.new_users_30d)} bulan ini`} />
        <StatCard icon={UserCheck}  label="Siswa Aktif"     value={fmt(stats.hero.mau)}          sub="Aktif 30 hari terakhir" accent="emerald" />
        <StatCard icon={Award}      label="Asesmen Selesai" value={fmt(stats.hero.assessments_done)} sub={`${fmt(stats.hero.paths_generated)} learning path dibuat`} accent="sky" />
        <StatCard icon={TrendingUp} label="Avg Readiness"   value={`${stats.hero.avg_readiness_score}%`} sub="Selesai ≥1 kursus" accent="violet" />
      </div>

      <SiswaTable provinsiOptions={stats.geographic.by_provinsi} />

      <Accordion icon={BarChart3} title="Key Statistics" subtitle={`${stats.hero.total_users.toLocaleString("id-ID")} total siswa`}>
        <KeyStatistics stats={stats} />
      </Accordion>

      <Accordion icon={Sparkles} title="Insights Asesmen & Profesi" subtitle={`${stats.hero.assessments_done} asesmen · ${stats.career.top_primary.length} karier target`}>
        <Insights stats={stats} />
      </Accordion>

      <Accordion icon={Sparkles} title="AI Recommendations" subtitle="On-demand · ditenagai Claude Sonnet">
        <AiRecommendations />
      </Accordion>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Accordion 1 — Key Statistics
// ─────────────────────────────────────────────────────────────────────────
function KeyStatistics({ stats }: { stats: SiswaStats }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total Siswa" value={stats.hero.total_users} sub={`+${stats.hero.new_users_30d} bulan ini`} />
        <Kpi label="DAU"  value={stats.hero.dau}  sub="Aktif hari ini" />
        <Kpi label="WAU"  value={stats.hero.wau}  sub="Aktif 7 hari" />
        <Kpi label="MAU"  value={stats.hero.mau}  sub="Aktif 30 hari" />
        <Kpi label="Asesmen Selesai"     value={stats.hero.assessments_done} />
        <Kpi label="Learning Path"       value={stats.hero.paths_generated} sub="Total digenerate" />
        <Kpi label="Kursus Selesai"      value={stats.hero.courses_completed} />
        <Kpi label="Avg Readiness"       value={`${stats.hero.avg_readiness_score}%`} sub="% siswa yang selesai ≥1 kursus" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Sebaran Provinsi (top 10)</h3>
          <ProvinsiBarChart data={stats.geographic.by_provinsi.slice(0, 10)} />
        </div>
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Kabupaten/Kota Teratas (top 10)</h3>
          <HBarChart data={stats.geographic.by_kab.slice(0, 10).map(r => ({ name: r.name, n: r.n }))} valueKey="n" labelKey="name" />
        </div>
      </div>

      <div>
        <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Sekolah dengan Siswa Terbanyak (top 20)</h3>
        <HBarChart
          data={stats.geographic.by_school.slice(0, 20).map(r => ({ name: `${r.nama} · ${r.provinsi}`, n: r.n }))}
          valueKey="n" labelKey="name" height={520}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Sign-up Trend (90 hari)</h3>
          <TrendLaporanPesertaChart data={stats.trend.signup_90d.map(d => ({ week: d.date.slice(5), laporan: d.n, peserta: 0 }))} />
        </div>
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Daily Active Users (90 hari)</h3>
          <TrendLaporanPesertaChart data={stats.trend.dau_90d.map(d => ({ week: d.date.slice(5), laporan: d.n, peserta: 0 }))} />
        </div>
      </div>

      <div>
        <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Funnel Konversi</h3>
        <FunnelChart steps={[
          { label: "Sign-up",           n: stats.funnel.signup },
          { label: "Selesai Asesmen",    n: stats.funnel.assessment_done },
          { label: "Pilih Karier",       n: stats.funnel.career_picked },
          { label: "Self-Assessment",    n: stats.funnel.self_assess_done },
          { label: "Path Digenerate",    n: stats.funnel.path_generated },
          { label: "Mulai Kursus",       n: stats.funnel.first_course_started },
          { label: "Selesai Kursus",     n: stats.funnel.first_course_completed },
        ]} />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Accordion 2 — Insights
// ─────────────────────────────────────────────────────────────────────────
function Insights({ stats }: { stats: SiswaStats }) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Rata-rata Skor RIASEC (semua siswa)</h3>
          <DoughnutChart data={[
            { name: "Realistic",     n: stats.riasec.avg_per_dim.R },
            { name: "Investigative", n: stats.riasec.avg_per_dim.I },
            { name: "Artistic",      n: stats.riasec.avg_per_dim.A },
            { name: "Social",        n: stats.riasec.avg_per_dim.S },
            { name: "Enterprising",  n: stats.riasec.avg_per_dim.E },
            { name: "Conventional",  n: stats.riasec.avg_per_dim.C },
          ]} />
        </div>
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Top 10 Kode RIASEC</h3>
          <HBarChart data={stats.riasec.top_codes} valueKey="n" labelKey="code" height={320} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-lg border border-white/8 p-4">
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2 text-center">RIASEC by Gender</h3>
          <RiasecRadar series={stats.riasec.by_gender.map(g => ({
            name: g.gender === "L" ? "Laki-laki" : "Perempuan",
            color: g.gender === "L" ? "#3b82f6" : "#ec4899",
            values: { R: g.R, I: g.I, A: g.A, S: g.S, E: g.E, C: g.C },
          }))} />
        </div>
        <div className="rounded-lg border border-white/8 p-4">
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2 text-center">RIASEC by Kelas</h3>
          <RiasecRadar series={stats.riasec.by_class.map((c, i) => ({
            name: `Kelas ${c.school_class}`,
            color: ["#10b981", "#f59e0b", "#a78bfa"][i] || "#9aa6bd",
            values: { R: c.R, I: c.I, A: c.A, S: c.S, E: c.E, C: c.C },
          }))} />
        </div>
      </div>

      <div>
        <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Heatmap RIASEC × Provinsi (top 10)</h3>
        <HeatmapRiasecProvince rows={stats.riasec.by_provinsi} />
      </div>

      <div>
        <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Karier Target Terpopuler (top 20)</h3>
        <HBarChart data={stats.career.top_primary.map(r => ({ name: r.title, n: r.n }))} valueKey="n" labelKey="name" height={520} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Karier Terpopuler / Provinsi</h3>
          <div className="text-xs space-y-1 max-h-80 overflow-y-auto">
            {stats.career.top_per_provinsi.map((r, i) => (
              <div key={i} className="flex justify-between gap-3 py-1 border-b border-white/5">
                <span className="text-ink-muted truncate" title={r.provinsi}>{r.provinsi}</span>
                <span className="text-ink text-right truncate" title={r.title}>{r.title}</span>
                <span className="text-amber-400 font-mono">{r.n}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Karier Terpopuler / Gender</h3>
          <div className="text-xs space-y-1 max-h-80 overflow-y-auto">
            {stats.career.top_per_gender.map((r, i) => (
              <div key={i} className="flex justify-between gap-3 py-1 border-b border-white/5">
                <span className="text-ink-muted">{r.gender === "L" ? "Laki-laki" : "Perempuan"}</span>
                <span className="text-ink text-right truncate" title={r.title}>{r.title}</span>
                <span className="text-amber-400 font-mono">{r.n}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Karier per Kode RIASEC</h3>
          <div className="text-xs space-y-1 max-h-80 overflow-y-auto">
            {stats.career.top_per_top_code.map((r, i) => (
              <div key={i} className="flex justify-between gap-3 py-1 border-b border-white/5">
                <span className="text-ink-muted font-mono">{r.top_code}</span>
                <span className="text-ink text-right truncate" title={r.title}>{r.title}</span>
                <span className="text-amber-400 font-mono">{r.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Accordion 3 — AI Recommendations
// ─────────────────────────────────────────────────────────────────────────
function AiRecommendations() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/siswa/recommendations", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading) {
    return (
      <div className="text-center py-8 space-y-3">
        <Sparkles className="mx-auto text-amber-400" size={28} />
        <div className="text-sm text-ink-muted">Tekan tombol untuk meminta Claude Sonnet mengamati snapshot stats di atas dan menyarankan 3 aksi konkret.</div>
        <button onClick={generate} className="mt-2 px-4 py-2 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/30 transition">
          Generate Rekomendasi
        </button>
        {error && <div className="text-xs text-red-400 mt-2">Error: {error}</div>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8 space-y-3">
        <Loader2 className="mx-auto text-amber-400 animate-spin" size={28} />
        <div className="text-sm text-ink-muted">Claude Sonnet sedang berpikir… (10–30 detik)</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-[11px] text-ink-subtle">
          Generated {new Date(data.generated_at).toLocaleString("id-ID")} ·
          {data.cached ? " from cache" : ` ${data.tokens?.input || "?"} in / ${data.tokens?.output || "?"} out`}
        </div>
        <button onClick={generate} className="text-[11px] text-ink-subtle hover:text-amber-400 flex items-center gap-1">
          <RefreshCw size={12} /> Force regenerate
        </button>
      </div>
      <div className="space-y-3">
        {(data.recommendations || []).map((r: any, i: number) => (
          <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-4">
            <div className="text-sm font-semibold text-amber-300 mb-1">{i + 1}. {r.title}</div>
            <div className="text-xs text-ink-muted mb-2">{r.rationale}</div>
            <ul className="text-xs text-ink-muted space-y-1">
              {(r.action_steps || []).map((s: string, si: number) => <li key={si}>→ {s}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Siswa data shape — normalized for the admin table (kkri.id-ready)
// ─────────────────────────────────────────────────────────────────────────
type RegistrationStatus = "aktif" | "belum_aktif" | "tidak_aktif" | "nonaktif";

type SiswaRow = {
  id: string;
  student_name: string;
  email_or_phone: string;
  school_name: string | null;
  npsn: string | null;
  province: string | null;
  city: string | null;
  registration_status: RegistrationStatus;
  learning_progress: number;
  registered_at: string | null;
  gender: "L" | "P" | null;
  school_class: string | null;
  riasec_top_code: string | null;
  primary_career_title: string | null;
};

function toSiswaRow(r: any): SiswaRow {
  let registration_status: RegistrationStatus = "belum_aktif";
  if (!r.is_active) {
    registration_status = "nonaktif";
  } else if (r.last_active_at) {
    const days = (Date.now() - new Date(`${r.last_active_at}Z`).getTime()) / 86400000;
    registration_status = days <= 30 ? "aktif" : "tidak_aktif";
  }
  const completed = Number(r.courses_completed) || 0;
  const total = Number(r.courses_total) || 0;
  return {
    id: r.id,
    student_name: r.full_name || "Tanpa Nama",
    email_or_phone: r.email || "—",
    school_name: r.school_nama ?? null,
    npsn: r.npsn ?? null,
    province: r.provinsi ?? null,
    city: r.kab_kota ?? null,
    registration_status,
    learning_progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    registered_at: r.created_at ?? null,
    gender: r.gender ?? null,
    school_class: r.school_class ?? null,
    riasec_top_code: r.riasec_top_code ?? null,
    primary_career_title: r.primary_career_title ?? null,
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_META: Record<RegistrationStatus, { label: string; className: string }> = {
  aktif:       { label: "Aktif",       className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  belum_aktif: { label: "Belum Aktif", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  tidak_aktif: { label: "Tidak Aktif", className: "bg-white/5 text-ink-subtle border-white/10" },
  nonaktif:    { label: "Nonaktif",    className: "bg-red-500/15 text-red-300 border-red-500/30" },
};

function StatusBadge({ status }: { status: RegistrationStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-block whitespace-nowrap px-2 py-0.5 text-[10px] font-medium rounded-full border ${m.className}`}>{m.label}</span>;
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${v}%` }} />
      </div>
      <span className="text-[10px] text-ink-subtle tabular-nums w-8 text-right">{v}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Loading / error / empty states
// ─────────────────────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="rounded border border-white/8 divide-y divide-white/5 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-3 py-3 flex items-center gap-4 animate-pulse">
          <div className="h-3 bg-white/5 rounded w-1/5" />
          <div className="h-3 bg-white/5 rounded w-1/5" />
          <div className="h-3 bg-white/5 rounded w-1/6" />
          <div className="h-3 bg-white/5 rounded w-16" />
          <div className="h-3 bg-white/5 rounded flex-1" />
          <div className="h-3 bg-white/5 rounded w-16" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="text-center py-10 space-y-3 rounded border border-red-500/20 bg-red-500/[0.03]">
      <AlertCircle className="mx-auto text-red-400" size={28} />
      <div className="text-sm text-ink-muted">Gagal memuat data siswa</div>
      <div className="text-[11px] text-ink-subtle">{message}</div>
      <button onClick={onRetry} className="mt-1 px-4 py-1.5 text-xs font-semibold bg-red-500/10 text-red-300 border border-red-500/30 rounded hover:bg-red-500/20 transition">
        Coba Lagi
      </button>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="text-center py-10 space-y-3 rounded border border-white/8 bg-white/[0.01]">
      <Inbox className="mx-auto text-ink-subtle" size={28} />
      <div className="text-sm text-ink-muted">Tidak ada siswa yang cocok dengan filter ini</div>
      <button onClick={onReset} className="mt-1 px-4 py-1.5 text-xs font-semibold bg-white/[0.03] text-ink-muted border border-white/10 rounded hover:border-white/30 transition">
        Reset Filter
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Daftar Siswa — search, filter, table with loading/error/empty states
// ─────────────────────────────────────────────────────────────────────────
function SiswaTable({ provinsiOptions }: { provinsiOptions: { name: string; n: number }[] }) {
  const [rows, setRows] = useState<SiswaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ]                 = useState("");
  const [provinsiFilter, setPF]   = useState("");
  const [genderFilter, setGF]     = useState("");
  const [classFilter, setCF]      = useState("");
  const [hasPathFilter, setHPF]   = useState("");
  const [offset, setOffset]       = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const limit = 50;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const sp = new URLSearchParams({
      ...(q             ? { q } : {}),
      ...(provinsiFilter? { provinsi: provinsiFilter } : {}),
      ...(genderFilter  ? { gender: genderFilter } : {}),
      ...(classFilter   ? { class: classFilter } : {}),
      ...(hasPathFilter ? { has_path: hasPathFilter } : {}),
      limit: String(limit),
      offset: String(offset),
    });
    fetch(`/api/admin/siswa?${sp}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        if (cancelled) return;
        setRows((d.rows || []).map(toSiswaRow));
        setTotal(d.total || 0);
      })
      .catch(e => { if (!cancelled) setError(e?.message || "Tidak dapat terhubung ke server"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [q, provinsiFilter, genderFilter, classFilter, hasPathFilter, offset, reloadKey]);

  const resetFilters = () => {
    setQ(""); setPF(""); setGF(""); setCF(""); setHPF(""); setOffset(0);
  };

  const Chip = ({ value, current, set, label }: { value: string; current: string; set: (v: string) => void; label: string }) => (
    <button
      onClick={() => { set(current === value ? "" : value); setOffset(0); }}
      className={`px-2 py-1 text-[11px] rounded border transition ${current === value ? "bg-amber-500/30 border-amber-400 text-amber-200" : "border-white/10 text-ink-muted hover:border-white/30"}`}
    >{label}</button>
  );

  const hasFilters = !!(q || provinsiFilter || genderFilter || classFilter || hasPathFilter);

  return (
    <section className="rounded-xl border border-white/8 bg-[#0a1325]/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Users size={18} className="text-amber-400" />
          <div>
            <h2 className="text-sm font-semibold text-ink">Daftar Siswa</h2>
            <p className="text-[11px] text-ink-subtle mt-0.5">Cari, filter, dan kelola data siswa terdaftar</p>
          </div>
        </div>
        <div className="text-[11px] text-ink-subtle">
          {loading ? "Memuat…" : `${fmt(total)} siswa ditemukan`}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-2.5 top-2.5 text-ink-subtle" />
            <input value={q} onChange={e => { setQ(e.target.value); setOffset(0); }}
              placeholder="Cari nama, email, atau sekolah" className="w-full pl-8 pr-3 py-2 text-xs bg-white/[0.02] border border-white/10 rounded text-ink placeholder:text-ink-subtle" />
          </div>
          <select value={provinsiFilter} onChange={e => { setPF(e.target.value); setOffset(0); }}
            className="px-3 py-2 text-xs bg-white/[0.02] border border-white/10 rounded text-ink-muted">
            <option value="" className="bg-[#0a1325]">Semua Provinsi</option>
            {provinsiOptions.map(p => (
              <option key={p.name} value={p.name} className="bg-[#0a1325]">{prettyProv(p.name)}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <span className="text-[10px] uppercase text-ink-subtle self-center mr-1">Gender:</span>
            <Chip value="L" current={genderFilter} set={setGF} label="L" />
            <Chip value="P" current={genderFilter} set={setGF} label="P" />
          </div>
          <div className="flex gap-1">
            <span className="text-[10px] uppercase text-ink-subtle self-center mr-1">Kelas:</span>
            {["10","11","12"].map(c => <Chip key={c} value={c} current={classFilter} set={setCF} label={c} />)}
          </div>
          <div className="flex gap-1">
            <span className="text-[10px] uppercase text-ink-subtle self-center mr-1">Path:</span>
            <Chip value="1" current={hasPathFilter} set={setHPF} label="Ada" />
            <Chip value="0" current={hasPathFilter} set={setHPF} label="Belum" />
          </div>
          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-white/10 text-ink-subtle hover:border-white/30 hover:text-ink transition">
              <X size={12} /> Reset
            </button>
          )}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />
        ) : loading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : (
          <div className="overflow-x-auto rounded border border-white/8">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02] text-ink-subtle uppercase text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2">Siswa</th>
                  <th className="text-left px-3 py-2">Sekolah</th>
                  <th className="text-left px-3 py-2">Lokasi</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Progress Belajar</th>
                  <th className="text-left px-3 py-2">Terdaftar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02] cursor-pointer"
                      onClick={() => window.location.href = `/admin/siswa/${r.id}`}>
                    <td className="px-3 py-2">
                      <div className="text-ink font-medium">{r.student_name}</div>
                      <div className="text-[10px] text-ink-subtle">{r.email_or_phone}</div>
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      <div className="truncate max-w-[200px]" title={r.school_name || ""}>{r.school_name || "—"}</div>
                      {r.npsn && <div className="text-[10px] text-ink-subtle">NPSN {r.npsn}</div>}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      <div>{r.city || "—"}</div>
                      <div className="text-[10px] text-ink-subtle">{prettyProv(r.province)}</div>
                    </td>
                    <td className="px-3 py-2 text-center"><StatusBadge status={r.registration_status} /></td>
                    <td className="px-3 py-2"><ProgressBar value={r.learning_progress} /></td>
                    <td className="px-3 py-2 text-ink-subtle text-[10px]">{formatDate(r.registered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!error && (
          <div className="flex justify-between items-center">
            <button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-3 py-1.5 text-xs bg-white/[0.03] border border-white/10 rounded disabled:opacity-30">← Prev</button>
            <span className="text-[11px] text-ink-subtle">Halaman {Math.floor(offset / limit) + 1} / {Math.max(1, Math.ceil(total / limit))}</span>
            <button disabled={loading || offset + limit >= total} onClick={() => setOffset(offset + limit)}
              className="px-3 py-1.5 text-xs bg-white/[0.03] border border-white/10 rounded disabled:opacity-30">Next →</button>
          </div>
        )}
      </div>
    </section>
  );
}
