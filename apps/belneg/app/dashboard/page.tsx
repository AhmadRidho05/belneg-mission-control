import {
  headlineKpi, kodamSummary, statusBreakdown, akreditasiBreakdown,
  internetBreakdown, listrikBreakdown, topYayasan
} from "@/lib/db";
import { fmt, pct } from "@/lib/utils";
import { KpiCard, MiniBar } from "@/components/kpi-card";
import {
  School, Building2, Shield, Crosshair, Compass, Award, Zap, Wifi,
  Users, MapPin, TrendingUp, AlertTriangle
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [kpi, kodam, status, akr, internet, listrik, yayasanTop] = await Promise.all([
    headlineKpi(),
    kodamSummary(),
    statusBreakdown(),
    akreditasiBreakdown(),
    internetBreakdown(),
    listrikBreakdown(),
    topYayasan(8),
  ]);

  const negeri = status.find(s => s.status === "NEGERI")?.n ?? 0;
  const swasta = status.find(s => s.status === "SWASTA")?.n ?? 0;
  const akrTotal = akr.reduce((a, b) => a + b.n, 0);
  const akrA = akr.find(a => a.level === "A")?.n ?? 0;
  const internetTotal = internet.reduce((a, b) => a + b.n, 0);
  const internetNo = internet.find(i => /tidak/i.test(i.akses))?.n ?? 0;
  const pln = listrik.find(l => l.sumber === "PLN")?.n ?? 0;

  // Top 3 stress KODAM (highest sekolah-per-kodim)
  const stressTop = [...kodam].sort((a, b) => b.ratio_sekolah_per_kodim - a.ratio_sekolah_per_kodim).slice(0, 3);

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
          Cross-domain intelligence: <strong className="text-ink">{fmt(kpi.total_sekolah)} satuan pendidikan menengah</strong> dipadu dengan
          struktur teritorial TNI AD (<strong className="text-ink">{kpi.n_kodam} Kodam · {kpi.n_korem} Korem · {kpi.n_kodim} Kodim</strong>)
          untuk Pemetaan Bela Negara Nasional.
        </p>
      </header>

      {/* HEADLINE KPI GRID */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">Headline KPIs</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="Total Satuan Pendidikan" value={kpi.total_sekolah} icon={School} accent="gold"
            hint={`${kpi.n_provinsi} provinsi · ${fmt(kpi.with_coords)} koordinat`} />
          <KpiCard label="SMA" value={kpi.total_sma} icon={School} />
          <KpiCard label="SMK" value={kpi.total_smk} icon={School} />
          <KpiCard label="MA + MAK + lainnya" value={kpi.total_ma} icon={School} />
          <KpiCard label="Yayasan Pendidikan" value={kpi.total_yayasan} icon={Building2}
            hint={`${fmt(kpi.total_naungan)} relasi naungan`} />
          <KpiCard label="KODAM" value={kpi.n_kodam} icon={Shield} accent="gold" />
          <KpiCard label="KOREM" value={kpi.n_korem} icon={Crosshair}
            hint="excl. 12 Berdiri Sendiri" />
          <KpiCard label="KODIM" value={kpi.n_kodim} icon={Compass} />
        </div>
      </section>

      {/* COMBINED INTEL */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title flex items-center gap-2"><Award size={14}/> Komposisi Sekolah</span>
            <span className="panel-subtitle">Public · Private</span>
          </div>
          <div className="panel-body space-y-5">
            <div>
              <div className="stat-num-lg">{pct(negeri, negeri + swasta, 0)}</div>
              <div className="stat-label mt-1">Sekolah Negeri</div>
            </div>
            <MiniBar a={negeri} b={swasta} />
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
              <div>
                <div className="stat-label">Negeri</div>
                <div className="stat-num text-ok">{fmt(negeri)}</div>
              </div>
              <div>
                <div className="stat-label">Swasta</div>
                <div className="stat-num text-accent">{fmt(swasta)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title flex items-center gap-2"><Award size={14}/> Akreditasi</span>
            <span className="panel-subtitle">{fmt(akrTotal)} entries</span>
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
            <span className="panel-title flex items-center gap-2"><Zap size={14}/> Infrastruktur</span>
            <span className="panel-subtitle">Listrik · Internet</span>
          </div>
          <div className="panel-body space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="stat-label">Listrik PLN</div>
                <div className="stat-num text-ok">{pct(pln, kpi.total_sekolah, 1)}</div>
                <div className="text-[11px] text-ink-muted">{fmt(pln)} sekolah</div>
              </div>
              <div>
                <div className="stat-label">Tanpa Internet</div>
                <div className="stat-num text-crit">{pct(internetNo, internetTotal, 1)}</div>
                <div className="text-[11px] text-ink-muted">{fmt(internetNo)} sekolah</div>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5 space-y-1.5">
              {internet.slice(0, 4).map(i => (
                <div key={i.akses} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ink-muted">
                    <Wifi size={11} /> {i.akses}
                  </span>
                  <span className="tabular-nums text-ink">{fmt(i.n)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* MILITARY × EDUCATION */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel lg:col-span-2">
          <div className="panel-head">
            <span className="panel-title flex items-center gap-2"><Shield size={14}/> Top KODAM by School Coverage</span>
            <span className="panel-subtitle">Multi-domain</span>
          </div>
          <div className="panel-body">
            <div className="-mx-3 sm:mx-0 overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="px-3 sm:px-0 py-2 stat-label">KODAM</th>
                    <th className="px-2 sm:px-0 py-2 stat-label text-right">Korem</th>
                    <th className="px-2 sm:px-0 py-2 stat-label text-right">Kodim</th>
                    <th className="px-2 sm:px-0 py-2 stat-label text-right">Sekolah</th>
                    <th className="px-2 sm:px-0 py-2 stat-label text-right">Akr A %</th>
                    <th className="px-3 sm:px-0 py-2 stat-label text-right">Sklh/Kdm</th>
                  </tr>
                </thead>
                <tbody>
                  {kodam.slice(0, 8).map(k => {
                    const stress = k.ratio_sekolah_per_kodim;
                    const stressCls = stress >= 200 ? "text-crit" : stress >= 100 ? "text-warn" : "text-ok";
                    return (
                      <tr key={k.kodam_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-3 sm:px-0 py-2.5 text-ink">{k.kodam_name}</td>
                        <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-ink-muted">{k.n_korem}</td>
                        <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-ink-muted">{k.n_kodim}</td>
                        <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-ink">{fmt(k.n_sekolah)}</td>
                        <td className="px-2 sm:px-0 py-2.5 text-right tabular-nums text-accent-glow">{k.pct_akreditasi_a.toFixed(1)}%</td>
                        <td className={`px-3 sm:px-0 py-2.5 text-right font-mono ${stressCls}`}>{stress.toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-[11px] text-ink-subtle">
              <strong className="text-ink-muted">Rasio &lt; 100</strong> hijau · <strong className="text-ink-muted">100–200</strong> kuning · <strong className="text-ink-muted">≥ 200</strong> merah (overload coverage).
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title flex items-center gap-2"><AlertTriangle size={14} className="text-warn"/> Stress Index</span>
            <span className="panel-subtitle">Top 3</span>
          </div>
          <div className="panel-body space-y-3">
            {stressTop.map((k, i) => {
              const stress = k.ratio_sekolah_per_kodim;
              const cls = stress >= 200 ? "border-crit/40 bg-crit/5" : stress >= 100 ? "border-warn/40 bg-warn/5" : "border-ok/40 bg-ok/5";
              const numCls = stress >= 200 ? "text-crit" : stress >= 100 ? "text-warn" : "text-ok";
              return (
                <div key={k.kodam_id} className={`rounded-md border p-3 ${cls}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-ink-muted">#{i + 1}</span>
                    <span className={`font-display text-2xl font-bold tabular-nums ${numCls}`}>{stress.toFixed(0)}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink">{k.kodam_name}</div>
                  <div className="mt-0.5 text-[11px] text-ink-muted">
                    {fmt(k.n_sekolah)} sekolah · {k.n_kodim} kodim
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TOP YAYASAN */}
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title flex items-center gap-2"><Building2 size={14}/> Top 8 Yayasan by Naungan</span>
          <span className="panel-subtitle">Largest networks</span>
        </div>
        <div className="panel-body">
          <ul className="space-y-2">
            {yayasanTop.map((y, i) => {
              const max = yayasanTop[0]?.n_naungan || 1;
              return (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-right font-mono text-ink-subtle">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-ink" title={y.nama}>{y.nama}</div>
                    <div className="text-[11px] text-ink-subtle">{y.provinsi}</div>
                  </div>
                  <div className="w-40 hidden sm:block">
                    <div className="h-1.5 rounded-sm bg-white/5">
                      <div className="h-full rounded-sm bg-accent" style={{ width: `${(y.n_naungan / max) * 100}%` }} />
                    </div>
                  </div>
                  <span className="w-16 text-right tabular-nums text-accent-glow font-semibold">{fmt(y.n_naungan)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
