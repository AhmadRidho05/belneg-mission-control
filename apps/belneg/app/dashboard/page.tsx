import {
  kkriTargetKpi, targetBentukDistribution, targetAkreditasiBreakdown,
  targetInternetBreakdown, targetKodamSummary, targetProvinceDistribution
} from "@/lib/db";
import { fmt, pct } from "@/lib/utils";
import { KpiCard } from "@/components/kpi-card";
import {
  School, Building2, Shield, Crosshair, Compass, Award, Wifi,
  MapPin, PieChart, AlertTriangle, CheckCircle2
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [kpi, bentuk, akr, internet, kodam, provinsiTop] = await Promise.all([
    kkriTargetKpi(),
    targetBentukDistribution(),
    targetAkreditasiBreakdown(),
    targetInternetBreakdown(),
    targetKodamSummary(),
    targetProvinceDistribution(8),
  ]);

  const bentukTotal = bentuk.reduce((a, b) => a + b.n, 0);
  const akrTotal = akr.reduce((a, b) => a + b.n, 0);
  const akrA = akr.find(a => a.level === "A")?.n ?? 0;
  const internetTotal = internet.reduce((a, b) => a + b.n, 0);
  const internetNo = internet.filter(i => /tidak/i.test(i.akses)).reduce((a, b) => a + b.n, 0);
  const coordTotal = kpi.with_coords + kpi.without_coords;

  // Top KODAM by school target coverage
  const kodamTop = kodam.slice(0, 8);

  // Top 3 KODAM by sekolah-per-koramil load (relative to overall average)
  const totalSekolahKodam = kodam.reduce((a, b) => a + b.n_sekolah_target, 0);
  const totalKoramilKodam = kodam.reduce((a, b) => a + b.n_koramil_target, 0);
  const avgRatio = totalKoramilKodam > 0 ? totalSekolahKodam / totalKoramilKodam : 0;
  const bebanTop = [...kodam].sort((a, b) => b.avg_sekolah_per_koramil - a.avg_sekolah_per_koramil).slice(0, 3);

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 lg:p-8">
      {/* HEADER */}
      <header className="flex flex-col gap-2 border-b border-white/5 pb-4 sm:pb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip text-accent-glow border-accent/40">● LIVE FEED</span>
          <span className="chip">Snapshot {new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-ink">
          Mission <span className="text-accent-glow">Briefing</span>
        </h1>
        <p className="max-w-3xl text-[13px] sm:text-sm text-ink-muted">
          Target sasaran KKRI: <strong className="text-ink">{fmt(kpi.total_sekolah_target)} satuan pendidikan</strong> dipadu dengan
          struktur teritorial TNI AD (<strong className="text-ink">{kpi.n_korem_target} Korem · {kpi.n_kodim_target} Kodim · {fmt(kpi.n_koramil_target)} Koramil</strong>)
          tersebar di {kpi.n_provinsi} provinsi dan {kpi.n_kabkota_target} kabupaten/kota untuk Pemetaan Bela Negara Nasional.
        </p>
      </header>

      {/* HEADLINE KPI GRID */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">Headline KPIs</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="Total Sekolah Target" value={kpi.total_sekolah_target} icon={School} accent="gold"
            hint={`${kpi.n_provinsi} provinsi · ${fmt(coordTotal)} entri target`} />
          <KpiCard label="KOREM Target" value={kpi.n_korem_target} icon={Crosshair} />
          <KpiCard label="KODIM Target" value={kpi.n_kodim_target} icon={Compass} />
          <KpiCard label="KORAMIL Target" value={kpi.n_koramil_target} icon={Shield} accent="gold" />
          <KpiCard label="Total Provinsi" value={kpi.n_provinsi} icon={MapPin} />
          <KpiCard label="Kab/Kota Target" value={kpi.n_kabkota_target} icon={Building2} />
          <KpiCard label="Dengan Koordinat" value={pct(kpi.with_coords, coordTotal, 1)} icon={CheckCircle2} accent="ok"
            hint={`${fmt(kpi.with_coords)} dari ${fmt(coordTotal)} entri`} />
          <KpiCard label="Tanpa Koordinat" value={kpi.without_coords} icon={AlertTriangle} accent="warn" />
        </div>
      </section>

      {/* COMBINED INTEL */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title flex items-center gap-2"><PieChart size={14}/> Komposisi Bentuk Sekolah</span>
            <span className="panel-subtitle">{fmt(bentukTotal)} entri</span>
          </div>
          <div className="panel-body space-y-3">
            <div>
              <div className="stat-num-lg">{pct(bentuk[0]?.n ?? 0, bentukTotal, 0)}</div>
              <div className="stat-label mt-1">{bentuk[0]?.bentuk ?? "—"}</div>
            </div>
            <ul className="space-y-1.5 pt-3 border-t border-white/5">
              {bentuk.slice(0, 5).map((b, i) => {
                const colors = ["bg-ok", "bg-accent", "bg-warn", "bg-accent-deep", "bg-ink-subtle"];
                const color = colors[i] ?? "bg-ink-subtle";
                return (
                  <li key={b.bentuk} className="flex items-center gap-2 text-sm">
                    <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />
                    <span className="w-20 truncate text-ink-muted" title={b.bentuk}>{b.bentuk}</span>
                    <div className="flex-1 h-1 rounded-sm bg-white/5">
                      <div className={`h-full rounded-sm ${color}`} style={{ width: `${(b.n / bentukTotal) * 100}%` }} />
                    </div>
                    <span className="w-16 text-right tabular-nums text-ink">{fmt(b.n)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title flex items-center gap-2"><Award size={14}/> Akreditasi</span>
            <span className="panel-subtitle">{fmt(akrTotal)} entri</span>
          </div>
          <div className="panel-body space-y-3">
            <div>
              <div className="stat-num-lg">{pct(akrA, akrTotal, 1)}</div>
              <div className="stat-label mt-1">Akreditasi A</div>
            </div>
            <ul className="space-y-1.5 pt-3 border-t border-white/5">
              {akr.slice(0, 5).map(a => {
                const color = a.level === "A" ? "bg-ok" : a.level === "B" ? "bg-warn" : a.level === "C" ? "bg-accent-deep" : "bg-ink-subtle";
                return (
                  <li key={a.level} className="flex items-center gap-2 text-sm">
                    <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />
                    <span className="w-8 font-mono text-ink-muted">{a.level}</span>
                    <div className="flex-1 h-1 rounded-sm bg-white/5">
                      <div className={`h-full rounded-sm ${color}`} style={{ width: `${(a.n / akrTotal) * 100}%` }} />
                    </div>
                    <span className="w-16 text-right tabular-nums text-ink">{fmt(a.n)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title flex items-center gap-2"><Wifi size={14}/> Status Internet</span>
            <span className="panel-subtitle">{fmt(internetTotal)} entri</span>
          </div>
          <div className="panel-body space-y-3">
            <div>
              <div className="stat-num-lg">{pct(internetTotal - internetNo, internetTotal, 1)}</div>
              <div className="stat-label mt-1">Memiliki Akses Internet</div>
            </div>
            <ul className="space-y-1.5 pt-3 border-t border-white/5">
              {internet.slice(0, 5).map((i, idx) => {
                const noAkses = /tidak/i.test(i.akses);
                const colors = ["bg-ok", "bg-accent", "bg-warn", "bg-crit", "bg-ink-subtle"];
                const color = noAkses ? "bg-crit" : (colors[idx] ?? "bg-ink-subtle");
                return (
                  <li key={i.akses} className="flex items-center gap-2 text-sm">
                    <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />
                    <span className="w-24 truncate text-ink-muted" title={i.akses}>{i.akses}</span>
                    <div className="flex-1 h-1 rounded-sm bg-white/5">
                      <div className={`h-full rounded-sm ${color}`} style={{ width: `${(i.n / internetTotal) * 100}%` }} />
                    </div>
                    <span className="w-16 text-right tabular-nums text-ink">{fmt(i.n)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* MILITARY × EDUCATION */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel lg:col-span-2">
          <div className="panel-head">
            <span className="panel-title flex items-center gap-2"><Shield size={14}/> Distribusi Target per KODAM</span>
            <span className="panel-subtitle">Level KORAMIL</span>
          </div>
          <div className="panel-body">
            <div className="-mx-3 sm:mx-0 overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="px-3 sm:px-0 py-2 stat-label">KODAM</th>
                    <th className="px-2 sm:px-0 py-2 stat-label text-right">Koramil</th>
                    <th className="px-2 sm:px-0 py-2 stat-label text-right">Sekolah</th>
                    <th className="px-2 sm:px-0 py-2 stat-label text-right">Akr A %</th>
                    <th className="px-3 sm:px-0 py-2 stat-label text-right">Sklh/Koramil</th>
                  </tr>
                </thead>
                <tbody>
                  {kodamTop.map(k => (
                    <tr key={k.kodam} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-3 sm:px-0 py-2.5 text-ink">{k.kodam}</td>
                      <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-ink-muted">{fmt(k.n_koramil_target)}</td>
                      <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-ink">{fmt(k.n_sekolah_target)}</td>
                      <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-accent-glow">{k.pct_akreditasi_a.toFixed(1)}%</td>
                      <td className="px-3 sm:px-0 py-2.5 text-right font-mono text-ink-muted">{k.avg_sekolah_per_koramil.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-[11px] text-ink-subtle">
              Diurutkan berdasarkan jumlah sekolah target. <strong className="text-ink-muted">Sklh/Koramil</strong> = rata-rata sekolah target per koramil.
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title flex items-center gap-2"><AlertTriangle size={14} className="text-warn"/> Beban KORAMIL</span>
            <span className="panel-subtitle">Top 3</span>
          </div>
          <div className="panel-body space-y-3">
            {bebanTop.map((k, i) => {
              const ratio = k.avg_sekolah_per_koramil;
              const cls = ratio >= avgRatio * 1.5 ? "border-crit/40 bg-crit/5" : ratio >= avgRatio * 1.1 ? "border-warn/40 bg-warn/5" : "border-ok/40 bg-ok/5";
              const numCls = ratio >= avgRatio * 1.5 ? "text-crit" : ratio >= avgRatio * 1.1 ? "text-warn" : "text-ok";
              return (
                <div key={k.kodam} className={`rounded-md border p-3 ${cls}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-ink-muted">#{i + 1}</span>
                    <span className={`font-display text-2xl font-bold tabular-nums ${numCls}`}>{ratio.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink">{k.kodam}</div>
                  <div className="mt-0.5 text-[11px] text-ink-muted">
                    {fmt(k.n_sekolah_target)} sekolah · {fmt(k.n_koramil_target)} koramil
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TOP PROVINSI */}
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title flex items-center gap-2"><MapPin size={14}/> Top Provinsi by Sekolah Target</span>
          <span className="panel-subtitle">Top {provinsiTop.length}</span>
        </div>
        <div className="panel-body">
          <ul className="space-y-2">
            {provinsiTop.map((p, i) => {
              const max = provinsiTop[0]?.n || 1;
              return (
                <li key={p.provinsi} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-right font-mono text-ink-subtle">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-ink" title={p.provinsi}>{p.provinsi}</div>
                  </div>
                  <div className="w-40 hidden sm:block">
                    <div className="h-1.5 rounded-sm bg-white/5">
                      <div className="h-full rounded-sm bg-accent" style={{ width: `${(p.n / max) * 100}%` }} />
                    </div>
                  </div>
                  <span className="w-16 text-right tabular-nums text-accent-glow font-semibold">{fmt(p.n)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
