"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DoughnutChart, PieDistChart, TreemapChart, SankeyChart, StackedBarChart,
  ScatterPlot, TrendLineChart, BubbleChart, HBarChart, RadarKodam,
  TrafficLightGrid, KodimStressGrid, SkTimelineChart, SkTimelineStacked,
  PrabowoBubbleChart, PrabowoSwingScatter,
} from "@/components/charts";
import { SekolahTable, type SekolahFilter } from "@/components/sekolah-table";
import { fmt } from "@/lib/utils";
import {
  Shield, Crosshair, Building2, Award, Wifi, Zap, TrendingUp, Layers, Activity,
  Radar as RadarIcon, GitBranch, Maximize2, Target, Scale, Compass, Flame,
  Calendar, History, FileText, Vote, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

type Props = {
  sankeyTop5: any;
  sankeyAll: any;
  bentukTree: { province: string; bentuk: string; n: number }[];
  status: { status: string; n: number }[];
  akr: { level: string; n: number }[];
  akrByProv: any[];
  internet: { akses: string; n: number }[];
  listrik: { sumber: string; n: number }[];
  yayasan: any[];
  scatter: any[];
  trend: any[];
  bubble: any[];
  kodam: any[];
  kodim: any[];
  skAll: { year: number; sk_pendirian: number; sk_operasional: number }[];
  skByAkrPendirian: { year: number; [k: string]: number }[];
  skByAkrOperasional: { year: number; [k: string]: number }[];
  skByStatusPendirian: { year: number; [k: string]: number }[];
  skByStatusOperasional: { year: number; [k: string]: number }[];
  prabowoKab: any[];
  kodamPolitik: any[];
  skByPrabowo: { year: number; dominant: number; swing: number; opposisi: number }[];
  koramilKodam: { kodam_id: string; kodam_name: string; n_koramils: number; n_kodims: number; n_schools: number; avg_schools_per_koramil: number }[];
  koramilScatter: { kodim_id: string; kodim_name: string; kodam_name: string; n_koramils: number; n_schools: number; schools_per_koramil: number }[];
  koramilBentuk: { bentuk: string; n: number }[];
  koramilKorem: { korem_id: string; korem_name: string; n_koramils: number; n_schools: number }[];
};

export function VisualisasiShell(p: Props) {
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<SekolahFilter>(() => readFilterFromUrl(searchParams));
  const [skDateMode, setSkDateMode] = useState<"pendirian" | "operasional">("pendirian");

  // Re-init when URL changes (e.g. user navigates from /assignment with new selection)
  useEffect(() => {
    const f = readFilterFromUrl(searchParams);
    if (f.kodam_ids?.length || f.kodim_ids?.length || f.statuses?.length) {
      setFilter(f);
      // Scroll to raw data table after a brief delay for layout
      setTimeout(() => document.getElementById("raw-data")?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [searchParams]);

  // KODAM + KODIM options for the table's multi-select controls
  const kodamOptions = useMemo(() => p.kodam.map((k: any) => ({
    id: k.kodam_id,
    label: k.kodam_name.replace(/^Kodam\s+/, ""),
    sub: `${k.n_kodim} kodim · ${k.n_sekolah} sekolah`,
  })), [p.kodam]);
  const kodimOptions = useMemo(() => p.kodim.map((k: any) => ({
    id: k.kodim_id,
    label: (k.kodim_name ?? k.kabupaten_kota ?? "Tanpa Kodim").replace(/^Kodim\s+\d+\//, ""),
    sub: `${k.kabupaten_kota ?? "—"} · ${k.kodam_name?.replace(/^Kodam\s+/, "") ?? ""}`,
  })), [p.kodim]);

  const setKodam = (id: string, label: string) =>
    setFilter({ type: "kodam", label: `KODAM: ${label}`, kodam_id: id });
  const setKodim = (id: string, label: string, kab?: string) =>
    setFilter({ type: "kodim", label: `KODIM: ${label}`, sub: kab, kodim_id: id });
  const setKab = (kab: string, provinsi?: string) =>
    setFilter({ type: "kab", label: kab, sub: provinsi, kab });
  const setProvBentuk = (provinsi: string, bentuk?: string) =>
    setFilter({
      type: "provinsi-bentuk",
      label: bentuk ? `${bentuk} di ${provinsi}` : provinsi,
      provinsi: `PROV. ${provinsi}`,
      bentuk,
    });
  const setBentukOnly = (bentuk: string) =>
    setFilter({ type: "bentuk", label: `Bentuk: ${bentuk}`, bentuk });
  const setAkrOnly = (akr: string) =>
    setFilter({ type: "akreditasi", label: `Akreditasi: ${akr}`, akr });
  const setStatusOnly = (status: string) =>
    setFilter({ type: "akreditasi", label: `Status: ${status}`, status });
  const setYayasan = (npyp: string, label: string) =>
    setFilter({ type: "yayasan", label: `Yayasan: ${label}`, sub: npyp, npyp });
  const setProvAkr = (province: string, akr: string) =>
    setFilter({ type: "provinsi-bentuk", label: `Akr ${akr} di ${province}`, provinsi: `PROV. ${province}`, akr });
  const clearFilter = () => setFilter({ type: "none", label: "" });

  // Smooth-scroll table on filter change
  const scrollToTable = () => {
    if (typeof document !== "undefined") {
      const el = document.getElementById("raw-data");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // ─── Derived datasets ───
  const treemapData = (() => {
    const byProv = new Map<string, { name: string; value: number }[]>();
    p.bentukTree.forEach(r => {
      if (!byProv.has(r.province)) byProv.set(r.province, []);
      byProv.get(r.province)!.push({ name: r.bentuk, value: r.n });
    });
    return Array.from(byProv.entries())
      .map(([prov, kids]) => ({
        name: prov,
        children: kids.sort((a, b) => b.value - a.value),
      }))
      .sort((a, b) => b.children.reduce((s, c) => s + c.value, 0) - a.children.reduce((s, c) => s + c.value, 0))
      .slice(0, 18);
  })();

  const trafficItems = p.kodam.map(k => ({
    id: k.kodam_id,
    label: k.kodam_name.replace(/^Kodam\s+/i, ""),
    sub: `${k.n_kodim} kodim · ${fmt(k.n_sekolah)} sekolah`,
    value: k.ratio_sekolah_per_kodim,
    level: (k.ratio_sekolah_per_kodim >= 200 ? "crit" : k.ratio_sekolah_per_kodim >= 100 ? "warn" : "ok") as "ok" | "warn" | "crit",
    payload: { kodam_id: k.kodam_id, kodam_name: k.kodam_name },
  }));

  const kodimItems = p.kodim.map((k: any) => ({
    id: k.kodim_id,
    label: (k.kodim_name ?? k.kabupaten_kota ?? "Tanpa Kodim").replace(/^Kodim\s+\d+\//, ""),
    sub: k.kabupaten_kota ?? "—",
    value: k.n_sekolah,
    payload: { kodim_id: k.kodim_id, kab: k.kabupaten_kota, kodam: k.kodam_name },
  }));

  // Radar (top 5)
  const top5 = [...p.kodam].sort((a, b) => b.n_sekolah - a.n_sekolah).slice(0, 5);
  const max = {
    sekolah: Math.max(...top5.map(k => k.n_sekolah)),
    kodim: Math.max(...top5.map(k => k.n_kodim)),
    korem: Math.max(...top5.map(k => k.n_korem)),
    akr: Math.max(...top5.map(k => k.n_akreditasi_a)),
    swasta_ratio: Math.max(...top5.map(k => k.n_swasta / Math.max(1, k.n_sekolah))),
  };
  const radarData = [
    { metric: "Sekolah", ...Object.fromEntries(top5.map(k => [k.kodam_name.replace(/^Kodam\s+/, ""), Math.round((k.n_sekolah / max.sekolah) * 100)])) },
    { metric: "Kodim", ...Object.fromEntries(top5.map(k => [k.kodam_name.replace(/^Kodam\s+/, ""), Math.round((k.n_kodim / max.kodim) * 100)])) },
    { metric: "Korem", ...Object.fromEntries(top5.map(k => [k.kodam_name.replace(/^Kodam\s+/, ""), Math.round((k.n_korem / max.korem) * 100)])) },
    { metric: "Akr A", ...Object.fromEntries(top5.map(k => [k.kodam_name.replace(/^Kodam\s+/, ""), Math.round((k.n_akreditasi_a / max.akr) * 100)])) },
    { metric: "Swasta %", ...Object.fromEntries(top5.map(k => [k.kodam_name.replace(/^Kodam\s+/, ""), Math.round(((k.n_swasta / Math.max(1, k.n_sekolah)) / max.swasta_ratio) * 100)])) },
  ];

  const bubbleData = p.bubble.map(b => ({ ...b, n_kodim: Math.max(1, b.n_kodim) }));

  // Sankey click router (handles all 2 sankeys: top5 + all)
  const onSankeyClick = (node: { id: string; label: string; meta?: Record<string, string>; level?: number }) => {
    const id = node.id;
    if (id.startsWith("KD-")) setKodam(id.slice(3), node.label);
    else if (id.startsWith("KM-")) setKodim(id.slice(3), node.label, node.meta?.kab);
    else if (id.startsWith("KAB-")) setKab(node.meta?.kab ?? node.label);
    else if (id.startsWith("BS-")) setKodam(id.slice(3), node.label);
    scrollToTable();
  };

  // Wrap setters used by visualisation clicks to also scroll
  const setKodamS = (id: string, label: string) => { setKodam(id, label); scrollToTable(); };
  const setKodimS = (id: string, label: string, kab?: string) => { setKodim(id, label, kab); scrollToTable(); };
  const setKabS = (kab: string, provinsi?: string) => { setKab(kab, provinsi); scrollToTable(); };
  const setProvBentukS = (provinsi: string, bentuk?: string) => { setProvBentuk(provinsi, bentuk); scrollToTable(); };

  return (
    <div className="space-y-6 sm:space-y-8 p-3 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-2 border-b border-white/5 pb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip text-accent-glow border-accent/40">● VISUAL INTEL</span>
          <span className="chip">interactive</span>
          <span className="chip">{p.kodim.length} kodim · {p.kodam.length} kodam</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-ink">
          Chart <span className="text-accent-glow">Gallery</span>
        </h1>
        <p className="max-w-3xl text-sm text-ink-muted">
          Klik elemen apapun (Sankey node · bubble · stress card · treemap) untuk drill-down tabel raw data di bawah.
        </p>
      </header>

      {/* TIER 0: Koramil coverage — combines koramil × kodim × korem × sekolah */}
      <Section title="Tier 0 · Coverage Korps Wilayah" subtitle="Koramil × Kodim × Korem × Sekolah · TA 2025" icon={Shield}>
        <KoramilSection
          perKodam={p.koramilKodam}
          scatter={p.koramilScatter}
          bentuk={p.koramilBentuk}
          perKorem={p.koramilKorem}
        />
      </Section>

      {/* TIER 1: Cross-domain */}
      <Section title="Tier 1 · Cross-Domain Intelligence" subtitle="Sekolah × KODAM/KOREM/KODIM" icon={Crosshair}>
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-7" title="Hierarki Top 5 KODAM" subtitle="Sankey · KODAM → KOREM" icon={GitBranch}>
            <SankeyChart data={p.sankeyTop5} onNodeClick={onSankeyClick} />
            <p className="mt-2 text-[11px] text-ink-subtle">Klik node KODAM atau KOREM untuk filter.</p>
          </Panel>

          <Panel className="lg:col-span-5" title="KODAM Stress Index" subtitle="Sekolah / Kodim" icon={Activity}>
            <TrafficLightGrid
              items={trafficItems}
              onSelect={({ id, label }) => setKodamS(id, label)}
              selectedId={filter.kodam_id ?? null}
            />
            <div className="mt-3 flex gap-3 text-[10px] uppercase tracking-widest text-ink-subtle">
              <span><span className="inline-block h-2 w-2 rounded-full bg-ok mr-1"/>≤100</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-warn mr-1"/>100–200</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-crit mr-1"/>≥200</span>
            </div>
          </Panel>

          <Panel className="lg:col-span-12" title="Full Hierarki TNI AD → Wilayah Sekolah"
            subtitle={`Sankey 3-level · ${p.sankeyAll.nodes.filter((n: any) => n.level === 0).length} Kodam · ${p.sankeyAll.total_kodim} Kodim · ${p.sankeyAll.total_kab} Kabupaten`}
            icon={GitBranch}>
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <div className="min-w-[640px] px-3 sm:px-0">
                <SankeyChart data={p.sankeyAll} height={1100} onNodeClick={onSankeyClick} />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-subtle">
              Kolom kiri: 21 KODAM · tengah: KODIM (≥5 sekolah) · kanan: kab/kota. Pada layar kecil, geser horizontal untuk navigasi.
            </p>
          </Panel>

          <Panel className="lg:col-span-12" title="KODIM Stress Index" subtitle={`Per-kodim gradient · ${p.kodim.length} kodim (beban tertinggi → terendah)`} icon={Flame}>
            <KodimStressGrid
              items={kodimItems}
              onSelect={({ id, label, payload }) => setKodimS(id, label, payload?.kab)}
              selectedId={filter.kodim_id ?? null}
            />
          </Panel>

          <Panel className="lg:col-span-7" title="Cross-Domain Bubble" subtitle="Kabupaten · sekolah × kualitas × kodim" icon={Target}>
            <BubbleChart data={bubbleData} onPointClick={(d) => setKabS(d.kab_kota, d.provinsi)} />
            <p className="mt-2 text-[11px] text-ink-subtle">Klik bubble untuk filter kabupaten. X = jumlah sekolah · Y = % akr A · Size = jumlah kodim.</p>
          </Panel>
          <Panel className="lg:col-span-5" title="Top 5 KODAM Profile" subtitle="Radar · 5 metrik · normalized" icon={RadarIcon}>
            <RadarKodam data={radarData} />
          </Panel>
        </div>
      </Section>

      {/* TIER 2 */}
      <Section title="Tier 2 · Sebaran Pendidikan" subtitle="Geografi & jenjang" icon={Layers}>
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-8" title="Distribusi Sekolah · Provinsi × Bentuk" subtitle="Treemap · Top 18 · klik untuk filter" icon={Maximize2}>
            <TreemapChart data={treemapData as any} onCellClick={({ province, bentuk }) => setProvBentukS(province, bentuk)} />
          </Panel>
          <Panel className="lg:col-span-4" title="Status" subtitle="Doughnut" icon={Scale}>
            <DoughnutChart
              data={p.status.map(s => ({ name: s.status === "NEGERI" ? "Negeri" : "Swasta", n: s.n }))}
              colors={["#10b981", "#f59e0b"]}
            />
            <div className="mt-3 flex gap-2 justify-center">
              <FilterChip onClick={() => setStatusOnly("NEGERI")} active={filter.status === "NEGERI"}>Negeri</FilterChip>
              <FilterChip onClick={() => setStatusOnly("SWASTA")} active={filter.status === "SWASTA"}>Swasta</FilterChip>
            </div>
          </Panel>

          <Panel className="lg:col-span-4" title="Akreditasi" subtitle="Pie · klik chip" icon={Award}>
            <PieDistChart
              data={p.akr.map(a => ({ name: a.level, n: a.n }))}
              colors={["#10b981", "#f59e0b", "#b45309", "#5d6a85", "#475569", "#3b82f6"]}
            />
            <div className="mt-3 flex flex-wrap gap-1 justify-center">
              {["A", "B", "C", "TT", "BT"].map(a => (
                <FilterChip key={a} onClick={() => setAkrOnly(a)} active={filter.akr === a}>{a}</FilterChip>
              ))}
            </div>
          </Panel>
          <Panel className="lg:col-span-8" title="Akreditasi per Provinsi" subtitle="Stacked bar · Top 12 · klik segmen" icon={Award}>
            <StackedBarChart
              data={p.akrByProv as any}
              keys={["A", "B", "C", "TT"]}
              colors={["#10b981", "#f59e0b", "#b45309", "#475569"]}
              onBarClick={({ province, level }) => { setProvAkr(province, level); scrollToTable(); }}
            />
          </Panel>
        </div>
      </Section>

      {/* TIER 3 */}
      <Section title="Tier 3 · Infrastruktur & Kualitas" subtitle="Energi · konektivitas · kapasitas" icon={Zap}>
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-4" title="Akses Internet" subtitle="Doughnut" icon={Wifi}>
            <DoughnutChart
              data={p.internet.slice(0, 5).map(i => ({ name: i.akses, n: i.n }))}
              colors={["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#5d6a85"]}
            />
          </Panel>
          <Panel className="lg:col-span-4" title="Sumber Listrik" subtitle="Pie" icon={Zap}>
            <PieDistChart
              data={p.listrik.slice(0, 6).map(l => ({ name: l.sumber, n: l.n }))}
              colors={["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#a78bfa", "#5d6a85"]}
            />
          </Panel>
          <Panel className="lg:col-span-4" title="Luas Tanah vs Akreditasi" subtitle="Scatter · log scale · 4k" icon={Activity}>
            <ScatterPlot data={p.scatter} />
          </Panel>
        </div>
      </Section>

      {/* TIER 4 */}
      <Section title="Tier 4 · Trend & Governance" subtitle="Multi-year · yayasan" icon={TrendingUp}>
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-7" title="Perkembangan Peserta Didik 2023/24 → 2025/26" subtitle="Line · SMA & SMK" icon={TrendingUp}>
            <TrendLineChart data={p.trend} />
          </Panel>
          <Panel className="lg:col-span-5" title="Top 15 Yayasan by Naungan" subtitle="Klik bar → filter" icon={Building2}>
            <HBarChart
              data={p.yayasan.slice(0, 12).map((y: any) => ({ ...y, label: y.nama.length > 38 ? y.nama.slice(0, 36) + "…" : y.nama }))}
              valueKey="n_naungan"
              labelKey="label"
              color="#f59e0b"
              onBarClick={(d: any) => { setYayasan(d.npyp, d.nama); scrollToTable(); }}
            />
          </Panel>
        </div>
      </Section>

      {/* TIER 5 · SK Timeline */}
      <Section title="Tier 5 · Riwayat Tanggal SK" subtitle="Pendirian + Operasional · 1945→2026" icon={Calendar}>
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Full-width main timeline */}
          <Panel className="lg:col-span-12" title="Timeline Pendirian Satuan Pendidikan" subtitle="Area chart · area = jumlah SK terbit per tahun" icon={History}>
            <SkTimelineChart data={p.skAll} height={420} />
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] text-ink-muted">
              <Stat label="Total SK Pendirian" value={p.skAll.reduce((s, d) => s + d.sk_pendirian, 0)} accent="gold"/>
              <Stat label="Total SK Operasional" value={p.skAll.reduce((s, d) => s + d.sk_operasional, 0)} accent="blue"/>
              <Stat label="Puncak Pendirian" value={p.skAll.reduce((a, b) => b.sk_pendirian > a.sk_pendirian ? b : a, p.skAll[0])?.year ?? "—"} accent="gold" raw/>
              <Stat label="Puncak Operasional" value={p.skAll.reduce((a, b) => b.sk_operasional > a.sk_operasional ? b : a, p.skAll[0])?.year ?? "—"} accent="blue" raw/>
            </div>
            <p className="mt-3 text-[11px] text-ink-subtle">
              Tahun puncak biasanya hasil konsolidasi data (banyak SK lama di-rekonfirmasi pada tahun yang sama). Pakai brush di bawah chart untuk zoom rentang tahun tertentu.
            </p>
          </Panel>

          {/* Breakdown controls */}
          <div className="lg:col-span-12 flex items-center justify-between gap-2 rounded-md border border-white/5 bg-white/[0.02] px-4 py-2">
            <span className="text-[11px] uppercase tracking-widest text-ink-muted flex items-center gap-1.5">
              <FileText size={11}/> Sumber tanggal untuk breakdown di bawah:
            </span>
            <div className="flex gap-1">
              {(["pendirian", "operasional"] as const).map(k => (
                <button
                  key={k}
                  onClick={() => setSkDateMode(k)}
                  className={`rounded-sm px-2.5 py-1 text-[10px] uppercase tracking-widest transition ${skDateMode === k ? "bg-accent text-bg font-semibold" : "bg-white/5 text-ink-muted hover:bg-white/10"}`}
                >
                  SK {k}
                </button>
              ))}
            </div>
          </div>

          <Panel className="lg:col-span-6" title="Per Tahun × Akreditasi" subtitle={`Stacked area · ${skDateMode === "pendirian" ? "SK Pendirian" : "SK Operasional"}`} icon={Award}>
            <SkTimelineStacked
              data={skDateMode === "pendirian" ? p.skByAkrPendirian : p.skByAkrOperasional}
              keys={["A", "B", "C", "TT", "BT"]}
              colors={["#10b981", "#f59e0b", "#b45309", "#475569", "#5d6a85"]}
              dateLabel={skDateMode === "pendirian" ? "SK Pendirian" : "SK Operasional"}
            />
          </Panel>

          <Panel className="lg:col-span-6" title="Per Tahun × Status" subtitle={`Stacked area · negeri vs swasta`} icon={Scale}>
            <SkTimelineStacked
              data={skDateMode === "pendirian" ? p.skByStatusPendirian : p.skByStatusOperasional}
              keys={["Negeri", "Swasta"]}
              colors={["#10b981", "#f59e0b"]}
              dateLabel={skDateMode === "pendirian" ? "SK Pendirian" : "SK Operasional"}
            />
          </Panel>
        </div>
      </Section>

      {/* TIER 6 · Cross-Domain Politik (Pilpres 2024 + 2019) */}
      <Section title="Tier 6 · Pilpres × Sekolah × Komando" subtitle="Prabowo dominance · pasangan calon × kabupaten × KODAM" icon={Vote}>
        {/* National + KODAM top stats */}
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          {(() => {
            const nat = p.kodamPolitik.reduce((a, k) => ({
              anies: a.anies + k.votes24_anies,
              prabowo: a.prabowo + k.votes24_prabowo,
              ganjar: a.ganjar + k.votes24_ganjar,
            }), { anies: 0, prabowo: 0, ganjar: 0 });
            const total = nat.anies + nat.prabowo + nat.ganjar;
            const pctPrabowo = total > 0 ? (nat.prabowo / total) * 100 : 0;
            const dominantKab = p.prabowoKab.filter((k: any) => k.pct24_prabowo >= 60).length;
            const oposisiKab = p.prabowoKab.filter((k: any) => k.pct24_prabowo < 40).length;
            return (
              <>
                <Stat label="% Prabowo 2024 (agg)" value={`${pctPrabowo.toFixed(1)}%`} accent="gold" raw />
                <Stat label="Anies 2024" value={nat.anies} accent="blue" />
                <Stat label="Ganjar 2024" value={nat.ganjar} />
                <Stat label="Kab dominan vs oposisi" value={`${dominantKab} : ${oposisiKab}`} accent="gold" raw />
              </>
            );
          })()}
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          {/* KODAM × pct_prabowo bar */}
          <Panel className="lg:col-span-12" title="Top KODAM by % Prabowo 2024" subtitle="Aggregat suara kab di bawah masing-masing komando" icon={Shield}>
            <HBarChart
              data={[...p.kodamPolitik]
                .filter(k => k.total24 > 0)
                .sort((a, b) => b.pct24_prabowo - a.pct24_prabowo)
                .slice(0, 21)
                .map(k => ({ label: k.kodam_name.replace(/^Kodam\s+/, ""), pct_prabowo: Number(k.pct24_prabowo.toFixed(1)) }))}
              valueKey="pct_prabowo"
              labelKey="label"
              color="#ef4444"
            />
            <p className="mt-2 text-[11px] text-ink-subtle">
              Catatan: data 2024 dari SIREKAP partial — proporsi relatif akurat, angka absolut tidak. {p.kodamPolitik.filter(k => k.pct24_prabowo >= 60).length} dari {p.kodamPolitik.length} KODAM punya ≥60% suara Prabowo.
            </p>
          </Panel>

          {/* Cross-domain bubble */}
          <Panel className="lg:col-span-12" title="Kabupaten · % Prabowo 2024 × Jumlah Sekolah × Jumlah Kodim" subtitle="Bubble · color = dominance bucket · klik untuk filter" icon={Target}>
            <PrabowoBubbleChart
              data={p.prabowoKab}
              onPointClick={(d) => setKabS(d.nama_kab, d.nama_prov)}
            />
            <p className="mt-2 text-[11px] text-ink-subtle">
              <strong className="text-crit">Merah</strong> = Prabowo dominan (≥60%); <strong className="text-[#a78bfa]">ungu</strong> = swing (40-60%); <strong className="text-[#3b82f6]">biru</strong> = oposisi (&lt;40%). Garis kuning = 50% benchmark.
            </p>
          </Panel>

          {/* Swing analysis */}
          <Panel className="lg:col-span-7" title="Swing Analysis 2019 → 2024" subtitle="Per kabupaten · garis diagonal = no change" icon={GitBranch}>
            <PrabowoSwingScatter data={p.prabowoKab} />
            <p className="mt-2 text-[11px] text-ink-subtle">
              <strong className="text-ok">Hijau</strong> = naik (Prabowo gain pp); <strong className="text-crit">merah</strong> = turun. Diagonal = no change. Posisi di atas garis = naik dibanding 2019.
            </p>
          </Panel>

          {/* SK timeline by Prabowo dominance */}
          <Panel className="lg:col-span-5" title="SK Pendirian Sekolah by Politik Bucket" subtitle="Stacked area · 1945→2026" icon={History}>
            <SkTimelineStacked
              data={p.skByPrabowo as any}
              keys={["dominant", "swing", "opposisi"]}
              colors={["#ef4444", "#a78bfa", "#3b82f6"]}
              height={360}
              dateLabel="SK Pendirian"
            />
            <p className="mt-2 text-[11px] text-ink-subtle">
              Sekolah dipisah berdasarkan dominansi Prabowo 2024 di kab-nya. Polanya menunjukkan: apakah ekspansi sekolah secara historis tinggi di area yang sekarang Prabowo-dominan vs oposisi?
            </p>
          </Panel>

          {/* Top dominant + opposition kabupaten lists */}
          <Panel className="lg:col-span-6" title="Top 10 Kab Prabowo Dominan" subtitle="Sort by % Prabowo 2024 · min 5k suara" icon={ArrowUpRight}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-white/5 text-left">
                  <th className="py-1.5 stat-label">Kabupaten</th>
                  <th className="py-1.5 stat-label">Provinsi</th>
                  <th className="py-1.5 stat-label text-right">% Prabowo</th>
                  <th className="py-1.5 stat-label text-right">Swing</th>
                  <th className="py-1.5 stat-label text-right">Sekolah</th>
                </tr></thead>
                <tbody>
                  {[...p.prabowoKab]
                    .filter(k => k.total24 >= 5000)
                    .sort((a, b) => b.pct24_prabowo - a.pct24_prabowo)
                    .slice(0, 10)
                    .map(k => (
                      <tr key={k.kab_norm} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] cursor-pointer"
                          onClick={() => { setKabS(k.nama_kab, k.nama_prov); }}>
                        <td className="py-1.5 text-ink truncate max-w-[180px]" title={k.nama_kab}>{k.nama_kab.replace(/^Kabupaten\s+|^Kota Administrasi\s+|^Kota\s+/, "")}</td>
                        <td className="py-1.5 text-ink-muted text-[11px]">{k.nama_prov.replace(/^Provinsi\s+|^Daerah Khusus Ibukota\s+/, "")}</td>
                        <td className="py-1.5 text-right tabular-nums text-crit font-semibold">{k.pct24_prabowo.toFixed(1)}%</td>
                        <td className={`py-1.5 text-right tabular-nums ${k.swing_pp > 0 ? "text-ok" : "text-crit"}`}>{k.swing_pp > 0 ? "+" : ""}{k.swing_pp.toFixed(1)}</td>
                        <td className="py-1.5 text-right tabular-nums text-ink-muted">{fmt(k.n_sekolah)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="lg:col-span-6" title="Top 10 Kab Oposisi (Anies)" subtitle="Sort by % Prabowo terendah · min 5k suara" icon={ArrowDownRight}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-white/5 text-left">
                  <th className="py-1.5 stat-label">Kabupaten</th>
                  <th className="py-1.5 stat-label">Provinsi</th>
                  <th className="py-1.5 stat-label text-right">% Prabowo</th>
                  <th className="py-1.5 stat-label text-right">% Anies</th>
                  <th className="py-1.5 stat-label text-right">Sekolah</th>
                </tr></thead>
                <tbody>
                  {[...p.prabowoKab]
                    .filter(k => k.total24 >= 5000)
                    .sort((a, b) => a.pct24_prabowo - b.pct24_prabowo)
                    .slice(0, 10)
                    .map(k => {
                      const pctAnies = k.total24 > 0 ? (k.votes24_anies / k.total24) * 100 : 0;
                      return (
                        <tr key={k.kab_norm} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] cursor-pointer"
                            onClick={() => { setKabS(k.nama_kab, k.nama_prov); }}>
                          <td className="py-1.5 text-ink truncate max-w-[180px]" title={k.nama_kab}>{k.nama_kab.replace(/^Kabupaten\s+|^Kota Administrasi\s+|^Kota\s+/, "")}</td>
                          <td className="py-1.5 text-ink-muted text-[11px]">{k.nama_prov.replace(/^Provinsi\s+|^Daerah Khusus Ibukota\s+/, "")}</td>
                          <td className="py-1.5 text-right tabular-nums text-ink-muted">{k.pct24_prabowo.toFixed(1)}%</td>
                          <td className="py-1.5 text-right tabular-nums text-[#3b82f6] font-semibold">{pctAnies.toFixed(1)}%</td>
                          <td className="py-1.5 text-right tabular-nums text-ink-muted">{fmt(k.n_sekolah)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </Section>

      {/* RAW DATA TABLE */}
      <section id="raw-data" className="space-y-3 pt-2">
        <div className="flex items-baseline gap-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent-glow"><Compass size={14} /></span>
          <h2 className="font-display text-base sm:text-xl font-bold tracking-tight text-ink">Drill-Down · Raw Data</h2>
          <span className="panel-subtitle">Tabel sekolah · interaktif</span>
        </div>
        <SekolahTable
          filter={filter}
          onFilterChange={setFilter}
          onClear={clearFilter}
          kodamOptions={kodamOptions}
          kodimOptions={kodimOptions}
        />
      </section>
    </div>
  );
}

// ─── Koramil section: 4 visualisations combining koramil × kodim/korem/sekolah ───
function KoramilSection({ perKodam, scatter, bentuk, perKorem }: {
  perKodam: Props["koramilKodam"];
  scatter: Props["koramilScatter"];
  bentuk: Props["koramilBentuk"];
  perKorem: Props["koramilKorem"];
}) {
  const totalKoramil = perKodam.reduce((s, r) => s + r.n_koramils, 0);
  const totalSchools = perKodam.reduce((s, r) => s + r.n_schools, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* KPI strip */}
      <Panel className="lg:col-span-12" title="Koramil Coverage Summary" subtitle="Total nasional" icon={Shield}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KoramilKpi label="Total Koramil"  value={totalKoramil.toLocaleString("id-ID")} />
          <KoramilKpi label="Kodam aktif"    value={perKodam.length} />
          <KoramilKpi label="SMA/SMK/MA/MAK terjangkau" value={totalSchools.toLocaleString("id-ID")} />
          <KoramilKpi label="Avg sekolah/koramil"        value={totalKoramil > 0 ? (totalSchools / totalKoramil).toFixed(1) : "—"} />
        </div>
      </Panel>

      {/* Bubble: per-kodam, x=n_koramils, y=n_schools, size=avg_schools/koramil */}
      <Panel className="lg:col-span-7" title="Beban Wilayah per Kodam" subtitle="Bubble · x=#koramil, y=#sekolah, size=avg sekolah/koramil" icon={Maximize2}>
        <KoramilBubblePerKodam data={perKodam} />
        <p className="mt-2 text-[11px] text-ink-subtle">Kodam dengan bubble besar = tiap koramil menangani banyak sekolah.</p>
      </Panel>

      {/* Doughnut: bentuk wilayah distribution */}
      <Panel className="lg:col-span-5" title="Bentuk Wilayah Koramil" subtitle="Doughnut · klasifikasi medan" icon={Compass}>
        <KoramilBentukDoughnut data={bentuk} />
      </Panel>

      {/* Stacked bar: top-15 Korem with koramils + schools side by side */}
      <Panel className="lg:col-span-7" title="Top 15 Korem · Koramil vs Sekolah" subtitle="Komposisi beban per Korem" icon={GitBranch}>
        <KoramilKoremStackedBar data={perKorem} />
      </Panel>

      {/* Scatter: per-kodim koramils vs schools, colored by kodam */}
      <Panel className="lg:col-span-5" title="Scatter · Kodim Load" subtitle="Setiap titik = 1 kodim (n_koramils vs n_sekolah)" icon={Target}>
        <KoramilScatter data={scatter} />
      </Panel>
    </div>
  );
}

function KoramilKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-white/8 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{label}</div>
      <div className="text-xl font-bold text-accent-glow mt-1">{value}</div>
    </div>
  );
}

const KODAM_PALETTE = ["#f59e0b","#10b981","#3b82f6","#a78bfa","#ec4899","#ef4444","#0ea5e9","#84cc16","#f97316","#06b6d4"];

function KoramilBubblePerKodam({ data }: { data: Props["koramilKodam"] }) {
  if (data.length === 0) return <div className="text-xs text-ink-subtle p-4">Belum ada data koramil.</div>;
  const maxK = Math.max(...data.map(d => d.n_koramils), 1);
  const maxS = Math.max(...data.map(d => d.n_schools), 1);
  const maxAvg = Math.max(...data.map(d => d.avg_schools_per_koramil || 0), 1);
  const W = 580, H = 320, padL = 50, padR = 18, padT = 14, padB = 36;
  const xS = (n: number) => padL + (n / maxK) * (W - padL - padR);
  const yS = (n: number) => H - padB - (n / maxS) * (H - padT - padB);
  const rS = (a: number) => 4 + (a / maxAvg) * 18;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[520px]">
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={padL} x2={W - padR} y1={H - padB - f * (H - padT - padB)} y2={H - padB - f * (H - padT - padB)} stroke="#5d6a85" strokeWidth={0.4} strokeDasharray="2,3" opacity={0.3} />
        ))}
        {/* Axes */}
        <text x={padL} y={H - 8} fill="#9aa6bd" fontSize={9}>0</text>
        <text x={W - padR} y={H - 8} fill="#9aa6bd" fontSize={9} textAnchor="end">{maxK} koramil</text>
        <text x={6} y={padT + 8} fill="#9aa6bd" fontSize={9}>{maxS} sek</text>
        <text x={W / 2} y={H - 8} fill="#9aa6bd" fontSize={10} textAnchor="middle">→ # Koramil</text>
        {/* Bubbles */}
        {data.map((d, i) => (
          <g key={d.kodam_id}>
            <circle cx={xS(d.n_koramils)} cy={yS(d.n_schools)} r={rS(d.avg_schools_per_koramil || 0)}
                    fill={KODAM_PALETTE[i % KODAM_PALETTE.length]} fillOpacity={0.55} stroke={KODAM_PALETTE[i % KODAM_PALETTE.length]} strokeWidth={1.2}>
              <title>{d.kodam_name}{"\n"}{d.n_koramils} koramil · {d.n_schools} sekolah · {d.avg_schools_per_koramil} avg</title>
            </circle>
            {d.n_koramils >= 200 && (
              <text x={xS(d.n_koramils)} y={yS(d.n_schools) - rS(d.avg_schools_per_koramil) - 3} fill="#e8edf5" fontSize={8.5} textAnchor="middle">
                {d.kodam_name.replace(/^Kodam\s+/, "")}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function KoramilBentukDoughnut({ data }: { data: Props["koramilBentuk"] }) {
  const total = data.reduce((s, d) => s + d.n, 0) || 1;
  const palette = ["#f59e0b","#10b981","#3b82f6","#a78bfa","#ec4899","#5d6a85","#0ea5e9"];
  const R = 80, r = 50;
  const cx = 110, cy = 110;
  let acc = 0;
  const arcs = data.map((d, i) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += d.n;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
    const x3 = cx + r * Math.cos(end),   y3 = cy + r * Math.sin(end);
    const x4 = cx + r * Math.cos(start), y4 = cy + r * Math.sin(start);
    return {
      path: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`,
      color: palette[i % palette.length], label: d.bentuk, n: d.n,
    };
  });
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 220 220" width={180} height={180}>
        {arcs.map((a, i) => (
          <path key={i} d={a.path} fill={a.color} opacity={0.85}>
            <title>{a.label}: {a.n}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#e8edf5" fontSize={20} fontWeight={700}>{total.toLocaleString("id-ID")}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#9aa6bd" fontSize={10}>koramil</text>
      </svg>
      <ul className="text-xs space-y-1">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: a.color }} />
            <span className="text-ink-muted">{a.label}</span>
            <span className="text-ink-subtle">·</span>
            <span className="text-ink font-mono">{a.n.toLocaleString("id-ID")}</span>
            <span className="text-ink-subtle">({Math.round(a.n / total * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KoramilKoremStackedBar({ data }: { data: Props["koramilKorem"] }) {
  if (data.length === 0) return <div className="text-xs text-ink-subtle p-4">Belum ada data.</div>;
  const max = Math.max(...data.map(d => d.n_koramils + d.n_schools), 1);
  return (
    <div className="space-y-1.5">
      {data.map(d => {
        const totK = d.n_koramils;
        const totS = d.n_schools;
        const wK = (totK / max) * 100;
        const wS = (totS / max) * 100;
        return (
          <div key={d.korem_id} className="flex items-center gap-2">
            <div className="w-32 text-[11px] text-ink-muted text-right truncate" title={d.korem_name}>{d.korem_name.replace(/^Korem\s+/, "")}</div>
            <div className="flex-1 flex h-5 rounded overflow-hidden">
              <div className="bg-accent" style={{ width: `${wK}%` }} title={`${totK} koramil`} />
              <div className="bg-emerald-500/70" style={{ width: `${wS}%` }} title={`${totS} sekolah`} />
            </div>
            <div className="w-20 text-right text-[10px] font-mono"><span className="text-accent-glow">{totK}</span><span className="text-ink-subtle"> · </span><span className="text-emerald-400">{totS}</span></div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 text-[10px] text-ink-subtle pt-2">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-accent rounded-sm" /> Koramil</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500/70 rounded-sm" /> SMA/SMK/MA/MAK</span>
      </div>
    </div>
  );
}

function KoramilScatter({ data }: { data: Props["koramilScatter"] }) {
  if (data.length === 0) return <div className="text-xs text-ink-subtle p-4">Belum ada data.</div>;
  const W = 380, H = 280, padL = 40, padR = 12, padT = 10, padB = 30;
  const maxK = Math.max(...data.map(d => d.n_koramils), 1);
  const maxS = Math.max(...data.map(d => d.n_schools), 1);
  const xS = (n: number) => padL + (n / maxK) * (W - padL - padR);
  const yS = (n: number) => H - padB - (n / maxS) * (H - padT - padB);
  // Color by kodam
  const kodamSet = Array.from(new Set(data.map(d => d.kodam_name))).slice(0, 10);
  const kodamColor = new Map(kodamSet.map((k, i) => [k, KODAM_PALETTE[i % KODAM_PALETTE.length]]));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[340px]">
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={padL} x2={W - padR}
                y1={H - padB - f * (H - padT - padB)} y2={H - padB - f * (H - padT - padB)}
                stroke="#5d6a85" strokeWidth={0.4} strokeDasharray="2,3" opacity={0.3} />
        ))}
        <text x={padL} y={H - 6} fill="#9aa6bd" fontSize={9}>0</text>
        <text x={W - padR} y={H - 6} fill="#9aa6bd" fontSize={9} textAnchor="end">{maxK}</text>
        <text x={6} y={padT + 8} fill="#9aa6bd" fontSize={9}>{maxS}</text>
        <text x={W / 2} y={H - 6} fill="#9aa6bd" fontSize={9} textAnchor="middle">→ # Koramil</text>
        {data.map(d => (
          <circle key={d.kodim_id} cx={xS(d.n_koramils)} cy={yS(d.n_schools)} r={2.5}
                  fill={kodamColor.get(d.kodam_name) || "#5d6a85"} fillOpacity={0.6}>
            <title>{d.kodim_name}{"\n"}{d.kodam_name}{"\n"}{d.n_koramils} koramil · {d.n_schools} sekolah{"\n"}{d.schools_per_koramil} sekolah/koramil</title>
          </circle>
        ))}
      </svg>
      <div className="text-[10px] text-ink-subtle mt-1">{data.length.toLocaleString("id-ID")} kodim · warna = kodam (top 10 berbeda)</div>
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

function FilterChip({ onClick, active, children }: { onClick: () => void; active: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-widest transition ${active ? "bg-accent text-bg font-semibold" : "bg-white/5 text-ink-muted hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}

function readFilterFromUrl(sp: ReturnType<typeof useSearchParams>): SekolahFilter {
  const get = (k: string) => sp?.get(k) ?? null;
  const splitList = (v: string | null) => (v ? v.split(",").map(s => s.trim()).filter(Boolean) : []);
  const f: SekolahFilter = { type: "none", label: "" };
  const kodam_ids = splitList(get("kodam_ids"));
  const kodim_ids = splitList(get("kodim_ids"));
  const statuses = splitList(get("statuses"));
  if (kodam_ids.length || kodim_ids.length || statuses.length) {
    f.type = "multi";
    if (kodam_ids.length) f.kodam_ids = kodam_ids;
    if (kodim_ids.length) f.kodim_ids = kodim_ids;
    if (statuses.length)  f.statuses = statuses;
    const parts: string[] = [];
    if (kodam_ids.length) parts.push(`${kodam_ids.length} KODAM`);
    if (kodim_ids.length) parts.push(`${kodim_ids.length} KODIM`);
    if (statuses.length === 1) parts.push(statuses[0]);
    if (statuses.length === 2) parts.push("Negeri+Swasta");
    f.label = parts.join(" · ");
  }
  return f;
}

function Stat({ label, value, accent = "ink", raw = false }: { label: string; value: number | string; accent?: "ink" | "gold" | "blue"; raw?: boolean }) {
  const cls = accent === "gold" ? "text-accent-glow" : accent === "blue" ? "text-[#60a5fa]" : "text-ink";
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-3">
      <div className="stat-label">{label}</div>
      <div className={`mt-0.5 font-display text-xl font-bold tabular-nums ${cls}`}>
        {typeof value === "number" && !raw ? fmt(value) : String(value)}
      </div>
    </div>
  );
}
