"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ChevronLeft, Mail, Phone, Shield, Trash2, Edit, MapPin, ClipboardList,
  School, User as UserIcon, CheckCircle2, Clock, Save, X,
} from "lucide-react";
import { fmt } from "@/lib/utils";
import { SekolahDetailModal } from "@/components/sekolah-detail-modal";

const GpsHistoryMap = dynamic(() => import("./gps-history-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[400px] place-items-center bg-bg-soft rounded-md border border-white/5">
      <div className="text-sm text-ink-muted animate-pulse">Loading map…</div>
    </div>
  ),
});

type User = any;
type Unit = { id: string; name: string; kind: string };
type Report = any;
type GpsPoint = {
  report_id: string;
  lat: number; lng: number;
  reported_at: string;
  jenis_kegiatan: string;
  sekolah_nama: string | null;
};

const TABS = [
  { key: "profile", label: "Profil", icon: UserIcon },
  { key: "reports", label: "Laporan", icon: ClipboardList },
  { key: "gps", label: "Riwayat GPS", icon: MapPin },
  { key: "assignment", label: "Sekolah Binaan", icon: School },
] as const;
type Tab = typeof TABS[number]["key"];

export default function UserDetailClient({ initialUser, units }: { initialUser: User; units: Unit[] }) {
  const router = useRouter();
  const [user, setUser] = useState<User>(initialUser);
  const [tab, setTab] = useState<Tab>("profile");
  const [reports, setReports] = useState<Report[]>([]);
  const [gps, setGps] = useState<GpsPoint[]>([]);
  const [assignment, setAssignment] = useState<{ count: number; sample: any[]; center: { lat: number; lng: number } | null }>({ count: 0, sample: [], center: null });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setFetchError(null);
    fetch(`/api/admin/users/${user.id}`, { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        return r.json();
      })
      .then(d => {
        setReports(Array.isArray(d.reports) ? d.reports : []);
        setGps(Array.isArray(d.gps) ? d.gps : []);
        setAssignment(d.assignment && typeof d.assignment === "object"
          ? { count: d.assignment.count ?? 0, sample: d.assignment.sample ?? [], center: d.assignment.center ?? null }
          : { count: 0, sample: [], center: null });
      })
      .catch(e => {
        if (e?.name === "AbortError") return;
        console.error("[user-detail] fetch failed:", e);
        setFetchError(e?.message ?? String(e));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [user.id]);

  const onDelete = async () => {
    if (!confirm(`Hapus user "${user.full_name}"?\n\nUser akan di-soft-delete (tidak bisa login lagi). Semua laporan & riwayat-nya TETAP tersimpan untuk audit.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("failed");
      router.push("/admin/pembina");
    } catch (e: any) { alert("Gagal hapus: " + e.message); }
    finally { setBusy(false); }
  };

  const unitName = user.kodim_name || user.korem_name || user.kodam_name || user.unit_id || "—";
  const stats = {
    total: reports.length,
    submitted: reports.filter(r => r.status === "submitted").length,
    approved: reports.filter(r => r.status === "approved").length,
    rejected: reports.filter(r => r.status === "rejected").length,
    with_gps: gps.length,
    sekolah_unique: new Set(reports.filter(r => r.sekolah_npsn).map(r => r.sekolah_npsn)).size,
  };

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      {/* Breadcrumb */}
      <Link href="/admin/pembina" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-accent-glow">
        <ChevronLeft size={14}/> Kembali ke daftar Pembina
      </Link>

      {/* Header */}
      <header className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {user.is_active
                ? <span className="chip text-ok border-ok/40"><CheckCircle2 size={11}/> ACTIVE</span>
                : <span className="chip text-warn border-warn/40"><Clock size={11}/> PENDING</span>}
              <span className="chip text-accent-glow border-accent/40">{user.role}</span>
              {unitName !== "—" && <span className="chip"><Shield size={10} className="text-accent"/>{unitName}</span>}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">{user.full_name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
              {user.email && <span className="flex items-center gap-1"><Mail size={11}/>{user.email}</span>}
              {user.phone && <span className="flex items-center gap-1"><Phone size={11}/>{user.phone}</span>}
              {user.nrp && <span>NRP {user.nrp}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <EditButton user={user} units={units} onSave={(updated) => setUser({ ...user, ...updated })} />
            <button onClick={onDelete} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-crit/40 bg-crit/10 px-3 py-2 text-[12px] font-semibold text-crit hover:bg-crit/20 disabled:opacity-40 transition">
              <Trash2 size={13}/> Hapus
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Stat label="Total Laporan" value={stats.total} accent="gold" />
          <Stat label="Pending" value={stats.submitted} />
          <Stat label="Disetujui" value={stats.approved} accent="ok" />
          <Stat label="Ditolak" value={stats.rejected} accent="crit" />
          <Stat label="Dengan GPS" value={stats.with_gps} />
          <Stat label="Sekolah Dikunjungi" value={stats.sekolah_unique} />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-white/5">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-widest transition whitespace-nowrap ${
                active ? "border-accent text-accent-glow" : "border-transparent text-ink-muted hover:text-ink"
              }`}>
              <t.icon size={13}/> {t.label}
              {t.key === "reports" && stats.total > 0 && <span className="text-ink-subtle">({stats.total})</span>}
              {t.key === "gps" && stats.with_gps > 0 && <span className="text-ink-subtle">({stats.with_gps})</span>}
              {t.key === "assignment" && assignment.count > 0 && <span className="text-ink-subtle">({fmt(assignment.count)})</span>}
            </button>
          );
        })}
      </div>

      {/* Fetch error banner */}
      {fetchError && (
        <div className="rounded-md border border-crit/40 bg-crit/10 p-3 text-[12px]">
          <div className="font-semibold text-crit mb-1">Gagal memuat data terkait user.</div>
          <div className="text-ink-muted font-mono break-all">{fetchError}</div>
          <div className="mt-2 text-ink-subtle text-[11px]">Reports / GPS / Assignment mungkin kosong walaupun datanya ada.</div>
        </div>
      )}

      {/* Tab content */}
      {tab === "profile" && <ProfileTab user={user} />}
      {tab === "reports" && <ReportsTab reports={reports} loading={loading} />}
      {tab === "gps" && <GpsTab gps={gps} loading={loading} />}
      {tab === "assignment" && <AssignmentTab data={assignment} loading={loading} />}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "gold" | "ok" | "crit" }) {
  const c = accent === "gold" ? "text-accent-glow" : accent === "ok" ? "text-ok" : accent === "crit" ? "text-crit" : "text-ink";
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-2.5">
      <div className="stat-label">{label}</div>
      <div className={`mt-0.5 font-display text-xl font-bold tabular-nums ${c}`}>{fmt(value)}</div>
    </div>
  );
}

// ─────────────────────────── PROFILE TAB ───────────────────────────

function ProfileTab({ user }: { user: User }) {
  const unitName = user.kodim_name || user.korem_name || user.kodam_name;
  const unitDisplay = unitName
    ? (user.unit_id ? `${unitName}` : unitName)
    : (user.unit_id ?? "—");
  const fmtDate = (s: string | null | undefined): string => {
    if (!s) return "—";
    try {
      const d = new Date(s.includes("T") || s.includes("Z") ? s : s + "Z");
      if (Number.isNaN(d.getTime())) return s;
      return d.toLocaleString("id-ID");
    } catch { return String(s); }
  };
  const rows: [string, any][] = [
    ["ID Internal", user.id],
    ["Nama Lengkap", user.full_name],
    ["Email", user.email ?? "—"],
    ["No HP", user.phone ?? "—"],
    ["NRP", user.nrp ?? "—"],
    ["Role", user.role],
    ["Unit", unitDisplay],
    ["Status", user.is_active ? "Active" : "Pending Approval"],
    ["Created", fmtDate(user.created_at)],
    ["Approved", fmtDate(user.approved_at)],
    ["Last Login", fmtDate(user.last_login_at)],
  ];
  return (
    <div className="panel">
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-white/5 last:border-0">
              <td className="px-4 py-2.5 text-[11px] uppercase tracking-widest text-ink-subtle font-semibold w-[200px]">{k}</td>
              <td className="px-4 py-2.5 text-ink">{v || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────── REPORTS TAB ───────────────────────────

function ReportsTab({ reports, loading }: { reports: Report[]; loading: boolean }) {
  const statusColor: Record<string, string> = {
    submitted: "text-warn bg-warn/10 border-warn/30",
    reviewed: "text-blue-400 bg-blue-400/10 border-blue-400/30",
    approved: "text-ok bg-ok/10 border-ok/30",
    rejected: "text-crit bg-crit/10 border-crit/30",
  };
  return (
    <div className="panel">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Tanggal</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Kegiatan</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Sekolah</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold text-right">Peserta</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold text-right">Foto</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">GPS</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-ink-subtle">
                {loading ? "Memuat…" : "Belum ada laporan dari user ini."}
              </td></tr>
            )}
            {reports.map(r => (
              <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-2 text-ink-muted whitespace-nowrap">{new Date(r.reported_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</td>
                <td className="px-4 py-2">
                  <div className="text-ink font-medium">{r.jenis_kegiatan}</div>
                  {r.materi && <div className="text-[11px] text-ink-subtle truncate max-w-[260px]">{r.materi}</div>}
                </td>
                <td className="px-4 py-2 max-w-[200px]">
                  <div className="text-ink-muted truncate">{r.sekolah_nama || "—"}</div>
                  <div className="text-[10px] text-ink-subtle">{r.sekolah_kec ?? ""}{r.sekolah_kab ? `, ${r.sekolah_kab}` : ""}</div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-muted">{fmt(r.peserta_laki + r.peserta_perempuan)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-muted">{r.n_photos > 0 ? r.n_photos : "—"}</td>
                <td className="px-4 py-2">
                  {r.lat != null && r.lng != null ? (
                    <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noopener" className="text-accent-glow hover:underline">
                      <MapPin size={11} className="inline"/>
                    </a>
                  ) : <span className="text-ink-subtle">—</span>}
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusColor[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────── GPS TAB ───────────────────────────

function GpsTab({ gps, loading }: { gps: GpsPoint[]; loading: boolean }) {
  if (loading) return <div className="panel p-8 text-center text-ink-subtle animate-pulse">Memuat…</div>;
  if (gps.length === 0) return <div className="panel p-8 text-center text-ink-subtle">Belum ada laporan dengan koordinat GPS dari user ini.</div>;

  // Compute bounds + timespan
  const first = gps[0], last = gps[gps.length - 1];
  const days = Math.round((new Date(last.reported_at).getTime() - new Date(first.reported_at).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total titik" value={gps.length} accent="gold" />
        <Stat label="Rentang hari" value={days} />
        <Stat label="Sekolah unik" value={new Set(gps.map(g => g.sekolah_nama).filter(Boolean)).size} />
      </div>
      <div className="panel p-2">
        <GpsHistoryMap points={gps} />
      </div>
      <div className="panel">
        <div className="px-4 py-2 border-b border-white/5 stat-label">Daftar titik (kronologis)</div>
        <div className="max-h-[300px] overflow-y-auto">
          {gps.map((p, i) => (
            <div key={p.report_id + i} className="flex items-center gap-2 border-b border-white/5 last:border-0 px-4 py-2 text-[12px]">
              <span className="w-6 text-right font-mono text-ink-subtle">{i + 1}</span>
              <span className="text-ink-muted whitespace-nowrap w-[140px]">{new Date(p.reported_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</span>
              <span className="flex-1 truncate text-ink">{p.jenis_kegiatan}</span>
              <span className="text-ink-subtle truncate max-w-[200px]">{p.sekolah_nama || "—"}</span>
              <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener" className="text-accent-glow text-[11px] hover:underline">
                {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── ASSIGNMENT TAB ───────────────────────────

function AssignmentTab({ data, loading }: { data: { count: number; sample: any[]; center: any }; loading: boolean }) {
  const [detailNpsn, setDetailNpsn] = useState<string | null>(null);

  if (loading) return <div className="panel p-8 text-center text-ink-subtle animate-pulse">Memuat…</div>;
  if (data.count === 0) return <div className="panel p-8 text-center text-ink-subtle">User belum di-assign unit, atau unit-nya tidak punya sekolah binaan.</div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Sekolah Binaan" value={data.count} accent="gold" />
        <Stat label="Sample ditampilkan" value={data.sample.length} />
      </div>
      <div className="panel">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">NPSN</th>
                <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Nama</th>
                <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Bentuk</th>
                <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Status</th>
                <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Akr</th>
                <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Kecamatan</th>
                <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Kab/Kota</th>
              </tr>
            </thead>
            <tbody>
              {data.sample.map(s => (
                <tr key={s.npsn} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-1.5">
                    <button
                      onClick={() => setDetailNpsn(s.npsn)}
                      className="font-mono text-ink-subtle hover:text-accent-glow hover:underline decoration-dotted underline-offset-2"
                      title={`Lihat detail ${s.nama}`}
                    >
                      {s.npsn}
                    </button>
                  </td>
                  <td className="px-4 py-1.5">
                    <button
                      onClick={() => setDetailNpsn(s.npsn)}
                      className="text-ink hover:text-accent-glow text-left"
                      title={s.nama}
                    >
                      {s.nama}
                    </button>
                  </td>
                  <td className="px-4 py-1.5 text-ink-muted">{s.bentuk}</td>
                  <td className="px-4 py-1.5"><span className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${s.status === "NEGERI" ? "bg-ok/10 text-ok" : "bg-accent/10 text-accent"}`}>{s.status}</span></td>
                  <td className="px-4 py-1.5"><span className="inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-mono text-ink-muted border-white/10 bg-white/5">{s.akr}</span></td>
                  <td className="px-4 py-1.5 text-ink-muted">{s.kecamatan}</td>
                  <td className="px-4 py-1.5 text-ink-muted">{s.kab_kota}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.count > data.sample.length && (
            <div className="px-4 py-2 text-[11px] text-ink-subtle border-t border-white/5">
              Menampilkan {data.sample.length} dari {fmt(data.count)} sekolah. Sisanya bisa di-explore di <Link href={`/visualisasi`} className="text-accent-glow hover:underline">/visualisasi</Link>.
            </div>
          )}
        </div>
      </div>

      {detailNpsn && (
        <SekolahDetailModal npsn={detailNpsn} onClose={() => setDetailNpsn(null)} />
      )}
    </div>
  );
}

// ─────────────────────────── EDIT BUTTON + MODAL ───────────────────────────

function EditButton({ user, units, onSave }: { user: User; units: Unit[]; onSave: (patch: any) => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user.full_name);
  const [nrp, setNrp] = useState(user.nrp ?? "");
  const [role, setRole] = useState(user.role);
  const [unitId, setUnitId] = useState(user.unit_id ?? "");
  const [isActive, setIsActive] = useState(!!user.is_active);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          nrp: nrp.trim(),
          role,
          unit_id: unitId || "",
          is_active: isActive ? 1 : 0,
        }),
      });
      if (!r.ok) throw new Error("failed");
      onSave({ full_name: fullName.trim(), nrp: nrp.trim() || null, role, unit_id: unitId || null, is_active: isActive ? 1 : 0 });
      setOpen(false);
    } catch (e: any) { alert("Gagal: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-bg hover:bg-accent-glow transition">
        <Edit size={13}/> Edit
      </button>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
             onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-bg-soft p-5 shadow-2xl">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold text-ink">Edit User</h2>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink"><X size={16}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="stat-label">Nama Lengkap</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2 text-[13px] text-ink"/>
              </div>
              <div>
                <label className="stat-label">NRP</label>
                <input value={nrp} onChange={e => setNrp(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2 text-[13px] text-ink"/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="stat-label">Role</label>
                  <select value={role} onChange={e => setRole(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-bg/60 px-2 py-2 text-[13px] text-ink">
                    {["KODAM", "KOREM", "KODIM", "KORAMIL", "ADMIN"].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="stat-label">Unit</label>
                  <select value={unitId} onChange={e => setUnitId(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-bg/60 px-2 py-2 text-[13px] text-ink">
                    <option value="">— pilih —</option>
                    {units.filter(u => role === "ADMIN" || u.kind === role || (role === "KORAMIL" && u.kind === "KODIM")).map(u => (
                      <option key={u.id} value={u.id}>{u.id} — {u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-ink-muted">
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                Akun aktif (bisa login)
              </label>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-ink-muted hover:bg-white/10">Batal</button>
              <button onClick={submit} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[12px] font-semibold text-bg hover:bg-accent-glow disabled:opacity-40 transition">
                <Save size={13}/> {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
