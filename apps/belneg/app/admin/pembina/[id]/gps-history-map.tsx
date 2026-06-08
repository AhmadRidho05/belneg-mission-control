"use client";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";

type Point = {
  report_id: string;
  lat: number; lng: number;
  reported_at: string;
  jenis_kegiatan: string;
  sekolah_nama: string | null;
};

function numberedIcon(n: number, color: string): L.DivIcon {
  const size = 28;
  return L.divIcon({
    className: "gps-history-marker",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #0a0f1c;box-shadow:0 0 0 1px ${color},0 0 10px ${color}aa;display:flex;align-items:center;justify-content:center;font-size:11px;color:#0a0f1c;font-weight:900;font-family:ui-monospace,monospace">${n}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ points }: { points: Point[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 11);
      return;
    }
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [points, map]);
  return null;
}

export default function GpsHistoryMap({ points }: { points: Point[] }) {
  const center: [number, number] = points.length > 0
    ? [points[0].lat, points[0].lng]
    : [-2.5, 118];

  // Color: gradient from cool (early) to warm (recent)
  const colors = useMemo(() => points.map((_, i) => {
    const t = points.length <= 1 ? 1 : i / (points.length - 1);
    // hsl 220 (blue) → 30 (orange) → 0 (red, latest)
    const hue = 220 - t * 220;
    return `hsl(${hue.toFixed(0)} 80% 55%)`;
  }), [points]);

  const polyPositions = points.map(p => [p.lat, p.lng] as [number, number]);

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-md">
      <MapContainer center={center} zoom={6} scrollWheelZoom className="h-full w-full" preferCanvas>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
          subdomains="abcd"
          maxZoom={19}
        />
        <FitBounds points={points} />

        {/* Polyline (kronologis) */}
        {polyPositions.length >= 2 && (
          <Polyline
            positions={polyPositions}
            pathOptions={{ color: "#fbbf24", weight: 2.5, opacity: 0.7, dashArray: "4 4" }}
          />
        )}

        {/* Numbered markers */}
        {points.map((p, i) => (
          <Marker key={p.report_id + i} position={[p.lat, p.lng]} icon={numberedIcon(i + 1, colors[i])}>
            <Popup>
              <div className="text-[12px]">
                <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: colors[i] }}>
                  #{i + 1} · {new Date(p.reported_at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="font-semibold mt-1">{p.jenis_kegiatan}</div>
                {p.sekolah_nama && <div className="text-[11px] mt-0.5" style={{ color: "#9aa6bd" }}>{p.sekolah_nama}</div>}
                <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener" style={{ color: "#fbbf24", fontSize: 11 }}>
                  {p.lat.toFixed(5)}, {p.lng.toFixed(5)} ↗
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[400] rounded-md border border-white/10 bg-bg-soft/95 backdrop-blur px-3 py-2 shadow-2xl">
        <div className="stat-label mb-1">Kronologis</div>
        <div className="flex items-center gap-2 text-[11px] text-ink-muted">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "hsl(220 80% 55%)" }}/>
          <span>Pertama</span>
          <span className="mx-1 text-ink-subtle">→</span>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "hsl(0 80% 55%)" }}/>
          <span>Terbaru</span>
        </div>
      </div>
    </div>
  );
}
