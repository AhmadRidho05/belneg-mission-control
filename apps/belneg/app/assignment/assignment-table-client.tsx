"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, MapPinned, Shield, CheckCircle2, Clock, FileText } from "lucide-react";
import { fmt } from "@/lib/utils";

// Mirrors the SELECT in ./page.tsx (kkri_users joined with unit + kkri_reports).
// Real data only — there is no separate "assignment" table yet, so "lokasi target"
// and "progress" are derived from the Pembina's own report history.
export type AssignmentRow = {
  id: string;
  full_name: string;
  nrp: string | null;
  role: string;
  unit_id: string | null;
  is_active: number;
  created_at: string;
  approved_at: string | null;
  last_login_at: string | null;
  unit_name: string | null;
  kabupaten_kota: string | null;
  n_laporan: number;
  last_report_at: string | null;
  last_sekolah_nama: string | null;
};

const ROLE_OPTS = ["ALL", "ADMIN", "KODAM", "KOREM", "KODIM", "KORAMIL"] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-glow">
      <Shield size={10} /> {role}
    </span>
  );
}

function StatusBadge({ isActive, approvedAt }: { isActive: number; approvedAt: string | null }) {
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-ok/30 bg-ok/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ok">
        <CheckCircle2 size={10} /> Aktif
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn">
      <Clock size={10} /> {approvedAt ? "Nonaktif" : "Pending approval"}
    </span>
  );
}

export default function AssignmentTableClient({ rows }: { rows: AssignmentRow[] }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_OPTS)[number]>("ALL");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (roleFilter !== "ALL" && r.role !== roleFilter) return false;
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "pending" && r.is_active) return false;
      if (q && !([r.full_name, r.nrp, r.unit_name, r.unit_id, r.kabupaten_kota].some(f => f?.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [rows, search, roleFilter, statusFilter]);

  const counts = {
    total: rows.length,
    active: rows.filter(r => r.is_active).length,
    pending: rows.filter(r => !r.is_active).length,
  };

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="chip text-accent-glow border-accent/40">● ASSIGNMENT TABLE</span>
            <span className="chip">{fmt(counts.total)} petugas</span>
            <span className="chip">{fmt(counts.active)} aktif</span>
            <span className="chip">{fmt(counts.pending)} pending</span>
          </div>
          <Link
            href="/assignment/map"
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-accent-glow transition hover:bg-accent/20"
          >
            <MapPinned size={13} /> Lihat Peta Assignment
          </Link>
        </div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight text-ink">
          Assignment <span className="text-accent-glow">Table</span>
        </h1>
        <p className="text-[12px] text-ink-muted max-w-3xl">
          Daftar petugas (Pembina KKRI) beserta unit/wilayah penugasan, status, dan progres pelaporan mereka.
          Data diambil langsung dari tabel pengguna &amp; laporan yang sudah ada — bukan data dummy.
          Untuk visualisasi titik lokasi di peta, lihat <Link href="/assignment/map" className="text-accent-glow hover:underline">Assignment Map</Link>.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama / NRP / unit / kabupaten…"
            className="w-64 rounded-md border border-white/10 bg-bg-soft/60 pl-8 pr-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="rounded-md border border-white/10 bg-bg-soft/60 px-2.5 py-1.5 text-[12px] text-ink"
        >
          {ROLE_OPTS.map(r => <option key={r} value={r}>{r === "ALL" ? "Semua Role" : r}</option>)}
        </select>
        <div className="flex rounded-md border border-white/10 overflow-hidden">
          {(["all", "active", "pending"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1.5 text-[11px] uppercase tracking-wider transition ${statusFilter === s ? "bg-accent text-bg font-semibold" : "bg-bg-soft/60 text-ink-muted hover:bg-white/5"}`}
            >
              {s === "all" ? "Semua" : s === "active" ? "Aktif" : "Pending"}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-ink-subtle ml-auto">{fmt(filtered.length)} dari {fmt(rows.length)} petugas</span>
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-bg-soft/80 text-[10px] uppercase tracking-widest text-ink-subtle">
              <tr>
                <th className="text-left px-3 py-2.5">Nama Petugas</th>
                <th className="text-left px-3 py-2.5">Role</th>
                <th className="text-left px-3 py-2.5">KODIM/KORAMIL Tujuan</th>
                <th className="text-left px-3 py-2.5">Kabupaten/Kota</th>
                <th className="text-left px-3 py-2.5">Sekolah/Lokasi Terakhir</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Tgl Assignment</th>
                <th className="text-left px-3 py-2.5">Progress</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-ink-subtle">Tidak ada petugas yang cocok dengan filter.</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02] align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-ink">{r.full_name}</div>
                    {r.nrp && <div className="text-[10px] text-ink-subtle font-mono">NRP {r.nrp}</div>}
                  </td>
                  <td className="px-3 py-2.5"><RoleBadge role={r.role} /></td>
                  <td className="px-3 py-2.5">
                    {r.unit_name
                      ? <><div className="text-ink">{r.unit_name}</div><div className="text-[10px] text-ink-subtle font-mono">{r.unit_id}</div></>
                      : <span className="text-ink-subtle">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">{r.kabupaten_kota ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {r.last_sekolah_nama
                      ? <span className="text-ink-muted" title={r.last_sekolah_nama}>{r.last_sekolah_nama}</span>
                      : <span className="text-ink-subtle">Belum ada laporan</span>}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge isActive={r.is_active} approvedAt={r.approved_at} /></td>
                  <td className="px-3 py-2.5 text-ink-muted">{fmtDate(r.approved_at ?? r.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-ink">
                      <FileText size={11} className="text-accent" />
                      <span className="font-semibold tabular-nums">{fmt(r.n_laporan)}</span>
                      <span className="text-ink-subtle">laporan</span>
                    </div>
                    <div className="text-[10px] text-ink-subtle mt-0.5">
                      {r.last_report_at ? `Terakhir lapor: ${fmtDate(r.last_report_at)}` : "Belum pernah check-in"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
