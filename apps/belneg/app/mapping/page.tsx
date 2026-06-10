import { targetSchoolDirectory, targetKodamAggregates } from "@/lib/db";
import MapClient from "./map-client";
import type { MapTargetSchoolPoint } from "./cluster-layer";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Indonesia bounding box — used to drop entries with invalid/out-of-range coordinates.
const LAT_MIN = -11.5, LAT_MAX = 6.5;
const LNG_MIN = 94.0, LNG_MAX = 141.5;

export default async function MappingPage() {
  const [directory, kodamAgg] = await Promise.all([
    targetSchoolDirectory(),
    targetKodamAggregates(),
  ]);

  const schools: MapTargetSchoolPoint[] = directory
    .filter((s): s is typeof s & { lat: number; lng: number } =>
      s.lat != null && s.lng != null &&
      s.lat >= LAT_MIN && s.lat <= LAT_MAX &&
      s.lng >= LNG_MIN && s.lng <= LNG_MAX
    )
    .map(s => ({
      npsn: s.npsn,
      nama: s.nama,
      bentuk: s.bentuk,
      akreditasi: s.akreditasi,
      level: s.level,
      unit: s.unit,
      kodam: s.kodam,
      kab_kota: s.kab_kota,
      lat: s.lat,
      lng: s.lng,
    }));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-screen flex-col">
      <header className="flex flex-col gap-2 border-b border-white/5 p-4 lg:p-6">
        <div className="flex items-center gap-2">
          <span className="chip text-accent-glow border-accent/40">● TACTICAL MAP</span>
          <span className="chip">{fmt(schools.length)} sekolah target</span>
          <span className="chip">{fmt(kodamAgg.length)} KODAM</span>
        </div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight text-ink">
          Mapping <span className="text-accent-glow">Sasaran KKRI</span>
        </h1>
      </header>
      <div className="flex-1 min-h-0">
        <MapClient schools={schools} kodamAgg={kodamAgg} />
      </div>
    </div>
  );
}
