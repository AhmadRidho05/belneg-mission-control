"use client";
import { useEffect, useMemo, useState } from "react";
import { Database, X, Wifi, Zap, Download, FileSpreadsheet, FileText, Filter as FilterIcon, Shield, Crosshair } from "lucide-react";
import { fmt } from "@/lib/utils";
import { SekolahDetailModal } from "./sekolah-detail-modal";
import { MultiSelect, type MultiSelectOption } from "./multi-select";

export type SekolahFilter = {
  type: "kodam" | "kodim" | "kab" | "provinsi-bentuk" | "akreditasi" | "bentuk" | "yayasan" | "multi" | "none";
  label: string;
  sub?: string;
  // Single-value (from click on charts)
  kodam_id?: string;
  kodim_id?: string;
  kab?: string;
  provinsi?: string;
  bentuk?: string;
  status?: string;
  akr?: string;
  npyp?: string;
  // Multi-value (from MultiSelect controls)
  kodam_ids?: string[];
  kodim_ids?: string[];
  statuses?: string[];  // ["NEGERI"], ["SWASTA"], ["NEGERI","SWASTA"], []
};

type Row = {
  npsn: string;
  nama: string;
  bentuk: string;
  status: string;
  akr: string;
  kab_kota: string;
  kecamatan: string;
  provinsi: string;
  akses_internet: string;
  sumber_listrik: string;
};

const PAGE_SIZE = 50;

const AKR_BADGE: Record<string, string> = {
  A: "bg-ok/15 text-ok border-ok/30",
  B: "bg-warn/15 text-warn border-warn/30",
  C: "bg-accent-deep/20 text-accent border-accent/30",
  TT: "bg-crit/15 text-crit border-crit/30",
  BT: "bg-white/5 text-ink-subtle border-white/10",
};
const STATUS_BADGE: Record<string, string> = {
  NEGERI: "bg-ok/10 text-ok",
  SWASTA: "bg-accent/10 text-accent",
};

export function SekolahTable({
  filter, onFilterChange, onClear,
  kodamOptions = [], kodimOptions = [],
}: {
  filter: SekolahFilter;
  onFilterChange: (next: SekolahFilter) => void;
  onClear: () => void;
  kodamOptions?: MultiSelectOption[];
  kodimOptions?: MultiSelectOption[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ npsn: string; focus: "sekolah" | "yayasan" } | null>(null);
  const [downloading, setDownloading] = useState<"csv" | "xlsx" | null>(null);

  // Reset pagination when filter changes
  useEffect(() => { setOffset(0); }, [JSON.stringify(filter)]);

  // Build query string used by both fetch + downloads
  const buildQuery = (opts?: { format?: "csv" | "xlsx" }) => {
    const params = new URLSearchParams();
    if (filter.kodam_id)  params.set("kodam_id", filter.kodam_id);
    if (filter.kodim_id)  params.set("kodim_id", filter.kodim_id);
    if (filter.kab)       params.set("kab", filter.kab);
    if (filter.provinsi)  params.set("provinsi", filter.provinsi);
    if (filter.bentuk)    params.set("bentuk", filter.bentuk);
    if (filter.status)    params.set("status", filter.status);
    if (filter.akr)       params.set("akr", filter.akr);
    if (filter.npyp)      params.set("npyp", filter.npyp);
    if (filter.kodam_ids?.length)  params.set("kodam_ids", filter.kodam_ids.join(","));
    if (filter.kodim_ids?.length)  params.set("kodim_ids", filter.kodim_ids.join(","));
    if (filter.statuses?.length)   params.set("statuses", filter.statuses.join(","));
    if (opts?.format) {
      params.set("format", opts.format);
    } else {
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
    }
    return params.toString();
  };

  useEffect(() => {
    const qs = buildQuery();
    const ctrl = new AbortController();
    setLoading(true); setErr(null);
    fetch(`/api/sekolah?${qs}`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setRows(data.rows ?? []); setTotal(data.total ?? 0); })
      .catch(e => { if (e.name !== "AbortError") setErr(e.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filter), offset]);

  const handleDownload = async (format: "csv" | "xlsx") => {
    setDownloading(format);
    try {
      const url = `/api/sekolah?${buildQuery({ format })}`;
      // Use fetch + blob to control download UX (avoids opening a new tab)
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const dl = document.createElement("a");
      dl.href = URL.createObjectURL(blob);
      dl.download = `belneg-sekolah-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.${format}`;
      document.body.appendChild(dl);
      dl.click();
      dl.remove();
      URL.revokeObjectURL(dl.href);
    } catch (e: any) {
      alert(`Download gagal: ${e.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const updateKodam = (ids: string[]) => onFilterChange({
    ...filter,
    type: ids.length > 0 || (filter.kodim_ids?.length ?? 0) > 0 || (filter.statuses?.length ?? 0) > 0 ? "multi" : "none",
    kodam_ids: ids,
    kodam_id: undefined, // multi takes over single
    label: buildLabel({ ...filter, kodam_ids: ids, kodam_id: undefined }),
  });
  const updateKodim = (ids: string[]) => onFilterChange({
    ...filter,
    type: ids.length > 0 || (filter.kodam_ids?.length ?? 0) > 0 || (filter.statuses?.length ?? 0) > 0 ? "multi" : "none",
    kodim_ids: ids,
    kodim_id: undefined,
    label: buildLabel({ ...filter, kodim_ids: ids, kodim_id: undefined }),
  });
  const updateStatuses = (statuses: string[]) => onFilterChange({
    ...filter,
    type: statuses.length > 0 || (filter.kodam_ids?.length ?? 0) > 0 || (filter.kodim_ids?.length ?? 0) > 0 ? "multi" : "none",
    statuses,
    status: undefined,
    label: buildLabel({ ...filter, statuses, status: undefined }),
  });

  const pages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const hasAnyFilter = (
    filter.type !== "none" ||
    (filter.kodam_ids?.length ?? 0) > 0 ||
    (filter.kodim_ids?.length ?? 0) > 0 ||
    (filter.statuses?.length ?? 0) > 0
  );

  return (
    <div className="panel">
      <div className="panel-head flex-wrap gap-2">
        <span className="panel-title flex items-center gap-2">
          <Database size={14} className="text-accent" /> Raw Data
        </span>
        <div className="flex items-center gap-2">
          {filter.label && (
            <span className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px]">
              <span className="text-[9px] uppercase tracking-widest text-accent-glow/80">Filter</span>
              <span className="text-ink font-medium">{filter.label}</span>
              {filter.sub && <span className="text-ink-muted">· {filter.sub}</span>}
            </span>
          )}
          {hasAnyFilter && (
            <button onClick={onClear}
              className="inline-flex items-center gap-1 rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-widest text-ink-muted hover:bg-white/10">
              <X size={10}/> Reset
            </button>
          )}
        </div>
      </div>

      {/* Multi-select filter row */}
      <div className="border-b border-white/5 px-3 sm:px-5 py-3">
        <div className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-widest text-ink-subtle">
          <FilterIcon size={10}/> Filter (gabungkan beberapa)
        </div>
        <div className="grid gap-2 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="mb-1 flex items-center gap-1 text-[10px] text-ink-muted">
              <Shield size={10} className="text-accent"/> KODAM ({kodamOptions.length})
            </div>
            <MultiSelect
              options={kodamOptions}
              selected={filter.kodam_ids ?? []}
              onChange={updateKodam}
              placeholder="Semua KODAM"
              searchPlaceholder="Cari kodam…"
              maxBadgeCount={1}
            />
          </div>
          <div className="md:col-span-5">
            <div className="mb-1 flex items-center gap-1 text-[10px] text-ink-muted">
              <Crosshair size={10} className="text-accent"/> KODIM ({kodimOptions.length})
            </div>
            <MultiSelect
              options={kodimOptions}
              selected={filter.kodim_ids ?? []}
              onChange={updateKodim}
              placeholder="Semua KODIM"
              searchPlaceholder="Cari kodim / kabupaten…"
              maxBadgeCount={2}
            />
          </div>
          <div className="md:col-span-3">
            <div className="mb-1 text-[10px] text-ink-muted">Status sekolah</div>
            <div className="flex gap-1">
              {(["NEGERI", "SWASTA"] as const).map(s => {
                const checked = (filter.statuses ?? []).includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => {
                      const cur = filter.statuses ?? [];
                      const next = checked ? cur.filter(x => x !== s) : [...cur, s];
                      updateStatuses(next);
                    }}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium uppercase tracking-widest transition ${
                      checked
                        ? s === "NEGERI" ? "border-ok/40 bg-ok/15 text-ok" : "border-accent/40 bg-accent/15 text-accent"
                        : "border-white/10 bg-white/5 text-ink-muted hover:bg-white/10"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Results header bar: count + pagination + downloads */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 sm:px-5 py-2 text-[11px]">
        <span className="text-ink-muted">
          {loading ? <span className="animate-pulse">Memuat…</span>
            : err ? <span className="text-crit">Error: {err}</span>
            : (<>
                <strong className="text-ink">{fmt(total)}</strong> sekolah cocok
                {total > 0 && <> · menampilkan <strong className="text-ink">{offset + 1}–{Math.min(offset + PAGE_SIZE, total)}</strong></>}
              </>)
          }
        </span>
        <div className="flex items-center gap-2">
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="rounded-sm border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-muted disabled:opacity-30 hover:bg-white/10">‹ Prev</button>
              <span className="text-[10px] text-ink-subtle tabular-nums">{currentPage} / {pages}</span>
              <button disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}
                className="rounded-sm border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-muted disabled:opacity-30 hover:bg-white/10">Next ›</button>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              disabled={loading || total === 0 || downloading !== null}
              onClick={() => handleDownload("csv")}
              className="inline-flex items-center gap-1 rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-widest text-ink hover:bg-accent/10 hover:text-accent-glow hover:border-accent/40 disabled:opacity-40 transition"
              title={`Download ${fmt(Math.min(total, 50000))} baris sebagai CSV`}
            >
              {downloading === "csv" ? <span className="animate-pulse">…</span> : <FileText size={11}/>}
              CSV
            </button>
            <button
              disabled={loading || total === 0 || downloading !== null}
              onClick={() => handleDownload("xlsx")}
              className="inline-flex items-center gap-1 rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-widest text-ink hover:bg-accent/10 hover:text-accent-glow hover:border-accent/40 disabled:opacity-40 transition"
              title={`Download ${fmt(Math.min(total, 50000))} baris sebagai Excel`}
            >
              {downloading === "xlsx" ? <span className="animate-pulse">…</span> : <FileSpreadsheet size={11}/>}
              Excel
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full min-w-[920px] text-[12px]">
          <thead className="sticky top-0 bg-bg-soft/95 backdrop-blur z-10">
            <tr className="border-b border-white/10 text-left">
              <Th>NPSN</Th>
              <Th>Nama Sekolah</Th>
              <Th>Bentuk</Th>
              <Th>Status</Th>
              <Th>Akr</Th>
              <Th>Kab/Kota</Th>
              <Th>Kecamatan</Th>
              <Th>Provinsi</Th>
              <Th>Internet</Th>
              <Th>Listrik</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={10} className="p-8 text-center text-ink-subtle">Tidak ada sekolah cocok dengan filter ini.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.npsn} className="border-b border-white/5 last:border-0 hover:bg-white/[0.025]">
                <td className="px-3 py-1.5">
                  <button onClick={() => setDetail({ npsn: r.npsn, focus: "sekolah" })}
                    className="font-mono text-ink-subtle hover:text-accent-glow hover:underline decoration-dotted underline-offset-2" title={`Lihat detail ${r.nama}`}>
                    {r.npsn}
                  </button>
                </td>
                <td className="px-3 py-1.5 max-w-[220px]">
                  <button onClick={() => setDetail({ npsn: r.npsn, focus: "sekolah" })}
                    className="text-ink hover:text-accent-glow text-left truncate w-full block" title={r.nama}>
                    {r.nama}
                  </button>
                </td>
                <td className="px-3 py-1.5 text-ink-muted">{r.bentuk}</td>
                <td className="px-3 py-1.5">
                  {r.status === "SWASTA" ? (
                    <button onClick={() => setDetail({ npsn: r.npsn, focus: "yayasan" })}
                      className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-medium transition hover:brightness-125 hover:ring-1 hover:ring-accent ${STATUS_BADGE[r.status] || "bg-white/5 text-ink-muted"}`}
                      title="Lihat yayasan penaung">
                      {r.status} →
                    </button>
                  ) : (
                    <span className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status] || "bg-white/5 text-ink-muted"}`}>{r.status}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-mono ${AKR_BADGE[r.akr] || AKR_BADGE.BT}`}>{r.akr || "BT"}</span>
                </td>
                <td className="px-3 py-1.5 text-ink-muted">{r.kab_kota}</td>
                <td className="px-3 py-1.5 text-ink-muted">{r.kecamatan}</td>
                <td className="px-3 py-1.5 text-ink-muted">{r.provinsi}</td>
                <td className="px-3 py-1.5 text-ink-subtle text-[11px]">
                  {r.akses_internet ? <span className="inline-flex items-center gap-1"><Wifi size={10}/> {r.akses_internet}</span> : "—"}
                </td>
                <td className="px-3 py-1.5 text-ink-subtle text-[11px]">
                  {r.sumber_listrik ? <span className="inline-flex items-center gap-1"><Zap size={10}/> {r.sumber_listrik}</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <SekolahDetailModal npsn={detail.npsn} focus={detail.focus} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function buildLabel(f: SekolahFilter): string {
  const parts: string[] = [];
  if (f.kodam_ids?.length)  parts.push(`${f.kodam_ids.length} KODAM`);
  if (f.kodim_ids?.length)  parts.push(`${f.kodim_ids.length} KODIM`);
  if (f.statuses?.length === 1) parts.push(f.statuses[0]);
  if (f.statuses?.length === 2) parts.push("Negeri+Swasta");
  if (f.kodam_id)  parts.push(`KODAM ${f.kodam_id}`);
  if (f.kodim_id)  parts.push(`KODIM ${f.kodim_id}`);
  if (f.kab)       parts.push(f.kab);
  if (f.provinsi)  parts.push(f.provinsi.replace(/^PROV\.\s*/i, ""));
  if (f.bentuk)    parts.push(f.bentuk);
  if (f.status && !f.statuses?.length)    parts.push(f.status);
  if (f.akr)       parts.push(`Akr ${f.akr}`);
  if (f.npyp)      parts.push(`Yayasan ${f.npyp}`);
  return parts.join(" · ");
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-subtle">{children}</th>;
}
