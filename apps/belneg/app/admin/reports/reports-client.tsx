"use client";
import { useMemo, useState, useEffect } from "react";
import {
  MapPin, Camera, Users, X, Search, SlidersHorizontal, ChevronDown, ChevronUp,
  Calendar, Image as ImageIcon, MapPinned, RotateCcw, Shield, Crosshair, School,
} from "lucide-react";
import { fmt } from "@/lib/utils";

// ─────────────────────────── Types ───────────────────────────
type Report = {
  id: string; user_id: string; unit_id: string | null;
  user_name: string; user_email: string | null; user_role: string;
  sekolah_npsn: string | null; sekolah_nama: string | null;
  sekolah_kab: string | null; sekolah_provinsi: string | null;
  sekolah_bentuk: string | null; sekolah_status: string | null; sekolah_akr: string | null;
  kodim_name: string | null; kodam_name: string | null;
  jenis_kegiatan: string;
  peserta_laki: number; peserta_perempuan: number;
  lat: number | null; lng: number | null;
  reported_at: string; submitted_at: string;
  status: "submitted" | "reviewed" | "approved" | "rejected";
  n_photos: number;
};

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-warn/15 text-warn border-warn/30",
  reviewed: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  approved: "bg-ok/15 text-ok border-ok/30",
  rejected: "bg-crit/15 text-crit border-crit/30",
};
const STATUS_LABEL: Record<string, string> = {
  submitted: "Pending", reviewed: "Reviewed", approved: "Disetujui", rejected: "Ditolak",
};

const PANGKAT_OPTIONS = ["Kapten", "Mayor", "Letkol", "Kolonel"];
const BENTUK_OPTIONS = ["SMA", "SMK", "MA", "MAK"];
const ROLE_OPTIONS = ["KODAM", "KOREM", "KODIM", "KORAMIL", "ADMIN"];

function extractPangkat(name: string): string | null {
  if (!name) return null;
  const m = name.match(/^(Kapten|Mayor|Letkol|Kolonel|Brigjen|Mayjen)/i);
  return m ? m[1] : null;
}

const PAGE_SIZE = 100;

// ─────────────────────────── Main ───────────────────────────
export default function ReportsClient({ reports: initial, isAdmin = false }: { reports: Report[]; isAdmin?: boolean }) {
  const [reports, setReports] = useState(initial);
  const [selected, setSelected] = useState<Report | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string[]>([]);          // multi
  const [dateFrom, setDateFrom] = useState("");                 // YYYY-MM-DD
  const [dateTo, setDateTo] = useState("");
  const [provinsi, setProvinsi] = useState("");                 // single
  const [kab, setKab] = useState("");                            // single
  const [kodam, setKodam] = useState<string[]>([]);              // multi
  const [kodim, setKodim] = useState<string[]>([]);              // multi
  const [roles, setRoles] = useState<string[]>([]);              // multi
  const [pangkat, setPangkat] = useState<string[]>([]);          // multi
  const [bentuk, setBentuk] = useState<string[]>([]);            // multi
  const [hasFoto, setHasFoto] = useState(false);
  const [hasGps, setHasGps] = useState(false);
  const [pelapor, setPelapor] = useState("");                   // text search
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Derive dropdown options dari data (unique)
  const opts = useMemo(() => {
    const prov = new Set<string>();
    const kabs = new Set<string>();
    const kodams = new Set<string>();
    const kodims = new Set<string>();
    for (const r of reports) {
      if (r.sekolah_provinsi) prov.add(r.sekolah_provinsi);
      if (r.sekolah_kab) kabs.add(r.sekolah_kab);
      if (r.kodam_name) kodams.add(r.kodam_name);
      if (r.kodim_name) kodims.add(r.kodim_name);
    }
    return {
      provinsi: Array.from(prov).sort(),
      kab: Array.from(kabs).sort(),
      kodam: Array.from(kodams).sort(),
      kodim: Array.from(kodims).sort(),
    };
  }, [reports]);

  // Filter pipeline
  const filtered = useMemo(() => {
    let out = reports;

    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(r =>
        (r.user_name?.toLowerCase().includes(q)) ||
        (r.sekolah_nama?.toLowerCase().includes(q)) ||
        (r.jenis_kegiatan?.toLowerCase().includes(q)) ||
        (r.sekolah_kab?.toLowerCase().includes(q)) ||
        (r.kodim_name?.toLowerCase().includes(q)) ||
        (r.kodam_name?.toLowerCase().includes(q)) ||
        (r.unit_id?.toLowerCase().includes(q)) ||
        (r.id.toLowerCase().includes(q))
      );
    }

    if (status.length) out = out.filter(r => status.includes(r.status));

    if (dateFrom) {
      out = out.filter(r => r.reported_at >= dateFrom);
    }
    if (dateTo) {
      // include the entire "to" day
      const toEnd = dateTo + " 23:59:59";
      out = out.filter(r => r.reported_at <= toEnd);
    }

    if (provinsi) out = out.filter(r => r.sekolah_provinsi === provinsi);
    if (kab) out = out.filter(r => r.sekolah_kab === kab);
    if (kodam.length) out = out.filter(r => r.kodam_name && kodam.includes(r.kodam_name));
    if (kodim.length) out = out.filter(r => r.kodim_name && kodim.includes(r.kodim_name));
    if (roles.length) out = out.filter(r => roles.includes(r.user_role));
    if (pangkat.length) {
      out = out.filter(r => {
        const p = extractPangkat(r.user_name);
        return p && pangkat.includes(p);
      });
    }
    if (bentuk.length) out = out.filter(r => r.sekolah_bentuk && bentuk.includes(r.sekolah_bentuk));
    if (hasFoto) out = out.filter(r => r.n_photos > 0);
    if (hasGps) out = out.filter(r => r.lat != null && r.lng != null);
    if (pelapor.trim()) {
      const q = pelapor.toLowerCase();
      out = out.filter(r => r.user_name?.toLowerCase().includes(q));
    }

    return out;
  }, [reports, search, status, dateFrom, dateTo, provinsi, kab, kodam, kodim, roles, pangkat, bentuk, hasFoto, hasGps, pelapor]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filtered.length]);

  const counts = useMemo(() => ({
    all: reports.length,
    submitted: reports.filter(r => r.status === "submitted").length,
    approved: reports.filter(r => r.status === "approved").length,
    rejected: reports.filter(r => r.status === "rejected").length,
    reviewed: reports.filter(r => r.status === "reviewed").length,
  }), [reports]);

  // Count active filters (excluding search + status chips which are visually obvious)
  const activeAdvancedCount =
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) +
    (provinsi ? 1 : 0) + (kab ? 1 : 0) +
    kodam.length + kodim.length + roles.length +
    pangkat.length + bentuk.length +
    (hasFoto ? 1 : 0) + (hasGps ? 1 : 0) +
    (pelapor.trim() ? 1 : 0);

  const resetAll = () => {
    setSearch(""); setStatus([]); setDateFrom(""); setDateTo("");
    setProvinsi(""); setKab(""); setKodam([]); setKodim([]); setRoles([]);
    setPangkat([]); setBentuk([]); setHasFoto(false); setHasGps(false); setPelapor("");
  };

  const changeStatus = async (r: Report, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/reports/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("failed");
      setReports(prev => prev.map(x => x.id === r.id ? { ...x, status: newStatus as any } : x));
      setSelected(s => s && s.id === r.id ? { ...s, status: newStatus as any } : s);
    } catch (e: any) { alert(e.message); }
  };

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-2 border-b border-white/5 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip text-accent-glow border-accent/40">● ADMIN</span>
          <span className="chip">{fmt(counts.all)} total · {fmt(filtered.length)} cocok</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink">
          Laporan <span className="text-accent-glow">KKRI</span>
        </h1>
        <p className="text-[13px] text-ink-muted">Review semua laporan dari mobile app Pembina KKRI. Search + filter untuk navigasi cepat.</p>
      </header>

      {/* SEARCH + QUICK STATUS + ADVANCED TOGGLE */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama pelapor, sekolah, jenis kegiatan, materi, kab/kota…"
              className="w-full rounded-md border border-white/10 bg-bg/60 pl-9 pr-3 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink p-1">
                <X size={12}/>
              </button>
            )}
          </div>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium transition ${
              showAdvanced || activeAdvancedCount > 0
                ? "border-accent/40 bg-accent/10 text-accent-glow"
                : "border-white/10 bg-white/5 text-ink-muted hover:bg-white/10"
            }`}
          >
            <SlidersHorizontal size={13}/> Filter lengkap
            {activeAdvancedCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-sm bg-accent text-bg text-[10px] font-bold w-5 h-5">{activeAdvancedCount}</span>
            )}
            {showAdvanced ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </button>
        </div>

        {/* Status quick chips (always visible) */}
        <div className="flex gap-1 flex-wrap">
          {(["submitted", "reviewed", "approved", "rejected"] as const).map(s => {
            const active = status.includes(s);
            return (
              <button key={s} onClick={() => setStatus(prev => toggle(prev, s))}
                className={`rounded-md px-3 py-1.5 text-[11px] uppercase tracking-widest transition ${
                  active
                    ? "bg-accent text-bg font-semibold"
                    : "bg-white/5 text-ink-muted hover:bg-white/10"
                }`}>
                {STATUS_LABEL[s]} ({fmt((counts as any)[s] ?? 0)})
              </button>
            );
          })}
          {status.length > 0 && (
            <button onClick={() => setStatus([])} className="rounded-md border border-white/10 px-2 py-1.5 text-[10px] text-ink-muted hover:bg-white/5">
              clear status
            </button>
          )}
        </div>
      </div>

      {/* ADVANCED FILTER PANEL */}
      {showAdvanced && (
        <div className="panel p-4 space-y-3">
          {/* Date range */}
          <FilterRow label="Periode kegiatan" icon={Calendar}>
            <div className="flex items-center gap-2 text-[12px]">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="rounded-md border border-white/10 bg-bg/60 px-2 py-1.5 text-ink"/>
              <span className="text-ink-subtle">s/d</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="rounded-md border border-white/10 bg-bg/60 px-2 py-1.5 text-ink"/>
            </div>
          </FilterRow>

          {/* Lokasi */}
          <FilterRow label="Lokasi sekolah" icon={MapPin}>
            <div className="grid gap-2 sm:grid-cols-2">
              <SearchableSelect
                label="Provinsi" value={provinsi} onChange={setProvinsi} options={opts.provinsi} placeholder="semua provinsi" />
              <SearchableSelect
                label="Kab/Kota" value={kab} onChange={setKab} options={opts.kab} placeholder="semua kab/kota" />
            </div>
          </FilterRow>

          {/* Unit */}
          <FilterRow label="Unit komando" icon={Shield}>
            <div className="grid gap-2 sm:grid-cols-2">
              <MultiSearchable label="KODAM" selected={kodam} onChange={setKodam} options={opts.kodam} placeholder="semua KODAM" />
              <MultiSearchable label="KODIM" selected={kodim} onChange={setKodim} options={opts.kodim} placeholder="semua KODIM" />
            </div>
          </FilterRow>

          {/* Pelapor */}
          <FilterRow label="Pelapor" icon={Users}>
            <div className="space-y-2">
              <input
                value={pelapor} onChange={e => setPelapor(e.target.value)}
                placeholder="cari nama pelapor…"
                className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-1.5 text-[12px] text-ink"
              />
              <div>
                <div className="stat-label mb-1">Pangkat</div>
                <ChipMulti options={PANGKAT_OPTIONS} selected={pangkat} onChange={setPangkat} />
              </div>
              <div>
                <div className="stat-label mb-1">Role</div>
                <ChipMulti options={ROLE_OPTIONS} selected={roles} onChange={setRoles} />
              </div>
            </div>
          </FilterRow>

          {/* Sekolah */}
          <FilterRow label="Bentuk sekolah" icon={School}>
            <ChipMulti options={BENTUK_OPTIONS} selected={bentuk} onChange={setBentuk} />
          </FilterRow>

          {/* Konten flags */}
          <FilterRow label="Konten laporan" icon={ImageIcon}>
            <div className="flex flex-wrap gap-3 text-[12px]">
              <label className="inline-flex items-center gap-2 cursor-pointer text-ink-muted hover:text-ink">
                <input type="checkbox" checked={hasFoto} onChange={e => setHasFoto(e.target.checked)} className="accent-amber-500"/>
                <ImageIcon size={11}/> Punya foto
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-ink-muted hover:text-ink">
                <input type="checkbox" checked={hasGps} onChange={e => setHasGps(e.target.checked)} className="accent-amber-500"/>
                <MapPinned size={11}/> Punya GPS
              </label>
            </div>
          </FilterRow>

          {/* Reset */}
          <div className="flex items-center justify-end pt-2 border-t border-white/5">
            <button onClick={resetAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-widest text-ink-muted hover:bg-white/10">
              <RotateCcw size={11}/> Reset semua filter
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE FILTER CHIPS (always visible if any) */}
      {activeAdvancedCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-ink-subtle">Filter aktif:</span>
          {dateFrom && <ActiveChip label={`Dari ${dateFrom}`} onRemove={() => setDateFrom("")} />}
          {dateTo && <ActiveChip label={`s/d ${dateTo}`} onRemove={() => setDateTo("")} />}
          {provinsi && <ActiveChip label={`Provinsi: ${provinsi}`} onRemove={() => setProvinsi("")} />}
          {kab && <ActiveChip label={`Kab: ${kab}`} onRemove={() => setKab("")} />}
          {kodam.map(k => <ActiveChip key={`kdm-${k}`} label={k} onRemove={() => setKodam(prev => prev.filter(x => x !== k))} />)}
          {kodim.map(k => <ActiveChip key={`kdi-${k}`} label={k} onRemove={() => setKodim(prev => prev.filter(x => x !== k))} />)}
          {roles.map(r => <ActiveChip key={`role-${r}`} label={`Role: ${r}`} onRemove={() => setRoles(prev => prev.filter(x => x !== r))} />)}
          {pangkat.map(p => <ActiveChip key={`pkt-${p}`} label={p} onRemove={() => setPangkat(prev => prev.filter(x => x !== p))} />)}
          {bentuk.map(b => <ActiveChip key={`bnt-${b}`} label={b} onRemove={() => setBentuk(prev => prev.filter(x => x !== b))} />)}
          {hasFoto && <ActiveChip label="Punya foto" onRemove={() => setHasFoto(false)} />}
          {hasGps && <ActiveChip label="Punya GPS" onRemove={() => setHasGps(false)} />}
          {pelapor.trim() && <ActiveChip label={`Pelapor: "${pelapor.trim()}"`} onRemove={() => setPelapor("")} />}
        </div>
      )}

      {/* RESULTS */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="panel p-8 text-center text-ink-subtle">
            Tidak ada laporan cocok dengan filter.
            {activeAdvancedCount > 0 && (
              <div className="mt-2">
                <button onClick={resetAll} className="text-accent-glow hover:underline">Reset filter</button>
              </div>
            )}
          </div>
        ) : (
          <>
            {filtered.slice(0, visibleCount).map(r => (
              <button key={r.id} onClick={() => setSelected(r)}
                className="panel w-full text-left p-4 hover:bg-white/[0.02] transition">
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <span className={`rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status] || r.status}</span>
                  <span className="text-[11px] text-ink-subtle">
                    {new Date(r.reported_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
                <div className="font-display text-base font-semibold text-ink">{r.jenis_kegiatan}</div>
                {r.sekolah_nama && (
                  <div className="mt-1 text-[12px] text-ink-muted flex items-center gap-1">
                    <MapPin size={11}/> {r.sekolah_nama} · {r.sekolah_kab}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
                  <span className="flex items-center gap-1"><Users size={11}/> {fmt(r.peserta_laki + r.peserta_perempuan)}</span>
                  {r.n_photos > 0 && <span className="flex items-center gap-1"><Camera size={11}/> {r.n_photos}</span>}
                  {r.lat != null && <span className="flex items-center gap-1"><MapPin size={11}/> GPS</span>}
                  <span className="text-ink-subtle">· <strong className="text-ink-muted">{r.user_name}</strong> · {r.kodim_name || r.kodam_name || r.unit_id}</span>
                </div>
              </button>
            ))}
            {visibleCount < filtered.length && (
              <div className="text-center pt-2">
                <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-[12px] text-ink-muted hover:bg-white/10 transition">
                  Tampilkan {Math.min(PAGE_SIZE, filtered.length - visibleCount)} laporan lagi (total {fmt(filtered.length - visibleCount)} tersisa)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selected && <DetailModal r={selected} onClose={() => setSelected(null)} onStatusChange={changeStatus} isAdmin={isAdmin} />}
    </div>
  );
}

// ─────────────────────────── UI primitives ───────────────────────────

function FilterRow({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-12 items-start">
      <div className="sm:col-span-3 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-ink-muted pt-1.5">
        <Icon size={11} className="text-accent"/> {label}
      </div>
      <div className="sm:col-span-9 min-w-0">{children}</div>
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/30 px-2 py-0.5 text-accent-glow">
      {label}
      <button onClick={onRemove} aria-label="Hapus filter" className="hover:text-ink"><X size={10}/></button>
    </span>
  );
}

function ChipMulti({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => {
        const active = selected.includes(o);
        return (
          <button key={o}
            onClick={() => onChange(active ? selected.filter(x => x !== o) : [...selected, o])}
            className={`rounded-md px-2.5 py-1 text-[11px] transition ${
              active ? "bg-accent text-bg font-semibold" : "bg-white/5 text-ink-muted hover:bg-white/10"
            }`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

function SearchableSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <div>
      <div className="stat-label mb-1">{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-bg/60 px-2 py-1.5 text-[12px] text-ink">
        <option value="">{placeholder ?? "— semua —"}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function MultiSearchable({ label, selected, onChange, options, placeholder }: {
  label: string; selected: string[]; onChange: (next: string[]) => void; options: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <div>
      <div className="stat-label mb-1">{label} {selected.length > 0 && <span className="text-accent-glow normal-case tracking-normal">({selected.length})</span>}</div>
      <div className="relative">
        <button onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between rounded-md border border-white/10 bg-bg/60 px-2 py-1.5 text-[12px] text-ink hover:bg-white/5">
          <span className="truncate text-left">
            {selected.length === 0 ? <span className="text-ink-subtle">{placeholder ?? "pilih…"}</span> :
              selected.length <= 2 ? selected.join(", ") : `${selected.slice(0, 2).join(", ")} +${selected.length - 2}`}
          </span>
          <ChevronDown size={12} className={`transition shrink-0 ${open ? "rotate-180" : ""}`}/>
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full max-w-[calc(100vw-1rem)] rounded-md border border-white/10 bg-bg-soft shadow-2xl">
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="cari…" autoFocus
              className="w-full border-b border-white/5 bg-transparent px-2 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle focus:outline-none"
            />
            <div className="max-h-[240px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-3 text-[11px] text-center text-ink-subtle">tidak ditemukan</div>
              ) : (
                filtered.map(o => {
                  const isSel = selected.includes(o);
                  return (
                    <button key={o}
                      onClick={() => onChange(isSel ? selected.filter(x => x !== o) : [...selected, o])}
                      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-white/5 ${isSel ? "bg-accent/10 text-ink" : "text-ink-muted"}`}>
                      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border shrink-0 ${isSel ? "bg-accent border-accent text-bg" : "border-white/15"}`}>
                        {isSel && "✓"}
                      </span>
                      <span className="truncate">{o}</span>
                    </button>
                  );
                })
              )}
            </div>
            {(selected.length > 0 || q) && (
              <div className="flex border-t border-white/5 p-1.5 gap-1">
                {selected.length > 0 && (
                  <button onClick={() => onChange([])} className="flex-1 rounded-sm bg-white/5 hover:bg-white/10 px-2 py-1 text-[10px] uppercase tracking-widest text-ink-muted">Kosongkan</button>
                )}
                <button onClick={() => setOpen(false)} className="flex-1 rounded-sm bg-accent text-bg hover:bg-accent-glow px-2 py-1 text-[10px] uppercase tracking-widest font-semibold">Tutup</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Detail modal (unchanged from before) ───────────────────────────
function DetailModal({ r, onClose, onStatusChange, isAdmin }: { r: Report; onClose: () => void; onStatusChange: (r: Report, s: string) => void; isAdmin: boolean }) {
  const [photos, setPhotos] = useState<{ url: string }[]>([]);
  const [body, setBody] = useState<{ materi: string | null; hasil: string | null; kendala: string | null; situasi_lapangan: string | null } | null>(null);
  useEffect(() => {
    fetch(`/api/admin/reports/${r.id}/photos`).then(x => x.json()).then(d => setPhotos(d.photos ?? [])).catch(() => {});
    fetch(`/api/admin/reports/${r.id}`).then(x => x.json()).then(d => setBody(d)).catch(() => {});
  }, [r.id]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1000] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-hidden rounded-none sm:rounded-lg border border-white/10 bg-bg-soft shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 sm:px-5 py-3 sm:py-4">
          <div className="min-w-0 flex-1">
            <span className={`rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status] || r.status}</span>
            <h2 className="mt-2 font-display text-lg sm:text-2xl font-bold text-ink leading-tight">{r.jenis_kegiatan}</h2>
            {r.sekolah_nama && <div className="text-[12px] text-ink-muted mt-1">📍 {r.sekolah_nama} · {r.sekolah_kab}</div>}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-muted hover:bg-white/5 hover:text-ink"><X size={18}/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          <Field label="Pelapor">{r.user_name} ({r.user_role} {r.unit_id})</Field>
          {r.kodam_name && <Field label="KODAM">{r.kodam_name}</Field>}
          {r.kodim_name && <Field label="KODIM">{r.kodim_name}</Field>}
          <Field label="Tanggal Kegiatan">{new Date(r.reported_at).toLocaleString("id-ID")}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Peserta Laki-laki">{fmt(r.peserta_laki)}</Field>
            <Field label="Peserta Perempuan">{fmt(r.peserta_perempuan)}</Field>
          </div>
          {body === null && (
            <div className="text-[12px] text-ink-subtle italic animate-pulse">Memuat detail laporan…</div>
          )}
          {body?.materi && <Field label="Materi">{body.materi}</Field>}
          {body?.hasil && <Field label="Hasil">{body.hasil}</Field>}
          {body?.kendala && <Field label="Kendala">{body.kendala}</Field>}
          {body?.situasi_lapangan && <Field label="Situasi Lapangan">{body.situasi_lapangan}</Field>}
          {r.lat != null && r.lng != null && (
            <Field label="Koordinat">
              <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noopener" className="text-accent-glow hover:underline font-mono">
                {r.lat.toFixed(5)}, {r.lng.toFixed(5)} ↗
              </a>
            </Field>
          )}
          {photos.length > 0 && (
            <div>
              <div className="stat-label mb-2">Foto Kegiatan ({photos.length})</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noopener" className="block rounded-md overflow-hidden border border-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`foto-${i+1}`} className="w-full h-32 object-cover hover:scale-105 transition"/>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/5 p-3 flex-wrap">
          {isAdmin ? (
            (["approved", "rejected", "reviewed", "submitted"] as const).map(s => (
              <button key={s} onClick={() => onStatusChange(r, s)} disabled={r.status === s}
                className={`flex-1 rounded-md px-3 py-2 text-[11px] uppercase tracking-widest font-semibold transition ${
                  r.status === s
                    ? "bg-white/10 text-ink-muted cursor-default"
                    : s === "approved" ? "bg-ok/20 text-ok border border-ok/40 hover:bg-ok/30"
                    : s === "rejected" ? "bg-crit/20 text-crit border border-crit/40 hover:bg-crit/30"
                    : "bg-white/5 text-ink hover:bg-white/10"
                }`}>
                {STATUS_LABEL[s] || s}
              </button>
            ))
          ) : (
            <div className="flex items-center gap-2 text-[12px] text-ink-muted">
              <span className="uppercase tracking-widest">Status:</span>
              <span className={`rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATUS_STYLE[r.status]}`}>
                {STATUS_LABEL[r.status] || r.status}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="text-[13px] text-ink mt-1 whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}
