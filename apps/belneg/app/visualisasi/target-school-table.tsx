"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Database, Search, X } from "lucide-react";
import { fmt } from "@/lib/utils";
import type { TargetSchoolRow } from "@/lib/db";

const PAGE_SIZE = 50;

const AKR_BADGE: Record<string, string> = {
  A: "bg-ok/15 text-ok border-ok/30",
  B: "bg-warn/15 text-warn border-warn/30",
  C: "bg-accent-deep/20 text-accent border-accent/30",
  TT: "bg-crit/15 text-crit border-crit/30",
  BT: "bg-white/5 text-ink-subtle border-white/10",
};
const LEVEL_BADGE: Record<string, string> = {
  KOREM: "bg-accent/10 text-accent-glow",
  KODIM: "bg-[#3b82f6]/15 text-[#60a5fa]",
  KORAMIL: "bg-ok/10 text-ok",
};

type Level = "ALL" | "KOREM" | "KODIM" | "KORAMIL";

export function TargetSchoolTable({ schools }: { schools: TargetSchoolRow[] }) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>("ALL");
  const [bentuk, setBentuk] = useState("ALL");
  const [akr, setAkr] = useState("ALL");
  const [offset, setOffset] = useState(0);
  const [deepLink, setDeepLink] = useState<string[]>([]);

  // Best-effort deep link from /assignment: /visualisasi?kodim_ids=...#raw-data
  useEffect(() => {
    const raw = searchParams?.get("kodim_ids");
    if (!raw) return;
    const tokens = raw.split(",").map(s => s.trim()).filter(Boolean);
    if (!tokens.length) return;
    setLevel("KODIM");
    setDeepLink(tokens);
    setTimeout(() => document.getElementById("raw-data")?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [searchParams]);

  const bentukOptions = useMemo(() => Array.from(new Set(schools.map(s => s.bentuk))).sort(), [schools]);
  const akrOptions = useMemo(() => Array.from(new Set(schools.map(s => s.akreditasi))).sort(), [schools]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools.filter(s => {
      if (level !== "ALL" && s.level !== level) return false;
      if (bentuk !== "ALL" && s.bentuk !== bentuk) return false;
      if (akr !== "ALL" && s.akreditasi !== akr) return false;
      if (deepLink.length) {
        const unit = s.unit.toLowerCase();
        if (!deepLink.some(t => unit.includes(t.toLowerCase()))) return false;
      }
      if (q) {
        const hay = `${s.nama} ${s.npsn} ${s.unit} ${s.kab_kota} ${s.kecamatan ?? ""} ${s.provinsi}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [schools, level, bentuk, akr, search, deepLink]);

  // Reset pagination whenever the filter set changes
  useEffect(() => { setOffset(0); }, [search, level, bentuk, akr, deepLink]);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);

  const hasFilter = search !== "" || level !== "ALL" || bentuk !== "ALL" || akr !== "ALL" || deepLink.length > 0;
  const clearAll = () => {
    setSearch(""); setLevel("ALL"); setBentuk("ALL"); setAkr("ALL"); setDeepLink([]);
  };

  return (
    <div className="panel">
      <div className="panel-head flex-wrap gap-2">
        <span className="panel-title flex items-center gap-2">
          <Database size={14} className="text-accent" /> Daftar Sekolah Target
        </span>
        <div className="flex items-center gap-2">
          {deepLink.length > 0 && (
            <span className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px]">
              <span className="text-[9px] uppercase tracking-widest text-accent-glow/80">Dari Assignment</span>
              <span className="text-ink font-medium">{deepLink.length} KODIM dipilih</span>
            </span>
          )}
          {hasFilter && (
            <button onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-widest text-ink-muted hover:bg-white/10">
              <X size={10}/> Reset
            </button>
          )}
        </div>
      </div>

      {/* Filter row */}
      <div className="border-b border-white/5 px-3 sm:px-5 py-3">
        <div className="grid gap-2 md:grid-cols-12">
          <div className="md:col-span-4 relative">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama, NPSN, kab/kota, kecamatan…"
              className="w-full rounded-md border border-white/10 bg-white/5 py-1.5 pl-7 pr-2 text-[12px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <select value={level} onChange={e => setLevel(e.target.value as Level)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-ink focus:border-accent/40 focus:outline-none">
              <option value="ALL">Semua Level</option>
              <option value="KOREM">KOREM</option>
              <option value="KODIM">KODIM</option>
              <option value="KORAMIL">KORAMIL</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <select value={bentuk} onChange={e => setBentuk(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-ink focus:border-accent/40 focus:outline-none">
              <option value="ALL">Semua Bentuk</option>
              {bentukOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <select value={akr} onChange={e => setAkr(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-ink focus:border-accent/40 focus:outline-none">
              <option value="ALL">Semua Akreditasi</option>
              {akrOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Result header + pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 sm:px-5 py-2 text-[11px]">
        <span className="text-ink-muted">
          <strong className="text-ink">{fmt(total)}</strong> sekolah target cocok
          {total > 0 && <> · menampilkan <strong className="text-ink">{offset + 1}–{Math.min(offset + PAGE_SIZE, total)}</strong></>}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-sm border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-muted disabled:opacity-30 hover:bg-white/10">‹ Prev</button>
            <span className="text-[10px] text-ink-subtle tabular-nums">{currentPage} / {pages}</span>
            <button disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-sm border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-muted disabled:opacity-30 hover:bg-white/10">Next ›</button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full min-w-[1080px] text-[12px]">
          <thead className="sticky top-0 bg-bg-soft/95 backdrop-blur z-10">
            <tr className="border-b border-white/10 text-left">
              <Th>NPSN</Th>
              <Th>Nama Sekolah</Th>
              <Th>Bentuk</Th>
              <Th>Akr</Th>
              <Th>Level</Th>
              <Th>Unit Penanggung Jawab</Th>
              <Th>KODAM</Th>
              <Th>Kab/Kota</Th>
              <Th>Kecamatan</Th>
              <Th>Provinsi</Th>
              <Th>Internet</Th>
              <Th>Posisi</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={12} className="p-8 text-center text-ink-subtle">Tidak ada sekolah target yang cocok dengan filter ini.</td></tr>
            )}
            {pageRows.map(s => (
              <tr key={`${s.level}-${s.npsn}-${s.unit}`} className="border-b border-white/5 last:border-0 hover:bg-white/[0.025]">
                <td className="px-3 py-1.5 font-mono text-ink-subtle">{s.npsn}</td>
                <td className="px-3 py-1.5 max-w-[220px] truncate text-ink" title={s.nama}>{s.nama}</td>
                <td className="px-3 py-1.5 text-ink-muted">{s.bentuk}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-mono ${AKR_BADGE[s.akreditasi] || AKR_BADGE.BT}`}>{s.akreditasi}</span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${LEVEL_BADGE[s.level]}`}>{s.level}</span>
                </td>
                <td className="px-3 py-1.5 max-w-[180px] truncate text-ink-muted" title={s.unit}>{s.unit}</td>
                <td className="px-3 py-1.5 text-[11px] text-ink-subtle">{s.kodam ?? "—"}</td>
                <td className="px-3 py-1.5 text-ink-muted">{s.kab_kota}</td>
                <td className="px-3 py-1.5 text-ink-muted">{s.kecamatan ?? "—"}</td>
                <td className="px-3 py-1.5 text-ink-muted">{s.provinsi}</td>
                <td className="px-3 py-1.5 text-[11px] text-ink-subtle">{s.internet}</td>
                <td className="px-3 py-1.5 text-[11px] text-ink-subtle">{s.posisi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-subtle">{children}</th>;
}
