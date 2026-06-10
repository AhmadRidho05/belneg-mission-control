"use client";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";

export type MapTargetSchoolPoint = {
  npsn: string;
  nama: string;
  bentuk: string;
  akreditasi: string;
  level: "KOREM" | "KODIM" | "KORAMIL";
  unit: string;
  kodam: string | null;
  kab_kota: string;
  lat: number;
  lng: number;
};

const SCHOOL_COLOR: Record<string, string> = {
  SMA: "#3b82f6", SMK: "#10b981", MA: "#a78bfa", MAK: "#ec4899",
};
const DEFAULT_COLOR = "#94a3b8";

function popupHtml(s: MapTargetSchoolPoint): string {
  return `
    <div style="font-size:12px;line-height:1.4">
      <div style="font-weight:600;color:#e8edf5;margin-bottom:4px">${escapeHtml(s.nama)}</div>
      <div style="color:#9aa6bd">NPSN: <span style="font-family:ui-monospace,monospace">${s.npsn}</span></div>
      <div style="color:#9aa6bd">Bentuk: <span style="color:#e8edf5">${s.bentuk}</span></div>
      <div style="color:#9aa6bd">Akreditasi: <span style="color:#fbbf24;font-weight:600">${s.akreditasi}</span></div>
      <div style="color:#9aa6bd">Level: <span style="color:#e8edf5">${s.level}</span></div>
      <div style="color:#9aa6bd">Unit: <span style="color:#e8edf5">${escapeHtml(s.unit)}${s.kodam ? ` · ${escapeHtml(s.kodam)}` : ""}</span></div>
      <div style="color:#9aa6bd">Kab/Kota: <span style="color:#e8edf5">${escapeHtml(s.kab_kota)}</span></div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function ClusteredSchools({ points }: { points: MapTargetSchoolPoint[] }) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const group = (L as any).markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      disableClusteringAtZoom: 11,
    }) as L.MarkerClusterGroup;
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();

    const markers: L.CircleMarker[] = [];
    for (const s of points) {
      const color = SCHOOL_COLOR[s.bentuk] ?? DEFAULT_COLOR;
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 3.4,
        color,
        weight: 1.2,
        fillColor: color,
        fillOpacity: 0.78,
      });
      marker.bindPopup(popupHtml(s));
      markers.push(marker);
    }
    group.addLayers(markers);
  }, [points]);

  return null;
}
