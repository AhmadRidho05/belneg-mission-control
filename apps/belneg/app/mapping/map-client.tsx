"use client";
import dynamic from "next/dynamic";
import type { MapTargetSchoolPoint } from "./cluster-layer";
import type { TargetKodamAgg } from "@/lib/db";

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-bg-soft">
      <div className="text-sm text-ink-muted animate-pulse">Loading tactical map…</div>
    </div>
  ),
});

export default function MapClient(props: { schools: MapTargetSchoolPoint[]; kodamAgg: TargetKodamAgg[] }) {
  return <MapView {...props} />;
}
