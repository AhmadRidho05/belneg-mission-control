"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronDown, GraduationCap, Sparkles, Users, BarChart3, Search, Loader2, RefreshCw } from "lucide-react";
import {
  DoughnutChart, HBarChart, ProvinsiBarChart, TrendLaporanPesertaChart,
} from "../users/admin-charts";
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
type ExplorerRow = {
  id: string; full_name: string; email: string; gender: "L"|"P"|null;
  school_class: string|null; school_nama: string|null; provinsi: string|null;
  riasec_top_code: string|null; primary_career_title: string|null;
  courses_completed: number; last_active_at: string|null;
};

export default function SiswaClient({ stats }: { stats: SiswaStats }) {
  return (
    <div className="px-5 py-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-center gap-3">
        <GraduationCap className="text-amber-400" size={26} />
        <div>
          <h1 className="text-xl font-bold text-ink">Siswa KKRI</h1>
          <p className="text-[11px] text-ink-subtle uppercase tracking-widest">Pencari Arah · Mission Control</p>
        </div>
      </header>

      <Accordion icon={BarChart3} title="Key Statistics" subtitle={`${stats.hero.total_users.toLocaleString("id-ID")} total siswa`} defaultOpen>
        <KeyStatistics stats={stats} />
      </Accordion>

      <Accordion icon={Sparkles} title="Insights Asesmen & Profesi" subtitle={`${stats.hero.assessments_done} asesmen · ${stats.career.top_primary.length} karier target`}>
        <Insights stats={stats} />
      </Accordion>

      <Accordion icon={Sparkles} title="AI Recommendations" subtitle="On-demand · ditenagai Claude Sonnet">
        <AiRecommendations />
      </Accordion>

      <Accordion icon={Users} title="User Explorer" subtitle="Cari, filter, dan drill-down per siswa">
        <UserExplorer />
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
// Accordion 4 — User Explorer
// ─────────────────────────────────────────────────────────────────────────
function UserExplorer() {
  const [rows, setRows] = useState<ExplorerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ]                 = useState("");
  const [provinsiFilter, setPF]   = useState("");
  const [genderFilter, setGF]     = useState("");
  const [classFilter, setCF]      = useState("");
  const [topCodeFilter, setTCF]   = useState("");
  const [hasPathFilter, setHPF]   = useState("");
  const [offset, setOffset]       = useState(0);
  const limit = 50;

  useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams({
      ...(q             ? { q } : {}),
      ...(provinsiFilter? { provinsi: provinsiFilter } : {}),
      ...(genderFilter  ? { gender: genderFilter } : {}),
      ...(classFilter   ? { class: classFilter } : {}),
      ...(topCodeFilter ? { top_code: topCodeFilter } : {}),
      ...(hasPathFilter ? { has_path: hasPathFilter } : {}),
      limit: String(limit),
      offset: String(offset),
    });
    fetch(`/api/admin/siswa?${sp}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [q, provinsiFilter, genderFilter, classFilter, topCodeFilter, hasPathFilter, offset]);

  const Chip = ({ value, current, set, label }: { value: string; current: string; set: (v: string) => void; label: string }) => (
    <button
      onClick={() => set(current === value ? "" : value)}
      className={`px-2 py-1 text-[11px] rounded border transition ${current === value ? "bg-amber-500/30 border-amber-400 text-amber-200" : "border-white/10 text-ink-muted hover:border-white/30"}`}
    >{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-ink-subtle" />
          <input value={q} onChange={e => { setQ(e.target.value); setOffset(0); }}
            placeholder="Cari nama / email / sekolah" className="w-full pl-8 pr-3 py-2 text-xs bg-white/[0.02] border border-white/10 rounded text-ink placeholder:text-ink-subtle" />
        </div>
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
      </div>

      <div className="text-[11px] text-ink-subtle">
        {loading ? "Memuat…" : `${total.toLocaleString("id-ID")} siswa cocok · menampilkan ${rows.length} dari offset ${offset}`}
      </div>

      <div className="overflow-x-auto rounded border border-white/8">
        <table className="w-full text-xs">
          <thead className="bg-white/[0.02] text-ink-subtle uppercase text-[10px]">
            <tr>
              <th className="text-left px-3 py-2">Nama</th>
              <th className="text-left px-3 py-2">Sekolah</th>
              <th className="px-3 py-2">Kelas</th>
              <th className="px-3 py-2">RIASEC</th>
              <th className="text-left px-3 py-2">Karier Target</th>
              <th className="px-3 py-2 text-right">Selesai</th>
              <th className="text-left px-3 py-2">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => window.location.href = `/admin/siswa/${r.id}`}>
                <td className="px-3 py-2 text-ink">{r.full_name}<div className="text-[10px] text-ink-subtle">{r.email}</div></td>
                <td className="px-3 py-2 text-ink-muted truncate max-w-[200px]" title={r.school_nama || ""}>{r.school_nama || "-"}<div className="text-[10px] text-ink-subtle">{r.provinsi}</div></td>
                <td className="px-3 py-2 text-center text-ink-muted">{r.school_class || "-"}</td>
                <td className="px-3 py-2 text-center font-mono text-amber-400">{r.riasec_top_code || "-"}</td>
                <td className="px-3 py-2 text-ink-muted truncate max-w-[200px]" title={r.primary_career_title || ""}>{r.primary_career_title || "-"}</td>
                <td className="px-3 py-2 text-right text-ink-muted">{r.courses_completed}</td>
                <td className="px-3 py-2 text-ink-subtle text-[10px]">{r.last_active_at ? r.last_active_at.slice(0,10) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
          className="px-3 py-1.5 text-xs bg-white/[0.03] border border-white/10 rounded disabled:opacity-30">← Prev</button>
        <span className="text-[11px] text-ink-subtle">Halaman {Math.floor(offset / limit) + 1} / {Math.max(1, Math.ceil(total / limit))}</span>
        <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}
          className="px-3 py-1.5 text-xs bg-white/[0.03] border border-white/10 rounded disabled:opacity-30">Next →</button>
      </div>
    </div>
  );
}
