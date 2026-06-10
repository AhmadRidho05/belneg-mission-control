import Image from "next/image";
import Link from "next/link";
import { ShieldOff } from "lucide-react";

export default function RegisterPage() {
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
        <div className="panel p-8 text-center">
          <ShieldOff size={36} className="mx-auto text-ink-muted mb-4" />
          <h1 className="font-display text-xl font-bold text-ink">Pendaftaran Ditutup</h1>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
            Akun baru tidak bisa dibuat secara mandiri. Hubungi administrator untuk membuatkan akun Anda.
          </p>
          <Link
            href="/auth/login"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-bg shadow-glow hover:bg-accent-glow transition"
          >
            Ke Halaman Login
          </Link>
        </div>
      </div>
    </div>
  );
}
