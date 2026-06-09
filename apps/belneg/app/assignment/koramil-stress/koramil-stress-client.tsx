"use client";

import { useState, useMemo } from "react";
import { Search, Flame, Map as MapIcon } from "lucide-react";
import Link from "next/link";

export default function KoramilStressClient({ stats, perKoramil, perKodam, byBentuk }: {
  stats: any; perKoramil: any[]; perKodam: any[]; byBentuk: any[];
}) {
  const [q, setQ] = useState("");
  const [kodamFilter, setKodamFilter] = useState("");
  const [bentukFilter, setBentukFilter] = useState("");

  const filtered = useMemo(() => {
    let r = perKoramil;
    if (kodamFilter) r = r.filter(k => k.kodam_name === kodamFilter);
    if (bentukFilter) r = r.filter(k => (k.bentuk_wilayah || "") === bentukFilter || (bentukFilter === "(unset)" && !k.bentuk_wilayah));
    if (q) {
      const lq = q.toLowerCase();
      r = r.filter(k => (k.koramil_name + " " + (k.danramil_name || "") + " " + (k.kodim_name || "")).toLowerCase().includes(lq));
    }
    return r;
  }, [perKoramil, kodamFilter, bentukFilter, q]);

  // Histogram buckets 0-10, 10-20, ..., 90-100
  const buckets = useMemo(() => {
    const b = Array(10).fill(0);
    for (const k of perKoramil) {
      const v = k.stress_index ?? 0;
      const idx = Math.min(9, Math.floor(v / 10));
      b[idx]++;
    }
    return b;
  }, [perKoramil]);
  const bucketMax = Math.max(...buckets, 1);

  const top10 = filtered.slice(0, 10);
  const distinctKodams = useMemo(() => Array.from(new Set(perKoramil.map(k => k.kodam_name))).sort(), [perKoramil]);

  return (
    <div className="px-5 py-6 space-y-6 max-w-7xl mx-auto">
      <header className="lg:pr-56">
        <SubNav active="koramil-stress" />
        <div className="flex items-center gap-3 mt-5">
          <Flame className="text-amber-400" size={26} />
          <div>
            <h1 className="text-xl font-bold text-ink">Koramil Stress Index</h1>
            <p className="text-[11px] text-ink-subtle uppercase tracking-widest">Beban kerja per koramil · TA 2025</p>
          </div>
        </div>
      </header>

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total Koramil"  value={stats.total_koramil} />
        <Kpi label="Distinct Kodim" value={stats.distinct_kodim} />
        <Kpi label="Distinct Kodam" value={stats.distinct_kodam} />
        <Kpi label="With Address"   value={`${Math.round(stats.with_address / stats.total_koramil * 100)}%`} sub={`${stats.with_address}/${stats.total_koramil}`} />
        <Kpi label="With Phone"     value={`${Math.round(stats.with_phone   / stats.total_koramil * 100)}%`} sub={`${stats.with_phone}/${stats.total_koramil}`} />
      </div>

      {/* Formula explainer */}
      <details className="rounded-lg border border-white/8 bg-[#0a1325]/60 p-4">
        <summary className="cursor-pointer text-xs font-semibold text-ink-muted hover:text-amber-300">▾ Bagaimana Stress Index dihitung?</summary>
        <div className="mt-3 space-y-2 text-xs text-ink-muted">
          <p><span className="text-amber-300 font-mono">stress = 0.6 × load + 0.3 × ops_gap + 0.1 × wilayah</span></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong className="text-ink">Load (60%)</strong> — jumlah SMA/SMK/MA/MAK di kabupaten Kodim induk ÷ jumlah koramil sekabupaten, dinormalisasi 0–100 lintas Indonesia. Koramil di daerah dengan banyak sekolah dan sedikit koramil tetangga = tinggi.</li>
            <li><strong className="text-ink">Ops gap (30%)</strong> — % field operasional (alamat, HP, nama Danramil, pangkat) yang kosong. Koramil dengan data tidak lengkap = lebih sulit dimobilisasi.</li>
            <li><strong className="text-ink">Wilayah (10%)</strong> — KR* (remote) +20 · KM (kota) 0 · lainnya 10.</li>
          </ul>
        </div>
      </details>

      {/* Stress distribution histogram */}
      <section>
        <h2 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Sebaran Stress Index</h2>
        <div className="rounded-lg border border-white/8 p-4">
          <div className="flex items-end gap-1 h-32">
            {buckets.map((n, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                <div className="text-[10px] text-ink-subtle">{n}</div>
                <div className="w-full bg-amber-500/70 rounded-t"
                     style={{ height: `${(n / bucketMax) * 100}%`, minHeight: n > 0 ? 4 : 0 }} />
                <div className="text-[10px] text-ink-subtle">{i * 10}-{i * 10 + 10}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Top stressed kodams */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h2 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">Kodam dengan Avg Beban Tertinggi</h2>
          <div className="rounded-lg border border-white/8 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02] text-ink-subtle uppercase text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2">Kodam</th>
                  <th className="text-right px-3 py-2">Koramil</th>
                  <th className="text-right px-3 py-2">Avg Schools/Koramil</th>
                </tr>
              </thead>
              <tbody>
                {perKodam.map(k => (
                  <tr key={k.kodam_id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-1.5 text-ink-muted truncate max-w-[240px]" title={k.kodam_name}>{k.kodam_name}</td>
                    <td className="px-3 py-1.5 text-right text-ink">{k.n_koramils}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-amber-300">{k.avg_schools_per_koramil}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-[11px] uppercase tracking-widest text-ink-subtle mb-2">10 Koramil Paling Tertekan (filter aktif)</h2>
          <div className="rounded-lg border border-white/8 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02] text-ink-subtle uppercase text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2">Koramil</th>
                  <th className="text-right px-3 py-2">Schools/Koramil</th>
                  <th className="text-right px-3 py-2">Stress</th>
                </tr>
              </thead>
              <tbody>
                {top10.map(k => (
                  <tr key={k.koramil_id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-1.5 text-ink-muted truncate max-w-[200px]" title={k.koramil_name + " · " + k.kodim_name}>
                      {k.koramil_name}<div className="text-[10px] text-ink-subtle truncate">{k.kodim_name}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-ink">{k.schools_per_koramil}</td>
                    <td className="px-3 py-1.5 text-right font-mono"><StressBadge v={k.stress_index} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Full table with filter */}
      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-widest text-ink-subtle">Daftar Lengkap Koramil ({filtered.length.toLocaleString("id-ID")})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-2.5 top-2.5 text-ink-subtle" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Cari nama koramil / danramil / kodim"
              className="w-full pl-8 pr-3 py-2 text-xs bg-white/[0.02] border border-white/10 rounded text-ink placeholder:text-ink-subtle" />
          </div>
          <select value={kodamFilter} onChange={e => setKodamFilter(e.target.value)}
            className="text-xs bg-white/[0.02] border border-white/10 rounded px-2 py-2 text-ink">
            <option value="">Semua Kodam</option>
            {distinctKodams.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={bentukFilter} onChange={e => setBentukFilter(e.target.value)}
            className="text-xs bg-white/[0.02] border border-white/10 rounded px-2 py-2 text-ink">
            <option value="">Semua Bentuk</option>
            {byBentuk.map(b => <option key={b.bentuk} value={b.bentuk}>{b.bentuk} ({b.n})</option>)}
          </select>
        </div>

        <div className="rounded-lg border border-white/8 overflow-hidden overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.02] text-ink-subtle uppercase text-[10px]">
              <tr>
                <th className="text-left px-3 py-2">Koramil</th>
                <th className="text-left px-3 py-2">Kodim</th>
                <th className="text-left px-3 py-2">Kodam</th>
                <th className="text-left px-3 py-2">Danramil</th>
                <th className="px-3 py-2">Pangkat</th>
                <th className="text-right px-3 py-2">SMA/K/Koramil</th>
                <th className="text-right px-3 py-2">Stress</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(k => (
                <tr key={k.koramil_id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-1.5 text-ink-muted truncate max-w-[200px]" title={k.koramil_name}>{k.koramil_name}</td>
                  <td className="px-3 py-1.5 text-ink-subtle truncate max-w-[180px]" title={k.kodim_name}>{k.kodim_name}</td>
                  <td className="px-3 py-1.5 text-ink-subtle truncate max-w-[180px]" title={k.kodam_name}>{k.kodam_name}</td>
                  <td className="px-3 py-1.5 text-ink-subtle truncate max-w-[160px]" title={k.danramil_name || ""}>{k.danramil_name || "—"}</td>
                  <td className="px-3 py-1.5 text-center text-ink-subtle">{k.pangkat || "—"}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{k.schools_per_koramil}</td>
                  <td className="px-3 py-1.5 text-right font-mono"><StressBadge v={k.stress_index} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <div className="px-3 py-2 text-[10px] text-ink-subtle bg-white/[0.01] border-t border-white/5">
              Menampilkan 200 teratas dari {filtered.length.toLocaleString("id-ID")} hasil. Perketat filter untuk lihat sisanya.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/8 p-3">
      <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{label}</div>
      <div className="text-xl font-bold text-amber-400 mt-1">{typeof value === "number" ? value.toLocaleString("id-ID") : value}</div>
      {sub && <div className="text-[10px] text-ink-subtle mt-0.5">{sub}</div>}
    </div>
  );
}

function StressBadge({ v }: { v: number }) {
  const color = v >= 70 ? "text-red-400 bg-red-500/10 border-red-500/40"
              : v >= 40 ? "text-amber-300 bg-amber-500/10 border-amber-500/40"
                        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/40";
  return <span className={`inline-block px-2 py-0.5 text-[10px] rounded border ${color}`}>{v}</span>;
}

// Shared sub-nav (mirrored in assignment-client.tsx)
export function SubNav({ active }: { active: "kodim-load" | "koramil-stress" }) {
  return (
    <nav className="flex gap-1 border-b border-white/8">
      <Link href="/assignment/map"
            className={`px-3 py-2 text-xs border-b-2 transition flex items-center gap-1.5 ${active === "kodim-load" ? "border-amber-400 text-amber-300" : "border-transparent text-ink-muted hover:text-ink"}`}>
        <MapIcon size={13}/> Kodim Load
      </Link>
      <Link href="/assignment/koramil-stress"
            className={`px-3 py-2 text-xs border-b-2 transition flex items-center gap-1.5 ${active === "koramil-stress" ? "border-amber-400 text-amber-300" : "border-transparent text-ink-muted hover:text-ink"}`}>
        <Flame size={13}/> Koramil Stress Index
      </Link>
    </nav>
  );
}
