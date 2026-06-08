"use client";

import { useEffect, useState } from "react";
import { Clock, CheckCircle2, XCircle, Mail, Phone, Sparkles } from "lucide-react";
import {
  listSimAccounts, setSimAccountStatus, WEB_ACCOUNTS_STORAGE_KEY,
  type SimWebAccount, type WebAccountStatus,
} from "@/lib/auth-sim";

// Self-registered Web Mission Control accounts live only in localStorage (see
// lib/auth-sim.ts) until a real web-accounts table exists. This panel surfaces
// them inside Manage User — clearly marked "Simulated" — alongside the real
// `kkri_users` data fetched by the parent, so admins can approve/reject
// registrations without the two sources being confused for one another.
export function SimulatedAccountsPanel() {
  const [accounts, setAccounts] = useState<SimWebAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setAccounts(listSimAccounts());

    // Cross-tab sync — e.g. someone registers in one tab while Manage User is
    // open in another.
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === WEB_ACCOUNTS_STORAGE_KEY) setAccounts(listSimAccounts());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (accounts.length === 0) return null;

  const pending = accounts.filter((a) => a.status === "pending").length;

  const decide = (id: string, status: WebAccountStatus) => {
    setBusy(id);
    setAccounts(setSimAccountStatus(id, status));
    setBusy(null);
  };

  return (
    <div className="panel overflow-hidden">
      <div className="panel-head">
        <span className="panel-title flex items-center gap-2">
          <Sparkles size={14}/> Pendaftaran Akun Web Mission Control
        </span>
        <span className="panel-subtitle">{pending} menunggu approval · localStorage simulation</span>
      </div>
      <div className="panel-body space-y-3">
        <p className="text-[11px] leading-relaxed text-ink-subtle">
          Akun-akun ini berasal dari <code>/auth/register</code> dan disimpan sementara di{" "}
          <code>localStorage</code> (belum masuk ke <code>kkri_users</code>). Tandai{" "}
          <span className="rounded-sm border border-accent/30 bg-accent/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-glow">Simulated</span>{" "}
          agar tidak tertukar dengan data web-account sungguhan setelah database/auth final tersedia.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-bg-soft/80 text-[10px] uppercase tracking-widest text-ink-subtle">
              <tr>
                <th className="text-left px-3 py-2.5">Nama / Kontak</th>
                <th className="text-left px-3 py-2.5">Jabatan</th>
                <th className="text-left px-3 py-2.5">Unit</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Daftar</th>
                <th className="text-left px-3 py-2.5">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className={`border-t border-white/5 align-top ${a.status === "pending" ? "bg-warn/5" : ""}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink">{a.full_name}</span>
                      <span className="rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-glow">
                        Simulated
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-subtle">
                      {a.contact.includes("@") ? <Mail size={9}/> : <Phone size={9}/>} {a.contact}
                    </div>
                    {a.nrp && <div className="mt-0.5 text-[10px] text-ink-subtle font-mono">NRP {a.nrp}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">{a.jabatan}</td>
                  <td className="px-3 py-2.5">
                    <div className="text-ink">{a.unit_nama || "—"}</div>
                    <div className="text-[10px] text-ink-subtle">{a.unit_jenis}</div>
                  </td>
                  <td className="px-3 py-2.5"><AccountStatusPill status={a.status} /></td>
                  <td className="px-3 py-2.5 text-[11px] text-ink-muted">
                    <div>{fmtDate(a.created_at)}</div>
                    {a.decided_at && <div className="text-ink-subtle">Diputuskan: {fmtDate(a.decided_at)}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {a.status !== "approved" && (
                        <button onClick={() => decide(a.id, "approved")} disabled={busy === a.id}
                          className="rounded-md bg-ok px-2 py-1 text-[10px] uppercase tracking-widest font-semibold text-bg hover:bg-ok/90 disabled:opacity-40">
                          <CheckCircle2 size={10} className="inline mr-1"/>Approve
                        </button>
                      )}
                      {a.status !== "rejected" && (
                        <button onClick={() => decide(a.id, "rejected")} disabled={busy === a.id}
                          className="rounded-md border border-crit/40 bg-crit/10 px-2 py-1 text-[10px] uppercase tracking-widest font-semibold text-crit hover:bg-crit/20 disabled:opacity-40">
                          <XCircle size={10} className="inline mr-1"/>Reject
                        </button>
                      )}
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

function AccountStatusPill({ status }: { status: WebAccountStatus }) {
  if (status === "approved") {
    return <span className="inline-flex items-center gap-1 rounded-sm border border-ok/30 bg-ok/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ok"><CheckCircle2 size={10}/> Approved</span>;
  }
  if (status === "rejected") {
    return <span className="inline-flex items-center gap-1 rounded-sm border border-crit/30 bg-crit/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-crit"><XCircle size={10}/> Rejected</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-sm border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn"><Clock size={10}/> Pending</span>;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}
