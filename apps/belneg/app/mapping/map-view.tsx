"use client";
import { MapContainer, TileLayer, CircleMarker, Popup, LayerGroup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useMemo, useState } from "react";
import { Filter, Eye, EyeOff, Shield, Crosshair, Compass, Target as TargetIcon, ChevronDown } from "lucide-react";
import type { TargetKodamAgg } from "@/lib/db";
import { fmt } from "@/lib/utils";
import { ClusteredSchools, type MapTargetSchoolPoint } from "./cluster-layer";

// School colors per bentuk
const SCHOOL_COLOR: Record<string, string> = {
  SMA: "#3b82f6",
  SMK: "#10b981",
  MA: "#a78bfa",
  MAK: "#ec4899",
};

const BENTUK_OPTIONS = ["SMA", "SMK", "MA", "MAK"] as const;
const LEVEL_OPTIONS = ["KOREM", "KODIM", "KORAMIL"] as const;
const LEVEL_COLOR: Record<string, string> = {
  KOREM: "#f59e0b",
  KODIM: "#3b82f6",
  KORAMIL: "#10b981",
};
const LEVEL_ICON: Record<string, any> = {
  KOREM: Crosshair,
  KODIM: Compass,
  KORAMIL: TargetIcon,
};
const AKR_OPTIONS = ["ALL", "A", "B", "C", "TT", "BT"] as const;
const KODAM_COLOR = "#ef4444";

const INDONESIA_CENTER: [number, number] = [-2.5, 118.0];
const INDONESIA_BOUNDS: [[number, number], [number, number]] = [
  [-11.5, 94.0],   // southwest
  [6.5,  141.5],   // northeast
];

export default function MapView({ schools, kodamAgg }: { schools: MapTargetSchoolPoint[]; kodamAgg: TargetKodamAgg[] }) {
  const [bentukLayers, setBentukLayers] = useState<Record<string, boolean>>({ SMA: true, SMK: true, MA: true, MAK: true });
  const [levelLayers, setLevelLayers] = useState<Record<string, boolean>>({ KOREM: true, KODIM: true, KORAMIL: true });
  const [akr, setAkr] = useState<(typeof AKR_OPTIONS)[number]>("ALL");
  const [showKodam, setShowKodam] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false); // collapsed-by-default on mobile

  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      if (!bentukLayers[s.bentuk]) return false;
      if (!levelLayers[s.level]) return false;
      if (akr !== "ALL" && s.akreditasi !== akr) return false;
      return true;
    });
  }, [schools, bentukLayers, levelLayers, akr]);

  // Aggregate counts per visible bentuk
  const bentukCounts = useMemo(() => {
    const c: Record<string, number> = { SMA: 0, SMK: 0, MA: 0, MAK: 0 };
    filteredSchools.forEach(s => { if (c[s.bentuk] !== undefined) c[s.bentuk]++; });
    return c;
  }, [filteredSchools]);

  // Aggregate counts per visible level
  const levelCounts = useMemo(() => {
    const c: Record<string, number> = { KOREM: 0, KODIM: 0, KORAMIL: 0 };
    filteredSchools.forEach(s => { c[s.level]++; });
    return c;
  }, [filteredSchools]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={INDONESIA_CENTER}
        zoom={5}
        minZoom={4}
        maxBounds={INDONESIA_BOUNDS}
        maxBoundsViscosity={1.0}
        worldCopyJump={false}
        scrollWheelZoom={true}
        className="absolute inset-0"
        preferCanvas={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
          subdomains="abcd"
          maxZoom={19}
          noWrap={true}
        />

        {/* School layer (clustered via leaflet.markercluster directly) */}
        <ClusteredSchools points={filteredSchools} />

        {/* KODAM aggregate centroids — agregasi target per KODAM (tidak ada koordinat markas di data target) */}
        {showKodam && (
          <LayerGroup>
            {kodamAgg.map(k => (
              <CircleMarker
                key={k.kodam}
                center={[k.lat, k.lng]}
                radius={6 + Math.sqrt(k.n_sekolah_target) * 1.4}
                pathOptions={{ color: KODAM_COLOR, fillColor: KODAM_COLOR, fillOpacity: 0.3, weight: 1.5 }}
              >
                <Popup>
                  <div className="text-[12px]">
                    <div className="text-[10px] uppercase tracking-widest text-accent-glow mb-1">KODAM</div>
                    <div className="font-semibold text-ink mb-1">{k.kodam}</div>
                    <div className="text-ink-muted text-[11px]">
                      {fmt(k.n_sekolah_target)} sekolah target · {fmt(k.n_koramil_target)} koramil
                    </div>
                    <div className="text-ink-subtle text-[10px] mt-1">Posisi: centroid koordinat koramil target</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </LayerGroup>
        )}
      </MapContainer>

      {/* Mobile: floating filter toggle button (bottom-right) */}
      <button
        onClick={() => setPanelOpen(true)}
        aria-label="Buka filter peta"
        className="lg:hidden pointer-events-auto absolute bottom-4 right-4 z-[400] flex items-center gap-2 rounded-full border border-accent/40 bg-bg-soft/95 px-4 py-3 text-[12px] font-semibold text-accent-glow shadow-2xl backdrop-blur min-h-[44px]"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <Filter size={14}/>
        Filter ({fmt(filteredSchools.length)})
      </button>

      {/* Mobile backdrop */}
      {panelOpen && (
        <div
          onClick={() => setPanelOpen(false)}
          className="lg:hidden fixed inset-0 z-[450] bg-black/50 backdrop-blur-sm"
        />
      )}

      {/* Floating control panel — desktop right side, mobile bottom sheet */}
      <div className={`pointer-events-none absolute inset-0 z-[460] lg:z-[400] ${panelOpen ? "block" : "hidden lg:block"}`}>
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 lg:bottom-auto lg:inset-x-auto lg:right-3 lg:top-3 lg:w-72 max-h-[80vh] lg:max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-t-2xl lg:rounded-lg border border-white/10 bg-bg-soft/95 backdrop-blur p-3 shadow-2xl"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          {/* Mobile drag-handle */}
          <div className="lg:hidden mx-auto mb-2 h-1 w-12 rounded-full bg-white/15"/>
          <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Filter size={13} className="text-accent" />
              <span className="font-display text-[12px] font-semibold uppercase tracking-wider text-ink">Layer & Filter</span>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              aria-label="Tutup filter"
              className="lg:hidden rounded-md p-1 text-ink-muted hover:bg-white/5 min-h-[32px] min-w-[32px] flex items-center justify-center"
            >
              <ChevronDown size={18}/>
            </button>
          </div>

          {/* BENTUK GROUP */}
          <div className="mb-3">
            <div className="stat-label mb-1.5">Bentuk Sekolah</div>
            <div className="grid grid-cols-2 gap-1.5">
              {BENTUK_OPTIONS.map(k => (
                <LayerToggle
                  key={k}
                  label={k}
                  count={bentukCounts[k]}
                  active={bentukLayers[k]}
                  color={SCHOOL_COLOR[k]}
                  onChange={() => setBentukLayers(l => ({ ...l, [k]: !l[k] }))}
                />
              ))}
            </div>
          </div>

          {/* LEVEL GROUP */}
          <div className="mb-3">
            <div className="stat-label mb-1.5 flex items-center gap-1.5"><Shield size={11}/> Level Komando</div>
            <div className="space-y-1.5">
              {LEVEL_OPTIONS.map(k => (
                <LayerToggle
                  key={k}
                  label={k}
                  count={levelCounts[k]}
                  active={levelLayers[k]}
                  color={LEVEL_COLOR[k]}
                  icon={LEVEL_ICON[k]}
                  onChange={() => setLevelLayers(l => ({ ...l, [k]: !l[k] }))}
                />
              ))}
            </div>
          </div>

          {/* AKREDITASI FILTER */}
          <div className="mb-3">
            <div className="stat-label mb-1.5">Akreditasi</div>
            <div className="flex gap-1">
              {AKR_OPTIONS.map(a => (
                <button
                  key={a}
                  onClick={() => setAkr(a)}
                  className={`flex-1 rounded-sm px-1 py-1 text-[10px] uppercase tracking-widest transition ${akr === a ? "bg-accent text-bg font-semibold" : "bg-white/5 text-ink-muted hover:bg-white/10"}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* KODAM CENTROID TOGGLE */}
          <div className="mb-3">
            <div className="stat-label mb-1.5 flex items-center gap-1.5"><Shield size={11}/> Agregasi Wilayah</div>
            <LayerToggle
              label="Centroid KODAM"
              count={kodamAgg.length}
              active={showKodam}
              color={KODAM_COLOR}
              icon={Shield}
              onChange={() => setShowKodam(v => !v)}
            />
          </div>

          {/* LEGEND */}
          <div className="border-t border-white/5 pt-2.5">
            <div className="stat-label mb-1.5">Legend</div>
            <ul className="space-y-1 text-[10.5px] text-ink-muted">
              {BENTUK_OPTIONS.map(k => (
                <li key={k} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SCHOOL_COLOR[k] }} />
                  {k}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full border" style={{ borderColor: KODAM_COLOR, background: `${KODAM_COLOR}4d` }} />
                Centroid KODAM (ukuran = jumlah sekolah target)
              </li>
            </ul>
          </div>

          <div className="mt-3 border-t border-white/5 pt-2 text-[10px] text-ink-subtle">
            Showing <strong className="text-ink-muted">{fmt(filteredSchools.length)}</strong> sekolah target
            {showKodam && <> · <strong className="text-ink-muted">{fmt(kodamAgg.length)}</strong> centroid KODAM</>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LayerToggle({
  label, count, active, color, icon: Icon, onChange,
}: { label: string; count: number; active: boolean; color: string; icon?: any; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`flex items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-left text-[11px] transition ${active ? "border-white/15 bg-white/5" : "border-white/5 bg-transparent text-ink-subtle opacity-60"}`}
    >
      <span className="flex items-center gap-1.5">
        {Icon ? <Icon size={11} style={{ color }} /> : <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
        <span className={`font-semibold ${active ? "text-ink" : ""}`}>{label}</span>
      </span>
      <span className="flex items-center gap-1.5 tabular-nums text-ink-muted">
        {fmt(count)}
        {active ? <Eye size={10}/> : <EyeOff size={10}/>}
      </span>
    </button>
  );
}
