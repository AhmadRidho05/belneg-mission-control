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
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";

type ModalKey = "tentang" | "cerita" | "faq" | "kontak";

// These are constants, actual labels will come from translation during render
const NAV_KEYS: ModalKey[] = ["tentang", "cerita", "faq", "kontak"];

const CERITA_CARDS = [
  { icon: GraduationCap, key: "story.card1" },
  { icon: Layers, key: "story.card2" },
  { icon: Clock3, key: "story.card3" },
  { icon: Users, key: "story.card4" },
  { icon: HeartHandshake, key: "story.card5" },
];

const FAQ_ITEMS = [
  { qKey: "faq.q1", aKey: "faq.a1" },
  { qKey: "faq.q2", aKey: "faq.a2" },
  { qKey: "faq.q3", aKey: "faq.a3" },
  { qKey: "faq.q4", aKey: "faq.a4" },
  { qKey: "faq.q5", aKey: "faq.a5" },
  { qKey: "faq.q6", aKey: "faq.a6" },
];

const MODAL_TITLE_KEYS: Record<ModalKey, string> = {
  tentang: "modal.about",
  cerita: "modal.story",
  faq: "modal.faq",
  kontak: "modal.contact",
};

const LANG_OPTIONS: Array<{ code: "id" | "en"; label: string }> = [
  { code: "id", label: "Indonesia" },
  { code: "en", label: "English" },
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
  const { lang, setLang } = useLanguage();
  const [openModal, setOpenModal] = useState<ModalKey | null>(null);
  const [langOpen, setLangOpen] = useState(false);
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
      {/* BACKGROUND LAYER — Hero background video.
          Lives at z-0 in normal stacking order (NOT -z-10) so it can never
          end up hidden behind an opaque ancestor background. The oversized
          120vh/120vw wrapper + centering keeps the video filling the hero
          edge-to-edge, and the dark brown/black overlays on top keep the hero
          text readable. The video is muted and loops automatically. */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[120vh] w-[120vw] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src="/videos/belneg-hero-background.mp4"
            autoPlay
            muted
            loop
            playsInline
            title="BELNEG landing background"
          />
        </div>
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/30 to-black/20" />
      </div>

      {/* FOREGROUND — cream/ivory navbar + white hero text sit above the
          video layer via z-10. */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col">

      {/* NAVBAR — logo left / menu center / actions right, width matches hero container */}
      <header className="relative z-30 border-b border-[#a47622]/20 bg-white/65 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 sm:px-8 py-3">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <span className="inline-flex h-12 w-12 items-center justify-center">
              <Image src="/logo.png" alt="BELNEG Logo" width={44} height={44} className="h-11 w-11 object-contain" priority />
            </span>
            <div className="leading-tight">
              <div className="font-display text-[16px] font-black uppercase tracking-[0.15em] text-[#2a1300]">BELNEG</div>
              <div className="text-[12px] uppercase tracking-[0.2em] text-[#7a5719] font-bold">Mission Control</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-2">
            {NAV_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setOpenModal(key)}
                className={cn("rounded-md px-3.5 py-2 text-[13px] font-semibold transition text-[#5a3a22] hover:text-white hover:bg-[#a47622]/80")}
              >
                {t(`nav.${key}`, lang)}
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
                className={cn("flex h-9 w-9 items-center justify-center rounded-md border border-[#a47622]/15 bg-white/45 transition text-[#5a3a22] hover:text-white hover:bg-[#a47622]/80")}
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

            <Link href="/auth/login" className={cn("rounded-md px-3.5 py-2 text-[12px] font-semibold border border-[#a47622]/15 bg-white/45 transition text-[#5a3a22] hover:text-white hover:bg-[#a47622]/80")}>
              Masuk
            </Link>
            <Link href="/auth/register" className="rounded-md px-3.5 py-2 text-[12px] font-semibold border border-[#a47622]/15 bg-white/45 transition text-[#5a3a22] hover:text-white hover:bg-[#a47622]/80">
              Daftar
            </Link>
          </div>
        </div>

        {/* Mobile menu — wrapped row of modal-trigger buttons under the bar */}
        <nav className="flex md:hidden flex-wrap items-center gap-1 px-6 pb-3 sm:px-8">
          {NAV_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setOpenModal(key)}
              className={cn("rounded-md px-2.5 py-1.5 text-[11px] font-medium transition hover:bg-[#a47622]/10 text-[#a47622] hover:text-[#7a5719]")}
            >
              {t(`nav.${key}`, lang)}
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

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
              Belneg
              <br />
              <span className="text-[#e3b768] whitespace-nowrap">Mission Control</span>
            </h1>

            <p className="mt-4 max-w-md text-[13px] sm:text-sm leading-relaxed text-white/75">
              {t("hero.subtitle", lang)}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-md bg-[#a47622] px-6 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-white shadow-md transition hover:bg-[#8a6420]"
              >
                {t("hero.cta.login", lang)}
              </Link>
              <button
                type="button"
                onClick={() => setOpenModal("tentang")}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-white/20"
              >
                {t("hero.cta.learn", lang)} <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* FEATURE STRIP — compact, stays within the viewport */}
          <div className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            <FeatureCard icon={BarChart3} title={t("feature.visualization.title", lang)} desc={t("feature.visualization.desc", lang)} />
            <FeatureCard icon={MapPin} title={t("feature.mapping.title", lang)} desc={t("feature.mapping.desc", lang)} />
            <FeatureCard icon={ShieldCheck} title={t("feature.reports.title", lang)} desc={t("feature.reports.desc", lang)} />
          </div>
        </div>
      </main>

      <footer className={cn("relative z-10 border-t border-[#a47622]/15 px-6 sm:px-8 py-4 text-center text-[10px] uppercase tracking-widest", INK_SUBTLE)}>
        {t("footer", lang)}
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
              <span className={cn("font-display text-sm font-semibold uppercase tracking-wider", INK)}>{openModal && t(MODAL_TITLE_KEYS[openModal], lang)}</span>
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
              {openModal === "tentang" && <TentangContent lang={lang} />}
              {openModal === "cerita" && <CeritaContent lang={lang} />}
              {openModal === "faq" && <FaqContent lang={lang} />}
              {openModal === "kontak" && <KontakContent lang={lang} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TentangContent({ lang }: { lang: "id" | "en" }) {
  return (
    <div className="space-y-3.5">
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        {t("about.p1", lang)}
      </p>
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        {t("about.p2", lang)}
      </p>
    </div>
  );
}

function CeritaContent({ lang }: { lang: "id" | "en" }) {
  return (
    <div className="space-y-4">
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        {t("story.p1", lang)}
      </p>
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        {t("story.p2", lang)}
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {CERITA_CARDS.map(({ icon: Icon, key }) => (
          <div key={key} className={cn("flex items-center gap-3 rounded-md p-3.5", CARD)}>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#a47622]/10 text-[#a47622]">
              <Icon size={15} />
            </span>
            <span className={cn("text-[12.5px] leading-snug font-medium", INK)}>{t(key, lang)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqContent({ lang }: { lang: "id" | "en" }) {
  return (
    <div className="space-y-2.5">
      {FAQ_ITEMS.map(({ qKey, aKey }) => (
        <details key={qKey} className={cn("group rounded-md px-4 py-3 open:bg-white/80", CARD)}>
          <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium marker:content-none", INK)}>
            {t(qKey, lang)}
            <ChevronRight size={15} className={cn("shrink-0 transition group-open:rotate-90", INK_SUBTLE)} />
          </summary>
          <p className={cn("mt-2.5 text-[12.5px] leading-relaxed", INK_MUTED)}>{t(aKey, lang)}</p>
        </details>
      ))}
    </div>
  );
}

function KontakContent({ lang }: { lang: "id" | "en" }) {
  return (
    <div className="space-y-4">
      <p className={cn("text-[13px] leading-relaxed", INK_MUTED)}>
        {t("contact.intro", lang)}
      </p>
      <div className={cn("rounded-md p-5", CARD)}>
        <div className={cn("font-display text-[13px] font-semibold uppercase tracking-wider", INK)}>{t("contact.secretariat", lang)}</div>
        <div className={cn("mt-3 space-y-2 text-[12.5px]", INK_MUTED)}>
          <div className="flex items-center gap-2"><Mail size={14} className="text-[#a47622]" /> sekretariat@kkri.id</div>
          <div className="flex items-center gap-2"><MapPinned size={14} className="text-[#a47622]" /> Jakarta, Indonesia</div>
        </div>
      </div>
      <p className={cn("text-[11px]", INK_SUBTLE)}>
        {t("contact.note", lang)}
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
