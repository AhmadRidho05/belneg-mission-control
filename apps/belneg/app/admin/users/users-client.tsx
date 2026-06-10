"use client";

import { useState } from "react";
import {
  CheckCircle2, XCircle, Clock, Search,
  Users as UsersIcon, Shield, AlertTriangle, UserPlus, X,
} from "lucide-react";
import { fmt } from "@/lib/utils";
import type { WebUser } from "./page";

const JABATAN_OPTIONS = [
  "Pratu", "Praka", "Kopda", "Koptu", "Kopka",
  "Serda", "Sertu", "Serka", "Serma", "Pelda", "Peltu",
  "Letda", "Lettu", "Kapten", "Mayor", "Letkol", "Kolonel",
  "Brigjen", "Mayjen", "Letjen", "Jenderal",
] as const;

const UNIT_JENIS_OPTIONS = ["KODAM", "KOREM", "KODIM", "KORAMIL"] as const;

type UserBucket = "pending" | "approved" | "rejected";

function bucketOf(u: WebUser): UserBucket {
  const s = u.status as UserBucket;
  if (s === "approved" || s === "rejected" || s === "pending") return s;
  return u.is_active ? "approved" : "pending";
}

// ─── Add User Modal ────────────────────────────────────────────────────────────

const INPUT_CLS =
  "w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30";

type AddUserForm = {
  full_name: string;
  email_or_phone: string;
  nrp: string;
  jabatan: string;
  unit_type: string;
  unit_name: string;
  role: "admin" | "user";
};

function AddUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (u: WebUser) => void;
}) {
  const [form, setForm] = useState<AddUserForm>({
    full_name: "",
    email_or_phone: "",
    nrp: "",
    jabatan: JABATAN_OPTIONS[0],
    unit_type: UNIT_JENIS_OPTIONS[0],
    unit_name: "",
    role: "user",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof AddUserForm>(k: K, v: AddUserForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email_or_phone.trim() || !form.nrp.trim() || !form.unit_name.trim()) {
      setError("Lengkapi semua field yang wajib.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/web/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email_or_phone: form.email_or_phone.trim(),
          nrp: form.nrp.trim(),
          jabatan: form.jabatan,
          unit_type: form.unit_type,
          unit_name: form.unit_name.trim(),
          role: form.role,
        }),
      });
      const data = await res.json() as { ok?: boolean; user?: WebUser; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Gagal membuat user (HTTP ${res.status}).`);
        return;
      }
      onCreated(data.user!);
    } catch {
      setError("Terjadi kesalahan koneksi. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-white/10 bg-bg-soft shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <UserPlus size={16} className="text-accent" />
            <h2 className="font-display text-base font-bold text-ink">Tambah User Baru</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-md p-1.5 text-ink-muted hover:bg-white/5 hover:text-ink transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <p className="text-[12px] text-ink-muted">
            User yang dibuat admin langsung berstatus{" "}
            <span className="font-semibold text-ok">approved</span> dan bisa login segera.
          </p>

          <ModalField label="Nama Lengkap *">
            <input
              required
              autoFocus
              value={form.full_name}
              onChange={e => set("full_name", e.target.value)}
              placeholder="Nama lengkap"
              className={INPUT_CLS}
            />
          </ModalField>

          <ModalField label="Nomor HP / WhatsApp *">
            <input
              required
              type="tel"
              inputMode="tel"
              value={form.email_or_phone}
              onChange={e => set("email_or_phone", e.target.value)}
              placeholder="0812xxxxxxxx"
              className={INPUT_CLS}
            />
          </ModalField>

          <ModalField label="NRP *">
            <input
              required
              value={form.nrp}
              onChange={e => set("nrp", e.target.value)}
              placeholder="Nomor Registrasi Pokok"
              className={INPUT_CLS}
            />
          </ModalField>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Pangkat *">
              <select
                required
                value={form.jabatan}
                onChange={e => set("jabatan", e.target.value)}
                className={INPUT_CLS}
              >
                {JABATAN_OPTIONS.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </ModalField>
            <ModalField label="Jenis Satuan">
              <select
                value={form.unit_type}
                onChange={e => set("unit_type", e.target.value)}
                className={INPUT_CLS}
              >
                {UNIT_JENIS_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </ModalField>
          </div>

          <ModalField label="Nama Unit Kerja *">
            <input
              required
              value={form.unit_name}
              onChange={e => set("unit_name", e.target.value)}
              placeholder="cth. Kodim 0501/BS, Korem 052/Wijayakrama"
              className={INPUT_CLS}
            />
          </ModalField>

          <ModalField label="Role">
            <div className="flex gap-3">
              {(["user", "admin"] as const).map(r => (
                <label key={r} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={form.role === r}
                    onChange={() => set("role", r)}
                    className="accent-accent"
                  />
                  <span className={`text-[12px] font-semibold uppercase tracking-wider ${
                    r === "admin" ? "text-crit" : "text-ink-muted"
                  }`}>
                    {r}
                    {r === "admin" && (
                      <span className="ml-1 text-[10px] text-crit/70 normal-case font-normal">(full access)</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </ModalField>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-crit/40 bg-crit/10 px-3 py-2.5 text-[12px] text-crit">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-[12px] text-ink-muted hover:bg-white/10 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition disabled:opacity-60"
            >
              <UserPlus size={13} />
              {loading ? "Membuat…" : "Buat User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="stat-label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function UsersClient({
  users: initialUsers,
  error,
}: {
  users: WebUser[];
  error: string | null;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [filter, setFilter] = useState<"all" | UserBucket>("pending");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = users.filter(u => {
    if (filter !== "all" && bucketOf(u) !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [u.full_name, u.email_or_phone, u.nrp, u.jabatan, u.unit_name, u.unit_type]
        .some(f => f?.toLowerCase().includes(q));
    }
    return true;
  });

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/web/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const d = await r.json() as { error?: string };
      throw new Error(d.error ?? `HTTP ${r.status}`);
    }
  };

  const approve = async (u: WebUser, role: string) => {
    setBusy(u.id);
    try {
      await patch(u.id, { status: "approved", is_active: 1, role });
      setUsers(prev =>
        prev.map(x => x.id === u.id ? { ...x, status: "approved", is_active: 1, role } : x)
      );
    } catch (e: unknown) {
      alert("Gagal approve: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  };

  const reject = async (u: WebUser) => {
    const msg = u.is_active
      ? `Nonaktifkan ${u.full_name}? User tidak bisa login sampai diaktifkan kembali.`
      : `Tolak pendaftaran ${u.full_name}?`;
    if (!confirm(msg)) return;
    setBusy(u.id);
    try {
      await patch(u.id, { status: "rejected", is_active: 0 });
      setUsers(prev =>
        prev.map(x => x.id === u.id ? { ...x, status: "rejected", is_active: 0 } : x)
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const deactivate = async (u: WebUser) => {
    if (!confirm(`Nonaktifkan ${u.full_name}? Status approved tetap, tapi is_active = 0.`)) return;
    setBusy(u.id);
    try {
      await patch(u.id, { is_active: 0 });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: 0 } : x));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const removeUser = async (u: WebUser) => {
    if (!confirm(`Hapus user "${u.full_name}"?\n\nUser akan dinonaktifkan permanen.`)) return;
    setBusy(u.id);
    try {
      const r = await fetch(`/api/web/admin/users/${u.id}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json() as { error?: string };
        throw new Error(d.error ?? "Gagal hapus");
      }
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleUserCreated = (newUser: WebUser) => {
    setUsers(prev => [newUser, ...prev]);
    setShowAddModal(false);
    setFilter("approved");
  };

  const counts = {
    all: users.length,
    pending: users.filter(u => bucketOf(u) === "pending").length,
    approved: users.filter(u => bucketOf(u) === "approved").length,
    rejected: users.filter(u => bucketOf(u) === "rejected").length,
  };

  return (
    <>
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleUserCreated}
        />
      )}

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-2 border-b border-white/5 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="chip text-accent-glow border-accent/40">● ADMIN</span>
            <span className="chip">
              {counts.pending} pending · {counts.approved} approved · {counts.rejected} rejected
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink">
                Manage <span className="text-accent-glow">User</span>
              </h1>
              <p className="mt-1 text-[13px] text-ink-muted">
                Kelola akun web BELNEG Mission Control. User baru hanya bisa dibuat oleh admin.
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="shrink-0 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition"
            >
              <UserPlus size={14} />
              Tambah User
            </button>
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-crit/40 bg-crit/10 px-4 py-3 text-[13px] text-crit">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span><strong>Gagal memuat data:</strong> {error}</span>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={UsersIcon} label="Total User" value={counts.all} accent="ink" />
          <SummaryCard icon={Clock} label="Pending" value={counts.pending} accent="warn" />
          <SummaryCard icon={CheckCircle2} label="Approved" value={counts.approved} accent="ok" />
          <SummaryCard icon={XCircle} label="Rejected" value={counts.rejected} accent="crit" />
        </div>

        {/* Filter + search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {(["all", "pending", "approved", "rejected"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-[11px] uppercase tracking-widest transition ${
                  filter === f
                    ? "bg-accent text-bg font-semibold"
                    : "bg-white/5 text-ink-muted hover:bg-white/10"
                }`}
              >
                {f} ({counts[f]})
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama, no HP, NRP, unit…"
              className="w-full rounded-md border border-white/10 bg-bg/60 pl-7 pr-2 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle"
            />
          </div>
        </div>

        {/* Table */}
        {!error && users.length === 0 ? (
          <div className="panel p-10 text-center">
            <div className="text-[13px] font-medium text-ink-muted mb-3">Belum ada data user.</div>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition"
            >
              <UserPlus size={14} /> Tambah User Pertama
            </button>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-bg-soft/80 text-[10px] uppercase tracking-widest text-ink-subtle">
                  <tr>
                    <th className="text-left px-3 py-2.5">Nama / No HP</th>
                    <th className="text-left px-3 py-2.5">Pangkat / Unit</th>
                    <th className="text-left px-3 py-2.5">Role</th>
                    <th className="text-left px-3 py-2.5">Status</th>
                    <th className="text-left px-3 py-2.5">Terdaftar</th>
                    <th className="text-left px-3 py-2.5">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-ink-subtle">
                        Tidak ada user yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                  {filtered.map(u => (
                    <UserRow
                      key={u.id}
                      user={u}
                      onApprove={approve}
                      onReject={reject}
                      onDeactivate={deactivate}
                      onDelete={removeUser}
                      busy={busy === u.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SummaryCard({
  icon: Icon, label, value, accent,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ElementType<any>;
  label: string;
  value: number;
  accent: "ink" | "ok" | "warn" | "crit";
}) {
  const color =
    accent === "ok" ? "text-ok" :
    accent === "warn" ? "text-warn" :
    accent === "crit" ? "text-crit" : "text-ink";
  return (
    <div className="panel p-3.5">
      <div className="flex items-center gap-1.5 text-ink-subtle">
        <Icon size={13} />
        <span className="stat-label">{label}</span>
      </div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${color}`}>{fmt(value)}</div>
    </div>
  );
}

function StatusPill({ bucket }: { bucket: UserBucket }) {
  if (bucket === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-ok/30 bg-ok/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ok">
        <CheckCircle2 size={10} /> Approved
      </span>
    );
  }
  if (bucket === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-crit/30 bg-crit/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-crit">
        <XCircle size={10} /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn">
      <Clock size={10} /> Pending
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

function UserRow({
  user, onApprove, onReject, onDeactivate, onDelete, busy,
}: {
  user: WebUser;
  onApprove: (u: WebUser, role: string) => void;
  onReject: (u: WebUser) => void;
  onDeactivate: (u: WebUser) => void;
  onDelete: (u: WebUser) => void;
  busy: boolean;
}) {
  const bucket = bucketOf(user);
  const [editing, setEditing] = useState(bucket === "pending");
  const [role, setRole] = useState(user.role);

  return (
    <>
      <tr
        className={`border-t border-white/5 hover:bg-white/[0.02] align-top ${
          bucket === "pending" ? "bg-warn/5" : ""
        }`}
      >
        {/* Nama / kontak */}
        <td className="px-3 py-2.5">
          <div className="font-medium text-ink">{user.full_name}</div>
          <div className="mt-0.5 text-[10px] text-ink-subtle">{user.email_or_phone}</div>
          {user.nrp && (
            <div className="mt-0.5 font-mono text-[10px] text-ink-subtle">NRP {user.nrp}</div>
          )}
        </td>

        {/* Pangkat / unit */}
        <td className="px-3 py-2.5 text-ink-muted">
          <div>{user.jabatan ?? "—"}</div>
          {(user.unit_type || user.unit_name) && (
            <div className="text-[10px] text-ink-subtle">
              {[user.unit_type, user.unit_name].filter(Boolean).join(" · ")}
            </div>
          )}
        </td>

        {/* Role */}
        <td className="px-3 py-2.5">
          <span className="inline-flex items-center gap-1 rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-glow">
            <Shield size={10} /> {user.role}
          </span>
          {user.is_active === 0 && bucket === "approved" && (
            <div className="mt-0.5 text-[9px] text-warn">nonaktif</div>
          )}
        </td>

        {/* Status */}
        <td className="px-3 py-2.5">
          <StatusPill bucket={bucket} />
        </td>

        {/* Tanggal */}
        <td className="px-3 py-2.5 text-[11px] text-ink-muted">
          {fmtDate(user.created_at)}
        </td>

        {/* Aksi */}
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {bucket !== "approved" && (
              <button
                onClick={() => setEditing(v => !v)}
                disabled={busy}
                className="rounded-md bg-ok px-2 py-1 text-[10px] uppercase tracking-widest font-semibold text-bg hover:bg-ok/90 disabled:opacity-40"
              >
                <CheckCircle2 size={10} className="inline mr-1" />
                Approve
              </button>
            )}
            {bucket === "approved" && user.is_active === 1 && (
              <button
                onClick={() => onDeactivate(user)}
                disabled={busy}
                className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[10px] uppercase tracking-widest font-semibold text-warn hover:bg-warn/20 disabled:opacity-40"
              >
                Nonaktifkan
              </button>
            )}
            {bucket !== "rejected" && (
              <button
                onClick={() => onReject(user)}
                disabled={busy}
                className="rounded-md border border-crit/40 bg-crit/10 px-2 py-1 text-[10px] uppercase tracking-widest font-semibold text-crit hover:bg-crit/20 disabled:opacity-40"
              >
                <XCircle size={10} className="inline mr-1" />
                Reject
              </button>
            )}
            <button
              onClick={() => onDelete(user)}
              disabled={busy}
              title="Hapus user"
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-ink-subtle hover:text-crit hover:border-crit/30 disabled:opacity-40 transition"
            >
              Hapus
            </button>
          </div>
        </td>
      </tr>

      {/* Inline approve form — role selector */}
      {editing && bucket !== "approved" && (
        <tr className="border-t border-white/5 bg-white/[0.03]">
          <td colSpan={6} className="px-3 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="stat-label">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="mt-1 rounded-md border border-white/10 bg-bg/60 px-2 py-1.5 text-[12px] text-ink"
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <button
                onClick={() => { onApprove(user, role); setEditing(false); }}
                disabled={busy}
                className="rounded-md bg-ok px-3 py-2 text-[11px] uppercase tracking-widest font-semibold text-bg hover:bg-ok/90 disabled:opacity-40"
              >
                <CheckCircle2 size={11} className="inline mr-1" />
                {busy ? "…" : "Konfirmasi Approve"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-widest text-ink-muted hover:bg-white/10"
              >
                Batal
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
