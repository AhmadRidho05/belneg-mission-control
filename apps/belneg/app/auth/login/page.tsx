"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");

  const [email, setEmail] = useState("");
  const [nrp, setNrp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !nrp.trim()) {
      setError("Lengkapi Email/No WhatsApp dan NRP terlebih dahulu.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/web/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_or_phone: email, nrp }),
      });
      const data = await res.json() as { ok?: boolean; role?: string; error?: string; message?: string };
      if (!res.ok) {
        if (data.error === "pending") setError("Akun Anda masih menunggu approval admin.");
        else if (data.error === "rejected") setError("Akun Anda ditolak atau dinonaktifkan.");
        else if (data.error === "inactive") setError("Akun Anda tidak aktif. Hubungi admin.");
        else setError(data.error ?? "Login gagal.");
        return;
      }
      router.push(`/dashboard?role=${data.role}`);
    } catch {
      setError("Terjadi kesalahan koneksi. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="font-display text-2xl font-bold text-ink">Login</h1>
      <p className="mt-1 text-[12px] text-ink-muted">
        Masuk ke BELNEG Mission Control menggunakan Email/No WhatsApp dan NRP Anda.
      </p>

      {notice === "registered_pending" && (
        <div className="mt-4 rounded-md border border-warn/30 bg-warn/10 px-3 py-2.5 text-[12px] leading-relaxed text-warn">
          Pendaftaran berhasil. Akun Anda berstatus <strong>pending</strong> dan baru bisa login setelah disetujui admin.
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Email / No WhatsApp">
          <input
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="nama@kkri.id atau 0812xxxxxxxx"
            className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </Field>
        <Field label="NRP">
          <input
            required
            value={nrp}
            onChange={e => setNrp(e.target.value)}
            placeholder="Nomor Registrasi Pokok"
            className="w-full rounded-md border border-white/10 bg-bg/60 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </Field>

        {error && <div className="text-[12px] text-crit">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition disabled:opacity-60"
        >
          <LogIn size={14} /> {loading ? "Memproses…" : "Masuk"}
        </button>
      </form>

      <p className="mt-5 text-center text-[12px] text-ink-muted">
        Belum punya akun?{" "}
        <Link href="/auth/register" className="text-accent-glow hover:underline">
          Daftar
        </Link>
      </p>
      <p className="mt-2 text-center text-[12px]">
        <Link href="/" className="text-ink-subtle hover:text-ink">
          ← Kembali ke beranda
        </Link>
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
