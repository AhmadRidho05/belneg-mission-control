"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { simulateLogin, dashboardPathFor } from "@/lib/auth-sim";

const REASON_MESSAGE: Record<"pending" | "rejected" | "not_found" | "nrp_mismatch" | "wrong_password", string> = {
  nrp_mismatch: "NRP tidak sesuai dengan akun terdaftar.",
  wrong_password: "Password salah.",
  pending: "Akun Anda masih menunggu approval admin.",
  rejected: "Akun Anda ditolak atau dinonaktifkan.",
  not_found: "Akun tidak ditemukan. Silakan daftar terlebih dahulu.",
};

// TEMPORARY AUTH SIMULATION — see lib/auth-sim.ts. No real database/session:
// identifier (email/WhatsApp) + NRP + password must all match a hardcoded
// admin or an approved self-registered account (see Manage User) — the helper
// returns a reason ("nrp_mismatch"/"wrong_password"/"pending"/"rejected"/
// "not_found") otherwise so we can explain exactly why the login was refused.
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");

  const [email, setEmail] = useState("");
  const [nrp, setNrp] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !nrp.trim() || !password) {
      setError("Lengkapi Email/No WhatsApp, NRP, dan Password terlebih dahulu.");
      return;
    }
    const result = simulateLogin({ identifier: email, nrp, password });
    if (!result.ok) {
      setError(REASON_MESSAGE[result.reason]);
      return;
    }
    router.push(dashboardPathFor(result.account.role));
  };

  return (
    <AuthShell>
      <h1 className="font-display text-2xl font-bold text-ink">Login</h1>
      <p className="mt-1 text-[12px] text-ink-muted">
        Masuk ke BELNEG Mission Control. <em className="not-italic text-ink-subtle">(Simulasi sementara — belum terhubung ke database.)</em>
      </p>

      {notice === "registered_pending" && (
        <div className="mt-4 rounded-md border border-warn/30 bg-warn/10 px-3 py-2.5 text-[12px] leading-relaxed text-warn">
          Pendaftaran tersimpan. Akun Anda berstatus <strong>pending</strong> dan baru bisa login setelah disetujui admin.
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Email / No WhatsApp">
          <input
            required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="nama@kkri.id atau 0812xxxxxxxx"
            className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </Field>
        <Field label="NRP">
          <input
            required value={nrp} onChange={e => setNrp(e.target.value)}
            placeholder="Nomor Registrasi Pokok"
            className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </Field>
        <Field label="Password">
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </Field>

        {error && <div className="text-[12px] text-crit">{error}</div>}

        <button type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition">
          <LogIn size={14}/> Masuk
        </button>
      </form>

      <p className="mt-5 text-center text-[12px] text-ink-muted">
        Belum punya akun? <Link href="/auth/register" className="text-accent-glow hover:underline">Daftar</Link>
      </p>
      <p className="mt-2 text-center text-[12px]">
        <Link href="/" className="text-ink-subtle hover:text-ink">← Kembali ke beranda</Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
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
