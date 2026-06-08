"use client";
import { useEffect, useState } from "react";
import {
  X, MapPin, Building2, Phone, Mail, Globe, Wifi, Zap, Award, School,
  Shield, Calendar, FileText, ExternalLink, Hash, User, Network,
} from "lucide-react";
import { fmt } from "@/lib/utils";

type DetailPayload = {
  sekolah: any;
  yayasan: any | null;
  naungan: any[];
};

const AKR_BADGE: Record<string, string> = {
  A: "bg-ok/15 text-ok border-ok/30",
  B: "bg-warn/15 text-warn border-warn/30",
  C: "bg-accent-deep/20 text-accent border-accent/30",
  TT: "bg-crit/15 text-crit border-crit/30",
  BT: "bg-white/5 text-ink-subtle border-white/10",
};

export function SekolahDetailModal({
  npsn, onClose, focus = "sekolah",
}: {
  npsn: string;
  onClose: () => void;
  focus?: "sekolah" | "yayasan";
}) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"sekolah" | "yayasan">(focus);

  useEffect(() => { setTab(focus); }, [focus, npsn]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const ctrl = new AbortController();
    setData(null); setErr(null);
    fetch(`/api/sekolah/${encodeURIComponent(npsn)}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setData)
      .catch(e => { if (e?.name !== "AbortError") setErr(String(e)); });
    return () => ctrl.abort();
  }, [npsn]);

  const s = data?.sekolah;
  const y = data?.yayasan;
  const naungan = data?.naungan ?? [];

  return (
    <Backdrop onClose={onClose}>
      <div className="w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-hidden rounded-none sm:rounded-lg border border-white/10 bg-bg-soft shadow-2xl flex flex-col">
        {/* HEAD */}
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-3 sm:px-5 py-3 sm:py-4">
          <div className="min-w-0 flex-1">
            {!data && !err && <div className="h-6 w-2/3 animate-pulse rounded bg-white/10" />}
            {err && <div className="text-crit text-sm">Error: {err}</div>}
            {s && (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="chip text-accent-glow border-accent/40">{s.bentuk_pendidikan}</span>
                  <span className={`chip border ${s.status === "NEGERI" ? "text-ok border-ok/40" : "text-accent border-accent/40"}`}>{s.status}</span>
                  <span className={`chip border ${AKR_BADGE[s.akreditasi] ?? AKR_BADGE.BT}`}>AKR {s.akreditasi}</span>
                </div>
                <h2 className="font-display text-lg sm:text-2xl font-bold text-ink leading-tight">{s.nama}</h2>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-muted">
                  <span className="font-mono"><Hash size={10} className="inline mr-0.5"/>{s.npsn}</span>
                  <span>{s.kab_kota} · {s.provinsi}</span>
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} aria-label="Tutup" className="rounded-md p-1.5 text-ink-muted hover:bg-white/5 hover:text-ink">
            <X size={18}/>
          </button>
        </div>

        {/* TABS */}
        {s && (
          <div className="border-b border-white/5 px-5 flex gap-1">
            <TabBtn active={tab === "sekolah"} onClick={() => setTab("sekolah")}>
              <School size={13}/> Detail Sekolah
            </TabBtn>
            <TabBtn active={tab === "yayasan"} onClick={() => setTab("yayasan")} disabled={!y}>
              <Building2 size={13}/> Yayasan {y && <span className="ml-1 inline-flex items-center justify-center rounded-sm bg-accent/20 px-1.5 py-0.5 text-[9px] tabular-nums text-accent-glow">{naungan.length}</span>}
            </TabBtn>
          </div>
        )}

        {/* BODY */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 sm:py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          {s && tab === "sekolah" && (
            <div className="space-y-5">
              <Section title="Lokasi" icon={MapPin}>
                <Field label="Alamat">{s.alamat_konsolidasi || s.alamat || "—"}</Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Kelurahan/Desa">{s.desa_kelurahan || "—"}</Field>
                  <Field label="Kecamatan">{s.kecamatan || "—"}</Field>
                  <Field label="Kab/Kota">{s.kab_kota || "—"}</Field>
                  <Field label="Provinsi">{s.provinsi || "—"}</Field>
                  <Field label="Lintang">{s.lintang ? s.lintang.toFixed(6) : "—"}</Field>
                  <Field label="Bujur">{s.bujur ? s.bujur.toFixed(6) : "—"}</Field>
                </div>
                {s.lintang && s.bujur && (
                  <a href={`https://www.google.com/maps?q=${s.lintang},${s.bujur}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12px] text-accent-glow hover:underline">
                    <ExternalLink size={11}/> Lihat di Google Maps
                  </a>
                )}
              </Section>

              <Section title="Profil Pendidikan" icon={Award}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Bentuk">{s.bentuk_pendidikan || "—"}</Field>
                  <Field label="Jenjang">{s.jenjang_pendidikan || "—"}</Field>
                  <Field label="Status">{s.status || "—"}</Field>
                  <Field label="Akreditasi">{s.akreditasi}</Field>
                  <Field label="Kementerian Pembina">{s.kementerian_pembina || "—"}</Field>
                  <Field label="Naungan">{s.naungan || "—"}</Field>
                </div>
              </Section>

              <Section title="Infrastruktur" icon={Zap}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Luas Tanah">{s.luas_tanah ? `${fmt(s.luas_tanah)} m²` : "—"}</Field>
                  <Field label="Sumber Listrik" icon={Zap}>{s.sumber_listrik || "—"}</Field>
                  <Field label="Akses Internet" icon={Wifi}>{s.akses_internet || "—"}</Field>
                </div>
              </Section>

              <Section title="Legal" icon={FileText}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="No. SK Pendirian">{s.no_sk_pendirian || "—"}</Field>
                  <Field label="Tgl SK Pendirian"><FmtDate v={s.tgl_sk_pendirian}/></Field>
                  <Field label="No. SK Operasional">{s.no_sk_operasional || "—"}</Field>
                  <Field label="Tgl SK Operasional"><FmtDate v={s.tgl_sk_operasional}/></Field>
                </div>
                {s.file_sk_operasional_url && (
                  <a href={s.file_sk_operasional_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12px] text-accent-glow hover:underline">
                    <ExternalLink size={11}/> Unduh SK Operasional
                  </a>
                )}
              </Section>

              <Section title="Kontak" icon={Phone}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Telepon" icon={Phone}>{s.telepon || "—"}</Field>
                  <Field label="Fax">{s.fax || "—"}</Field>
                  <Field label="Email" icon={Mail}>{s.email || "—"}</Field>
                  <Field label="Website" icon={Globe}>
                    {s.website ? (
                      <a href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noopener" className="text-accent-glow hover:underline">{s.website}</a>
                    ) : "—"}
                  </Field>
                  <Field label="Operator">{s.operator || "—"}</Field>
                </div>
              </Section>

              {(s.kodim_id || s.kodam_name) && (
                <Section title="Komando Teritorial (penaung)" icon={Shield}>
                  <div className="rounded-md border border-accent/20 bg-accent/5 p-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-semibold text-ink">{s.kodim_name ?? "—"}</span>
                      <span className="text-[10px] uppercase tracking-widest text-accent-glow">{s.kodim_id ?? ""}</span>
                    </div>
                    <div className="text-[12px] text-ink-muted">di bawah <strong className="text-ink">{s.kodam_name ?? "—"}</strong></div>
                  </div>
                </Section>
              )}
            </div>
          )}

          {s && tab === "yayasan" && y && (
            <div className="space-y-5">
              <Section title="Identitas Yayasan" icon={Building2}>
                <div className="rounded-md border border-accent/30 bg-accent/5 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-accent-glow">NPYP {y.npyp}</div>
                  <div className="mt-1 font-display text-lg sm:text-xl font-bold text-ink leading-snug break-words">{y.judul}</div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                    <Field label="Pimpinan" icon={User}>{y.pimpinan || "—"}</Field>
                    <Field label="Provinsi">{y.provinsi || "—"}</Field>
                    <Field label="Email" icon={Mail}>{y.email || "—"}</Field>
                    <Field label="Operator">{y.operator || "—"}</Field>
                  </div>
                </div>
              </Section>

              <Section title="Legal" icon={FileText}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="No. Pendirian">{y.no_pendirian || "—"}</Field>
                  <Field label="Tgl Pendirian"><FmtDate v={y.tgl_pendirian}/></Field>
                  <Field label="No. SK Badan Hukum">{y.no_sk_badan_hukum || "—"}</Field>
                  <Field label="Tgl SK Pengesahan"><FmtDate v={y.tgl_sk_pengesahan}/></Field>
                  <Field label="No. Pengesahan PN/LN">{y.no_pengesahan_pn_ln || "—"}</Field>
                </div>
              </Section>

              <Section title={`Sekolah Naungan (${naungan.length})`} icon={Network}>
                <div className="rounded-md border border-white/5 max-h-[320px] overflow-auto">
                  <table className="w-full min-w-[640px] text-[12px]">
                    <thead className="sticky top-0 bg-bg-soft/95 backdrop-blur">
                      <tr className="border-b border-white/10 text-left">
                        <th className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">NPSN</th>
                        <th className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Nama</th>
                        <th className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Jenjang</th>
                        <th className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Kab/Kota</th>
                        <th className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-ink-subtle font-semibold">Provinsi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {naungan.map(n => {
                        const isCurrent = n.npsn === npsn;
                        return (
                          <tr key={n.npsn} className={`border-b border-white/5 last:border-0 ${isCurrent ? "bg-accent/10" : "hover:bg-white/[0.025]"}`}>
                            <td className="px-3 py-1.5 font-mono text-ink-subtle">{n.npsn}{isCurrent && <span className="ml-1 text-[9px] text-accent-glow">←</span>}</td>
                            <td className={`px-3 py-1.5 ${isCurrent ? "text-ink font-semibold" : "text-ink-muted"}`}>{n.nama}</td>
                            <td className="px-3 py-1.5 text-ink-subtle">{n.jenjang}</td>
                            <td className="px-3 py-1.5 text-ink-subtle">{n.kabupaten}</td>
                            <td className="px-3 py-1.5 text-ink-subtle">{n.provinsi}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          )}

          {s && tab === "yayasan" && !y && (
            <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-ink-muted">
              Sekolah ini tidak terhubung ke yayasan terdaftar (NPYP kosong).
            </div>
          )}
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-medium transition ${
        active
          ? "border-accent text-accent-glow"
          : disabled
            ? "border-transparent text-ink-subtle opacity-40 cursor-not-allowed"
            : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-accent-glow/80 font-semibold">
        <Icon size={11}/> {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-ink-subtle flex items-center gap-1">
        {Icon && <Icon size={10}/>} {label}
      </div>
      <div className="text-[12.5px] text-ink break-words mt-0.5">{children}</div>
    </div>
  );
}

function FmtDate({ v }: { v: string | null | undefined }) {
  if (!v) return <>—</>;
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return <>{v}</>;
    return <>{d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</>;
  } catch {
    return <>{v}</>;
  }
}
