"use client";

import { useState } from "react";
import {
  CheckCircle2, XCircle, Clock, Search,
  Users as UsersIcon, Shield, AlertTriangle,
} from "lucide-react";
import { fmt } from "@/lib/utils";
import type { WebUser } from "./page";

type UserBucket = "pending" | "approved" | "rejected";

function bucketOf(u: WebUser): UserBucket {
  const s = u.status as UserBucket;
  if (s === "approved" || s === "rejected" || s === "pending") return s;
  return u.is_active ? "approved" : "pending";
}

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
          <span className="chip">
            {counts.pending} pending · {counts.approved} approved · {counts.rejected} rejected
          </span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink">
          Manage <span className="text-accent-glow">User</span>
        </h1>
        <p className="text-[13px] text-ink-muted">
          Kelola akun web BELNEG Mission Control. User yang mendaftar muncul sebagai{" "}
          <em>pending</em> — admin perlu approve sebelum user bisa login.
        </p>
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
            placeholder="Cari nama, email/WA, NRP, unit…"
            className="w-full rounded-md border border-white/10 bg-bg/60 pl-7 pr-2 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle"
          />
        </div>
      </div>

      {/* Table */}
      {!error && users.length === 0 ? (
        <div className="panel p-10 text-center">
          <div className="text-[13px] font-medium text-ink">Belum ada data user.</div>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-bg-soft/80 text-[10px] uppercase tracking-widest text-ink-subtle">
                <tr>
                  <th className="text-left px-3 py-2.5">Nama / Kontak</th>
                  <th className="text-left px-3 py-2.5">Jabatan / Unit</th>
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

        {/* Jabatan / unit */}
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
