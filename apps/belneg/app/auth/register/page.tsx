"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { UserPlus, CheckCircle2 } from "lucide-react";
import {
  registerSimAccount, JABATAN_OPTIONS, UNIT_JENIS_OPTIONS,
} from "@/lib/auth-sim";

// TEMPORARY AUTH SIMULATION — see lib/auth-sim.ts. No database write happens
// here: the account is stored locally as `pending` / role `user` and shows up
// in Manage User for an admin to approve or reject. Registration never logs
// the visitor in directly — only an approved account can sign in.
export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState("");
  const [jabatan, setJabatan] = useState(JABATAN_OPTIONS[0]);
  const [unitJenis, setUnitJenis] = useState(UNIT_JENIS_OPTIONS[0]);
  const [unitNama, setUnitNama] = useState("");
  const [nrp, setNrp] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !contact.trim() || !unitNama.trim() || !nrp.trim() || !password) {
      setError("Lengkapi semua data terlebih dahulu.");
      return;
    }
    registerSimAccount({ full_name: fullName, contact, jabatan, unit_jenis: unitJenis, unit_nama: unitNama, nrp, password });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <AuthShell>
        <div className="text-center">
          <CheckCircle2 size={36} className="mx-auto text-ok" />
          <h1 className="mt-3 font-display text-xl font-bold text-ink">Pendaftaran berhasil</h1>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
            Pendaftaran berhasil. Akun Anda menunggu approval admin. Anda akan bisa masuk ke dashboard
            setelah admin menyetujui pendaftaran ini di menu Manage User.
          </p>
          <Link
            href="/auth/login?notice=registered_pending"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition"
          >
            Ke halaman Login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-display text-2xl font-bold text-ink">Daftar Akun</h1>
      <p className="mt-1 text-[12px] text-ink-muted">
        Akun baru otomatis berstatus <strong className="text-ink">pending</strong> dan menunggu approval admin sebelum bisa masuk dashboard.{" "}
        <em className="not-italic text-ink-subtle">(Simulasi sementara — belum tersimpan ke database.)</em>
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Nama Lengkap">
          <input
            required value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="Nama lengkap"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Email / No WhatsApp">
          <input
            required value={contact} onChange={e => setContact(e.target.value)}
            placeholder="nama@email.com atau 0812xxxxxxxx"
            className={INPUT_CLS}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Jabatan">
            <select value={jabatan} onChange={e => setJabatan(e.target.value)} className={INPUT_CLS}>
              {JABATAN_OPTIONS.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </Field>
          <Field label="Jenis Satuan/Unit">
            <select value={unitJenis} onChange={e => setUnitJenis(e.target.value)} className={INPUT_CLS}>
              {UNIT_JENIS_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Nama Unit Kerja">
          <input
            required value={unitNama} onChange={e => setUnitNama(e.target.value)}
            placeholder="cth. Kodim 0501/BS, Korem 052/Wijayakrama, Koramil 01/Menteng"
            className={INPUT_CLS}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="NRP">
            <input
              required value={nrp} onChange={e => setNrp(e.target.value)}
              placeholder="Nomor Registrasi Pokok"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Password">
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className={INPUT_CLS}
            />
          </Field>
        </div>

        {error && <div className="text-[12px] text-crit">{error}</div>}

        <button type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition">
          <UserPlus size={14}/> Daftar
        </button>
      </form>

      <p className="mt-5 text-center text-[12px] text-ink-muted">
        Sudah punya akun? <Link href="/auth/login" className="text-accent-glow hover:underline">Masuk</Link>
      </p>
      <p className="mt-2 text-center text-[12px]">
        <Link href="/" className="text-ink-subtle hover:text-ink">← Kembali ke beranda</Link>
      </p>
    </AuthShell>
  );
}

const INPUT_CLS = "w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30";

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white/5 shadow-glow">
            <Image src="/logo.png" alt="BELNEG Logo" width={32} height={32} className="h-8 w-8 object-contain" priority />
          </span>
          <div className="leading-tight">
            <div className="font-display text-[13px] font-bold uppercase tracking-[0.18em] text-ink">BELNEG</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-accent-glow/80">Mission Control</div>
          </div>
        </div>
        <div className="panel p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="stat-label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
