"use client";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, Shield, Filter, ChevronDown, ChevronUp, ExternalLink, Flame, Search, Calendar, Check, FileDown } from "lucide-react";
import type { KodimRow } from "@/lib/db";
import { SekolahDetailModal } from "@/components/sekolah-detail-modal";
import { SkTimelineMini } from "@/components/charts";
import { fmt } from "@/lib/utils";

const INDONESIA_CENTER: [number, number] = [-2.5, 118.0];
const INDONESIA_BOUNDS: [[number, number], [number, number]] = [
  [-11.5, 94.0],
  [6.5,  141.5],
];

type Bucket = "low" | "mid" | "high" | "crit";
function bucketOf(n: number, maxN: number): Bucket {
  const t = n / maxN;
  if (t >= 0.6) return "crit";
  if (t >= 0.3) return "mid";
  if (t >= 0.1) return "low";
  return "low";
}
function bucketColor(b: Bucket, alpha = 1): string {
  switch (b) {
    case "crit": return alpha === 1 ? "#ef4444" : `rgba(239,68,68,${alpha})`;
    case "high": return alpha === 1 ? "#f97316" : `rgba(249,115,22,${alpha})`;
    case "mid":  return alpha === 1 ? "#f59e0b" : `rgba(245,158,11,${alpha})`;
    case "low":  return alpha === 1 ? "#10b981" : `rgba(16,185,129,${alpha})`;
  }
}
function gradientColor(t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const hue = clamp < 0.5 ? 140 - clamp * 80 : 60 - (clamp - 0.5) * 120;
  return `hsl(${hue.toFixed(0)} 75% 55%)`;
}

function FlyTo({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? 10, { duration: 0.9 });
  }, [target, map]);
  return null;
}

const KODAM_OPTS = ["ALL"] as const;

export default function AssignmentMap({ kodim, isAdmin = false }: { kodim: KodimRow[]; isAdmin?: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<KodimRow | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [search, setSearch] = useState("");
  const [kodamFilter, setKodamFilter] = useState<string>("ALL");
  const [showCrit, setShowCrit] = useState(true);
  const [showMid, setShowMid] = useState(true);
  const [showLow, setShowLow] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tableNpsn, setTableNpsn] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [skSeries, setSkSeries] = useState<{ year: number; sk_pendirian: number; sk_operasional: number }[]>([]);
  const [skLoading, setSkLoading] = useState(false);
  const [koramilRows, setKoramilRows] = useState<any[]>([]);
  const [koramilLoading, setKoramilLoading] = useState(false);

  const onMap = useMemo(() => kodim.filter(k => k.lat != null && k.lng != null), [kodim]);
  const maxN = useMemo(() => Math.max(1, ...onMap.map(k => k.n_sekolah)), [onMap]);

  // Unique kodam list for filter
  const kodamOptions = useMemo(() => {
    const set = new Set(onMap.map(k => k.kodam_name));
    return ["ALL", ...Array.from(set).sort()];
  }, [onMap]);

  // Filtered + searched markers
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return onMap.filter(k => {
      if (kodamFilter !== "ALL" && k.kodam_name !== kodamFilter) return false;
      if (q && !(k.kodim_name.toLowerCase().includes(q) || (k.kabupaten_kota ?? "").toLowerCase().includes(q))) return false;
      const t = k.n_sekolah / maxN;
      const cat = t >= 0.6 ? "crit" : t >= 0.3 ? "mid" : "low";
      if (cat === "crit" && !showCrit) return false;
      if (cat === "mid" && !showMid) return false;
      if (cat === "low" && !showLow) return false;
      return true;
    });
  }, [onMap, kodamFilter, search, maxN, showCrit, showMid, showLow]);

  // Side panel ranking (filtered)
  const ranked = useMemo(() => [...visible].sort((a, b) => b.n_sekolah - a.n_sekolah), [visible]);

  // Fetch sample schools when a kodim is selected
  useEffect(() => {
    if (!selected) { setTableRows([]); return; }
    const ctrl = new AbortController();
    setTableLoading(true);
    fetch(`/api/sekolah?kodim_id=${selected.kodim_id}&limit=20`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setTableRows(d.rows ?? []))
      .catch(() => {})
      .finally(() => setTableLoading(false));
    return () => ctrl.abort();
  }, [selected]);

  // Fetch SK timeline when a kodim is selected
  useEffect(() => {
    if (!selected) { setSkSeries([]); return; }
    const ctrl = new AbortController();
    setSkLoading(true);
    fetch(`/api/kodim/${selected.kodim_id}/sk-timeline`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setSkSeries(d.data ?? []))
      .catch(() => {})
      .finally(() => setSkLoading(false));
    return () => ctrl.abort();
  }, [selected]);

  // Fetch koramils when a kodim is selected
  useEffect(() => {
    if (!selected) { setKoramilRows([]); return; }
    const ctrl = new AbortController();
    setKoramilLoading(true);
    fetch(`/api/kodim/${selected.kodim_id}/koramils`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setKoramilRows(d.rows ?? []))
      .catch(() => {})
      .finally(() => setKoramilLoading(false));
    return () => ctrl.abort();
  }, [selected]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-screen flex-col">
      {/* HEADER */}
      <header className="flex flex-col gap-2 border-b border-white/5 p-4 lg:p-6 lg:pr-72 xl:pr-80">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip text-accent-glow border-accent/40">● ASSIGNMENT VIEW</span>
          <span className="chip">{fmt(visible.length)} kodim</span>
          <span className="chip">{fmt(visible.reduce((s, k) => s + k.n_sekolah, 0))} sekolah</span>
        </div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight text-ink">
          Assignment <span className="text-accent-glow">Map</span>
        </h1>
        <p className="text-[12px] text-ink-muted max-w-3xl">
          Setiap circle = 1 KODIM. <strong className="text-ink">Ukuran</strong> ∝ jumlah sekolah ditugaskan, <strong className="text-ink">warna</strong> = stress index (gradient hijau→merah).
          Klik marker untuk drill-down assignment.
        </p>
      </header>

      <div className="flex-1 min-h-0 relative">
        <MapContainer
          center={INDONESIA_CENTER}
          zoom={5}
          minZoom={4}
          maxBounds={INDONESIA_BOUNDS}
          maxBoundsViscosity={1.0}
          worldCopyJump={false}
          scrollWheelZoom
          className="absolute inset-0"
          preferCanvas
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap &copy; CARTO'
            subdomains="abcd"
            maxZoom={19}
            noWrap={true}
          />

          <FlyTo target={flyTarget} />

          {visible.map(k => {
            const t = k.n_sekolah / maxN;
            const radius = Math.max(4, Math.sqrt(k.n_sekolah) * 1.4 + 2);
            const color = gradientColor(t);
            const isSelected = selected?.kodim_id === k.kodim_id;
            return (
              <CircleMarker
                key={k.kodim_id}
                center={[k.lat!, k.lng!]}
                radius={isSelected ? radius + 4 : radius}
                pathOptions={{
                  color: color,
                  weight: isSelected ? 2.5 : 1.2,
                  fillColor: color,
                  fillOpacity: 0.6,
                }}
                eventHandlers={{
                  click: () => { setSelected(k); setFlyTarget({ lat: k.lat!, lng: k.lng!, zoom: 10 }); },
                }}
              >
                <LeafletTooltip>
                  <div className="text-[11px]">
                    <div className="font-semibold text-ink">{k.kodim_name}</div>
                    <div className="text-ink-muted">{k.kabupaten_kota}</div>
                    <div className="mt-0.5 text-accent-glow">{fmt(k.n_sekolah)} sekolah</div>
                  </div>
                </LeafletTooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>

        {/* MOBILE floating triggers */}
        <div className="lg:hidden pointer-events-none absolute inset-x-0 bottom-0 z-[420] flex justify-between gap-2 p-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {isAdmin && (
          <button
            onClick={() => setPanelOpen(true)}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-bg-soft/95 px-3.5 py-2.5 text-[11px] font-semibold text-accent-glow shadow-2xl backdrop-blur min-h-[44px]"
          >
            <Filter size={13}/> Filter ({fmt(visible.length)})
          </button>
          )}
          {selected && (
            <button
              onClick={() => { /* opens via state — selected is what controls right panel */ }}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-bg-soft/95 px-3.5 py-2.5 text-[11px] font-semibold text-accent-glow shadow-2xl backdrop-blur min-h-[44px]"
            >
              <Crosshair size={13}/> Detail
            </button>
          )}
        </div>

        {/* Mobile backdrop for left panel */}
        {isAdmin && panelOpen && (
          <div onClick={() => setPanelOpen(false)} className="lg:hidden absolute inset-0 z-[440] bg-black/50 backdrop-blur-sm"/>
        )}

        {/* LEFT CONTROL PANEL — admin only */}
        {isAdmin && <div className={`pointer-events-none absolute inset-0 z-[460] lg:z-[400] ${panelOpen ? "block" : "hidden lg:block"}`}>
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 lg:bottom-auto lg:inset-x-auto lg:left-3 lg:top-3 lg:w-72 max-h-[85vh] lg:max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-t-2xl lg:rounded-lg border border-white/10 bg-bg-soft/95 backdrop-blur shadow-2xl"
            style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}>
            <div className="lg:hidden mx-auto pt-2 h-1 w-12 rounded-full bg-white/15"/>
            <button
              onClick={() => setPanelOpen(v => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 border-b border-white/5 hover:bg-white/5"
            >
              <span className="font-display text-[12px] font-semibold uppercase tracking-wider text-ink flex items-center gap-2">
                <Filter size={13} className="text-accent"/> Filter & Ranking
              </span>
              {panelOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>

            {panelOpen && (
              <div className="p-3 space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-subtle" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari kodim / kabupaten…"
                    className="w-full rounded-sm border border-white/10 bg-bg/60 pl-7 pr-2 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle"
                  />
                </div>

                {/* Kodam filter */}
                <div>
                  <div className="stat-label mb-1">Filter KODAM</div>
                  <select
                    value={kodamFilter}
                    onChange={(e) => setKodamFilter(e.target.value)}
                    className="w-full rounded-sm border border-white/10 bg-bg/60 px-2 py-1.5 text-[12px] text-ink"
                  >
                    {kodamOptions.map(opt => (
                      <option key={opt} value={opt}>{opt === "ALL" ? "Semua KODAM" : opt}</option>
                    ))}
                  </select>
                </div>

                {/* Stress level toggles */}
                <div>
                  <div className="stat-label mb-1">Stress Level</div>
                  <div className="space-y-1">
                    <StressToggle color={gradientColor(0.85)} label="Crit (≥60% peak)" count={onMap.filter(k => k.n_sekolah / maxN >= 0.6).length} active={showCrit} onChange={() => setShowCrit(v => !v)} />
                    <StressToggle color={gradientColor(0.45)} label="Mid (30-60%)" count={onMap.filter(k => { const t = k.n_sekolah / maxN; return t >= 0.3 && t < 0.6; }).length} active={showMid} onChange={() => setShowMid(v => !v)} />
                    <StressToggle color={gradientColor(0.15)} label="Low (<30%)" count={onMap.filter(k => k.n_sekolah / maxN < 0.3).length} active={showLow} onChange={() => setShowLow(v => !v)} />
                  </div>
                </div>

                {/* Ranking list with multi-pick checkboxes */}
                <div>
                  <div className="stat-label mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Flame size={11} className="text-accent"/> Ranking ({ranked.length})</span>
                    {picked.size > 0 && (
                      <span className="text-accent-glow normal-case tracking-normal">{picked.size} dipilih</span>
                    )}
                  </div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <button
                      onClick={() => setPicked(prev => {
                        const next = new Set(prev);
                        ranked.forEach(k => next.add(k.kodim_id));
                        return next;
                      })}
                      className="rounded-sm bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-ink-muted hover:bg-white/10"
                    >Pilih semua yg tampil</button>
                    {picked.size > 0 && (
                      <button
                        onClick={() => setPicked(new Set())}
                        className="rounded-sm bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-ink-muted hover:bg-white/10"
                      >Kosongkan</button>
                    )}
                  </div>
                  <div className="max-h-[280px] overflow-y-auto space-y-0.5">
                    {ranked.slice(0, 80).map((k, i) => {
                      const t = k.n_sekolah / maxN;
                      const c = gradientColor(t);
                      const isSel = selected?.kodim_id === k.kodim_id;
                      const isPicked = picked.has(k.kodim_id);
                      return (
                        <div
                          key={k.kodim_id}
                          className={`group flex items-center gap-1 rounded-sm transition ${isSel ? "bg-accent/15 ring-1 ring-accent-glow" : "hover:bg-white/5"}`}
                        >
                          <button
                            onClick={() => {
                              setPicked(prev => {
                                const next = new Set(prev);
                                next.has(k.kodim_id) ? next.delete(k.kodim_id) : next.add(k.kodim_id);
                                return next;
                              });
                            }}
                            aria-label={isPicked ? `Hapus ${k.kodim_name}` : `Pilih ${k.kodim_name}`}
                            className={`ml-1 flex h-3.5 w-3.5 items-center justify-center rounded-sm border shrink-0 transition ${
                              isPicked ? "border-accent bg-accent text-bg" : "border-white/15 hover:border-white/30"
                            }`}
                          >
                            {isPicked && <Check size={9} strokeWidth={3} />}
                          </button>
                          <button
                            onClick={() => { setSelected(k); setFlyTarget({ lat: k.lat!, lng: k.lng!, zoom: 10 }); }}
                            className="flex-1 text-left flex items-center gap-2 px-1 py-1 text-[11px] min-w-0"
                          >
                            <span className="w-4 text-right font-mono text-ink-subtle">{i + 1}</span>
                            <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
                            <span className="flex-1 truncate text-ink" title={k.kodim_name}>{k.kodim_name.replace(/^Kodim\s+\d+\//, "")}</span>
                            <span className="tabular-nums text-accent-glow font-semibold">{fmt(k.n_sekolah)}</span>
                          </button>
                        </div>
                      );
                    })}
                    {ranked.length > 80 && (
                      <div className="px-2 py-1 text-[10px] text-ink-subtle">+ {ranked.length - 80} kodim lainnya — pakai search atau filter</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>}

        {/* RIGHT DETAIL PANEL — desktop right side, mobile bottom sheet */}
        {selected && (
          <>
            <div onClick={() => setSelected(null)} className="lg:hidden absolute inset-0 z-[440] bg-black/50 backdrop-blur-sm"/>
            <div className="pointer-events-none absolute inset-0 z-[460] lg:z-[400]">
              <div className="pointer-events-auto absolute inset-x-0 bottom-0 lg:bottom-auto lg:inset-x-auto lg:right-3 lg:top-3 lg:w-96 max-h-[85vh] lg:max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-t-2xl lg:rounded-lg border border-white/10 bg-bg-soft/95 backdrop-blur shadow-2xl"
                style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}>
                <div className="lg:hidden mx-auto pt-2 h-1 w-12 rounded-full bg-white/15"/>
              <div className="flex items-start justify-between border-b border-white/5 p-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-accent-glow">{selected.kodim_id}</div>
                  <div className="font-display text-base font-bold text-ink leading-tight mt-0.5">{selected.kodim_name}</div>
                  <div className="text-[11px] text-ink-muted mt-1">{selected.kabupaten_kota}</div>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Tutup detail" className="rounded-md p-1.5 text-ink-muted hover:bg-white/5 hover:text-ink min-h-[32px] min-w-[32px] flex items-center justify-center">✕</button>
              </div>

              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Sekolah" value={selected.n_sekolah} color="accent-glow"/>
                  <Stat label="Akreditasi A" value={selected.n_akreditasi_a} color="ok" sub={`${selected.n_sekolah > 0 ? ((selected.n_akreditasi_a / selected.n_sekolah) * 100).toFixed(1) : "0"}%`}/>
                  <Stat label="Negeri" value={selected.n_negeri}/>
                  <Stat label="Swasta" value={selected.n_swasta}/>
                </div>

                <div className="rounded-md border border-white/5 bg-white/5 p-2.5 text-[11px]">
                  <div className="flex items-center gap-1.5"><Shield size={11} className="text-accent"/><span className="stat-label">Parent</span></div>
                  <div className="mt-0.5 text-ink">{selected.kodam_name}</div>
                  {selected.korem_name && selected.korem_name !== "Berdiri Sendiri" && (
                    <div className="mt-0.5 text-ink-muted">via {selected.korem_name}</div>
                  )}
                </div>

                <div>
                  <div className="stat-label mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Calendar size={11} className="text-accent"/> Riwayat SK Sekolah</span>
                    {skLoading && <span className="animate-pulse text-ink-subtle">loading…</span>}
                  </div>
                  {!skLoading && skSeries.length === 0 && (
                    <div className="rounded-md border border-dashed border-white/10 p-3 text-[10px] text-center text-ink-subtle">
                      Tidak ada tanggal SK tercatat untuk KODIM ini.
                    </div>
                  )}
                  {skSeries.length > 0 && (
                    <div className="rounded-md border border-white/5 bg-white/[0.02] p-2">
                      <SkTimelineMini data={skSeries} height={130} />
                      <div className="flex justify-between text-[9px] uppercase tracking-widest text-ink-subtle pt-1 px-1">
                        <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-accent mr-1"/>Pendirian {fmt(skSeries.reduce((s, d) => s + d.sk_pendirian, 0))}</span>
                        <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#3b82f6] mr-1"/>Operasional {fmt(skSeries.reduce((s, d) => s + d.sk_operasional, 0))}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="stat-label mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Shield size={11} className="text-accent"/> Koramil di bawah ({koramilRows.length})</span>
                    {koramilLoading && <span className="animate-pulse text-ink-subtle">loading…</span>}
                  </div>
                  {!koramilLoading && koramilRows.length === 0 && (
                    <div className="rounded-md border border-dashed border-white/10 p-3 text-[10px] text-center text-ink-subtle">
                      Tidak ada koramil tercatat untuk KODIM ini.
                    </div>
                  )}
                  {koramilRows.length > 0 && (
                    <div className="rounded-md border border-white/5 max-h-[220px] overflow-y-auto">
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-bg-soft/95 text-[9px] uppercase tracking-widest text-ink-subtle">
                          <tr><th className="text-left px-2 py-1">Koramil</th><th className="text-left px-2 py-1">Danramil</th><th className="px-2 py-1">Pangkat</th></tr>
                        </thead>
                        <tbody>
                          {koramilRows.map((k: any) => (
                            <tr key={k.koramil_id} className="border-t border-white/5 hover:bg-white/[0.02]">
                              <td className="px-2 py-1 text-ink truncate max-w-[120px]" title={k.koramil_name}>{k.koramil_name.replace(/^KORAMIL\s*-?\s*/, "")}</td>
                              <td className="px-2 py-1 text-ink-muted truncate max-w-[120px]" title={k.danramil_name || ""}>{k.danramil_name || "—"}</td>
                              <td className="px-2 py-1 text-center text-ink-subtle">{k.pangkat || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {isAdmin && (
                      <div className="px-2 py-1 text-[9px] text-center border-t border-white/5">
                        <a href="/assignment/koramil-stress" className="text-accent-glow hover:underline">Lihat Stress Index →</a>
                      </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div className="stat-label mb-1.5 flex items-center justify-between">
                    <span>Sekolah Assigned (sample 20)</span>
                    {tableLoading && <span className="animate-pulse text-ink-subtle">loading…</span>}
                  </div>
                  <div className="rounded-md border border-white/5 max-h-[280px] overflow-y-auto">
                    {tableRows.length === 0 && !tableLoading && (
                      <div className="p-3 text-center text-[11px] text-ink-subtle">Tidak ada sekolah ditemukan.</div>
                    )}
                    {tableRows.map(r => (
                      <button
                        key={r.npsn}
                        onClick={() => setTableNpsn(r.npsn)}
                        className="block w-full text-left border-b border-white/5 last:border-0 px-2.5 py-1.5 text-[11px] hover:bg-white/5"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-ink-subtle text-[10px] shrink-0">{r.npsn}</span>
                          <span className="inline-block rounded-sm px-1 text-[9px] font-medium bg-white/5 text-ink-muted">{r.bentuk}</span>
                          <span className={`inline-block rounded-sm px-1 text-[9px] font-medium ${r.status === "NEGERI" ? "bg-ok/15 text-ok" : "bg-accent/15 text-accent"}`}>{r.status[0]}</span>
                          {r.akr && r.akr !== "BT" && (
                            <span className={`inline-block rounded-sm px-1 text-[9px] font-mono ${r.akr === "A" ? "bg-ok/15 text-ok" : r.akr === "B" ? "bg-warn/15 text-warn" : "bg-accent-deep/20 text-accent"}`}>{r.akr}</span>
                          )}
                        </div>
                        <div className="text-ink truncate mt-0.5">{r.nama}</div>
                        <div className="text-ink-subtle text-[10px]">{r.kecamatan}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <a
                  href={`/visualisasi#raw-data`}
                  className="block w-full rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-center text-[11px] text-accent-glow hover:bg-accent/20 transition"
                >
                  <ExternalLink size={11} className="inline mr-1"/> Lihat semua di Visualisasi
                </a>
              </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Floating action bar when multi-pick is active */}
      {picked.size > 0 && (
        <div className="pointer-events-auto absolute left-1/2 z-[500] -translate-x-1/2 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-accent/40 bg-bg-soft/95 px-3 py-2.5 shadow-2xl backdrop-blur max-w-[calc(100vw-1.5rem)]"
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <span className="text-[12px] text-ink">
            <strong className="text-accent-glow">{picked.size}</strong> KODIM dipilih
          </span>
          <span className="text-ink-subtle">·</span>
          <button
            onClick={() => router.push(`/visualisasi?kodim_ids=${Array.from(picked).join(",")}#raw-data`)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-bg hover:bg-accent-glow transition"
          >
            <FileDown size={12}/> Filter di Raw Data
          </button>
          <button
            onClick={() => setPicked(new Set())}
            className="rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-widest text-ink-muted hover:bg-white/10"
          >
            Batal
          </button>
        </div>
      )}

      {tableNpsn && (
        <SekolahDetailModal npsn={tableNpsn} onClose={() => setTableNpsn(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, color = "ink", sub }: { label: string; value: number; color?: string; sub?: string }) {
  const colorCls = color === "accent-glow" ? "text-accent-glow" : color === "ok" ? "text-ok" : color === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-2.5">
      <div className="stat-label">{label}</div>
      <div className={`mt-0.5 font-display text-xl font-bold tabular-nums ${colorCls}`}>{fmt(value)}</div>
      {sub && <div className="text-[10px] text-ink-subtle mt-0.5">{sub}</div>}
    </div>
  );
}

function StressToggle({ color, label, count, active, onChange }: { color: string; label: string; count: number; active: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`flex w-full items-center justify-between rounded-sm border px-2 py-1 text-[11px] transition ${active ? "border-white/15 bg-white/5" : "border-white/5 bg-transparent opacity-50"}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <span className={active ? "text-ink" : "text-ink-subtle"}>{label}</span>
      </span>
      <span className="tabular-nums text-ink-muted">{fmt(count)}</span>
    </button>
  );
}
