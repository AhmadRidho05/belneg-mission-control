"use client";

// Landing page — fully self-contained (no shared/external landing components,
// no next-intl/widgets). Page title comes from the root layout's metadata
// (this must be a client component to drive the modal/dropdown UI below).

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ShieldCheck, BarChart3, MapPin, GraduationCap, Layers,
  Clock3, Users, HeartHandshake, Mail, MapPinned, ChevronRight,
  Globe, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ModalKey = "tentang" | "cerita" | "faq" | "kontak";

const NAV_ITEMS: Array<{ key: ModalKey; label: string }> = [
  { key: "tentang", label: "Tentang KKRI" },
  { key: "cerita", label: "Cerita KKRI" },
  { key: "faq", label: "FAQ" },
  { key: "kontak", label: "Kontak" },
];

const CERITA_CARDS = [
  { icon: GraduationCap, text: "Ekstrakurikuler SMA/SMK/MA" },
  { icon: Layers, text: "Blended learning" },
  { icon: Clock3, text: "Siklus 36 minggu" },
  { icon: Users, text: "Karakter & kepemimpinan" },
  { icon: HeartHandshake, text: "Sukarela dan non-militeristik" },
];

const FAQ_ITEMS = [
  {
    q: "Apa itu KKRI?",
    a: "KKRI adalah program ekstrakurikuler pembinaan karakter Pancasila dan kesadaran bela negara bagi murid jenjang pendidikan menengah.",
  },
  {
    q: "Siapa yang bisa mengikuti KKRI?",
    a: "Murid SMA/SMK/MA sederajat yang secara sukarela mendaftar pada ekstrakurikuler KKRI di satuan pendidikan.",
  },
  {
    q: "Apakah KKRI bersifat wajib?",
    a: "Tidak. KKRI bersifat sukarela sebagai kegiatan ekstrakurikuler dan tidak menjadi syarat kenaikan kelas atau kelulusan.",
  },
  {
    q: "Apakah KKRI bersifat militeristik?",
    a: "Tidak. KKRI mengedepankan pendekatan edukatif, reflektif, kolaboratif, inklusif, dan non-militeristik.",
  },
  {
    q: "Bagaimana model pembelajarannya?",
    a: "KKRI menggunakan blended learning yang memadukan modul daring, kuis, refleksi, tugas kolaboratif, mentoring, dan sesi tatap muka berkala.",
  },
  {
    q: "Apa fungsi BELNEG Mission Control?",
    a: "BELNEG Mission Control berfungsi sebagai dashboard digital untuk memantau data pelaksanaan KKRI, laporan kegiatan, sebaran sekolah, pembina, siswa, dan progres program.",
  },
];

const MODAL_TITLES: Record<ModalKey, string> = {
  tentang: "Tentang KKRI",
  cerita: "Cerita KKRI",
  faq: "FAQ",
  kontak: "Kontak",
};

const LANG_OPTIONS: Array<{ code: "ID" | "EN"; label: string }> = [
  { code: "ID", label: "Indonesia" },
  { code: "EN", label: "English" },
];

// Local ivory / gold / dark-brown palette — deliberately separate from the
// dashboard's dark "Mission Control" theme so the landing page reads as a
// clean, bright marketing page rather than the ops dashboard.
const INK = "text-[#2a1300]";
const INK_MUTED = "text-[#6b5847]";
const INK_SUBTLE = "text-[#9c8a76]";
const GOLD = "text-[#a47622]";
const CARD = "border border-[#a47622]/15 bg-white/55";

export default function LandingPage() {
  const [openModal, setOpenModal] = useState<ModalKey | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [lang, setLang] = useState<"ID" | "EN">("ID");
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!langOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!langRef.current?.contains(e.target as Node)) setLangOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLangOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [langOpen]);

  useEffect(() => {
    if (!openModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenModal(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openModal]);

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#1d0e04]">
      {/* BACKGROUND LAYER — YouTube embed (cuQLbt5zPug) as the hero backdrop.
          Lives at z-0 in normal stacking order (NOT -z-10) so it can never
          end up hidden behind an opaque ancestor background. The oversized
          120vh/120vw wrapper + centering keeps the embed filling the hero
          edge-to-edge (YouTube iframes ignore object-cover), and the dark
          brown/black overlays on top keep the hero text readable. Autoplay
          only works muted — see `mute=1` in the embed URL below. */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[120vh] w-[120vw] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <iframe
            className="absolute inset-0 h-full w-full object-cover"
            src="https://www.youtube.com/embed/cuQLbt5zPug?autoplay=1&mute=1&controls=0&loop=1&playlist=cuQLbt5zPug&modestbranding=1&rel=0&showinfo=0&playsinline=1"
            title="BELNEG landing background"
            frameBorder={0}
            allow="autoplay; encrypted-media"
            allowFullScreen={false}
            tabIndex={-1}
          />
        </div>
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/30 to-black/20" />
      </div>

      {/* FOREGROUND — cream/ivory navbar + white hero text sit above the
          video layer via z-10. */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col">

      {/* NAVBAR — logo left / menu center / actions right, width matches hero container */}
      <header className="relative z-30 border-b border-[#a47622]/15 bg-white/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 sm:px-8 py-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="inline-flex h-9 w-9 items-center justify-center">
              <Image src="/logo.png" alt="BELNEG Logo" width={28} height={28} className="h-7 w-7 object-contain" priority />
            </span>
            <div className="leading-tight">
              <div className="font-display text-[12px] font-bold uppercase tracking-[0.18em] text-white">BELNEG</div>
              <div className="text-[9px] uppercase tracking-[0.22em] text-[#e3b768]">Mission Control</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setOpenModal(item.key)}
                className={cn("rounded-md px-3 py-2 text-[12px] font-medium transition hover:bg-[#a47622]/10 text-[#a47622] hover:text-[#7a5719]")}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative" ref={langRef}>
              <button
                type="button"
                onClick={() => setLangOpen((v) => !v)}
                aria-label="Pilih bahasa"
                aria-expanded={langOpen}
                title="Bahasa"
                className={cn("flex h-9 w-9 items-center justify-center rounded-md border border-[#a47622]/25 bg-white/60 transition hover:bg-white/90", INK_MUTED, "hover:text-[#2a1300]")}
              >
                <Globe size={16} />
              </button>
              {langOpen && (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] w-36 overflow-hidden rounded-lg border border-[#a47622]/20 bg-[#fffaf0] shadow-lg">
                  {LANG_OPTIONS.map((opt) => (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => { setLang(opt.code); setLangOpen(false); }}
                      className={cn(
                        "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[12px] transition hover:bg-[#a47622]/10",
                        lang === opt.code ? cn(GOLD, "font-medium") : INK_MUTED
                      )}
                    >
                      {opt.label}
                      {lang === opt.code && <span className="h-1.5 w-1.5 rounded-full bg-[#a47622]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Link href="/auth/login" className={cn("rounded-md border border-[#a47622]/25 bg-white/60 px-3.5 py-2 text-[12px] font-medium transition hover:bg-white/90", INK_MUTED, "hover:text-[#2a1300]")}>
              Masuk
            </Link>
            <Link href="/auth/register" className="rounded-md border border-[#a47622]/40 bg-[#a47622]/10 px-3.5 py-2 text-[12px] font-medium text-[#7a5719] transition hover:bg-[#a47622]/20">
              Daftar
            </Link>
          </div>
        </div>

        {/* Mobile menu — wrapped row of modal-trigger buttons under the bar */}
        <nav className="flex md:hidden flex-wrap items-center gap-1 px-6 pb-3 sm:px-8">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setOpenModal(item.key)}
              className={cn("rounded-md px-2.5 py-1.5 text-[11px] font-medium transition hover:bg-[#a47622]/10 text-[#a47622] hover:text-[#7a5719]")}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* HERO — big left-aligned headline over the video, like the reference;
          fills the remaining viewport so the page never needs to scroll. */}
      <main className="relative z-10 flex flex-1 items-center">
        <div className="mx-auto w-full max-w-7xl px-6 sm:px-8">
          <div className="max-w-xl text-left">
            <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#e3b768] backdrop-blur-sm">
              ● Live Feed
            </span>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white">
              BELNEG <span className="text-[#e3b768]">Mission Control</span>
            </h1>

            <p className="mt-4 max-w-md text-[13px] sm:text-sm leading-relaxed text-white/75">
              Dashboard monitoring Korps Kadet Republik Indonesia (KKRI) — pemantauan laporan kegiatan,
              sebaran satuan pendidikan, dan struktur teritorial TNI AD dalam satu pusat komando digital.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-md bg-[#a47622] px-6 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-white shadow-md transition hover:bg-[#8a6420]"
              >
                Masuk Dashboard
              </Link>
              <button
                type="button"
                onClick={() => setOpenModal("tentang")}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-white/20"
              >
                Pelajari KKRI <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* FEATURE STRIP — compact, stays within the viewport */}
          <div className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            <FeatureCard icon={BarChart3} title="Visualisasi Data" desc="Statistik & sebaran satuan pendidikan secara real-time." />
            <FeatureCard icon={MapPin} title="Pemetaan Wilayah" desc="Peta interaktif lokasi sekolah & komando teritorial." />
            <FeatureCard icon={ShieldCheck} title="Laporan KKRI" desc="Pantau laporan kegiatan dari Pembina di lapangan." />
          </div>
        </div>
      </main>

      <footer className={cn("relative z-10 border-t border-[#a47622]/15 px-6 sm:px-8 py-4 text-center text-[10px] uppercase tracking-widest", INK_SUBTLE)}>
        SEKBER DIKMEN 2025 · Bela Negara Intelligence
      </footer>
      </div>

      {/* CONTENT MODAL — opened from the navbar; only this panel scrolls internally */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2a1300]/40 backdrop-blur-sm px-4"
          onClick={() => setOpenModal(null)}
        >
          <div
            className="w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-lg border border-[#a47622]/20 bg-[#fffaf0] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#a47622]/15 bg-[#fffaf0] px-5 py-4">
              <span className={cn("font-display text-sm font-semibold uppercase tracking-wider", INK)}>{MODAL_TITLES[openModal]}</span>
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                aria-label="Tutup"
                className={cn("flex h-7 w-7 items-center justify-center rounded-md border border-[#a47622]/25 bg-white/70 transition hover:bg-white", INK_MUTED, "hover:text-[#2a1300]")}
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-5 py-5">
              {openModal === "tentang" && <TentangContent />}
              {openModal === "cerita" && <CeritaContent />}
              {openModal === "faq" && <FaqContent />}
              {openModal === "kontak" && <KontakContent />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TentangContent() {
  return (
    <div className="space-y-3.5">
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        Korps Kadet Republik Indonesia atau KKRI adalah program pembinaan karakter Pancasila dan
        kesadaran bela negara bagi murid jenjang pendidikan menengah. Program ini diselenggarakan
        melalui kegiatan ekstrakurikuler dengan pendekatan edukatif, kolaboratif, reflektif, inklusif,
        dan non-militeristik.
      </p>
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        KKRI dirancang untuk membantu murid SMA/SMK/MA sederajat mengembangkan kedisiplinan,
        kepemimpinan, nasionalisme, kemampuan berpikir kritis, kolaborasi, komunikasi, dan kepedulian
        sosial melalui pembelajaran bauran yang memadukan aktivitas daring dan tatap muka.
      </p>
    </div>
  );
}

function CeritaContent() {
  return (
    <div className="space-y-4">
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        KKRI hadir sebagai ruang pembinaan generasi muda agar semakin siap menghadapi tantangan
        kebangsaan di era digital. Program ini tidak diposisikan sebagai pelatihan militer, melainkan
        sebagai pendidikan karakter kebangsaan yang relevan dengan kehidupan remaja Indonesia.
      </p>
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        Dalam satu siklus pelaksanaan, KKRI berlangsung selama 36 minggu efektif dan terbagi dalam dua
        batch semesteran. Kegiatan dilakukan melalui modul daring, video pembelajaran, kuis, jurnal
        refleksi, tugas kolaboratif, praktik tatap muka, mentoring kelompok, dan proyek pengabdian
        masyarakat. Program ini bersifat sukarela, inklusif, dan menekankan pembentukan disiplin diri,
        kepemimpinan, civic engagement, serta kesadaran bela negara modern.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {CERITA_CARDS.map(({ icon: Icon, text }) => (
          <div key={text} className={cn("flex items-center gap-3 rounded-md p-3.5", CARD)}>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#a47622]/10 text-[#a47622]">
              <Icon size={15} />
            </span>
            <span className={cn("text-[12.5px] leading-snug font-medium", INK)}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqContent() {
  return (
    <div className="space-y-2.5">
      {FAQ_ITEMS.map(({ q, a }) => (
        <details key={q} className={cn("group rounded-md px-4 py-3 open:bg-white/80", CARD)}>
          <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium marker:content-none", INK)}>
            {q}
            <ChevronRight size={15} className={cn("shrink-0 transition group-open:rotate-90", INK_SUBTLE)} />
          </summary>
          <p className={cn("mt-2.5 text-[12.5px] leading-relaxed", INK_MUTED)}>{a}</p>
        </details>
      ))}
    </div>
  );
}

function KontakContent() {
  return (
    <div className="space-y-4">
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        Untuk informasi lebih lanjut mengenai pelaksanaan, koordinasi, dan dukungan teknis program
        KKRI, silakan menghubungi Sekretariat KKRI.
      </p>
      <div className={cn("rounded-md p-5", CARD)}>
        <div className={cn("font-display text-[13px] font-semibold uppercase tracking-wider", INK)}>Sekretariat KKRI</div>
        <div className={cn("mt-3 space-y-2 text-[12.5px]", INK_MUTED)}>
          <div className="flex items-center gap-2"><Mail size={14} className="text-[#a47622]" /> sekretariat@kkri.id</div>
          <div className="flex items-center gap-2"><MapPinned size={14} className="text-[#a47622]" /> Jakarta, Indonesia</div>
        </div>
      </div>
      <p className={cn("text-[11px]", INK_SUBTLE)}>
        Informasi kontak ini dapat disesuaikan kembali mengikuti kanal resmi Sekretariat KKRI.
      </p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className={cn("rounded-md p-3.5", CARD)}>
      <Icon size={17} className="text-[#a47622]" />
      <div className={cn("mt-2 text-[12.5px] font-semibold", INK)}>{title}</div>
      <div className={cn("mt-1 text-[11.5px]", INK_MUTED)}>{desc}</div>
    </div>
  );
}
