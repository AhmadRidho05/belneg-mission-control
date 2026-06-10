"use client";
import { Suspense } from "react";
import {
  School, Shield, Crosshair, Compass, Award, Wifi, MapPin, Layers,
  Maximize2, Navigation, CheckCircle2, Building2, Map as MapIcon, Flame, Target, Database,
} from "lucide-react";
import {
  DoughnutChart, PieDistChart, TreemapChart, HBarChart, KodimStressGrid,
} from "@/components/charts";
import { fmt, prettyProv } from "@/lib/utils";
import { TargetSchoolTable } from "./target-school-table";
import type {
  KkriTargetKpi, TargetKodamRow, TargetKoremRow, TargetKoramilRow, KodimRow, TargetSchoolRow,
} from "@/lib/db";

type Props = {
  kpi: KkriTargetKpi;
  bentuk: { bentuk: string; n: number }[];
  akreditasi: { level: string; n: number }[];
  internet: { akses: string; n: number }[];
  posisi: { posisi: string; n: number }[];
  provinsi: { provinsi: string; n: number }[];
  kabKota: { kab_kota: string; n: number }[];
  kecamatan: { kecamatan: string; n: number }[];
  pulau: { pulau: string; n: number }[];
  provinceBentukTree: { provinsi: string; bentuk: string; n: number }[];
  levelDist: { level: string; n: number }[];
  kodam: TargetKodamRow[];
  korem: TargetKoremRow[];
  koramil: TargetKoramilRow[];
  kodim: KodimRow[];
  schools: TargetSchoolRow[];
};

const AKR_COLORS = ["#10b981", "#f59e0b", "#b45309", "#5d6a85", "#475569"];
const INTERNET_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#5d6a85"];
const LEVEL_COLORS = ["#f59e0b", "#3b82f6", "#10b981"];
const COORD_COLORS = ["#10b981", "#ef4444"];

export function VisualisasiShell(p: Props) {
  // Treemap: provinsi × bentuk, grouped & sorted, top 18 provinsi by total
  const treemapData = (() => {
    const byProv = new Map<string, { name: string; value: number }[]>();
    p.provinceBentukTree.forEach(r => {
      const prov = prettyProv(r.provinsi);
      if (!byProv.has(prov)) byProv.set(prov, []);
      byProv.get(prov)!.push({ name: r.bentuk, value: r.n });
    });
    return Array.from(byProv.entries())
      .map(([name, children]) => ({ name, children: children.sort((a, b) => b.value - a.value) }))
      .sort((a, b) => b.children.reduce((s, c) => s + c.value, 0) - a.children.reduce((s, c) => s + c.value, 0))
      .slice(0, 18);
  })();

  const provinsiData = p.provinsi.map(r => ({ ...r, label: prettyProv(r.provinsi) }));

  const koremTop = [...p.korem]
    .sort((a, b) => b.n_sekolah_target - a.n_sekolah_target)
    .slice(0, 12)
    .map(r => ({ ...r, label: r.korem.length > 28 ? r.korem.slice(0, 26) + "…" : r.korem }));

  const koramilData = p.koramil.map(r => ({ ...r, label: r.koramil.length > 24 ? r.koramil.slice(0, 22) + "…" : r.koramil }));

  const kodimItems = p.kodim.slice(0, 24).map(k => ({
    id: k.kodim_id,
    label: k.kodim_name,
    sub: k.kabupaten_kota ?? "—",
    value: k.n_sekolah,
  }));

  const coordData = [
    { name: "Dengan Koordinat", n: p.kpi.with_coords },
    { name: "Tanpa Koordinat", n: p.kpi.without_coords },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 p-3 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-2 border-b border-white/5 pb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip text-accent-glow border-accent/40">● VISUAL INTEL</span>
          <span className="chip">{p.kpi.n_provinsi} provinsi · {p.kpi.n_kabkota_target} kab/kota</span>
          <span className="chip">{p.kpi.n_korem_target} Korem · {p.kpi.n_kodim_target} Kodim · {fmt(p.kpi.n_koramil_target)} Koramil</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-ink">
          Visualisasi <span className="text-accent-glow">Target KKRI</span>
        </h1>
        <p className="max-w-3xl text-sm text-ink-muted">
          {fmt(p.kpi.total_sekolah_target)} sekolah sasaran Pemetaan Bela Negara, dipetakan terhadap struktur teritorial KOREM, KODIM, dan KORAMIL TNI AD.
        </p>
      </header>

      {/* SECTION 1: Komposisi & Kualitas Sasaran */}
      <Section title="Komposisi & Kualitas Sasaran" subtitle={`${fmt(p.kpi.total_sekolah_target)} sekolah target`} icon={Award}>
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-4" title="Komposisi Bentuk Sekolah" subtitle="Doughnut" icon={School}>
            <DoughnutChart data={p.bentuk.map(b => ({ name: b.bentuk, n: b.n }))} />
          </Panel>
          <Panel className="lg:col-span-4" title="Akreditasi" subtitle="Pie" icon={Award}>
            <PieDistChart data={p.akreditasi.map(a => ({ name: a.level, n: a.n }))} colors={AKR_COLORS} />
          </Panel>
          <Panel className="lg:col-span-4" title="Akses Internet" subtitle="Doughnut" icon={Wifi}>
            <DoughnutChart data={p.internet.map(i => ({ name: i.akses, n: i.n }))} colors={INTERNET_COLORS} />
          </Panel>
          <Panel className="lg:col-span-4" title="Ketersediaan Koordinat" subtitle="Doughnut" icon={CheckCircle2}>
            <DoughnutChart data={coordData} colors={COORD_COLORS} />
          </Panel>
          <Panel className="lg:col-span-4" title="Posisi Sekolah" subtitle="Pie" icon={Navigation}>
            <PieDistChart data={p.posisi.map(x => ({ name: x.posisi, n: x.n }))} />
          </Panel>
          <Panel className="lg:col-span-4" title="Distribusi per Level" subtitle="Doughnut · KOREM/KODIM/KORAMIL" icon={Layers}>
            <DoughnutChart data={p.levelDist.map(x => ({ name: x.level, n: x.n }))} colors={LEVEL_COLORS} />
          </Panel>
        </div>
      </Section>

      {/* SECTION 2: Sebaran Wilayah Target */}
      <Section title="Sebaran Wilayah Target" subtitle={`${p.kpi.n_provinsi} provinsi · ${p.kpi.n_kabkota_target} kab/kota`} icon={MapPin}>
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-6" title="Top Provinsi" subtitle={`Top ${provinsiData.length}`} icon={MapPin}>
            <HBarChart data={provinsiData} valueKey="n" labelKey="label" color="#f59e0b" />
          </Panel>
          <Panel className="lg:col-span-6" title="Top Kab/Kota" subtitle={`Top ${p.kabKota.length}`} icon={Building2}>
            <HBarChart data={p.kabKota} valueKey="n" labelKey="kab_kota" color="#3b82f6" />
          </Panel>
          <Panel className="lg:col-span-6" title="Top Kecamatan" subtitle={`Top ${p.kecamatan.length}`} icon={Compass}>
            <HBarChart data={p.kecamatan} valueKey="n" labelKey="kecamatan" color="#a78bfa" />
          </Panel>
          <Panel className="lg:col-span-6" title="Distribusi Pulau" subtitle="Pie · level KORAMIL" icon={MapIcon}>
            <PieDistChart data={p.pulau.map(x => ({ name: x.pulau, n: x.n }))} />
          </Panel>
          <Panel className="lg:col-span-12" title="Provinsi × Bentuk Sekolah" subtitle="Treemap · Top 18 provinsi" icon={Maximize2}>
            <TreemapChart data={treemapData} />
          </Panel>
        </div>
      </Section>

      {/* SECTION 3: Beban Komando Teritorial */}
      <Section title="Beban Komando Teritorial" subtitle={`${p.kpi.n_korem_target} Korem · ${p.kpi.n_kodim_target} Kodim · ${fmt(p.kpi.n_koramil_target)} Koramil`} icon={Shield}>
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-12" title="Ringkasan per KODAM" subtitle="Sekolah target & akreditasi A · level KORAMIL" icon={Shield}>
            <KodamSummaryTable rows={p.kodam} />
          </Panel>
          <Panel className="lg:col-span-6" title="Top KOREM" subtitle="Sekolah target" icon={Crosshair}>
            <HBarChart data={koremTop} valueKey="n_sekolah_target" labelKey="label" color="#f59e0b" />
          </Panel>
          <Panel className="lg:col-span-6" title="Top KORAMIL" subtitle="Sekolah target" icon={Target}>
            <HBarChart data={koramilData} valueKey="n_sekolah_target" labelKey="label" color="#10b981" />
          </Panel>
          <Panel className="lg:col-span-12" title="Beban per KODIM" subtitle={`${fmt(p.kodim.length)} kodim · top 24 by sekolah target`} icon={Flame}>
            <KodimStressGrid items={kodimItems} />
          </Panel>
        </div>
      </Section>

      {/* RAW DATA */}
      <section id="raw-data" className="space-y-3 scroll-mt-20">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent-glow shrink-0"><Database size={14} /></span>
          <h2 className="font-display text-base sm:text-xl font-bold tracking-tight text-ink">Daftar Sekolah Target</h2>
          <span className="panel-subtitle">{fmt(p.schools.length)} entri</span>
        </div>
        <Suspense fallback={<div className="panel p-6 text-center text-sm text-ink-subtle">Memuat tabel sekolah…</div>}>
          <TargetSchoolTable schools={p.schools} />
        </Suspense>
      </section>
    </div>
  );
}

function KodamSummaryTable({ rows }: { rows: TargetKodamRow[] }) {
  return (
    <div className="-mx-3 sm:mx-0 overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-white/5 text-left">
            <th className="px-3 sm:px-0 py-2 stat-label">KODAM</th>
            <th className="px-2 sm:px-0 py-2 stat-label text-right">Koramil</th>
            <th className="px-2 sm:px-0 py-2 stat-label text-right">Sekolah Target</th>
            <th className="px-2 sm:px-0 py-2 stat-label text-right">Akr A</th>
            <th className="px-2 sm:px-0 py-2 stat-label text-right">Akr A %</th>
            <th className="px-3 sm:px-0 py-2 stat-label text-right">Sklh/Koramil</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(k => (
            <tr key={k.kodam} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
              <td className="px-3 sm:px-0 py-2.5 text-ink">{k.kodam}</td>
              <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-ink-muted">{fmt(k.n_koramil_target)}</td>
              <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-ink">{fmt(k.n_sekolah_target)}</td>
              <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-ink-muted">{fmt(k.n_akreditasi_a)}</td>
              <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-accent-glow">{k.pct_akreditasi_a.toFixed(1)}%</td>
              <td className="px-3 sm:px-0 py-2.5 text-right font-mono text-ink-muted">{k.avg_sekolah_per_koramil.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent-glow shrink-0"><Icon size={14} /></span>
        <h2 className="font-display text-base sm:text-xl font-bold tracking-tight text-ink">{title}</h2>
        <span className="panel-subtitle">{subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function Panel({ className = "", title, subtitle, icon: Icon, children }: { className?: string; title: string; subtitle: string; icon: any; children: React.ReactNode }) {
  return (
    <div className={`panel min-w-0 ${className}`}>
      <div className="panel-head flex-wrap gap-x-3 gap-y-0.5">
        <span className="panel-title flex items-center gap-2 min-w-0"><Icon size={13} className="text-accent shrink-0" /> <span className="truncate">{title}</span></span>
        <span className="panel-subtitle">{subtitle}</span>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}
