"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, Send, RefreshCw, Phone, Eye, EyeOff } from "lucide-react";

type Stage = "request" | "verify";

const RESEND_COOLDOWN = 60; // seconds

export default function LoginPage() {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("request");

  // Stage 1 fields
  const [phone, setPhone] = useState("");
  const [nrp, setNrp] = useState("");
  const [showNrp, setShowNrp] = useState(false);

  // Stage 2 field
  const [otp, setOtp] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestOtp = async () => {
    if (!phone.trim() || !nrp.trim()) {
      setError("Lengkapi Nomor HP dan NRP terlebih dahulu.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/web/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_or_phone: phone.trim().toLowerCase(), nrp: nrp.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) {
        if (data.error === "pending") setError("Akun Anda masih menunggu approval admin.");
        else if (data.error === "rejected") setError("Akun Anda ditolak atau dinonaktifkan.");
        else if (data.error === "inactive") setError("Akun Anda tidak aktif. Hubungi admin.");
        else setError(data.message ?? data.error ?? "Gagal mengirim OTP.");
        return;
      }
      setOtp("");
      setStage("verify");
      setCooldown(RESEND_COOLDOWN);
    } catch {
      setError("Terjadi kesalahan koneksi. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) {
      setError("Masukkan kode OTP terlebih dahulu.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/web/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_or_phone: phone.trim().toLowerCase(), otp_code: otp.trim() }),
      });
      const data = await res.json() as { ok?: boolean; role?: string; error?: string; message?: string };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Verifikasi gagal.");
        return;
      }
      router.push(`/dashboard?role=${data.role}`);
    } catch {
      setError("Terjadi kesalahan koneksi. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setError(null);
    setOtp("");
    await requestOtp();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stage === "request") requestOtp();
    else verifyOtp();
  };

  return (
    <AuthShell>
      <h1 className="font-display text-2xl font-bold text-ink">Login</h1>
      <p className="mt-1 text-[12px] text-ink-muted">
        {stage === "request"
          ? "Masuk ke BELNEG Mission Control menggunakan Nomor HP dan NRP Anda."
          : "Masukkan kode OTP yang sudah dikirim."}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {stage === "request" ? (
          <>
            <Field label="Nomor HP / WhatsApp">
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
                <input
                  required
                  autoFocus
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0812xxxxxxxx"
                  className="w-full rounded-md border border-white/10 bg-bg/60 pl-8 pr-3 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
            </Field>

            <Field label="NRP">
              <div className="relative">
                <input
                  required
                  type={showNrp ? "text" : "password"}
                  value={nrp}
                  onChange={e => setNrp(e.target.value)}
                  placeholder="Masukkan NRP"
                  autoComplete="off"
                  className="w-full rounded-md border border-white/10 bg-bg/60 px-3 pr-9 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={() => setShowNrp(v => !v)}
                  aria-label={showNrp ? "Sembunyikan NRP" : "Tampilkan NRP"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink transition p-0.5"
                >
                  {showNrp ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>

            {error && <div className="text-[12px] text-crit">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition disabled:opacity-60"
            >
              <Send size={14} /> {loading ? "Mengirim…" : "Kirim OTP"}
            </button>
          </>
        ) : (
          <>
            <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2.5 text-[12px] leading-relaxed text-accent-glow">
              Kode OTP demo sudah dibuat. Cek terminal server untuk mendapatkan kode.
            </div>

            <Field label="Kode OTP">
              <input
                required
                autoFocus
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6 digit kode OTP"
                maxLength={6}
                inputMode="numeric"
                pattern="\d{6}"
                className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle tracking-[0.3em] focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </Field>

            {error && <div className="text-[12px] text-crit">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition disabled:opacity-60"
            >
              <LogIn size={14} /> {loading ? "Memverifikasi…" : "Verifikasi & Masuk"}
            </button>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setStage("request"); setError(null); setOtp(""); }}
                className="text-[12px] text-ink-muted hover:text-ink transition"
              >
                ← Ubah Nomor HP / NRP
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="inline-flex items-center gap-1.5 text-[12px] text-accent-glow hover:underline transition disabled:opacity-50 disabled:no-underline"
              >
                <RefreshCw size={11} />
                {cooldown > 0 ? `Kirim Ulang (${cooldown}s)` : "Kirim Ulang OTP"}
              </button>
            </div>
          </>
        )}
      </form>

      {stage === "request" && (
        <p className="mt-5 text-center text-[12px]">
          <Link href="/" className="text-ink-subtle hover:text-ink">
            ← Kembali ke beranda
          </Link>
        </p>
      )}
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
