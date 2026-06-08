"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Clock, Mail, Phone, Shield, Search, Plus, ChevronRight, Trash2, Users as UsersIcon } from "lucide-react";
import { fmt } from "@/lib/utils";
import { AdminSummary } from "./admin-summary";
import type { AdminStats } from "./admin-stats";

type User = {
  id: string; email: string | null; phone: string | null; full_name: string;
  nrp: string | null; role: string; unit_id: string | null; is_active: number;
  created_at: string; approved_at: string | null; last_login_at: string | null;
  kodim_name: string | null; korem_name: string | null; kodam_name: string | null;
  n_reports: number;
};
type Unit = { id: string; name: string; kind: string };

// Manage Pembina approval status, derived from existing kkri_users fields. There is no
// dedicated "rejected" flag in the schema yet (and we're not adding one — see the
// constraint to not alter the database), so:
//   pending  = never decided      (is_active = 0, approved_at IS NULL)
//   approved = currently active   (is_active = 1)
//   rejected = approved before, now deactivated (is_active = 0, approved_at IS NOT NULL)
// TODO(integration): once a dedicated status/rejected_at column exists, "rejected before
// ever being approved" can be told apart from "still pending" — not assumed here.
type PembinaBucket = "pending" | "approved" | "rejected";
function bucketOf(u: User): PembinaBucket {
  if (u.is_active) return "approved";
  return u.approved_at ? "rejected" : "pending";
}

export default function UsersClient({ users: initialUsers, units, stats }: { users: User[]; units: Unit[]; stats: AdminStats }) {
  const [users, setUsers] = useState(initialUsers);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = users.filter(u => {
    if (filter !== "all" && bucketOf(u) !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [u.full_name, u.email, u.phone, u.nrp, u.unit_id].some(f => f?.toLowerCase().includes(q));
    }
    return true;
  });

  const approve = async (u: User, role: string, unit_id: string) => {
    setBusy(u.id);
    try {
      const r = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: 1, role, unit_id }),
      });
      if (!r.ok) throw new Error("failed");
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: 1, role, unit_id } : x));
    } catch (e: any) { alert("Gagal approve: " + e.message); }
    finally { setBusy(null); }
  };

  const reject = async (u: User) => {
    const msg = u.is_active
      ? `Nonaktifkan ${u.full_name}? User tidak akan bisa login sampai diaktifkan kembali.`
      : `Tolak permintaan ${u.full_name}? User akan tetap nonaktif.`;
    if (!confirm(msg)) return;
    setBusy(u.id);
    try {
      const r = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: 0 }),
      });
      if (!r.ok) throw new Error("failed");
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: 0 } : x));
    } catch (e: any) { alert(e.message); }
    finally { setBusy(null); }
  };

  const removeUser = async (u: User) => {
    if (!confirm(`Hapus user "${u.full_name}"?\n\nUser akan di-soft-delete (tidak bisa login lagi). Semua laporan & riwayat-nya TETAP tersimpan untuk audit.`)) return;
    setBusy(u.id);
    try {
      const r = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("failed");
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (e: any) { alert(e.message); }
    finally { setBusy(null); }
  };

  const [showCreate, setShowCreate] = useState(false);
  const onCreated = (newUser: User) => {
    setUsers(prev => [newUser, ...prev]);
    setShowCreate(false);
  };

  const counts = {
    all: users.length,
    pending: users.filter(u => bucketOf(u) === "pending").length,
    approved: users.filter(u => bucketOf(u) === "approved").length,
    rejected: users.filter(u => bucketOf(u) === "rejected").length,
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-2 border-b border-white/5 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="chip text-accent-glow border-accent/40">● ADMIN</span>
          <span className="chip">{counts.pending} pending · {counts.approved} approved · {counts.rejected} rejected</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Manage <span className="text-accent-glow">Pembina</span>
          </h1>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-bg hover:bg-accent-glow transition shadow-glow"
          >
            <Plus size={14}/> Tambah Pembina
          </button>
        </div>
        <p className="text-[13px] text-ink-muted">
          Approval untuk Pembina KKRI (personel lapangan) yang register lewat aplikasi mobile, atau dibuat manual.
          Akun Pembina ini terpisah dari akun web Mission Control — role di sini (KODAM/KOREM/KODIM/KORAMIL/ADMIN)
          menunjukkan jenjang komando, bukan hak akses dashboard.
          Alur: Pembina register → berstatus <em>pending</em> → muncul di sini → admin approve / reject → baru bisa login di APK.
          Klik baris untuk lihat detail (riwayat GPS, laporan, sekolah binaan).
        </p>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={UsersIcon} label="Total Pembina" value={counts.all} accent="ink" />
        <SummaryCard icon={Clock} label="Pending Approval" value={counts.pending} accent="warn" />
        <SummaryCard icon={CheckCircle2} label="Approved / Active" value={counts.approved} accent="ok" />
        <SummaryCard icon={XCircle} label="Rejected / Inactive" value={counts.rejected} accent="crit" />
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["all", "pending", "approved", "rejected"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-[11px] uppercase tracking-widest transition ${filter === f ? "bg-accent text-bg font-semibold" : "bg-white/5 text-ink-muted hover:bg-white/10"}`}>
              {f} ({counts[f]})
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama, email, HP, NRP, unit Pembina…"
            className="w-full rounded-md border border-white/10 bg-bg/60 pl-7 pr-2 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle" />
        </div>
      </div>

      {/* User table */}
      {users.length === 0 ? (
        <div className="panel p-10 text-center">
          <div className="text-[13px] font-medium text-ink">Belum ada data Pembina.</div>
          <div className="mt-1 text-[12px] text-ink-subtle">Menunggu data registrasi dari aplikasi mobile.</div>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-bg-soft/80 text-[10px] uppercase tracking-widest text-ink-subtle">
                <tr>
                  <th className="text-left px-3 py-2.5">Nama / Kontak</th>
                  <th className="text-left px-3 py-2.5">Role</th>
                  <th className="text-left px-3 py-2.5">Unit</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                  <th className="text-left px-3 py-2.5">Tanggal</th>
                  <th className="text-left px-3 py-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-ink-subtle">Tidak ada Pembina cocok dengan filter.</td></tr>
                )}
                {filtered.map(u => (
                  <UserRow key={u.id} user={u} units={units} onApprove={approve} onReject={reject} onDelete={removeUser} busy={busy === u.id} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deeper analytics — collapsed by default, only meaningful once there's real activity data */}
      <AdminSummary stats={stats} />

      {showCreate && (
        <CreateUserModal units={units} onClose={() => setShowCreate(false)} onCreated={onCreated} />
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: "ink" | "ok" | "warn" | "crit" }) {
  const colorCls = accent === "ok" ? "text-ok" : accent === "warn" ? "text-warn" : accent === "crit" ? "text-crit" : "text-ink";
  return (
    <div className="panel p-3.5">
      <div className="flex items-center gap-1.5 text-ink-subtle">
        <Icon size={13} />
        <span className="stat-label">{label}</span>
      </div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${colorCls}`}>{fmt(value)}</div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso + "Z").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

function StatusPill({ bucket }: { bucket: PembinaBucket }) {
  if (bucket === "approved") {
    return <span className="inline-flex items-center gap-1 rounded-sm border border-ok/30 bg-ok/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ok"><CheckCircle2 size={10}/> Approved</span>;
  }
  if (bucket === "rejected") {
    return <span className="inline-flex items-center gap-1 rounded-sm border border-crit/30 bg-crit/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-crit"><XCircle size={10}/> Rejected</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-sm border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn"><Clock size={10}/> Pending</span>;
}

function UserRow({ user, units, onApprove, onReject, onDelete, busy }: {
  user: User; units: Unit[];
  onApprove: (u: User, role: string, unit_id: string) => void;
  onReject: (u: User) => void;
  onDelete: (u: User) => void;
  busy: boolean;
}) {
  const bucket = bucketOf(user);
  const [editing, setEditing] = useState(bucket === "pending");
  const [role, setRole] = useState(user.role);
  const [unitId, setUnitId] = useState(user.unit_id ?? "");
  const unitName = user.kodim_name || user.korem_name || user.kodam_name;

  return (
    <>
      <tr className={`border-t border-white/5 hover:bg-white/[0.02] align-top ${bucket === "pending" ? "bg-warn/5" : ""}`}>
        <td className="px-3 py-2.5">
          <Link href={`/admin/pembina/${user.id}`} className="font-medium text-ink hover:text-accent-glow transition">{user.full_name}</Link>
          <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[10px] text-ink-subtle">
            {user.email && <span className="flex items-center gap-1"><Mail size={9}/>{user.email}</span>}
            {user.phone && <span className="flex items-center gap-1"><Phone size={9}/>{user.phone}</span>}
          </div>
          {user.nrp && <div className="mt-0.5 text-[10px] text-ink-subtle font-mono">NRP {user.nrp}</div>}
        </td>
        <td className="px-3 py-2.5">
          <span className="inline-flex items-center gap-1 rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-glow">
            <Shield size={10}/> {user.role}
          </span>
        </td>
        <td className="px-3 py-2.5">
          {unitName
            ? <><div className="text-ink">{unitName}</div><div className="text-[10px] text-ink-subtle font-mono">{user.unit_id}</div></>
            : <span className="text-ink-subtle">{user.unit_id ?? "—"}</span>}
        </td>
        <td className="px-3 py-2.5"><StatusPill bucket={bucket} /></td>
        <td className="px-3 py-2.5 text-[11px] text-ink-muted">
          <div>Daftar: {fmtDate(user.created_at)}</div>
          {user.approved_at && <div>Diputuskan: {fmtDate(user.approved_at)}</div>}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/admin/pembina/${user.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-ink-muted hover:bg-accent/10 hover:text-accent-glow hover:border-accent/40 transition">
              Detail <ChevronRight size={10}/>
            </Link>
            {bucket !== "approved" && (
              <button onClick={() => setEditing(v => !v)} disabled={busy}
                className="rounded-md bg-ok px-2 py-1 text-[10px] uppercase tracking-widest font-semibold text-bg hover:bg-ok/90 disabled:opacity-40">
                <CheckCircle2 size={10} className="inline mr-1"/>Approve
              </button>
            )}
            {bucket !== "rejected" && (
              <button onClick={() => onReject(user)} disabled={busy}
                className="rounded-md border border-crit/40 bg-crit/10 px-2 py-1 text-[10px] uppercase tracking-widest font-semibold text-crit hover:bg-crit/20 disabled:opacity-40">
                <XCircle size={10} className="inline mr-1"/>{user.is_active ? "Nonaktifkan" : "Reject"}
              </button>
            )}
            <button onClick={() => onDelete(user)} disabled={busy}
              className="rounded-md border border-white/10 bg-white/5 p-1.5 text-ink-subtle hover:text-crit hover:border-crit/30 disabled:opacity-40 transition"
              title="Hapus user">
              <Trash2 size={12}/>
            </button>
          </div>
        </td>
      </tr>
      {editing && bucket !== "approved" && (
        <tr className="border-t border-white/5 bg-white/[0.03]">
          <td colSpan={6} className="px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label className="stat-label">Role</label>
                <select value={role} onChange={e => setRole(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-bg/60 px-2 py-1.5 text-[12px] text-ink">
                  {["KODAM", "KOREM", "KODIM", "KORAMIL", "ADMIN"].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="sm:col-span-6">
                <label className="stat-label">Unit</label>
                <select value={unitId} onChange={e => setUnitId(e.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-bg/60 px-2 py-1.5 text-[12px] text-ink">
                  <option value="">— pilih unit —</option>
                  {units.filter(u => role === "ADMIN" || u.kind === role || (role === "KORAMIL" && u.kind === "KODIM")).map(u => (
                    <option key={u.id} value={u.id}>{u.id} — {u.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3 flex gap-2 items-end">
                <button onClick={() => onApprove(user, role, unitId)} disabled={busy || (role !== "ADMIN" && !unitId)}
                  className="flex-1 rounded-md bg-ok px-3 py-2 text-[11px] uppercase tracking-widest font-semibold text-bg hover:bg-ok/90 disabled:opacity-40">
                  <CheckCircle2 size={11} className="inline mr-1"/>{busy ? "…" : "Konfirmasi Approve"}
                </button>
                <button onClick={() => setEditing(false)} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-widest text-ink-muted hover:bg-white/10">
                  Batal
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CreateUserModal({ units, onClose, onCreated }: {
  units: Unit[];
  onClose: () => void;
  onCreated: (u: User) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState("");
  const [nrp, setNrp] = useState("");
  const [role, setRole] = useState<string>("KODIM");
  const [unitId, setUnitId] = useState("");
  const [activate, setActivate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          contact: contact.trim(),
          role, unit_id: unitId || null,
          nrp: nrp.trim() || null,
          is_active: activate ? 1 : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      const newUser: User = {
        id: data.id,
        email: /@/.test(contact) ? contact.trim().toLowerCase() : null,
        phone: !/@/.test(contact) ? contact.trim() : null,
        full_name: fullName.trim(),
        nrp: nrp.trim() || null,
        role,
        unit_id: unitId || null,
        is_active: activate ? 1 : 0,
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        approved_at: activate ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
        last_login_at: null,
        kodim_name: units.find(u => u.id === unitId && u.kind === "KODIM")?.name ?? null,
        korem_name: units.find(u => u.id === unitId && u.kind === "KOREM")?.name ?? null,
        kodam_name: units.find(u => u.id === unitId && u.kind === "KODAM")?.name ?? null,
        n_reports: 0,
      };
      onCreated(newUser);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-bg-soft p-5 shadow-2xl">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Tambah Pembina</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">✕</button>
        </div>
        <div className="space-y-3">
          <Field label="Nama Lengkap*">
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nama lengkap personnel"
              className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2 text-[13px] text-ink"/>
          </Field>
          <Field label="Email atau No HP*" hint="Yang akan menerima OTP untuk login">
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="user@tni.mil.id atau 0812xxx"
              className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2 text-[13px] text-ink"/>
          </Field>
          <Field label="NRP (opsional)">
            <input value={nrp} onChange={e => setNrp(e.target.value)} placeholder="Nomor Registrasi Pokok"
              className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2 text-[13px] text-ink"/>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Role*">
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-bg/60 px-2 py-2 text-[13px] text-ink">
                {["KODAM", "KOREM", "KODIM", "KORAMIL", "ADMIN"].map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label={role === "ADMIN" ? "Unit (opsional)" : "Unit*"}>
              <select value={unitId} onChange={e => setUnitId(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-bg/60 px-2 py-2 text-[13px] text-ink">
                <option value="">— pilih —</option>
                {units.filter(u => role === "ADMIN" || u.kind === role || (role === "KORAMIL" && u.kind === "KODIM")).map(u => (
                  <option key={u.id} value={u.id}>{u.id} — {u.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-ink-muted">
            <input type="checkbox" checked={activate} onChange={e => setActivate(e.target.checked)} />
            Aktifkan langsung (bisa login tanpa approval)
          </label>
          {err && <div className="rounded-md border border-crit/40 bg-crit/10 px-3 py-2 text-[12px] text-crit">{err}</div>}
        </div>
        <div className="mt-5 flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-ink-muted hover:bg-white/10">Batal</button>
          <button onClick={submit} disabled={saving || !fullName.trim() || !contact.trim() || (role !== "ADMIN" && !unitId)}
            className="rounded-md bg-accent px-4 py-2 text-[12px] font-semibold text-bg hover:bg-accent-glow disabled:opacity-40 transition">
            {saving ? "Menyimpan…" : "Buat User"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="stat-label">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-[10px] text-ink-subtle">{hint}</div>}
    </div>
  );
}
