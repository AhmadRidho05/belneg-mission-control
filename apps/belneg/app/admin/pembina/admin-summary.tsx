"use client";
import { useMemo, useState } from "react";
import {
  Users, ClipboardList, UsersRound, School as SchoolIcon, TrendingUp,
  Activity, Award, MapPin, GitBranch, Maximize2, Target, Calendar,
  CandlestickChart as CandleIcon, ChevronDown, ChevronUp,
} from "lucide-react";
import { fmt } from "@/lib/utils";
import type { AdminStats } from "./admin-stats";
import {
  DoughnutChart, TrendLaporanPesertaChart, CandlestickChart, SankeyChart,
  TreemapPangkat, PembinaBubbleChart, GpsScatterChart, PangkatStatusStackedBar,
  HBarChart, DowHourHeatmap, GeoKabBubble, ProvinsiBarChart,
} from "./admin-charts";

const ROLE_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#a78bfa", "#10b981"];
const STATUS_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444"];
const BENTUK_COLORS = ["#3b82f6", "#10b981", "#a78bfa", "#ec4899", "#f97316", "#94a3b8"];

export function AdminSummary({ stats }: { stats: AdminStats }) {
  const [open, setOpen] = useState(true);

  const topPembinaForBar = useMemo(() =>
    stats.top_pembina.map(p => ({
      label: p.full_name.length > 32 ? p.full_name.slice(0, 30) + "…" : p.full_name,
      n: p.n_laporan,
    })), [stats.top_pembina]);

  const topKodimForBar = useMemo(() =>
    stats.top_kodim.map(k => ({
      label: k.kodim_name.length > 32 ? k.kodim_name.slice(0, 30) + "…" : k.kodim_name,
      n: k.n_laporan,
    })), [stats.top_kodim]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-ink flex items-center gap-2">
          <Activity size={16} className="text-accent-glow"/> Summary &amp; Visualisasi
        </h2>
        <button onClick={() => setOpen(v => !v)} className="text-[11px] text-ink-muted hover:text-ink flex items-center gap-1">
          {open ? "Sembunyikan" : "Tampilkan"} {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </button>
      </div>

      {!open && <div className="text-[12px] text-ink-subtle">Tap "Tampilkan" untuk lihat 12+ grafik analisis kegiatan, laporan, pergerakan, dan satuan Pembina KKRI.</div>}

      {open && (
        <>
          {/* HERO KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <Kpi icon={Users} label="Total Pembina" value={stats.hero.total_pembina} accent="gold" />
            <Kpi icon={Users} label="Aktif" value={stats.hero.active_pembina} accent="ok" />
            <Kpi icon={Users} label="Pending" value={stats.hero.pending_pembina} accent="warn" />
            <Kpi icon={ClipboardList} label="Total Laporan" value={stats.hero.total_laporan} accent="gold" />
            <Kpi icon={ClipboardList} label="Laporan 30d" value={stats.hero.laporan_30d} />
            <Kpi icon={UsersRound} label="Total Peserta" value={stats.hero.total_peserta} accent="ok" />
            <Kpi icon={SchoolIcon} label="Sekolah Unik" value={stats.hero.sekolah_unik} />
            <Kpi icon={TrendingUp} label="Avg/Pembina" value={stats.hero.avg_per_pembina} raw />
          </div>

          {/* ROW 1 — DISTRIBUTION (3 doughnuts) */}
          <Section title="Distribusi" subtitle="Komposisi role, status laporan, bentuk sekolah" icon={Award}>
            <div className="grid gap-3 lg:grid-cols-3">
              <Panel title="Role Pembina" subtitle="KODAM · KOREM · KODIM · KORAMIL · ADMIN">
                <DoughnutChart data={stats.by_role} colors={ROLE_COLORS} />
              </Panel>
              <Panel title="Status Laporan" subtitle="Pending · Reviewed · Approved · Rejected">
                <DoughnutChart data={stats.by_status.map(s => ({ ...s, name: STATUS_LABEL[s.name] ?? s.name }))} colors={STATUS_COLORS} />
              </Panel>
              <Panel title="Bentuk Sekolah" subtitle="SMA · SMK · MA · MAK · lainnya">
                <DoughnutChart data={stats.by_bentuk} colors={BENTUK_COLORS} />
              </Panel>
            </div>
          </Section>

          {/* ROW 2 — TIME SERIES (line + candlestick) */}
          <Section title="Tren &amp; Fluktuasi" subtitle="Volume + peserta over time + variance harian" icon={TrendingUp}>
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Tren Laporan &amp; Peserta" subtitle="Mingguan · 12 bulan · dual-axis">
                <TrendLaporanPesertaChart data={stats.trend_weekly} />
              </Panel>
              <Panel title="Candlestick — Peserta per Minggu" subtitle="OHLC (open/high/low/close) · 3 bulan · hijau=naik, merah=turun" icon={CandleIcon}>
                <CandlestickChart data={stats.candlestick_weekly_peserta} />
              </Panel>
            </div>
          </Section>

          {/* ROW 3 — HIERARCHY (sankey + treemap) */}
          <Section title="Hierarki &amp; Aliran" subtitle="Sankey komando, treemap pangkat" icon={GitBranch}>
            <div className="grid gap-3 lg:grid-cols-12">
              <Panel className="lg:col-span-7" title="Top 5 KODAM → KODIM → Status" subtitle="Aliran laporan dari komando ke status akhir">
                <SankeyChart data={stats.sankey_kodam_kodim_status} />
              </Panel>
              <Panel className="lg:col-span-5" title="Pangkat × Role" subtitle="Hierarki: pangkat (luar) × scope unit (dalam)" icon={Maximize2}>
                <TreemapPangkat data={stats.treemap_pangkat_role} />
              </Panel>
            </div>
          </Section>

          {/* ROW 4 — PATTERN (bubble + GPS scatter) */}
          <Section title="Pola &amp; Korelasi" subtitle="Activity per pembina, sebaran GPS, geografis" icon={Target}>
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Bubble — Performa Pembina" subtitle="X=jumlah laporan · Y=avg peserta · size=sekolah unik · color=role">
                <PembinaBubbleChart data={stats.pembina_bubble} />
              </Panel>
              <Panel title="GPS Scatter — Sebaran Geografis Laporan" subtitle="800 titik random · color=status" icon={MapPin}>
                <GpsScatterChart data={stats.gps_scatter} />
              </Panel>
              <Panel className="lg:col-span-2" title="Bubble Geografis — Konsentrasi per Kabupaten/Kota" subtitle="X=#pembina · Y=#laporan · size=#sekolah disambangi · top 50 kab">
                <GeoKabBubble data={stats.geographic_kab} />
              </Panel>
            </div>
          </Section>

          {/* ROW 5 — RANKING (bar charts) */}
          <Section title="Ranking" subtitle="Top pembina, top KODIM, distribusi pangkat" icon={ClipboardList}>
            <div className="grid gap-3 lg:grid-cols-12">
              <Panel className="lg:col-span-6" title="Top 15 Pembina by Laporan" subtitle="Aktivitas tertinggi">
                <HBarChart data={topPembinaForBar} valueKey="n" labelKey="label" color="#fbbf24" height={420} />
              </Panel>
              <Panel className="lg:col-span-6" title="Top 10 KODIM by Aktivitas" subtitle="Komando dengan laporan terbanyak">
                <HBarChart data={topKodimForBar} valueKey="n" labelKey="label" color="#3b82f6" height={420} />
              </Panel>
              <Panel className="lg:col-span-7" title="Pangkat × Status Laporan" subtitle="Stacked bar · siapa yang banyak approved">
                <PangkatStatusStackedBar data={stats.pangkat_status} />
              </Panel>
              <Panel className="lg:col-span-5" title="Aktivitas per Hari × Jam" subtitle="Heatmap kapan laporan disubmit" icon={Calendar}>
                <DowHourHeatmap data={stats.dow_hour_heatmap} />
              </Panel>
              <Panel className="lg:col-span-12" title="Top 15 Provinsi (lokasi sekolah)" subtitle="Distribusi geografis output laporan">
                <ProvinsiBarChart data={stats.by_provinsi_sekolah} />
              </Panel>
            </div>
          </Section>
        </>
      )}
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = {
  submitted: "Pending",
  reviewed: "Reviewed",
  approved: "Approved",
  rejected: "Rejected",
};

function Kpi({ icon: Icon, label, value, accent, raw }: { icon: any; label: string; value: number | string; accent?: "gold" | "ok" | "warn"; raw?: boolean }) {
  const c = accent === "gold" ? "text-accent-glow" : accent === "ok" ? "text-ok" : accent === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="panel p-3 flex items-start gap-2.5">
      <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-ink-muted shrink-0"><Icon size={14}/></span>
      <div className="min-w-0">
        <div className="stat-label truncate">{label}</div>
        <div className={`mt-0.5 font-display text-lg sm:text-xl font-bold tabular-nums ${c}`}>
          {raw ? String(value) : fmt(value as number)}
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent-glow shrink-0"><Icon size={12}/></span>
        <h3 className="font-display text-sm sm:text-base font-bold tracking-tight text-ink">{title}</h3>
        <span className="panel-subtitle">{subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function Panel({ className = "", title, subtitle, icon: Icon, children }: { className?: string; title: string; subtitle: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className={`panel min-w-0 ${className}`}>
      <div className="panel-head flex-wrap gap-x-2 gap-y-0.5">
        <span className="panel-title flex items-center gap-2 min-w-0">
          {Icon && <Icon size={11} className="text-accent shrink-0"/>}
          <span className="truncate">{title}</span>
        </span>
        <span className="panel-subtitle">{subtitle}</span>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}
