"use client";
import { MapContainer, TileLayer, Marker, Popup, LayerGroup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useMemo, useState } from "react";
import { Filter, Eye, EyeOff, Crosshair, School, Shield, Compass, ChevronUp, ChevronDown } from "lucide-react";
import type { MapSchoolPoint, MapMilitaryPoint } from "@/lib/db";
import { fmt } from "@/lib/utils";
import { ClusteredSchools } from "./cluster-layer";

// School colors per bentuk
const SCHOOL_COLOR: Record<string, string> = {
  SMA: "#3b82f6",
  SMK: "#10b981",
  MA: "#a78bfa",
  MAK: "#ec4899",
};
const DEFAULT_SCHOOL_COLOR = "#94a3b8";

// Military marker icons (SVG-based DivIcon).
// KODIM size scales with koramilCount (more koramils under a kodim = larger marker).
function militaryIcon(tipe: "KODAM" | "KOREM" | "KODIM", koramilCount = 0): L.DivIcon {
  const baseSize = tipe === "KODAM" ? 28 : tipe === "KOREM" ? 22 : 16;
  // Koramil density bump for KODIM: +0–10px on top of base 16
  const sizeBump = tipe === "KODIM" ? Math.min(10, Math.round((koramilCount || 0) / 5)) : 0;
  const size = baseSize + sizeBump;
  const color = tipe === "KODAM" ? "#ef4444" : tipe === "KOREM" ? "#f59e0b" : "#c9b585";
  const ring = tipe === "KODAM" ? 3 : 2;
  const badge = tipe === "KODIM" && koramilCount > 0
    ? `<div style="position:absolute;top:-6px;right:-8px;min-width:16px;height:14px;padding:0 4px;border-radius:7px;background:#0a0f1c;border:1px solid ${color};color:${color};font-size:8.5px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif">${koramilCount}</div>`
    : "";
  return L.divIcon({
    className: "military-marker",
    html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${ring}px solid #0a0f1c;box-shadow:0 0 0 1px ${color},0 0 12px ${color}aa;display:flex;align-items:center;justify-content:center;font-size:${Math.round(baseSize * 0.45)}px;color:#0a0f1c;font-weight:900;font-family:ui-sans-serif">${tipe[0]}${badge}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const BENTUK_OPTIONS = ["SMA", "SMK", "MA", "MAK"] as const;
const MIL_OPTIONS = ["KODAM", "KOREM", "KODIM"] as const;

export default function MapView({ schools, military, koramilByKodim = {} }: { schools: MapSchoolPoint[]; military: MapMilitaryPoint[]; koramilByKodim?: Record<string, number> }) {
  const [layers, setLayers] = useState({
    SMA: true, SMK: true, MA: true, MAK: true,
    KODAM: true, KOREM: true, KODIM: true,
  });
  const [status, setStatus] = useState<"ALL" | "NEGERI" | "SWASTA">("ALL");
  const [akr, setAkr] = useState<"ALL" | "A" | "B" | "C" | "BT">("ALL");
  const [panelOpen, setPanelOpen] = useState(false); // collapsed-by-default on mobile

  // Province filter (computed lazily — extract unique province names from school NPSN locations)
  // Actually we don't have province on the school point payload — keep it simple and add later.

  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      // Map MA-family
      const bentukKey = s.bentuk === "MA" ? "MA" :
                        s.bentuk === "MAK" ? "MAK" :
                        s.bentuk === "SMA" ? "SMA" :
                        s.bentuk === "SMK" ? "SMK" :
                        null;
      if (!bentukKey || !(layers as any)[bentukKey]) return false;
      if (status !== "ALL" && s.status !== status) return false;
      if (akr !== "ALL") {
        if (akr === "BT" && s.akr !== "BT") return false;
        if (akr !== "BT" && s.akr !== akr) return false;
      }
      return true;
    });
  }, [schools, layers, status, akr]);

  const filteredMil = useMemo(() => military.filter(m => (layers as any)[m.tipe]), [military, layers]);

  // Aggregate counts per visible bentuk
  const counts = useMemo(() => {
    const c: Record<string, number> = { SMA: 0, SMK: 0, MA: 0, MAK: 0 };
    filteredSchools.forEach(s => {
      const k = s.bentuk === "MA" ? "MA" : s.bentuk === "MAK" ? "MAK" : s.bentuk === "SMA" ? "SMA" : s.bentuk === "SMK" ? "SMK" : null;
      if (k) c[k]++;
    });
    return c;
  }, [filteredSchools]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[-2.5, 118]}
        zoom={5}
        scrollWheelZoom={true}
        className="absolute inset-0"
        preferCanvas={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
          subdomains="abcd"
          maxZoom={19}
        />

        {/* School layer (clustered via leaflet.markercluster directly) */}
        <ClusteredSchools points={filteredSchools} />

        {/* Military layer (NOT clustered — they're scarce + iconic).
            KODIM markers carry a koramil-count badge + density-scaled size. */}
        <LayerGroup>
          {filteredMil.map(m => {
            const koramilN = m.tipe === "KODIM" ? (koramilByKodim[m.id] || 0) : 0;
            return (
              <Marker key={m.id} position={[m.lat, m.lng]} icon={militaryIcon(m.tipe, koramilN)}>
                <Popup>
                  <div className="text-[12px]">
                    <div className="text-[10px] uppercase tracking-widest text-accent-glow mb-1">{m.tipe}</div>
                    <div className="font-semibold text-ink mb-1">{m.name}</div>
                    {m.address && <div className="text-ink-muted text-[11px]">{m.address}</div>}
                    {m.tipe === "KODIM" && koramilN > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/10 text-[11px]">
                        <span className="text-amber-300 font-semibold">{koramilN}</span>
                        <span className="text-ink-muted"> koramil di bawahnya · </span>
                        <a href={`/assignment/koramil-stress`} className="text-accent-glow underline">stress index</a>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </LayerGroup>
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

          {/* SCHOOLS GROUP */}
          <div className="mb-3">
            <div className="stat-label mb-1.5 flex items-center gap-1.5"><School size={11}/> Satuan Pendidikan</div>
            <div className="grid grid-cols-2 gap-1.5">
              {BENTUK_OPTIONS.map(k => (
                <LayerToggle
                  key={k}
                  label={k}
                  count={counts[k]}
                  active={(layers as any)[k]}
                  color={SCHOOL_COLOR[k]}
                  onChange={() => setLayers(l => ({ ...l, [k]: !(l as any)[k] }))}
                />
              ))}
            </div>
          </div>

          {/* MILITARY GROUP */}
          <div className="mb-3">
            <div className="stat-label mb-1.5 flex items-center gap-1.5"><Shield size={11}/> Komando Teritorial</div>
            <div className="space-y-1.5">
              {MIL_OPTIONS.map(k => {
                const milCount = filteredMil.filter(m => m.tipe === k).length;
                const color = k === "KODAM" ? "#ef4444" : k === "KOREM" ? "#f59e0b" : "#c9b585";
                const Icon = k === "KODAM" ? Shield : k === "KOREM" ? Crosshair : Compass;
                return (
                  <LayerToggle
                    key={k}
                    label={k}
                    count={milCount}
                    active={(layers as any)[k]}
                    color={color}
                    icon={Icon}
                    onChange={() => setLayers(l => ({ ...l, [k]: !(l as any)[k] }))}
                  />
                );
              })}
            </div>
          </div>

          {/* STATUS FILTER */}
          <div className="mb-3">
            <div className="stat-label mb-1.5">Status</div>
            <div className="flex gap-1">
              {(["ALL", "NEGERI", "SWASTA"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 rounded-sm px-2 py-1 text-[10px] uppercase tracking-widest transition ${status === s ? "bg-accent text-bg font-semibold" : "bg-white/5 text-ink-muted hover:bg-white/10"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* AKREDITASI FILTER */}
          <div className="mb-3">
            <div className="stat-label mb-1.5">Akreditasi</div>
            <div className="flex gap-1">
              {(["ALL", "A", "B", "C", "BT"] as const).map(a => (
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
              {MIL_OPTIONS.map(k => {
                const color = k === "KODAM" ? "#ef4444" : k === "KOREM" ? "#f59e0b" : "#c9b585";
                return (
                  <li key={k} className="flex items-center gap-2">
                    <span className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-black text-bg" style={{ background: color, border: "1.5px solid #0a0f1c", boxShadow: `0 0 0 1px ${color}` }}>
                      {k[0]}
                    </span>
                    {k}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-3 border-t border-white/5 pt-2 text-[10px] text-ink-subtle">
            Showing <strong className="text-ink-muted">{fmt(filteredSchools.length)}</strong> sekolah · <strong className="text-ink-muted">{fmt(filteredMil.length)}</strong> pos militer
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
