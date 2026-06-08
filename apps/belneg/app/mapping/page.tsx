import { mapSchools, mapMilitary, headlineKpi, koramilCountByKodim } from "@/lib/db";
import MapClient from "./map-client";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MappingPage() {
  const [schools, military, kpi, koramilByKodim] = await Promise.all([
    mapSchools(),
    mapMilitary(),
    headlineKpi(),
    koramilCountByKodim(),
  ]);

  const totalKoramil = Object.values(koramilByKodim).reduce((s, n) => s + n, 0);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-screen flex-col">
      <header className="flex flex-col gap-2 border-b border-white/5 p-4 lg:p-6">
        <div className="flex items-center gap-2">
          <span className="chip text-accent-glow border-accent/40">● TACTICAL MAP</span>
          <span className="chip">{fmt(schools.length)} sekolah</span>
          <span className="chip">{fmt(military.length)} pos militer</span>
          <span className="chip">{fmt(totalKoramil)} koramil</span>
        </div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight text-ink">
          Mapping <span className="text-accent-glow">Sebaran</span>
        </h1>
      </header>
      <div className="flex-1 min-h-0">
        <MapClient schools={schools} military={military} koramilByKodim={koramilByKodim} />
      </div>
    </div>
  );
}
